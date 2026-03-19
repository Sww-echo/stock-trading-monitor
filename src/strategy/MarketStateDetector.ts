import { MAResult, MarketState, MarketStateInfo } from '../types/strategy.js';

/**
 * 市场状态检测器
 * 负责识别均线密集（Consolidation）和发散（Expansion）状态
 * 以及判断多头/空头排列
 */
export class MarketStateDetector {
  private consolidationThreshold: number;

  /**
   * @param consolidationThreshold 密集判断阈值（标准差），默认为0.02（2%）
   */
  constructor(consolidationThreshold: number = 0.02) {
    this.consolidationThreshold = consolidationThreshold;
  }

  /**
   * 检测市场状态
   * @param maResult 移动平均线计算结果
   * @returns 市场状态信息
   */
  detectState(maResult: MAResult): MarketStateInfo {
    // 提取所有6条均线的值
    const maValues = [
      maResult.ma20,
      maResult.ma60,
      maResult.ma120,
      maResult.ema20,
      maResult.ema60,
      maResult.ema120,
    ];

    // 如果有任何均线值为NaN，返回UNKNOWN状态
    if (maValues.some(v => isNaN(v))) {
      return {
        state: MarketState.UNKNOWN,
        stdDev: NaN,
        range: NaN,
        isBullish: false,
        isBearish: false,
      };
    }

    // 计算标准差
    const stdDev = this.calculateStdDev(maValues);

    // 计算极差（最大值 - 最小值）
    const maxValue = Math.max(...maValues);
    const minValue = Math.min(...maValues);
    const range = maxValue - minValue;

    // 检查多头和空头排列
    const isBullish = this.isBullishAlignment(maResult);
    const isBearish = this.isBearishAlignment(maResult);

    // 判断市场状态
    let state: MarketState;
    
    // 计算相对标准差（标准差/均值），用于判断密集程度
    const mean = maValues.reduce((sum, v) => sum + v, 0) / maValues.length;
    const relativeStdDev = stdDev / mean;

    if (relativeStdDev < this.consolidationThreshold) {
      // 标准差低于阈值，判定为密集状态
      state = MarketState.CONSOLIDATION;
    } else if (isBullish) {
      // 标准差高于阈值且多头排列，判定为多头发散
      state = MarketState.EXPANSION_BULL;
    } else if (isBearish) {
      // 标准差高于阈值且空头排列，判定为空头发散
      state = MarketState.EXPANSION_BEAR;
    } else {
      // 其他情况判定为未知状态
      state = MarketState.UNKNOWN;
    }

    return {
      state,
      stdDev,
      range,
      isBullish,
      isBearish,
    };
  }

  /**
   * 计算标准差
   * @param values 数值数组
   * @returns 标准差
   */
  calculateStdDev(values: number[]): number {
    if (values.length === 0) {
      return NaN;
    }

    // 计算均值
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    // 计算方差
    const variance = values.reduce((sum, value) => {
      const diff = value - mean;
      return sum + diff * diff;
    }, 0) / values.length;

    // 返回标准差（方差的平方根）
    return Math.sqrt(variance);
  }

  /**
   * 检查是否多头排列
   * 多头排列定义：MA20 > MA60 > MA120 且 EMA20 > EMA60 > EMA120
   * @param maResult 移动平均线计算结果
   * @returns 是否多头排列
   */
  isBullishAlignment(maResult: MAResult): boolean {
    const maAlignment = maResult.ma20 > maResult.ma60 && maResult.ma60 > maResult.ma120;
    const emaAlignment = maResult.ema20 > maResult.ema60 && maResult.ema60 > maResult.ema120;
    return maAlignment && emaAlignment;
  }

  /**
   * 检查是否空头排列
   * 空头排列定义：MA20 < MA60 < MA120 且 EMA20 < EMA60 < EMA120
   * @param maResult 移动平均线计算结果
   * @returns 是否空头排列
   */
  isBearishAlignment(maResult: MAResult): boolean {
    const maAlignment = maResult.ma20 < maResult.ma60 && maResult.ma60 < maResult.ma120;
    const emaAlignment = maResult.ema20 < maResult.ema60 && maResult.ema60 < maResult.ema120;
    return maAlignment && emaAlignment;
  }
}
