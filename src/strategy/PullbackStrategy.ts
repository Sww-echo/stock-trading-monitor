import { KLineData } from '../types/market.js';
import { MAResult, MarketState, MarketStateInfo, SignalType, TradingSignal } from '../types/strategy.js';

/**
 * 策略B：趋势中首次回踩MA20
 * 
 * 策略逻辑：
 * 1. 只在市场处于EXPANSION状态时监控
 * 2. 检测价格首次回踩MA20但未有效跌破（多头）或首次反弹触碰MA20但未有效突破（空头）
 * 3. 有效跌破/突破定义为收盘价穿越MA20
 * 4. 止损位设置为有效跌破或突破MA20的价格
 */
export class PullbackStrategy {
  /**
   * 检测回踩信号
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
    // 只在发散状态下检测回踩信号
    if (stateInfo.state !== MarketState.EXPANSION_BULL && stateInfo.state !== MarketState.EXPANSION_BEAR) {
      return null;
    }

    // 需要足够的历史数据
    if (klines.length < 20 || maHistory.length < 20) {
      return null;
    }

    // 检测上涨趋势中的回踩
    if (stateInfo.state === MarketState.EXPANSION_BULL) {
      return this.detectBullishPullback(klines, maHistory);
    }

    // 检测下跌趋势中的反弹
    if (stateInfo.state === MarketState.EXPANSION_BEAR) {
      return this.detectBearishPullback(klines, maHistory);
    }

    return null;
  }

  /**
   * 检测上涨趋势中的回踩
   *
   * 逻辑：
   * 1. 市场处于多头发散状态
   * 2. 价格首次回踩MA20
   * 3. 未有效跌破MA20（收盘价仍在MA20上方）
   *
   * @param klines K线数据数组
   * @param maHistory 历史均线数据
   * @returns 做多信号或null
   */
  private detectBullishPullback(
    klines: KLineData[],
    maHistory: MAResult[]
  ): TradingSignal | null {
    const currentKline = klines[klines.length - 1];
    const currentMA = maHistory[maHistory.length - 1];

    // 当前收盘价必须在MA20上方（未有效跌破）
    if (currentKline.close <= currentMA.ma20) {
      return null;
    }

    if (this.isEffectiveBreak(currentKline.close, currentMA.ma20)) {
      return null;
    }

    // 提取MA20历史值
    const ma20Values = maHistory.map(ma => ma.ma20);

    // 检查是否首次回踩
    if (!this.isFirstPullback(klines, ma20Values)) {
      return null;
    }

    // 检查当前K线是否触碰或接近MA20
    const touchThreshold = currentMA.ma20 * 0.005; // 0.5%的容差
    const hasTouchedMA20 = currentKline.low <= currentMA.ma20 + touchThreshold;

    if (hasTouchedMA20) {
      // 止损位设为有效跌破MA20的价格（MA20下方一定距离）
      const stopLoss = currentMA.ma20 * 0.98; // MA20下方2%

      return {
        type: SignalType.BUY_PULLBACK,
        symbol: '', // 将由调用者填充
        timestamp: currentKline.timestamp,
        price: currentKline.close,
        stopLoss: stopLoss,
        takeProfit: [], // 将由RiskCalculator计算
        reason: `上涨趋势中首次回踩MA20(${currentMA.ma20.toFixed(2)})支撑`,
        confidence: 0.75,
      };
    }

    return null;
  }

  /**
   * 检测下跌趋势中的反弹
   * 
   * 逻辑：
   * 1. 市场处于空头发散状态
   * 2. 价格首次反弹触碰MA20
   * 3. 未有效突破MA20（收盘价仍在MA20下方）
   * 
   * @param klines K线数据数组
   * @param maHistory 历史均线数据
   * @returns 做空信号或null
   */
  private detectBearishPullback(
    klines: KLineData[],
    maHistory: MAResult[]
  ): TradingSignal | null {
    const currentKline = klines[klines.length - 1];
    const currentMA = maHistory[maHistory.length - 1];

    // 当前收盘价必须在MA20下方（未有效突破）
    if (currentKline.close >= currentMA.ma20) {
      return null;
    }

    if (this.isEffectiveBreak(currentKline.close, currentMA.ma20)) {
      return null;
    }

    // 提取MA20历史值
    const ma20Values = maHistory.map(ma => ma.ma20);

    // 检查是否首次反弹（逻辑与回踩类似）
    if (!this.isFirstPullback(klines, ma20Values)) {
      return null;
    }

    // 检查当前K线是否触碰或接近MA20
    const touchThreshold = currentMA.ma20 * 0.005; // 0.5%的容差
    const hasTouchedMA20 = currentKline.high >= currentMA.ma20 - touchThreshold;

    if (hasTouchedMA20) {
      // 止损位设为有效突破MA20的价格（MA20上方一定距离）
      const stopLoss = currentMA.ma20 * 1.02; // MA20上方2%

      return {
        type: SignalType.SELL_PULLBACK,
        symbol: '', // 将由调用者填充
        timestamp: currentKline.timestamp,
        price: currentKline.close,
        stopLoss: stopLoss,
        takeProfit: [], // 将由RiskCalculator计算
        reason: `下跌趋势中首次反弹至MA20(${currentMA.ma20.toFixed(2)})阻力`,
        confidence: 0.75,
      };
    }

    return null;
  }

  /**
   * 检查是否首次回踩
   * 
   * 逻辑：
   * 1. 在最近的趋势中，价格之前一直远离MA20
   * 2. 当前是第一次接近或触碰MA20
   * 
   * @param klines K线数据数组
   * @param ma20Values MA20历史值数组
   * @returns 是否首次回踩
   */
  private isFirstPullback(klines: KLineData[], ma20Values: number[]): boolean {
    // 检查最近10-20根K线
    const lookback = Math.min(20, klines.length);
    const startIndex = klines.length - lookback;

    let touchCount = 0;
    const touchThreshold = 0.01; // 1%的接近阈值

    for (let i = startIndex; i < klines.length; i++) {
      const kline = klines[i];
      const ma20 = ma20Values[i];

      if (isNaN(ma20)) {
        continue;
      }

      // 检查K线是否接近MA20（最低价或最高价在MA20的1%范围内）
      const distanceToMA20 = Math.abs(kline.low - ma20) / ma20;
      const distanceHighToMA20 = Math.abs(kline.high - ma20) / ma20;

      if (distanceToMA20 <= touchThreshold || distanceHighToMA20 <= touchThreshold) {
        touchCount++;
      }
    }

    // 如果触碰次数<=2次，认为是首次回踩
    return touchCount <= 2;
  }

  /**
   * 检查是否有效跌破/突破
   * 
   * 有效跌破/突破定义为收盘价穿越MA20
   * 
   * @param price 收盘价
   * @param ma20 MA20值
   * @returns 是否有效跌破/突破
   */
  private isEffectiveBreak(price: number, ma20: number): boolean {
    // 收盘价与MA20的距离超过0.5%认为是有效穿越
    const breakThreshold = 0.005; // 0.5%
    const distance = Math.abs(price - ma20) / ma20;

    return distance > breakThreshold;
  }
}
