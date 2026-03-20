import { DataManager } from '../data/DataManager.js';
import {
  ChartDensityPoint,
  ChartMovingAveragePoint,
  ChartSignalMarker,
  ChartZone,
  MarketChartAnalysis,
} from '../types/chart.js';
import { KLineData } from '../types/market.js';
import { MAResult, MarketState, SignalType } from '../types/strategy.js';
import { MACalculator } from '../strategy/MACalculator.js';
import { MarketStateDetector } from '../strategy/MarketStateDetector.js';
import { StrategyEngine } from '../strategy/StrategyEngine.js';

export interface MarketChartServiceDependencies {
  dataManager: Pick<DataManager, 'getKLines'>;
}

interface ReplaySignal extends ChartSignalMarker {
  barIndex: number;
}

export class MarketChartService {
  private readonly dataManager: MarketChartServiceDependencies['dataManager'];
  private readonly maCalculator: MACalculator;
  private readonly strategyEngine: StrategyEngine;

  constructor(
    deps: MarketChartServiceDependencies,
    maCalculator: MACalculator = new MACalculator(),
    strategyEngine: StrategyEngine = new StrategyEngine()
  ) {
    this.dataManager = deps.dataManager;
    this.maCalculator = maCalculator;
    this.strategyEngine = strategyEngine;
  }

  async buildAnalysis(
    symbol: string,
    interval: string,
    options?: {
      limit?: number;
      consolidationThreshold?: number;
    }
  ): Promise<MarketChartAnalysis> {
    const limit = this.normalizeLimit(options?.limit);
    const consolidationThreshold = options?.consolidationThreshold ?? 0.02;
    const detector = new MarketStateDetector(consolidationThreshold);

    const klines = await this.dataManager.getKLines(symbol, interval, limit);
    const maHistory = this.maCalculator.calculateHistory(klines);
    const movingAverages = klines.map((kline, index) => {
      return this.toChartMovingAveragePoint(kline.timestamp, maHistory[index]);
    });
    const density = klines.map((kline, index) => {
      const stateInfo = detector.detectState(maHistory[index]);
      return this.toDensityPoint(kline.timestamp, maHistory[index], stateInfo.state, stateInfo.stdDev, stateInfo.range, stateInfo.isBullish, stateInfo.isBearish);
    });
    const zones = this.buildZones(density);
    const signals = await this.replaySignals(symbol, klines, maHistory, consolidationThreshold);
    const latestDensity = density[density.length - 1] ?? null;
    const latestSignal = signals[signals.length - 1] ?? null;
    const latestKline = klines[klines.length - 1] ?? null;

    return {
      symbol,
      interval,
      limit: klines.length,
      consolidationThreshold,
      klines,
      movingAverages,
      density,
      zones,
      signals,
      summary: {
        latestPrice: latestKline?.close ?? null,
        latestTimestamp: latestKline?.timestamp ?? null,
        latestDensity,
        latestSignal,
        marketBias: this.resolveMarketBias(latestDensity),
        bandUpper: latestDensity?.upperBound ?? null,
        bandLower: latestDensity?.lowerBound ?? null,
        analysisNotes: this.buildAnalysisNotes(latestDensity, latestSignal, zones),
      },
    };
  }

