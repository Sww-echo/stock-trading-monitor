export type AdviceAction = 'buy' | 'sell' | 'watch' | 'hold' | 'reduce';

export type AdviceLevel = 'strong' | 'normal' | 'weak';

export interface TradingAdvice {
  symbol: string;
  interval: string;
  action: AdviceAction;
  signalType: string;
  adviceLevel: AdviceLevel;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number[];
  reason: string;
  riskNote?: string;
  timestamp: number;
}
