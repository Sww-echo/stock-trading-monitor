import { KLineData } from '../types/market.js';
import { MAResult } from '../types/strategy.js';

/**
 * 移动平均线计算器
 * 负责计算简单移动平均线(SMA)和指数移动平均线(EMA)
 */
export class MACalculator {
  /**
   * 计算简单移动平均线 (Simple Moving Average)
   * @param prices 价格数组
   * @param period 周期
   * @returns SMA值，如果数据不足返回NaN
   */
  calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return NaN;
    }

    const relevantPrices = prices.slice(-period);
    const sum = relevantPrices.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  /**
   * 计算指数移动平均线 (Exponential Moving Average)
   * @param prices 价格数组
   * @param period 周期
   * @returns EMA值，如果数据不足返回NaN
   */
  calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return NaN;
    }

    const multiplier = 2 / (period + 1);
    
    // 初始EMA使用前period个价格的SMA
    const initialSMA = this.calculateSMA(prices.slice(0, period), period);
    let ema = initialSMA;

    // 从period位置开始计算EMA
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * 计算所有6条均线
   * @param klines K线数据数组
   * @returns MAResult对象，包含所有6条均线的值
   */
  calculateAll(klines: KLineData[]): MAResult {
    const closePrices = klines.map(k => k.close);

    return {
      ma20: this.calculateSMA(closePrices, 20),
      ma60: this.calculateSMA(closePrices, 60),
      ma120: this.calculateSMA(closePrices, 120),
      ema20: this.calculateEMA(closePrices, 20),
      ema60: this.calculateEMA(closePrices, 60),
      ema120: this.calculateEMA(closePrices, 120),
    };
  }

  /**
   * 批量计算历史均线值
   * 为每个K线位置计算当时的均线值
   * @param klines K线数据数组
   * @returns MAResult数组，每个元素对应一个K线位置的均线值
   */
  calculateHistory(klines: KLineData[]): MAResult[] {
    const results: MAResult[] = [];
    
    // 需要至少120个数据点才能计算完整的均线
    for (let i = 0; i < klines.length; i++) {
      const slicedKlines = klines.slice(0, i + 1);
      results.push(this.calculateAll(slicedKlines));
    }

    return results;
  }
}
