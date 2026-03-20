import { describe, expect, it, vi } from 'vitest';
import { MarketChartService } from './MarketChartService.js';
import { KLineData } from '../types/market.js';
import { SignalType } from '../types/strategy.js';

function createBreakoutKlines(): KLineData[] {
  const closes = [
    ...Array.from({ length: 120 }, (_, index) => 100 + (index % 2 === 0 ? 0.12 : -0.12)),
    100.4,
    101.3,
    103.1,
    102.5,
    102.9,
    103.3,
  ];

  return closes.map((close, index) => {
    const previousClose = closes[Math.max(0, index - 1)] ?? close;
    const open = index === 0 ? close : previousClose;
    const high = Math.max(open, close) + 0.45;
    const low = Math.min(open, close) - 0.45;

    return {
      timestamp: 1710000000000 + index * 60 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: 1000 + index * 10,
    };
  });
}

describe('MarketChartService', () => {
  it('应该生成 agent 可消费的图表分析和 SVG', async () => {
    const klines = createBreakoutKlines();
    const service = new MarketChartService({
      dataManager: {
        getKLines: vi.fn(async () => klines),
      },
    });

    const analysis = await service.buildAnalysis('BTC/USDT', '1h', {
      limit: klines.length,
      consolidationThreshold: 0.02,
    });

    expect(analysis.symbol).toBe('BTC/USDT');
    expect(analysis.klines).toHaveLength(klines.length);
    expect(analysis.movingAverages[0].ma20).toBeNull();
    expect(analysis.movingAverages[119].ma120).not.toBeNull();
    expect(analysis.density.some((point) => point.state === 'consolidation')).toBe(true);
    expect(analysis.signals.some((signal) => signal.type === SignalType.BUY_BREAKOUT)).toBe(true);
    expect(analysis.summary.latestDensity).not.toBeNull();
    expect(analysis.summary.analysisNotes.length).toBeGreaterThan(0);

    const svg = service.renderSvg(analysis);
    expect(svg).toContain('<svg');
    expect(svg).toContain('BTC/USDT');
    expect(svg).toContain('BUY BO');
  });
});
