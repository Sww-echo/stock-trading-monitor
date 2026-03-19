import { KLineData } from '../types/market.js';
import { MAResult, MarketState, MarketStateInfo, SignalType, TradingSignal } from '../types/strategy.js';

/**
 * 策略A：均线密集突破开仓法
 * 
 * 策略逻辑：
 * 1. 只在市场处于CONSOLIDATION状态时监控
 * 2. 检测价格突破密集区后的回踩/反弹
 * 3. 向上突破：价格突破密集区上边界后回踩但未跌破，收盘价在密集区上方
 * 4. 向下突破：价格跌破密集区下边界后反弹但未突破，收盘价在密集区下方
 * 5. 止损位设置在密集区的另一侧边界
 */
export class BreakoutStrategy {
  /**
   * 检测突破信号
   * @param klines K线数据数组
   * @param maHistory 历史均线数据
   * @param stateInfo 市场状态信息
   * @returns 交易信号或null
   */
  detectSignal(
    klines: KLineData[],
    maHistory: MAResult[],
    stateInfo: MarketStateInfo
  ): TradingSignal | null {
    // 只在密集状态下检测突破信号
    if (!this.isInConsolidation(stateInfo)) {
      return null;
    }

    // 需要足够的历史数据
    if (klines.length < 10 || maHistory.length < 10) {
      return null;
    }

    // 检测向上突破
    const bullishSignal = this.detectBullishBreakout(klines, maHistory);
    if (bullishSignal) {
      return bullishSignal;
    }

    // 检测向下突破
    const bearishSignal = this.detectBearishBreakout(klines, maHistory);
    if (bearishSignal) {
      return bearishSignal;
    }

    return null;
  }

  /**
   * 检查是否处于密集状态
   * @param stateInfo 市场状态信息
   * @returns 是否密集
   */
  private isInConsolidation(stateInfo: MarketStateInfo): boolean {
    return stateInfo.state === MarketState.CONSOLIDATION;
  }

  /**
   * 检测向上突破后回踩
   * 
   * 逻辑：
   * 1. 找到密集区（历史上的CONSOLIDATION状态）
   * 2. 价格向上突破密集区上边界
   * 3. 突破后价格回踩但未跌破密集区上边界
   * 4. 当前收盘价位于密集区上方
   * 
   * @param klines K线数据数组
   * @param maHistory 历史均线数据
   * @returns 做多信号或null
   */
  private detectBullishBreakout(
    klines: KLineData[],
    maHistory: MAResult[]
  ): TradingSignal | null {
    const currentKline = klines[klines.length - 1];
    const currentMA = maHistory[maHistory.length - 1];

    // 计算当前密集区边界
    const bounds = this.calculateConsolidationBounds(currentMA);

    // 当前收盘价必须在密集区上方
    if (currentKline.close <= bounds.upper) {
      return null;
    }

    // 检查最近5-10根K线的行为
    const lookback = Math.min(10, klines.length);
    let hasBreakout = false;
    let hasPullback = false;
    let highestClose = 0;
    let breakoutIndex = -1;

    for (let i = klines.length - lookback; i < klines.length; i++) {
      const kline = klines[i];
      
      // 检测突破：收盘价突破上边界
      if (!hasBreakout && kline.close > bounds.upper) {
        hasBreakout = true;
        highestClose = kline.close;
        breakoutIndex = i;
      }

      // 更新突破后的最高收盘价
      if (hasBreakout && kline.close > highestClose) {
        highestClose = kline.close;
      }

      // 检测回踩：突破后收盘价回落（低于之前的最高收盘价）但仍在上边界之上
      if (hasBreakout && i > breakoutIndex && kline.close < highestClose && kline.close > bounds.upper) {
        hasPullback = true;
      }
    }

    if (hasBreakout && hasPullback) {
      return {
        type: SignalType.BUY_BREAKOUT,
        symbol: '', // 将由调用者填充
        timestamp: currentKline.timestamp,
        price: currentKline.close,
        stopLoss: bounds.lower, // 止损设在密集区下边界
        takeProfit: [], // 将由RiskCalculator计算
        reason: `向上突破密集区[${bounds.lower.toFixed(2)}-${bounds.upper.toFixed(2)}]后回踩支撑`,
        confidence: 0.8,
      };
    }

    return null;
  }

  /**
   * 检测向下突破后反弹
   * 
   * 逻辑：
   * 1. 找到密集区（历史上的CONSOLIDATION状态）
   * 2. 价格向下跌破密集区下边界
   * 3. 突破后价格反弹但未突破密集区下边界
   * 4. 当前收盘价位于密集区下方
   * 
   * @param klines K线数据数组
   * @param maHistory 历史均线数据
   * @returns 做空信号或null
   */
  private detectBearishBreakout(
    klines: KLineData[],
    maHistory: MAResult[]
  ): TradingSignal | null {
    const currentKline = klines[klines.length - 1];
    const currentMA = maHistory[maHistory.length - 1];

    // 计算当前密集区边界
    const bounds = this.calculateConsolidationBounds(currentMA);

    // 当前收盘价必须在密集区下方
    if (currentKline.close >= bounds.lower) {
      return null;
    }

    // 检查最近5-10根K线的行为
    const lookback = Math.min(10, klines.length);
    let hasBreakout = false;
    let hasBounce = false;
    let lowestClose = Infinity;
    let breakoutIndex = -1;

    for (let i = klines.length - lookback; i < klines.length; i++) {
      const kline = klines[i];
      
      // 检测突破：收盘价跌破下边界
      if (!hasBreakout && kline.close < bounds.lower) {
        hasBreakout = true;
        lowestClose = kline.close;
        breakoutIndex = i;
      }

      // 更新突破后的最低收盘价
      if (hasBreakout && kline.close < lowestClose) {
        lowestClose = kline.close;
      }

      // 检测反弹：突破后收盘价反弹（高于之前的最低收盘价）但仍在下边界之下
      if (hasBreakout && i > breakoutIndex && kline.close > lowestClose && kline.close < bounds.lower) {
        hasBounce = true;
      }
    }

    if (hasBreakout && hasBounce) {
      return {
        type: SignalType.SELL_BREAKOUT,
        symbol: '', // 将由调用者填充
        timestamp: currentKline.timestamp,
        price: currentKline.close,
        stopLoss: bounds.upper, // 止损设在密集区上边界
        takeProfit: [], // 将由RiskCalculator计算
        reason: `向下跌破密集区[${bounds.lower.toFixed(2)}-${bounds.upper.toFixed(2)}]后反弹阻力`,
        confidence: 0.8,
      };
    }

    return null;
  }

  /**
   * 计算密集区边界
   * 
   * 密集区定义为6条均线的范围
   * 上边界：6条均线的最大值
   * 下边界：6条均线的最小值
   * 
   * @param maResult 均线计算结果
   * @returns 密集区上下边界
   */
  private calculateConsolidationBounds(maResult: MAResult): { upper: number; lower: number } {
    const maValues = [
      maResult.ma20,
      maResult.ma60,
      maResult.ma120,
      maResult.ema20,
      maResult.ema60,
      maResult.ema120,
    ];

    // 过滤掉NaN值
    const validValues = maValues.filter(v => !isNaN(v));

    if (validValues.length === 0) {
      return { upper: NaN, lower: NaN };
    }

    return {
      upper: Math.max(...validValues),
      lower: Math.min(...validValues),
    };
  }
}
