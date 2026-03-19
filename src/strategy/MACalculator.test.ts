import { describe, it, expect } from 'vitest';
import { MACalculator } from './MACalculator.js';
import { KLineData } from '../types/market.js';

describe('MACalculator', () => {
  const calculator = new MACalculator();

  describe('calculateSMA', () => {
    it('should calculate simple moving average correctly', () => {
      const prices = [10, 20, 30, 40, 50];
      const result = calculator.calculateSMA(prices, 5);
      expect(result).toBe(30); // (10+20+30+40+50)/5 = 30
    });

    it('should use only the last N prices for calculation', () => {
      const prices = [10, 20, 30, 40, 50, 60];
      const result = calculator.calculateSMA(prices, 3);
      expect(result).toBe(50); // (40+50+60)/3 = 50
    });

    it('should return NaN when insufficient data', () => {
      const prices = [10, 20];
      const result = calculator.calculateSMA(prices, 5);
      expect(result).toBeNaN();
    });

    it('should handle single period correctly', () => {
      const prices = [42];
      const result = calculator.calculateSMA(prices, 1);
      expect(result).toBe(42);
    });

    it('should handle exact period length', () => {
      const prices = [10, 20, 30];
      const result = calculator.calculateSMA(prices, 3);
      expect(result).toBe(20);
    });
  });

  describe('calculateEMA', () => {
    it('should calculate exponential moving average correctly', () => {
      const prices = [22, 24, 23, 25, 27, 26, 28, 30];
      const result = calculator.calculateEMA(prices, 5);
      
      // Manual calculation:
      // Initial SMA(5) = (22+24+23+25+27)/5 = 24.2
      // Multiplier = 2/(5+1) = 0.333...
      // EMA[5] = (26-24.2)*0.333 + 24.2 = 24.8
      // EMA[6] = (28-24.8)*0.333 + 24.8 = 25.867
      // EMA[7] = (30-25.867)*0.333 + 25.867 = 27.244
      expect(result).toBeCloseTo(27.244, 2);
    });

    it('should return NaN when insufficient data', () => {
      const prices = [10, 20];
      const result = calculator.calculateEMA(prices, 5);
      expect(result).toBeNaN();
    });

    it('should handle exact period length', () => {
      const prices = [10, 20, 30];
      const result = calculator.calculateEMA(prices, 3);
      // With exact period, EMA equals SMA
      expect(result).toBe(20);
    });

    it('should give more weight to recent prices', () => {
      const prices = Array(20).fill(10);
      prices.push(100); // Add a spike at the end
      
      const sma = calculator.calculateSMA(prices, 10);
      const ema = calculator.calculateEMA(prices, 10);
      
      // EMA should be higher than SMA due to recent spike
      expect(ema).toBeGreaterThan(sma);
    });
  });

  describe('calculateAll', () => {
    it('should calculate all 6 moving averages', () => {
      const klines: KLineData[] = [];
      for (let i = 0; i < 120; i++) {
        klines.push({
          timestamp: Date.now() + i * 3600000,
          open: 100 + i,
          high: 105 + i,
          low: 95 + i,
          close: 100 + i,
          volume: 1000,
        });
      }

      const result = calculator.calculateAll(klines);

      expect(result.ma20).toBeDefined();
      expect(result.ma60).toBeDefined();
      expect(result.ma120).toBeDefined();
      expect(result.ema20).toBeDefined();
      expect(result.ema60).toBeDefined();
      expect(result.ema120).toBeDefined();

      // All values should be numbers
      expect(typeof result.ma20).toBe('number');
      expect(typeof result.ma60).toBe('number');
      expect(typeof result.ma120).toBe('number');
      expect(typeof result.ema20).toBe('number');
      expect(typeof result.ema60).toBe('number');
      expect(typeof result.ema120).toBe('number');
    });

    it('should return NaN for periods with insufficient data', () => {
      const klines: KLineData[] = [];
      for (let i = 0; i < 30; i++) {
        klines.push({
          timestamp: Date.now() + i * 3600000,
          open: 100,
          high: 105,
          low: 95,
          close: 100,
          volume: 1000,
        });
      }

      const result = calculator.calculateAll(klines);

      expect(result.ma20).not.toBeNaN();
      expect(result.ma60).toBeNaN(); // Not enough data
      expect(result.ma120).toBeNaN(); // Not enough data
    });

    it('should use close prices for calculation', () => {
      const klines: KLineData[] = [];
      for (let i = 0; i < 20; i++) {
        klines.push({
          timestamp: Date.now() + i * 3600000,
          open: 50,
          high: 60,
          low: 40,
          close: 100, // Only close price should matter
          volume: 1000,
        });
      }

      const result = calculator.calculateAll(klines);
      expect(result.ma20).toBe(100); // All close prices are 100
    });
  });

  describe('calculateHistory', () => {
    it('should calculate MA values for each historical point', () => {
      const klines: KLineData[] = [];
      for (let i = 0; i < 50; i++) {
        klines.push({
          timestamp: Date.now() + i * 3600000,
          open: 100,
          high: 105,
          low: 95,
          close: 100 + i,
          volume: 1000,
        });
      }

      const history = calculator.calculateHistory(klines);

      expect(history).toHaveLength(50);
      expect(history[0]).toBeDefined();
      expect(history[49]).toBeDefined();
    });

    it('should have NaN for early periods with insufficient data', () => {
      const klines: KLineData[] = [];
      for (let i = 0; i < 30; i++) {
        klines.push({
          timestamp: Date.now() + i * 3600000,
          open: 100,
          high: 105,
          low: 95,
          close: 100,
          volume: 1000,
        });
      }

      const history = calculator.calculateHistory(klines);

      // First 19 entries should have NaN for ma20
      expect(history[0].ma20).toBeNaN();
      expect(history[10].ma20).toBeNaN();
      expect(history[19].ma20).not.toBeNaN(); // 20th entry should have ma20
    });

    it('should show progression of MA values over time', () => {
      const klines: KLineData[] = [];
      for (let i = 0; i < 25; i++) {
        klines.push({
          timestamp: Date.now() + i * 3600000,
          open: 100,
          high: 105,
          low: 95,
          close: 100 + i * 2, // Increasing prices
          volume: 1000,
        });
      }

      const history = calculator.calculateHistory(klines);

      // MA20 should increase over time with increasing prices
      const ma20_at_20 = history[19].ma20;
      const ma20_at_24 = history[24].ma20;
      
      expect(ma20_at_24).toBeGreaterThan(ma20_at_20);
    });

    it('should handle empty array', () => {
      const history = calculator.calculateHistory([]);
      expect(history).toHaveLength(0);
    });

    it('should handle single data point', () => {
      const klines: KLineData[] = [{
        timestamp: Date.now(),
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 1000,
      }];

      const history = calculator.calculateHistory(klines);
      expect(history).toHaveLength(1);
      expect(history[0].ma20).toBeNaN();
    });
  });

  describe('edge cases', () => {
    it('should handle zero prices', () => {
      const prices = [0, 0, 0, 0, 0];
      const sma = calculator.calculateSMA(prices, 5);
      const ema = calculator.calculateEMA(prices, 5);
      
      expect(sma).toBe(0);
      expect(ema).toBe(0);
    });

    it('should handle negative prices', () => {
      const prices = [-10, -20, -30, -40, -50];
      const sma = calculator.calculateSMA(prices, 5);
      
      expect(sma).toBe(-30);
    });

    it('should handle very large numbers', () => {
      const prices = Array(20).fill(1e10);
      const sma = calculator.calculateSMA(prices, 20);
      
      expect(sma).toBe(1e10);
    });

    it('should handle decimal prices with precision', () => {
      const prices = [10.123, 20.456, 30.789];
      const sma = calculator.calculateSMA(prices, 3);
      
      expect(sma).toBeCloseTo(20.456, 3);
    });
  });
});
