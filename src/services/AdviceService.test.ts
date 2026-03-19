import { describe, it, expect } from 'vitest';
import { AdviceService } from './AdviceService.js';
import { SystemConfig } from '../types/config.js';
import { TakeProfitMode } from '../types/risk.js';
import { SignalType, TradingSignal } from '../types/strategy.js';

describe('AdviceService', () => {
  const service = new AdviceService();

  const baseConfig: SystemConfig = {
    symbols: ['BTC/USDT'],
    intervals: ['1h'],
    providers: {
      binance: { enabled: true },
      okx: { enabled: false },
      tushare: { enabled: false, apiToken: '' },
      yahooFinance: { enabled: false },
    },
    consolidationThreshold: 0.02,
    takeProfitMode: TakeProfitMode.FIXED_RATIO,
    takeProfitRatio: 3,
    maxRiskPerTrade: 100,
    maxLeverage: 3,
    accountBalance: 10000,
    enableSound: false,
    enableEmail: false,
    emailAddress: undefined,
    dataRetentionDays: 30,
    updateInterval: 60,
  };

  const createSignal = (overrides?: Partial<TradingSignal>): TradingSignal => ({
    type: SignalType.BUY_BREAKOUT,
    symbol: 'BTC/USDT',
    timestamp: 1710000000000,
    price: 42000,
    stopLoss: 41000,
    takeProfit: [],
    reason: '均线密集后向上突破',
    confidence: 0.8,
    ...overrides,
  });

  it('应该将买入突破信号转换为 buy 建议', () => {
    const advice = service.fromSignal(createSignal(), '1h', baseConfig);

    expect(advice.action).toBe('buy');
    expect(advice.signalType).toBe(SignalType.BUY_BREAKOUT);
    expect(advice.adviceLevel).toBe('strong');
    expect(advice.entryPrice).toBe(42000);
    expect(advice.stopLoss).toBe(41000);
    expect(advice.takeProfit).toEqual([45000]);
  });

  it('应该将卖出突破信号转换为 sell 建议', () => {
    const advice = service.fromSignal(
      createSignal({
        type: SignalType.SELL_BREAKOUT,
        price: 42000,
        stopLoss: 43000,
        reason: '均线密集后向下跌破',
      }),
      '4h',
      baseConfig
    );

    expect(advice.action).toBe('sell');
    expect(advice.interval).toBe('4h');
    expect(advice.takeProfit).toEqual([39000]);
  });

  it('应该支持回踩类信号并生成对应说明', () => {
    const advice = service.fromSignal(
      createSignal({
        type: SignalType.BUY_PULLBACK,
        reason: '上涨趋势中首次回踩 MA20',
        confidence: 0.75,
      }),
      '1h',
      baseConfig
    );

    expect(advice.action).toBe('buy');
    expect(advice.adviceLevel).toBe('normal');
    expect(advice.riskNote).toContain('回踩类信号');
  });

  it('应该根据 confidence 生成 weak 等级建议', () => {
    const advice = service.fromSignal(
      createSignal({ confidence: 0.45 }),
      '1h',
      baseConfig
    );

    expect(advice.adviceLevel).toBe('weak');
  });

  it('应该根据配置中的止盈模式生成止盈位', () => {
    const advice = service.fromSignal(
      createSignal(),
      '1h',
      {
        ...baseConfig,
        takeProfitMode: TakeProfitMode.FIBONACCI,
      }
    );

    expect(advice.takeProfit).toHaveLength(4);
    expect(advice.takeProfit[0]).toBeCloseTo(43618);
  });

  it('应该在高杠杆场景下附加风险警告', () => {
    const advice = service.fromSignal(
      createSignal(),
      '1h',
      {
        ...baseConfig,
        maxRiskPerTrade: 1000,
        accountBalance: 1000,
      }
    );

    expect(advice.riskNote).toContain('高风险警告');
  });

  it('应该支持批量转换信号', () => {
    const advices = service.fromSignals(
      [
        createSignal(),
        createSignal({ symbol: 'ETH/USDT', type: SignalType.SELL_PULLBACK, stopLoss: 43000 }),
      ],
      '1h',
      baseConfig
    );

    expect(advices).toHaveLength(2);
    expect(advices[0].symbol).toBe('BTC/USDT');
    expect(advices[1].action).toBe('sell');
  });
});
