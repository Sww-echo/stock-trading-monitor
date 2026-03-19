import { describe, it, expect, vi } from 'vitest';
import { WatchSummaryService } from './WatchSummaryService.js';
import { SignalType } from '../types/strategy.js';
import { TakeProfitMode } from '../types/risk.js';
import { Position } from '../types/position.js';
import { SystemConfig } from '../types/config.js';

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
          },
        ]),
      },
    });

    const result = await service.build(baseConfig);

    expect(result.symbols).toEqual(['BTC/USDT', 'AAPL']);
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0].scannedSymbols).toEqual(['BTC/USDT']);
    expect(result.intervals[0].skippedSymbols).toEqual(['AAPL']);
    expect(result.intervals[0].advices).toHaveLength(1);
    expect(result.intervals[0].advices[0].action).toBe('buy');
    expect(result.positions.openCount).toBe(1);
    expect(result.positions.alerts).toHaveLength(1);
    expect(result.positions.alerts[0].shouldTakeProfit).toBe(true);
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
          },
        ]),
      },
    });

    const result = await service.build({
      ...baseConfig,
      symbols: ['BTC/USDT', 'ETH/USDT', 'AAPL'],
    });
    const agentSummary = service.buildAgentSummary(result);

    expect(agentSummary.status).toBe('attention');
    expect(agentSummary.counts.buy).toBe(2);
    expect(agentSummary.counts.positionAlerts).toBe(1);
    expect(agentSummary.counts.errors).toBe(0);
    expect(agentSummary.counts.skippedSymbols).toBe(1);
    expect(agentSummary.topSignals).toHaveLength(2);
    expect(agentSummary.topSignals[0].symbol).toBe('BTC/USDT');
    expect(agentSummary.positionActions).toEqual([
      {
        positionId: 'pos-1',
        symbol: 'BTC/USDT',
        action: 'take_profit',
        currentPrice: 40500,
        pnlPercent: 1.25,
      },
    ]);
    expect(agentSummary.skippedSymbols).toEqual(['AAPL']);
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

    const agentSummary = service.buildAgentSummary(result);
    expect(agentSummary.status).toBe('warning');
    expect(agentSummary.counts.errors).toBe(1);
  });
});
