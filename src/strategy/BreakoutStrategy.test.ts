import { describe, it, expect, beforeEach } from 'vitest';
import { BreakoutStrategy } from './BreakoutStrategy.js';
import { KLineData } from '../types/market.js';
import { MAResult, MarketState, MarketStateInfo, SignalType } from '../types/strategy.js';

describe('BreakoutStrategy', () => {
  let strategy: BreakoutStrategy;

  beforeEach(() => {
    strategy = new BreakoutStrategy();
  });

  // 辅助函数：创建K线数据
  const createKLine = (timestamp: number, open: number, high: number, low: number, close: number): KLineData => ({
    timestamp,
    open,
    high,
    low,
    close,
    volume: 1000,
  });

  // 辅助函数：创建均线结果
  const createMAResult = (base: number, spread: number = 0): MAResult => ({
    ma20: base + spread,
    ma60: base,
    ma120: base - spread,
    ema20: base + spread,
    ema60: base,
    ema120: base - spread,
  });

  describe('detectSignal', () => {
    it('should return null when not in consolidation state', () => {
      const klines = Array.from({ length: 10 }, (_, i) => 
        createKLine(i * 3600000, 100, 105, 95, 100)
      );
      const maHistory = Array.from({ length: 10 }, () => createMAResult(100, 5));
      const stateInfo: MarketStateInfo = {
        state: MarketState.EXPANSION_BULL,
        stdDev: 5,
        range: 10,
        isBullish: true,
        isBearish: false,
      };

      const signal = strategy.detectSignal(klines, maHistory, stateInfo);
      expect(signal).toBeNull();
    });

    it('should return null when insufficient data', () => {
      const klines = Array.from({ length: 5 }, (_, i) => 
        createKLine(i * 3600000, 100, 105, 95, 100)
      );
      const maHistory = Array.from({ length: 5 }, () => createMAResult(100, 1));
      const stateInfo: MarketStateInfo = {
        state: MarketState.CONSOLIDATION,
        stdDev: 1,
        range: 2,
        isBullish: false,
        isBearish: false,
      };

      const signal = strategy.detectSignal(klines, maHistory, stateInfo);
      expect(signal).toBeNull();
    });

    it('should detect bullish breakout signal', () => {
      const maHistory = Array.from({ length: 15 }, () => createMAResult(100, 1));
      
      // 创建突破场景：密集区在99-101，价格突破到105后回踩到102
      const klines: KLineData[] = [
        ...Array.from({ length: 5 }, (_, i) => createKLine(i * 3600000, 100, 101, 99, 100)),
        createKLine(5 * 3600000, 100, 105, 100, 104), // 突破
        createKLine(6 * 3600000, 104, 106, 103, 105), // 继续上涨
        createKLine(7 * 3600000, 105, 105, 102, 103), // 回踩
        createKLine(8 * 3600000, 103, 104, 101, 102), // 回踩到密集区上方
        createKLine(9 * 3600000, 102, 103, 101, 102), // 当前K线，收盘在密集区上方
      ];

      const stateInfo: MarketStateInfo = {
        state: MarketState.CONSOLIDATION,
        stdDev: 0.5,
        range: 2,
        isBullish: false,
        isBearish: false,
      };

      const signal = strategy.detectSignal(klines, maHistory, stateInfo);
      expect(signal).not.toBeNull();
      expect(signal?.type).toBe(SignalType.BUY_BREAKOUT);
      expect(signal?.price).toBe(102);
      expect(signal?.stopLoss).toBeLessThan(signal!.price);
    });

    it('should detect bearish breakout signal', () => {
      const maHistory = Array.from({ length: 15 }, () => createMAResult(100, 1));
      
      // 创建突破场景：密集区在99-101，价格跌破到95后反弹到98
      const klines: KLineData[] = [
        ...Array.from({ length: 5 }, (_, i) => createKLine(i * 3600000, 100, 101, 99, 100)),
        createKLine(5 * 3600000, 100, 100, 95, 96), // 跌破
        createKLine(6 * 3600000, 96, 96, 94, 95), // 继续下跌
        createKLine(7 * 3600000, 95, 98, 95, 97), // 反弹
        createKLine(8 * 3600000, 97, 99, 97, 98), // 反弹到密集区下方
        createKLine(9 * 3600000, 98, 99, 97, 98), // 当前K线，收盘在密集区下方
      ];

      const stateInfo: MarketStateInfo = {
        state: MarketState.CONSOLIDATION,
        stdDev: 0.5,
        range: 2,
        isBullish: false,
        isBearish: false,
      };

      const signal = strategy.detectSignal(klines, maHistory, stateInfo);
      expect(signal).not.toBeNull();
      expect(signal?.type).toBe(SignalType.SELL_BREAKOUT);
      expect(signal?.price).toBe(98);
      expect(signal?.stopLoss).toBeGreaterThan(signal!.price);
    });
  });

  describe('calculateConsolidationBounds', () => {
    it('should calculate correct bounds from MA values', () => {
      const maResult: MAResult = {
        ma20: 102,
        ma60: 100,
        ma120: 98,
        ema20: 103,
        ema60: 101,
        ema120: 99,
      };

      const bounds = (strategy as any).calculateConsolidationBounds(maResult);
      expect(bounds.upper).toBe(103);
      expect(bounds.lower).toBe(98);
    });

    it('should handle NaN values', () => {
      const maResult: MAResult = {
        ma20: 102,
        ma60: NaN,
        ma120: 98,
        ema20: 103,
        ema60: 101,
        ema120: NaN,
      };

      const bounds = (strategy as any).calculateConsolidationBounds(maResult);
      expect(bounds.upper).toBe(103);
      expect(bounds.lower).toBe(98);
    });

    it('should return NaN bounds when all values are NaN', () => {
      const maResult: MAResult = {
        ma20: NaN,
        ma60: NaN,
        ma120: NaN,
        ema20: NaN,
        ema60: NaN,
        ema120: NaN,
      };

      const bounds = (strategy as any).calculateConsolidationBounds(maResult);
      expect(isNaN(bounds.upper)).toBe(true);
      expect(isNaN(bounds.lower)).toBe(true);
    });
  });

  describe('isInConsolidation', () => {
    it('should return true for CONSOLIDATION state', () => {
      const stateInfo: MarketStateInfo = {
        state: MarketState.CONSOLIDATION,
        stdDev: 1,
        range: 2,
        isBullish: false,
        isBearish: false,
      };

      const result = (strategy as any).isInConsolidation(stateInfo);
      expect(result).toBe(true);
    });

    it('should return false for non-CONSOLIDATION states', () => {
      const states = [
        MarketState.EXPANSION_BULL,
        MarketState.EXPANSION_BEAR,
        MarketState.UNKNOWN,
      ];

      states.forEach(state => {
        const stateInfo: MarketStateInfo = {
          state,
          stdDev: 5,
          range: 10,
          isBullish: state === MarketState.EXPANSION_BULL,
          isBearish: state === MarketState.EXPANSION_BEAR,
        };

        const result = (strategy as any).isInConsolidation(stateInfo);
        expect(result).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    it('should not generate signal if price breaks but does not pull back', () => {
      const maHistory = Array.from({ length: 15 }, () => createMAResult(100, 1));
      
      // 价格突破但持续上涨，没有回踩
      const klines: KLineData[] = [
        ...Array.from({ length: 5 }, (_, i) => createKLine(i * 3600000, 100, 101, 99, 100)),
        createKLine(5 * 3600000, 100, 105, 100, 104),
        createKLine(6 * 3600000, 104, 108, 104, 107),
        createKLine(7 * 3600000, 107, 110, 107, 109),
        createKLine(8 * 3600000, 109, 112, 109, 111),
        createKLine(9 * 3600000, 111, 115, 111, 114),
      ];

      const stateInfo: MarketStateInfo = {
        state: MarketState.CONSOLIDATION,
        stdDev: 0.5,
        range: 2,
        isBullish: false,
        isBearish: false,
      };

      const signal = strategy.detectSignal(klines, maHistory, stateInfo);
      expect(signal).toBeNull();
    });

    it('should not generate signal if pullback breaks below consolidation', () => {
      const maHistory = Array.from({ length: 15 }, () => createMAResult(100, 1));
      
      // 价格突破后回踩跌破密集区
      const klines: KLineData[] = [
        ...Array.from({ length: 5 }, (_, i) => createKLine(i * 3600000, 100, 101, 99, 100)),
        createKLine(5 * 3600000, 100, 105, 100, 104),
        createKLine(6 * 3600000, 104, 106, 103, 105),
        createKLine(7 * 3600000, 105, 105, 98, 99), // 回踩跌破密集区
        createKLine(8 * 3600000, 99, 100, 97, 98),
        createKLine(9 * 3600000, 98, 99, 97, 98),
      ];

      const stateInfo: MarketStateInfo = {
        state: MarketState.CONSOLIDATION,
        stdDev: 0.5,
        range: 2,
        isBullish: false,
        isBearish: false,
      };

      const signal = strategy.detectSignal(klines, maHistory, stateInfo);
      expect(signal).toBeNull();
    });

    it('should include meaningful reason in signal', () => {
      const maHistory = Array.from({ length: 15 }, () => createMAResult(100, 1));
      
      const klines: KLineData[] = [
        ...Array.from({ length: 5 }, (_, i) => createKLine(i * 3600000, 100, 101, 99, 100)),
        createKLine(5 * 3600000, 100, 105, 100, 104),
        createKLine(6 * 3600000, 104, 106, 103, 105),
        createKLine(7 * 3600000, 105, 105, 102, 103),
        createKLine(8 * 3600000, 103, 104, 101, 102),
        createKLine(9 * 3600000, 102, 103, 101, 102),
      ];

      const stateInfo: MarketStateInfo = {
        state: MarketState.CONSOLIDATION,
        stdDev: 0.5,
        range: 2,
        isBullish: false,
        isBearish: false,
      };

      const signal = strategy.detectSignal(klines, maHistory, stateInfo);
      expect(signal?.reason).toContain('突破密集区');
      expect(signal?.reason).toContain('回踩');
    });
  });
});
