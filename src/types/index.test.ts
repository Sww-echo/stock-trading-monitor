import { describe, it, expect } from 'vitest';
import { MarketType, MarketState, SignalType, AlertType, TakeProfitMode, AdviceAction, isActionablePositionStatus } from './index.js';

describe('Core Type Definitions', () => {
  it('should export MarketType enum', () => {
    expect(MarketType.CRYPTO).toBe('crypto');
    expect(MarketType.STOCK_CN).toBe('stock_cn');
    expect(MarketType.STOCK_US).toBe('stock_us');
  });

  it('should export MarketState enum', () => {
    expect(MarketState.CONSOLIDATION).toBe('consolidation');
    expect(MarketState.EXPANSION_BULL).toBe('expansion_bull');
    expect(MarketState.EXPANSION_BEAR).toBe('expansion_bear');
    expect(MarketState.UNKNOWN).toBe('unknown');
  });

  it('should export SignalType enum', () => {
    expect(SignalType.BUY_BREAKOUT).toBe('buy_breakout');
    expect(SignalType.SELL_BREAKOUT).toBe('sell_breakout');
    expect(SignalType.BUY_PULLBACK).toBe('buy_pullback');
    expect(SignalType.SELL_PULLBACK).toBe('sell_pullback');
  });

  it('should export AlertType enum', () => {
    expect(AlertType.BUY_SIGNAL).toBe('buy_signal');
    expect(AlertType.SELL_SIGNAL).toBe('sell_signal');
    expect(AlertType.STOP_LOSS).toBe('stop_loss');
    expect(AlertType.TAKE_PROFIT).toBe('take_profit');
    expect(AlertType.TREND_REVERSAL).toBe('trend_reversal');
    expect(AlertType.ERROR).toBe('error');
  });

  it('should export AdviceAction type values as string literals', () => {
    const action: AdviceAction = 'buy';
    expect(action).toBe('buy');
  });

  it('should export isActionablePositionStatus helper', () => {
    const actionable = isActionablePositionStatus({
      position: {
        id: 'p1',
        symbol: 'BTC/USDT',
        entryPrice: 40000,
        entryTime: 1710000000000,
        quantity: 0.1,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 39000,
        takeProfit: [43000],
        status: 'open',
      },
      currentPrice: 40500,
      pnl: 50,
      pnlPercent: 1.25,
      shouldStopLoss: false,
      shouldTakeProfit: true,
      trendReversed: false,
    });

    const notActionable = isActionablePositionStatus({
      position: {
        id: 'p2',
        symbol: 'ETH/USDT',
        entryPrice: 3000,
        entryTime: 1710000000000,
        quantity: 1,
        strategyType: SignalType.BUY_PULLBACK,
        stopLoss: 2800,
        takeProfit: [3300],
        status: 'open',
      },
      currentPrice: 3010,
      pnl: 10,
      pnlPercent: 0.33,
      shouldStopLoss: false,
      shouldTakeProfit: false,
      trendReversed: false,
    });

    expect(actionable).toBe(true);
    expect(notActionable).toBe(false);
  });

  it('should export TakeProfitMode enum', () => {
    expect(TakeProfitMode.FIXED_RATIO).toBe('fixed_ratio');
    expect(TakeProfitMode.PREVIOUS_CONSOLIDATION).toBe('prev_consol');
    expect(TakeProfitMode.FIBONACCI).toBe('fibonacci');
  });
});