  renderSvg(analysis: MarketChartAnalysis): string {
    const width = 1280;
    const height = 720;
    const padding = { top: 72, right: 220, bottom: 60, left: 72 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const pointCount = analysis.klines.length;
    const xStep = pointCount > 1 ? plotWidth / (pointCount - 1) : plotWidth;

    const priceValues = this.collectRenderablePrices(analysis);
    const [minPrice, maxPrice] = this.expandPriceRange(priceValues);
    const yForPrice = (price: number): number => {
      return padding.top + ((maxPrice - price) / (maxPrice - minPrice)) * plotHeight;
    };
    const xForIndex = (index: number): number => padding.left + index * xStep;

    const horizontalGrid = this.buildHorizontalGrid(analysis.klines, minPrice, maxPrice, width, padding, plotHeight, yForPrice);
    const candles = analysis.klines.map((kline, index) => {
      const x = xForIndex(index);
      const bodyWidth = Math.max(4, Math.min(10, xStep * 0.72));
      const openY = yForPrice(kline.open);
      const closeY = yForPrice(kline.close);
      const highY = yForPrice(kline.high);
      const lowY = yForPrice(kline.low);
      const isBullish = kline.close >= kline.open;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
      const color = isBullish ? '#22c55e' : '#ef4444';

      return `
        <line x1="${x.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${x.toFixed(2)}" y2="${lowY.toFixed(2)}" stroke="${color}" stroke-width="1.4" />
        <rect x="${(x - bodyWidth / 2).toFixed(2)}" y="${bodyTop.toFixed(2)}" width="${bodyWidth.toFixed(2)}" height="${bodyHeight.toFixed(2)}" rx="1.5" fill="${color}" />
      `;
    }).join('');

    const bandPolygons = this.buildBandPolygons(analysis, xForIndex, yForPrice).join('');
    const maLines = [
      { key: 'ma20', color: '#38bdf8', dash: '' },
      { key: 'ma60', color: '#f59e0b', dash: '' },
      { key: 'ma120', color: '#a78bfa', dash: '' },
      { key: 'ema20', color: '#0ea5e9', dash: '6 4' },
      { key: 'ema60', color: '#d97706', dash: '6 4' },
      { key: 'ema120', color: '#8b5cf6', dash: '6 4' },
    ].map((series) => {
      const points = analysis.movingAverages
        .map((item, index) => {
          const value = item[series.key as keyof ChartMovingAveragePoint];
          if (typeof value !== 'number') {
            return null;
          }

          return `${xForIndex(index).toFixed(2)},${yForPrice(value).toFixed(2)}`;
        })
        .filter((item): item is string => item !== null)
        .join(' ');

      if (!points) {
        return '';
      }

      return `<polyline points="${points}" fill="none" stroke="${series.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"${series.dash ? ` stroke-dasharray="${series.dash}"` : ''} />`;
    }).join('');

    const markers = analysis.signals.map((signal) => {
      const index = analysis.klines.findIndex((kline) => kline.timestamp === signal.timestamp);
      if (index === -1) {
        return '';
      }

      const x = xForIndex(index);
      const y = yForPrice(signal.price);
      const isBuy = signal.type === SignalType.BUY_BREAKOUT || signal.type === SignalType.BUY_PULLBACK;
      const color = isBuy ? '#22c55e' : '#ef4444';
      const points = isBuy
        ? `${x},${y - 18} ${x - 10},${y + 4} ${x + 10},${y + 4}`
        : `${x},${y + 18} ${x - 10},${y - 4} ${x + 10},${y - 4}`;
      const labelY = isBuy ? y - 24 : y + 32;

      return `
        <polygon points="${points}" fill="${color}" opacity="0.95" />
        <text x="${x.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" fill="${color}" font-size="12" font-weight="700">
          ${this.escapeXml(this.getSignalLabel(signal.type))}
        </text>
      `;
    }).join('');

    const latest = analysis.summary.latestDensity;
    const infoLines = [
      `Price: ${this.formatPrice(analysis.summary.latestPrice)}`,
      `State: ${latest?.state ?? 'unknown'}`,
      `Bias: ${analysis.summary.marketBias}`,
      `Band: ${this.formatPrice(analysis.summary.bandLower)} - ${this.formatPrice(analysis.summary.bandUpper)}`,
      `Signals: ${analysis.signals.length}`,
    ];
    const noteLines = analysis.summary.analysisNotes.slice(0, 3);
    const legendItems = [
      { label: 'MA20', color: '#38bdf8', dash: '' },
      { label: 'MA60', color: '#f59e0b', dash: '' },
      { label: 'MA120', color: '#a78bfa', dash: '' },
      { label: 'EMA20/60/120', color: '#64748b', dash: '6 4' },
      { label: 'Dense Zone', color: '#f59e0b', dash: '' },
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${this.escapeXml(`${analysis.symbol} ${analysis.interval} MA Chart`)}</title>
  <desc id="desc">${this.escapeXml(noteLines.join('；') || '价格、均线、密集区与买卖点图表')}</desc>
  <defs>
    <linearGradient id="panel" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#panel)" />
  <rect x="${padding.left}" y="${padding.top}" width="${plotWidth}" height="${plotHeight}" rx="18" fill="#0b1220" stroke="#1e293b" />
  ${horizontalGrid}
  ${bandPolygons}
  ${candles}
  ${maLines}
  ${markers}
  <text x="${padding.left}" y="38" fill="#f8fafc" font-size="28" font-weight="700">${this.escapeXml(analysis.symbol)} ${this.escapeXml(analysis.interval)}</text>
  <text x="${padding.left}" y="60" fill="#94a3b8" font-size="14">MA/EMA dense zone and strategy replay markers</text>
  <g transform="translate(${width - padding.right + 24}, ${padding.top})">
    <rect width="${padding.right - 36}" height="248" rx="16" fill="#111827" stroke="#334155" />
    <text x="18" y="28" fill="#f8fafc" font-size="16" font-weight="700">Agent Notes</text>
    ${infoLines.map((line, index) => {
      return `<text x="18" y="${56 + index * 24}" fill="#cbd5e1" font-size="13">${this.escapeXml(line)}</text>`;
    }).join('')}
    ${noteLines.map((line, index) => {
      return `<text x="18" y="${188 + index * 20}" fill="#94a3b8" font-size="12">${this.escapeXml(line)}</text>`;
    }).join('')}
  </g>
  <g transform="translate(${width - padding.right + 24}, ${padding.top + 280})">
    <rect width="${padding.right - 36}" height="152" rx="16" fill="#111827" stroke="#334155" />
    <text x="18" y="28" fill="#f8fafc" font-size="16" font-weight="700">Legend</text>
    ${legendItems.map((item, index) => {
      const y = 54 + index * 22;
      return `
        <line x1="18" y1="${y}" x2="58" y2="${y}" stroke="${item.color}" stroke-width="3"${item.dash ? ` stroke-dasharray="${item.dash}"` : ''} />
        <text x="70" y="${y + 4}" fill="#cbd5e1" font-size="12">${this.escapeXml(item.label)}</text>
      `;
    }).join('')}
  </g>
</svg>`;
  }

  private normalizeLimit(limit?: number): number {
    if (!Number.isFinite(limit)) {
      return 180;
    }

    return Math.min(500, Math.max(120, Math.floor(limit ?? 180)));
  }

  private toChartMovingAveragePoint(timestamp: number, maResult: MAResult): ChartMovingAveragePoint {
    return {
      timestamp,
      ma20: this.toNullableNumber(maResult.ma20),
      ma60: this.toNullableNumber(maResult.ma60),
      ma120: this.toNullableNumber(maResult.ma120),
      ema20: this.toNullableNumber(maResult.ema20),
      ema60: this.toNullableNumber(maResult.ema60),
      ema120: this.toNullableNumber(maResult.ema120),
    };
  }

  private toDensityPoint(
    timestamp: number,
    maResult: MAResult,
    state: MarketState,
    stdDev: number,
    range: number,
    isBullish: boolean,
    isBearish: boolean
  ): ChartDensityPoint {
    const bounds = this.getBounds(maResult);
    const mean = bounds.values.length > 0
      ? bounds.values.reduce((sum, value) => sum + value, 0) / bounds.values.length
      : NaN;
    const relativeStdDev = Number.isFinite(stdDev) && Number.isFinite(mean) && mean !== 0 ? stdDev / mean : NaN;
    const widthPercent = Number.isFinite(bounds.upper) && Number.isFinite(bounds.lower) && Number.isFinite(mean) && mean !== 0
      ? (bounds.upper - bounds.lower) / mean
      : NaN;

    return {
      timestamp,
      state,
      stdDev: this.toNullableNumber(stdDev),
      range: this.toNullableNumber(range),
      relativeStdDev: this.toNullableNumber(relativeStdDev),
      upperBound: this.toNullableNumber(bounds.upper),
      lowerBound: this.toNullableNumber(bounds.lower),
      widthPercent: this.toNullableNumber(widthPercent),
      isBullish,
      isBearish,
    };
  }

  private getBounds(maResult: MAResult): { values: number[]; upper: number; lower: number } {
    const values = [
      maResult.ma20,
      maResult.ma60,
      maResult.ma120,
      maResult.ema20,
      maResult.ema60,
      maResult.ema120,
    ].filter((value) => Number.isFinite(value));

    return {
      values,
      upper: values.length > 0 ? Math.max(...values) : NaN,
      lower: values.length > 0 ? Math.min(...values) : NaN,
    };
  }

  private async replaySignals(
    symbol: string,
    klines: KLineData[],
    maHistory: MAResult[],
    consolidationThreshold: number
  ): Promise<ChartSignalMarker[]> {
    if (klines.length < 120) {
      return [];
    }

    const detector = new MarketStateDetector(consolidationThreshold);
    const replayed: ReplaySignal[] = [];

    for (let endIndex = 119; endIndex < klines.length; endIndex++) {
      const slicedKlines = klines.slice(0, endIndex + 1);
      const slicedMAHistory = maHistory.slice(0, endIndex + 1);
      const latestMA = slicedMAHistory[slicedMAHistory.length - 1];
      const stateInfo = detector.detectState(latestMA);
      const signal = await this.strategyEngine.analyze(symbol, slicedKlines, slicedMAHistory, stateInfo);

      if (!signal) {
        continue;
      }

      const previous = replayed[replayed.length - 1];
      if (
        previous &&
        previous.type === signal.type &&
        endIndex - previous.barIndex <= 3 &&
        Math.abs(previous.price - signal.price) / Math.max(previous.price, 1) < 0.015
      ) {
        continue;
      }

      replayed.push({
        type: signal.type,
        timestamp: signal.timestamp,
        price: signal.price,
        stopLoss: signal.stopLoss,
        confidence: signal.confidence,
        reason: signal.reason,
        barIndex: endIndex,
      });
    }

    return replayed.map((signal) => {
      return {
        type: signal.type,
        timestamp: signal.timestamp,
        price: signal.price,
        stopLoss: signal.stopLoss,
        confidence: signal.confidence,
        reason: signal.reason,
      };
    });
  }

  private buildZones(density: ChartDensityPoint[]): ChartZone[] {
    const zones: ChartZone[] = [];
    let buffer: ChartDensityPoint[] = [];

    const flush = () => {
      if (buffer.length === 0) {
        return;
      }

      const lowerValues = buffer
        .map((item) => item.lowerBound)
        .filter((value): value is number => typeof value === 'number');
      const upperValues = buffer
        .map((item) => item.upperBound)
        .filter((value): value is number => typeof value === 'number');
      const widthValues = buffer
        .map((item) => item.widthPercent)
        .filter((value): value is number => typeof value === 'number');

      if (lowerValues.length > 0 && upperValues.length > 0 && widthValues.length > 0) {
        zones.push({
          kind: 'consolidation',
          startTimestamp: buffer[0].timestamp,
          endTimestamp: buffer[buffer.length - 1].timestamp,
          lowerBound: Math.min(...lowerValues),
          upperBound: Math.max(...upperValues),
          widthPercent: Math.max(...widthValues),
        });
      }

      buffer = [];
    };

    for (const point of density) {
      if (point.state === MarketState.CONSOLIDATION && typeof point.lowerBound === 'number' && typeof point.upperBound === 'number') {
        buffer.push(point);
      } else {
        flush();
      }
    }

    flush();
    return zones;
  }

  private resolveMarketBias(latestDensity: ChartDensityPoint | null): 'bullish' | 'bearish' | 'neutral' {
    if (!latestDensity) {
      return 'neutral';
    }

    if (latestDensity.isBullish) {
      return 'bullish';
    }

    if (latestDensity.isBearish) {
      return 'bearish';
    }

    return 'neutral';
  }

  private buildAnalysisNotes(
    latestDensity: ChartDensityPoint | null,
    latestSignal: ChartSignalMarker | null,
    zones: ChartZone[]
  ): string[] {
    const notes: string[] = [];

    if (!latestDensity) {
      notes.push('当前没有足够的均线数据，暂时无法判断结构。');
      return notes;
    }

    if (latestDensity.state === MarketState.CONSOLIDATION) {
      notes.push(`当前 6 条均线仍在密集区，带宽约 ${(latestDensity.widthPercent ?? 0) * 100}%。`);
    } else if (latestDensity.state === MarketState.EXPANSION_BULL) {
      notes.push('当前均线呈多头发散，更适合等待首次回踩类机会。');
    } else if (latestDensity.state === MarketState.EXPANSION_BEAR) {
      notes.push('当前均线呈空头发散，优先留意反弹至 MA20 附近后的空头机会。');
    } else {
      notes.push('当前结构混合，建议结合更高周期再确认方向。');
    }

    if (latestSignal) {
      notes.push(`最近一次策略信号为 ${this.getSignalLabel(latestSignal.type)}，触发价 ${this.formatPrice(latestSignal.price)}。`);
    }

    if (zones.length > 0) {
      const lastZone = zones[zones.length - 1];
      notes.push(`最近密集区范围约 ${this.formatPrice(lastZone.lowerBound)} - ${this.formatPrice(lastZone.upperBound)}。`);
    }

    return notes;
  }

  private collectRenderablePrices(analysis: MarketChartAnalysis): number[] {
    const values: number[] = [];

    for (const kline of analysis.klines) {
      values.push(kline.low, kline.high);
    }

    for (const item of analysis.movingAverages) {
      for (const key of ['ma20', 'ma60', 'ma120', 'ema20', 'ema60', 'ema120'] as const) {
        const value = item[key];
        if (typeof value === 'number') {
          values.push(value);
        }
      }
    }

    for (const point of analysis.density) {
      if (typeof point.lowerBound === 'number') {
        values.push(point.lowerBound);
      }
      if (typeof point.upperBound === 'number') {
        values.push(point.upperBound);
      }
    }

    for (const signal of analysis.signals) {
      values.push(signal.price, signal.stopLoss);
    }

    return values.filter((value) => Number.isFinite(value));
  }

  private expandPriceRange(values: number[]): [number, number] {
    if (values.length === 0) {
      return [0, 1];
    }

    let minPrice = Math.min(...values);
    let maxPrice = Math.max(...values);

    if (minPrice === maxPrice) {
      minPrice -= minPrice * 0.02 || 1;
      maxPrice += maxPrice * 0.02 || 1;
    } else {
      const padding = (maxPrice - minPrice) * 0.06;
      minPrice -= padding;
      maxPrice += padding;
    }

    return [minPrice, maxPrice];
  }

  private buildHorizontalGrid(
    klines: KLineData[],
    minPrice: number,
    maxPrice: number,
    width: number,
    padding: { top: number; right: number; bottom: number; left: number },
    plotHeight: number,
    // eslint-disable-next-line no-unused-vars
    yForPrice: (price: number) => number
  ): string {
    const rows = 5;
    const lines: string[] = [];

    for (let index = 0; index <= rows; index++) {
      const ratio = index / rows;
      const price = maxPrice - (maxPrice - minPrice) * ratio;
      const y = yForPrice(price);
      lines.push(`<line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}" stroke="#1e293b" stroke-width="1" stroke-dasharray="4 6" />`);
      lines.push(`<text x="${(padding.left - 12).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#64748b" font-size="12">${this.escapeXml(this.formatPrice(price))}</text>`);
    }

    const labelCount = Math.min(5, rows + 1);
    const y = padding.top + plotHeight + 24;
    const step = labelCount > 1 ? (width - padding.left - padding.right) / (labelCount - 1) : 0;
    for (let index = 0; index < labelCount; index++) {
      const x = padding.left + index * step;
      lines.push(`<line x1="${x.toFixed(2)}" y1="${padding.top}" x2="${x.toFixed(2)}" y2="${(padding.top + plotHeight).toFixed(2)}" stroke="#0f172a" stroke-width="1" />`);
      const pointIndex = labelCount > 1
        ? Math.min(klines.length - 1, Math.round(((klines.length - 1) * index) / (labelCount - 1)))
        : 0;
      const label = klines[pointIndex]
        ? this.formatAxisTimestamp(klines[pointIndex].timestamp)
        : String(index + 1);
      lines.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" fill="#64748b" font-size="12">${this.escapeXml(label)}</text>`);
    }

    return lines.join('');
  }

