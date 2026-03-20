import { describe, expect, it } from 'vitest';
import { SymbolClassifier } from './SymbolClassifier.js';
import { MarketType } from '../types/market.js';

describe('SymbolClassifier', () => {
  const classifier = new SymbolClassifier();

  it('should classify crypto symbols with slash', () => {
    expect(classifier.classify('BTC/USDT')).toBe(MarketType.CRYPTO);
  });

  it('should classify crypto symbols with dash', () => {
    expect(classifier.classify('BTC-USDT')).toBe(MarketType.CRYPTO);
  });

  it('should classify common crypto ticker', () => {
    expect(classifier.classify('ETH')).toBe(MarketType.CRYPTO);
  });

  it('should classify A-share symbols', () => {
    expect(classifier.classify('600519.SH')).toBe(MarketType.STOCK_CN);
    expect(classifier.classify('000001.SZ')).toBe(MarketType.STOCK_CN);
  });

  it('should classify US stock symbols', () => {
    expect(classifier.classify('AAPL')).toBe(MarketType.STOCK_US);
  });

  it('should throw for unsupported symbols', () => {
    expect(() => classifier.classify('INVALID@SYMBOL')).toThrow('Unable to determine market type');
  });
});
