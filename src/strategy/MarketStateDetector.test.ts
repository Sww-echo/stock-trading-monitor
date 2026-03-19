import { describe, it, expect } from 'vitest';
import { MarketStateDetector } from './MarketStateDetector.js';
import { MAResult, MarketState } from '../types/strategy.js';

describe('MarketStateDetector', () => {
  describe('calculateStdDev', () => {
    it('should calculate standard deviation correctly', () => {
      const detector = new MarketStateDetector();
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const stdDev = detector.calculateStdDev(values);
      expect(stdDev).toBeCloseTo(2.0, 1);
    });

    it('should return NaN for empty array', () => {
      const detector = new MarketStateDetector();
      const stdDev = detector.calculateStdDev([]);
      expect(stdDev).toBeNaN();
    });

    it('should return 0 for identical values', () => {
      const detector = new MarketStateDetector();
      const values = [5, 5, 5, 5, 5];
      const stdDev = detector.calculateStdDev(values);
      expect(stdDev).toBe(0);
    });
  });

  describe('isBullishAlignment', () => {
    it('should return true for bullish alignment', () => {
      const detector = new MarketStateDetector();
      const maResult: MAResult = {
        ma20: 120,
        ma60: 110,
        ma120: 100,
        ema20: 125,
        ema60: 115,
        ema120: 105,
      };
      expect(detector.isBullishAlignment(maResult)).toBe(true);
    });

    it('should return false when MA alignment is incorrect', () => {
      const detector = new MarketStateDetector();
      const maResult: MAResult = {
        ma20: 100,
        ma60: 110,
        ma120: 120,
        ema20: 125,
        ema60: 115,
        ema120: 105,
      };
      expect(detector.isBullishAlignment(maResult)).toBe(false);
    });

    it('should return false when EMA alignment is incorrect', () => {
      const detector = new MarketStateDetector();
      const maResult: MAResult = {
        ma20: 120,
        ma60: 110,
        ma120: 100,
        ema20: 105,
        ema60: 115,
        ema120: 125,
      };
      expect(detector.isBullishAlignment(maResult)).toBe(false);
    });

    it('should return false when both alignments are incorrect', () => {
      const detector = new MarketStateDetector();
      const maResult: MAResult = {
        ma20: 100,
        ma60: 110,
        ma120: 120,
        ema20: 105,
        ema60: 115,
        ema120: 125,
      };
      expect(detector.isBullishAlignment(maResult)).toBe(false);
    });
  });

  describe('isBearishAlignment', () => {
    it('should return true for bearish alignment', () => {
      const detector = new MarketStateDetector();
      const maResult: MAResult = {
        ma20: 100,
        ma60: 110,
        ma120: 120,
        ema20: 105,
        ema60: 115,
        ema120: 125,
      };
      expect(detector.isBearishAlignment(maResult)).toBe(true);
    });

    it('should return false when MA alignment is incorrect', () => {
      const detector = new MarketStateDetector();
      const maResult: MAResult = {
        ma20: 120,
        ma60: 110,
        ma120: 100,
        ema20: 105,
        ema60: 115,
        ema120: 125,
      };
      expect(detector.isBearishAlignment(maResult)).toBe(false);
    });

    it('should return false when EMA alignment is incorrect', () => {
      const detector = new MarketStateDetector();
      const maResult: MAResult = {
        ma20: 100,
        ma60: 110,
        ma120: 120,
        ema20: 125,
        ema60: 115,
        ema120: 105,
      };
      expect(detector.isBearishAlignment(maResult)).toBe(false);
    });
  });

  describe('detectState', () => {
    it('should detect CONSOLIDATION state when stdDev is below threshold', () => {
      const detector = new MarketStateDetector(0.02);
      const maResult: MAResult = {
        ma20: 100,
        ma60: 101,
        ma120: 100.5,
        ema20: 100.2,
        ema60: 100.8,
        ema120: 100.3,
      };
      const stateInfo = detector.detectState(maResult);
      expect(stateInfo.state).toBe(MarketState.CONSOLIDATION);
      expect(stateInfo.isBullish).toBe(false);
      expect(stateInfo.isBearish).toBe(false);
    });

    it('should detect EXPANSION_BULL state for bullish alignment with high stdDev', () => {
      const detector = new MarketStateDetector(0.02);
      const maResult: MAResult = {
        ma20: 120,
        ma60: 110,
        ma120: 100,
        ema20: 125,
        ema60: 115,
        ema120: 105,
      };
      const stateInfo = detector.detectState(maResult);
      expect(stateInfo.state).toBe(MarketState.EXPANSION_BULL);
      expect(stateInfo.isBullish).toBe(true);
      expect(stateInfo.isBearish).toBe(false);
    });

    it('should detect EXPANSION_BEAR state for bearish alignment with high stdDev', () => {
      const detector = new MarketStateDetector(0.02);
      const maResult: MAResult = {
        ma20: 100,
        ma60: 110,
        ma120: 120,
        ema20: 105,
        ema60: 115,
        ema120: 125,
      };
      const stateInfo = detector.detectState(maResult);
      expect(stateInfo.state).toBe(MarketState.EXPANSION_BEAR);
      expect(stateInfo.isBullish).toBe(false);
      expect(stateInfo.isBearish).toBe(true);
    });

    it('should detect UNKNOWN state when no clear alignment exists', () => {
      const detector = new MarketStateDetector(0.02);
      const maResult: MAResult = {
        ma20: 110,
        ma60: 100,
        ma120: 120,
        ema20: 115,
        ema60: 105,
        ema120: 125,
      };
      const stateInfo = detector.detectState(maResult);
      expect(stateInfo.state).toBe(MarketState.UNKNOWN);
      expect(stateInfo.isBullish).toBe(false);
      expect(stateInfo.isBearish).toBe(false);
    });

    it('should return UNKNOWN state when any MA value is NaN', () => {
      const detector = new MarketStateDetector(0.02);
      const maResult: MAResult = {
        ma20: NaN,
        ma60: 110,
        ma120: 100,
        ema20: 125,
        ema60: 115,
        ema120: 105,
      };
      const stateInfo = detector.detectState(maResult);
      expect(stateInfo.state).toBe(MarketState.UNKNOWN);
      expect(stateInfo.stdDev).toBeNaN();
      expect(stateInfo.range).toBeNaN();
      expect(stateInfo.isBullish).toBe(false);
      expect(stateInfo.isBearish).toBe(false);
    });

    it('should calculate range correctly', () => {
      const detector = new MarketStateDetector(0.02);
      const maResult: MAResult = {
        ma20: 120,
        ma60: 110,
        ma120: 100,
        ema20: 125,
        ema60: 115,
        ema120: 105,
      };
      const stateInfo = detector.detectState(maResult);
      expect(stateInfo.range).toBe(25); // 125 - 100
    });

    it('should use custom consolidation threshold', () => {
      const detector = new MarketStateDetector(0.1); // Higher threshold
      const maResult: MAResult = {
        ma20: 110,
        ma60: 105,
        ma120: 100,
        ema20: 112,
        ema60: 107,
        ema120: 102,
      };
      const stateInfo = detector.detectState(maResult);
      // With higher threshold, this should be consolidation
      expect(stateInfo.state).toBe(MarketState.CONSOLIDATION);
    });
  });

  describe('edge cases', () => {
    it('should handle equal MA values correctly', () => {
      const detector = new MarketStateDetector(0.02);
      const maResult: MAResult = {
        ma20: 100,
        ma60: 100,
        ma120: 100,
        ema20: 100,
        ema60: 100,
        ema120: 100,
      };
      const stateInfo = detector.detectState(maResult);
      expect(stateInfo.state).toBe(MarketState.CONSOLIDATION);
      expect(stateInfo.stdDev).toBe(0);
      expect(stateInfo.range).toBe(0);
    });

    it('should handle very small price differences', () => {
      const detector = new MarketStateDetector(0.02);
      const maResult: MAResult = {
        ma20: 42000.1,
        ma60: 42000.2,
        ma120: 42000.15,
        ema20: 42000.12,
        ema60: 42000.18,
        ema120: 42000.14,
      };
      const stateInfo = detector.detectState(maResult);
      expect(stateInfo.state).toBe(MarketState.CONSOLIDATION);
    });
  });
});
