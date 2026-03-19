import { describe, it, expect } from 'vitest';
import { RiskCalculator } from './RiskCalculator.js';
import { SignalType, TradingSignal } from '../types/strategy.js';
import { TakeProfitMode } from '../types/risk.js';

describe('RiskCalculator', () => {
  const createMockSignal = (overrides?: Partial<TradingSignal>): TradingSignal => ({
    type: SignalType.BUY_BREAKOUT,
    symbol: 'BTC/USDT',
    timestamp: Date.now(),
    price: 42000,
    stopLoss: 41000,
    takeProfit: [],
    reason: 'Test signal',
    confidence: 0.8,
    ...overrides
  });

  describe('calculate', () => {
    it('should calculate risk parameters with fixed ratio mode', () => {
      const calculator = new RiskCalculator(1000, 10000);
      const signal = createMockSignal();
      
      const result = calculator.calculate(signal, TakeProfitMode.FIXED_RATIO, 3);
      
      expect(result.stopLoss).toBe(41000);
      expect(result.takeProfit).toHaveLength(1);
      expect(result.takeProfit[0]).toBe(45000); // 42000 + (42000-41000)*3
      expect(result.positionSize).toBe(1); // 1000 / 1000
      expect(result.riskAmount).toBe(1000);
      expect(result.rewardAmount).toBe(3000);
      expect(result.riskRewardRatio).toBe(3);
    });

    it('should calculate risk parameters with fibonacci mode', () => {
      const calculator = new RiskCalculator(1000, 10000);
      const signal = createMockSignal();
      
      const result = calculator.calculate(signal, TakeProfitMode.FIBONACCI);
      
      expect(result.takeProfit).toHaveLength(4);
      expect(result.takeProfit[0]).toBeCloseTo(43618); // 42000 + 1000*1.618
      expect(result.takeProfit[1]).toBeCloseTo(44618); // 42000 + 1000*2.618
      expect(result.takeProfit[2]).toBeCloseTo(45618); // 42000 + 1000*3.618
      expect(result.takeProfit[3]).toBeCloseTo(46236); // 42000 + 1000*4.236
    });

    it('should generate warning for high leverage', () => {
      const calculator = new RiskCalculator(1000, 1000); // Small account
      const signal = createMockSignal({ price: 42000, stopLoss: 41000 });
      
      const result = calculator.calculate(signal, TakeProfitMode.FIXED_RATIO, 3);
      
      expect(result.leverage).toBeGreaterThan(3);
      expect(result.warning).toContain('高风险警告');
    });
  });

  describe('calculateStopLoss', () => {
    it('should return stop loss from signal', () => {
      const calculator = new RiskCalculator(1000, 10000);
      const signal = createMockSignal({ stopLoss: 41000 });
      
      const stopLoss = calculator.calculateStopLoss(signal);
      
      expect(stopLoss).toBe(41000);
    });
  });

  describe('calculateTakeProfit', () => {
    it('should calculate take profit with fixed ratio 1:3', () => {
      const calculator = new RiskCalculator(1000, 10000);
      const signal = createMockSignal({ price: 42000, stopLoss: 41000 });
      
      const takeProfit = calculator.calculateTakeProfit(signal, TakeProfitMode.FIXED_RATIO, 3);
      
      expect(takeProfit).toHaveLength(1);
      expect(takeProfit[0]).toBe(45000);
    });

    it('should calculate take profit with fixed ratio 1:5', () => {
      const calculator = new RiskCalculator(1000, 10000);
      const signal = createMockSignal({ price: 42000, stopLoss: 41000 });
      
      const takeProfit = calculator.calculateTakeProfit(signal, TakeProfitMode.FIXED_RATIO, 5);
      
      expect(takeProfit).toHaveLength(1);
      expect(takeProfit[0]).toBe(47000);
    });

    it('should calculate take profit for short positions', () => {
      const calculator = new RiskCalculator(1000, 10000);
      const signal = createMockSignal({ 
        type: SignalType.SELL_BREAKOUT,
        price: 42000, 
        stopLoss: 43000 
      });
      
      const takeProfit = calculator.calculateTakeProfit(signal, TakeProfitMode.FIXED_RATIO, 3);
      
      expect(takeProfit).toHaveLength(1);
      expect(takeProfit[0]).toBe(39000); // 42000 - (43000-42000)*3
    });

    it('should calculate take profit with previous consolidation mode', () => {
      const calculator = new RiskCalculator(1000, 10000);
      const signal = createMockSignal({ price: 42000, stopLoss: 41000 });
      
      const takeProfit = calculator.calculateTakeProfit(signal, TakeProfitMode.PREVIOUS_CONSOLIDATION);
      
      expect(takeProfit).toHaveLength(1);
      expect(takeProfit[0]).toBe(44000); // 42000 + (42000-41000)*2
    });

    it('should calculate take profit with fibonacci mode', () => {
      const calculator = new RiskCalculator(1000, 10000);
      const signal = createMockSignal({ price: 42000, stopLoss: 41000 });
      
      const takeProfit = calculator.calculateTakeProfit(signal, TakeProfitMode.FIBONACCI);
      
      expect(takeProfit).toHaveLength(4);
      expect(takeProfit[0]).toBeCloseTo(43618);
      expect(takeProfit[1]).toBeCloseTo(44618);
      expect(takeProfit[2]).toBeCloseTo(45618);
      expect(takeProfit[3]).toBeCloseTo(46236);
    });
  });

  describe('calculatePositionSize', () => {
    it('should calculate position size based on max risk', () => {
      const calculator = new RiskCalculator(1000, 10000);
      
      const positionSize = calculator.calculatePositionSize(42000, 41000);
      
      expect(positionSize).toBe(1); // 1000 / (42000-41000)
    });

    it('should calculate position size for different risk distances', () => {
      const calculator = new RiskCalculator(500, 10000);
      
      const positionSize = calculator.calculatePositionSize(42000, 41500);
      
      expect(positionSize).toBe(1); // 500 / 500
    });

    it('should throw error when stop loss equals entry price', () => {
      const calculator = new RiskCalculator(1000, 10000);
      
      expect(() => calculator.calculatePositionSize(42000, 42000)).toThrow('止损价格不能等于开仓价格');
    });
  });

  describe('calculateLeverage', () => {
    it('should calculate leverage correctly', () => {
      const calculator = new RiskCalculator(1000, 10000);
      
      const leverage = calculator.calculateLeverage(30000);
      
      expect(leverage).toBe(3);
    });

    it('should calculate leverage less than 1 for small positions', () => {
      const calculator = new RiskCalculator(1000, 10000);
      
      const leverage = calculator.calculateLeverage(5000);
      
      expect(leverage).toBe(0.5);
    });

    it('should throw error when account balance is zero', () => {
      const calculator = new RiskCalculator(1000, 0);
      
      expect(() => calculator.calculateLeverage(30000)).toThrow('账户余额不能为0');
    });
  });
});
