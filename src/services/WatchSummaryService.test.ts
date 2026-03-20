import { describe, it, expect, vi } from 'vitest';
import { WatchSummaryService } from './WatchSummaryService.js';
import { SignalType } from '../types/strategy.js';
import { TakeProfitMode } from '../types/risk.js';
import { Position } from '../types/position.js';
import { MarketChartAnalysis } from '../types/chart.js';
import { SystemConfig } from '../types/config.js';
import type { WatchSummaryHistoryStorage, WatchSummarySnapshot } from './WatchSummaryHistoryStorage.js';

const baseConfig: SystemConfig = {
  symbols: ['BTC/USDT', 'AAPL'],
  intervals: ['1h'],
  providers: {
    binance: { enabled: true },
    okx: { enabled: false },
    tushare: { enabled: false, apiToken: '' },
    yahooFinance: { enabled: true },
  },
  consolidationThreshold: 0.02,
  takeProfitMode: TakeProfitMode.FIXED_RATIO,
  takeProfitRatio: 3,
  maxRiskPerTrade: 100,
  maxLeverage: 3,
  accountBalance: 10000,
  enableSound: true,
  enableEmail: false,
  emailAddress: undefined,
  dataRetentionDays: 30,
  updateInterval: 60,
};

class InMemoryWatchSummaryHistoryStorage implements WatchSummaryHistoryStorage {
  private snapshots: WatchSummarySnapshot[] = [];

  async save(snapshot: WatchSummarySnapshot): Promise<void> {
    this.snapshots.push(snapshot);
  }

  async list(limit: number = 20): Promise<WatchSummarySnapshot[]> {
    return [...this.snapshots]
      .sort((a, b) => b.generatedAt - a.generatedAt)
      .slice(0, limit);
  }
}

function createChartAnalysis(symbol: string, interval: string): MarketChartAnalysis {
  return {
    symbol,
    interval,
    limit: 180,
    consolidationThreshold: 0.02,
    klines: [],
    movingAverages: [],
    density: [],
    zones: [
      {
        kind: 'consolidation',
        startTimestamp: 1710000000000,
        endTimestamp: 1710003600000,
        upperBound: 42000,
        lowerBound: 41000,
        widthPercent: 0.02,
      },
    ],
    signals: [
      {
        type: SignalType.BUY_BREAKOUT,
        timestamp: 1710000000000,
        price: 42000,
        stopLoss: 41000,
        confidence: 0.82,
        reason: `${symbol} ${interval} breakout`,
      },
    ],
    summary: {
      latestPrice: 42000,
      latestTimestamp: 1710000000000,
      latestDensity: null,
      latestSignal: null,
      marketBias: 'bullish',
      bandUpper: 42000,
      bandLower: 41000,
      analysisNotes: [`${symbol} ${interval} chart note`],
    },
  };
}

