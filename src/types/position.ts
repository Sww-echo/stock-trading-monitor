import { SignalType } from './strategy.js';

/**
 * 持仓记录
 */
export interface Position {
  id: string;
  symbol: string;
  entryPrice: number;
  entryTime: number;
  quantity: number;
  strategyType: SignalType;
  stopLoss: number;
  takeProfit: number[];
  status: 'open' | 'closed';
}

/**
 * 持仓状态
 */
export interface PositionStatus {
  position: Position;
  currentPrice: number;
  pnl: number;              // 盈亏金额
  pnlPercent: number;       // 盈亏百分比
  shouldStopLoss: boolean;
  shouldTakeProfit: boolean;
  trendReversed: boolean;
}
