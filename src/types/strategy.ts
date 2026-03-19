/**
 * 移动平均线计算结果
 */
export interface MAResult {
  ma20: number;
  ma60: number;
  ma120: number;
  ema20: number;
  ema60: number;
  ema120: number;
}

/**
 * 市场状态枚举
 */
export enum MarketState {
  CONSOLIDATION = 'consolidation',    // 均线密集
  EXPANSION_BULL = 'expansion_bull',  // 多头发散
  EXPANSION_BEAR = 'expansion_bear',  // 空头发散
  UNKNOWN = 'unknown'
}

/**
 * 市场状态信息
 */
export interface MarketStateInfo {
  state: MarketState;
  stdDev: number;       // 6条均线的标准差
  range: number;        // 6条均线的极差
  isBullish: boolean;   // 是否多头排列
  isBearish: boolean;   // 是否空头排列
}

/**
 * 信号类型枚举
 */
export enum SignalType {
  BUY_BREAKOUT = 'buy_breakout',       // 突破做多
  SELL_BREAKOUT = 'sell_breakout',     // 突破做空
  BUY_PULLBACK = 'buy_pullback',       // 回踩做多
  SELL_PULLBACK = 'sell_pullback',     // 回踩做空
}

/**
 * 交易信号
 */
export interface TradingSignal {
  type: SignalType;
  symbol: string;
  timestamp: number;
  price: number;          // 触发价格
  stopLoss: number;       // 止损价
  takeProfit: number[];   // 止盈价（可能多个）
  reason: string;         // 触发原因描述
  confidence: number;     // 信号强度（0-1）
}