describe('WatchSummaryService', () => {
  it('应该汇总扫描建议、跳过标的和持仓提醒', async () => {
    const position: Position = {
      id: 'pos-1',
      symbol: 'BTC/USDT',
      entryPrice: 40000,
      entryTime: 1710000000000,
      quantity: 0.1,
      strategyType: SignalType.BUY_BREAKOUT,
      stopLoss: 39000,
      takeProfit: [43000],
      status: 'open',
    };

    const service = new WatchSummaryService({
      dataManager: {
        isSymbolTradingTime: vi.fn((symbol: string) => symbol !== 'AAPL'),
        getLatestPrice: vi.fn(async () => 40500),
      },
      signalScanner: {
        scanSymbol: vi.fn(async (symbol: string, interval: string) => ({
          type: SignalType.BUY_BREAKOUT,
          symbol,
          timestamp: 1710000000000,
          price: 42000,
          stopLoss: 41000,
          takeProfit: [],
          reason: `${interval} 突破`,
          confidence: 0.82,
        })),
      },
      positionMonitor: {
        getAllPositions: vi.fn(() => [position]),
        updatePositions: vi.fn(async () => [
          {
            position,
            currentPrice: 40500,
            pnl: 50,
            pnlPercent: 1.25,
            shouldStopLoss: false,
            shouldTakeProfit: true,
            trendReversed: false,
            triggeredTakeProfits: [43000],
            nextTakeProfit: undefined,
            adjustedStopLoss: 40000,
            recommendedAction: 'reduce',
          },
        ]),
      },
      chartService: {
        buildAnalysis: vi.fn(async (symbol: string, interval: string) => createChartAnalysis(symbol, interval)),
        renderSvg: vi.fn(() => '<svg>chart</svg>'),
      },
    });

    const result = await service.build(baseConfig);

    expect(result.symbols).toEqual(['BTC/USDT', 'AAPL']);
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0].scannedSymbols).toEqual(['BTC/USDT']);
    expect(result.intervals[0].skippedSymbols).toEqual(['AAPL']);
    expect(result.intervals[0].advices).toHaveLength(1);
    expect(result.intervals[0].advices[0].action).toBe('buy');
    expect(result.symbolSummaries).toHaveLength(1);
    expect(result.symbolSummaries[0].symbol).toBe('BTC/USDT');
    expect(result.symbolSummaries[0].primaryAction).toBe('buy');
    expect(result.symbolSummaries[0].priorityScore).toBeGreaterThan(0);
    expect(result.positions.openCount).toBe(1);
    expect(result.positions.alerts).toHaveLength(1);
    expect(result.positions.alerts[0].shouldTakeProfit).toBe(true);
    expect(result.positions.alerts[0].triggeredTakeProfits).toEqual([43000]);
    expect(result.positions.alerts[0].recommendedAction).toBe('reduce');
    expect(result.alertReservation.enabledChannels.sound).toBe(true);
    expect(result.alertReservation.reservedTypes).toContain('take_profit');
    expect(result.errors).toEqual([]);
  });

  it('应该收集扫描异常并继续处理其他标的', async () => {
    const service = new WatchSummaryService({
      dataManager: {
        isSymbolTradingTime: vi.fn(() => true),
        getLatestPrice: vi.fn(async () => 100),
      },
      signalScanner: {
        scanSymbol: vi.fn(async (symbol: string) => {
          if (symbol === 'BTC/USDT') {
            throw new Error('scan failed');
          }

          return null;
        }),
      },
      positionMonitor: {
        getAllPositions: vi.fn(() => []),
        updatePositions: vi.fn(async () => []),
      },
    });

    const result = await service.build({
      ...baseConfig,
      symbols: ['BTC/USDT', 'ETH/USDT'],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      symbol: 'BTC/USDT',
      interval: '1h',
      stage: 'scan',
      message: 'scan failed',
    });
    expect(result.intervals[0].scannedSymbols).toEqual(['BTC/USDT', 'ETH/USDT']);
    expect(result.intervals[0].advices).toEqual([]);
  });

  it('应该汇总 OpenClaw 可消费的 agentSummary', async () => {
    const position: Position = {
      id: 'pos-1',
      symbol: 'BTC/USDT',
      entryPrice: 40000,
      entryTime: 1710000000000,
      quantity: 0.1,
      strategyType: SignalType.BUY_BREAKOUT,
      stopLoss: 39000,
      takeProfit: [43000],
      status: 'open',
    };

    const service = new WatchSummaryService({
      dataManager: {
        isSymbolTradingTime: vi.fn((symbol: string) => symbol !== 'AAPL'),
        getLatestPrice: vi.fn(async () => 40500),
      },
      signalScanner: {
        scanSymbol: vi.fn(async (symbol: string, interval: string) => ({
          type: SignalType.BUY_BREAKOUT,
          symbol,
          timestamp: 1710000000000,
          price: symbol === 'BTC/USDT' ? 42000 : 3000,
          stopLoss: symbol === 'BTC/USDT' ? 41000 : 2900,
          takeProfit: [],
          reason: `${symbol} ${interval} 突破`,
          confidence: symbol === 'BTC/USDT' ? 0.82 : 0.66,
        })),
      },
      positionMonitor: {
        getAllPositions: vi.fn(() => [position]),
        updatePositions: vi.fn(async () => [
          {
            position,
            currentPrice: 40500,
            pnl: 50,
            pnlPercent: 1.25,
            shouldStopLoss: false,
            shouldTakeProfit: true,
            trendReversed: false,
            triggeredTakeProfits: [43000],
            nextTakeProfit: undefined,
            adjustedStopLoss: 40000,
            recommendedAction: 'reduce',
          },
        ]),
      },
      chartService: {
        buildAnalysis: vi.fn(async (symbol: string, interval: string) => createChartAnalysis(symbol, interval)),
        renderSvg: vi.fn(() => '<svg>chart</svg>'),
      },
    });

    const result = await service.build({
      ...baseConfig,
      symbols: ['BTC/USDT', 'ETH/USDT', 'AAPL'],
    });
    const agentSummary = await service.buildAgentSummary(result, {
      consolidationThreshold: baseConfig.consolidationThreshold,
    });

    expect(agentSummary.status).toBe('attention');
    expect(agentSummary.counts.buy).toBe(2);
    expect(agentSummary.counts.positionAlerts).toBe(1);
    expect(agentSummary.counts.errors).toBe(0);
    expect(agentSummary.counts.skippedSymbols).toBe(1);
    expect(agentSummary.topSignals).toHaveLength(2);
    expect(agentSummary.topSignals[0].symbol).toBe('BTC/USDT');
    expect(agentSummary.topSignals[0].priorityScore).toBeGreaterThan(agentSummary.topSignals[1].priorityScore);
    expect(agentSummary.positionActions).toEqual([
      {
        positionId: 'pos-1',
        symbol: 'BTC/USDT',
        action: 'reduce',
        currentPrice: 40500,
        pnlPercent: 1.25,
      },
    ]);
    expect(agentSummary.skippedSymbols).toEqual(['AAPL']);
    expect(agentSummary.topSignalCharts).toHaveLength(2);
    expect(agentSummary.topSignalCharts[0].symbol).toBe('BTC/USDT');
    expect(agentSummary.topSignalCharts[0].chart.mimeType).toBe('image/svg+xml');
    expect(agentSummary.topSignalCharts[0].chart.svg).toContain('<svg>');
  });

  it('应该按 symbol 聚合多周期建议并标记冲突', async () => {
    const service = new WatchSummaryService({
      dataManager: {
        isSymbolTradingTime: vi.fn(() => true),
        getLatestPrice: vi.fn(async () => 100),
      },
      signalScanner: {
        scanSymbol: vi.fn(async (symbol: string, interval: string) => ({
          type: interval === '4h' ? SignalType.SELL_BREAKOUT : SignalType.BUY_BREAKOUT,
          symbol,
          timestamp: 1710000000000,
          price: 100,
          stopLoss: 95,
          takeProfit: [],
          reason: `${symbol} ${interval} signal`,
          confidence: interval === '4h' ? 0.7 : 0.8,
        })),
      },
      positionMonitor: {
        getAllPositions: vi.fn(() => []),
        updatePositions: vi.fn(async () => []),
      },
    });

    const result = await service.build({
      ...baseConfig,
      symbols: ['BTC/USDT'],
      intervals: ['1h', '4h'],
    });

    expect(result.symbolSummaries).toHaveLength(1);
    expect(result.symbolSummaries[0]).toMatchObject({
      symbol: 'BTC/USDT',
      hasConflict: true,
    });
    expect(result.symbolSummaries[0].intervals).toEqual(['1h', '4h']);
    expect(result.symbolSummaries[0].actions).toContain('buy');
    expect(result.symbolSummaries[0].actions).toContain('sell');
  });

  it('应该在存在异常时返回 warning 状态', async () => {
    const service = new WatchSummaryService({
      dataManager: {
        isSymbolTradingTime: vi.fn(() => true),
        getLatestPrice: vi.fn(async () => 100),
      },
      signalScanner: {
        scanSymbol: vi.fn(async () => {
          throw new Error('scan failed');
        }),
      },
      positionMonitor: {
        getAllPositions: vi.fn(() => []),
        updatePositions: vi.fn(async () => []),
      },
    });

    const result = await service.build({
      ...baseConfig,
      symbols: ['BTC/USDT'],
    });

    const agentSummary = await service.buildAgentSummary(result);
    expect(agentSummary.status).toBe('warning');
    expect(agentSummary.counts.errors).toBe(1);
    expect(agentSummary.topSignalCharts).toEqual([]);
  });

  it('应该在 build 后保存历史快照并支持查询', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1710000000001);
    nowSpy.mockReturnValueOnce(1710000000002);

    const historyStorage = new InMemoryWatchSummaryHistoryStorage();
    const service = new WatchSummaryService({
      dataManager: {
        isSymbolTradingTime: vi.fn(() => true),
        getLatestPrice: vi.fn(async () => 100),
      },
      signalScanner: {
        scanSymbol: vi.fn(async (symbol: string, interval: string) => ({
          type: SignalType.BUY_BREAKOUT,
          symbol,
          timestamp: 1710000000000,
          price: 100,
          stopLoss: 95,
          takeProfit: [],
          reason: `${symbol} ${interval} signal`,
          confidence: 0.8,
        })),
      },
      positionMonitor: {
        getAllPositions: vi.fn(() => []),
        updatePositions: vi.fn(async () => []),
      },
    }, undefined, historyStorage);

    try {
      const firstResult = await service.build({
        ...baseConfig,
        symbols: ['BTC/USDT'],
        intervals: ['1h'],
      });

      const secondResult = await service.build({
        ...baseConfig,
        symbols: ['ETH/USDT'],
        intervals: ['4h'],
      });

      const history = await service.listHistory();

      expect(history).toHaveLength(2);
      expect(history[0].generatedAt).toBe(secondResult.generatedAt);
      expect(history[1].generatedAt).toBe(firstResult.generatedAt);
      expect(history[0].symbols).toEqual(['ETH/USDT']);
      expect(history[1].symbols).toEqual(['BTC/USDT']);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('应该支持限制历史查询条数', async () => {
    const historyStorage = new InMemoryWatchSummaryHistoryStorage();
    const service = new WatchSummaryService({
      dataManager: {
        isSymbolTradingTime: vi.fn(() => true),
        getLatestPrice: vi.fn(async () => 100),
      },
      signalScanner: {
        scanSymbol: vi.fn(async (symbol: string, interval: string) => ({
          type: SignalType.BUY_BREAKOUT,
          symbol,
          timestamp: 1710000000000,
          price: 100,
          stopLoss: 95,
          takeProfit: [],
          reason: `${symbol} ${interval} signal`,
          confidence: 0.8,
        })),
      },
      positionMonitor: {
        getAllPositions: vi.fn(() => []),
        updatePositions: vi.fn(async () => []),
      },
    }, undefined, historyStorage);

    await service.build({
      ...baseConfig,
      symbols: ['BTC/USDT'],
    });
    await service.build({
      ...baseConfig,
      symbols: ['ETH/USDT'],
    });
    await service.build({
      ...baseConfig,
      symbols: ['SOL/USDT'],
    });

    const history = await service.listHistory(2);

    expect(history).toHaveLength(2);
    expect(history[0].symbols).toEqual(['SOL/USDT']);
    expect(history[1].symbols).toEqual(['ETH/USDT']);
  });
});