  private buildBandPolygons(
    analysis: MarketChartAnalysis,
    // eslint-disable-next-line no-unused-vars
    xForIndex: (index: number) => number,
    // eslint-disable-next-line no-unused-vars
    yForPrice: (price: number) => number
  ): string[] {
    const polygons: string[] = [];
    let segment: Array<{ x: number; upper: number; lower: number }> = [];

    const flush = () => {
      if (segment.length < 2) {
        segment = [];
        return;
      }

      const upperPoints = segment.map((item) => `${item.x.toFixed(2)},${item.upper.toFixed(2)}`);
      const lowerPoints = [...segment]
        .reverse()
        .map((item) => `${item.x.toFixed(2)},${item.lower.toFixed(2)}`);
      polygons.push(`<polygon points="${[...upperPoints, ...lowerPoints].join(' ')}" fill="#f59e0b" fill-opacity="0.12" stroke="#fbbf24" stroke-opacity="0.25" stroke-width="1.4" />`);
      segment = [];
    };

    analysis.density.forEach((point, index) => {
      if (
        point.state === MarketState.CONSOLIDATION &&
        typeof point.upperBound === 'number' &&
        typeof point.lowerBound === 'number'
      ) {
        segment.push({
          x: xForIndex(index),
          upper: yForPrice(point.upperBound),
          lower: yForPrice(point.lowerBound),
        });
        return;
      }

      flush();
    });

    flush();
    return polygons;
  }

  private getSignalLabel(type: SignalType): string {
    switch (type) {
      case SignalType.BUY_BREAKOUT:
        return 'BUY BO';
      case SignalType.SELL_BREAKOUT:
        return 'SELL BO';
      case SignalType.BUY_PULLBACK:
        return 'BUY PB';
      case SignalType.SELL_PULLBACK:
        return 'SELL PB';
    }
  }

  private formatPrice(value: number | null): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '-';
    }

    if (Math.abs(value) >= 1000) {
      return value.toFixed(2);
    }

    if (Math.abs(value) >= 1) {
      return value.toFixed(3);
    }

    return value.toFixed(6);
  }

  private toNullableNumber(value: number): number | null {
    return Number.isFinite(value) ? value : null;
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll('\'', '&apos;');
  }

  private formatAxisTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  }
}
