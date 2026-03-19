import { AlertType } from './alert.js';
import { AdviceAction, AdviceLevel, TradingAdvice } from './advice.js';
import { PositionStatus } from './position.js';

export interface WatchErrorItem {
  symbol?: string;
  interval?: string;
  stage: 'scan' | 'position' | 'config';
  message: string;
}

export interface WatchIntervalSummary {
  interval: string;
  scannedSymbols: string[];
  skippedSymbols: string[];
  advices: TradingAdvice[];
  errors: WatchErrorItem[];
}

export interface WatchPositionAlert {
  positionId: string;
  symbol: string;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  shouldStopLoss: boolean;
  shouldTakeProfit: boolean;
  trendReversed: boolean;
}

export interface WatchAlertReservation {
  enabledChannels: {
    sound: boolean;
    email: boolean;
    emailAddress?: string;
  };
  reservedTypes: AlertType[];
}

export interface WatchSummaryResult {
  generatedAt: number;
  symbols: string[];
  intervals: WatchIntervalSummary[];
  positions: {
    openCount: number;
    alerts: WatchPositionAlert[];
  };
  alertReservation: WatchAlertReservation;
  errors: WatchErrorItem[];
}

export type WatchAgentSummaryStatus = 'ok' | 'attention' | 'warning';

export interface WatchAgentSummaryCounts {
  buy: number;
  sell: number;
  hold: number;
  reduce: number;
  watch: number;
  positionAlerts: number;
  errors: number;
  skippedSymbols: number;
}

export interface WatchAgentTopSignal {
  symbol: string;
  interval: string;
  action: AdviceAction;
  adviceLevel: AdviceLevel;
  confidence: number;
  reason: string;
}

export type WatchAgentPositionActionType = 'stop_loss' | 'take_profit' | 'trend_reversal';

export interface WatchAgentPositionAction {
  positionId: string;
  symbol: string;
  action: WatchAgentPositionActionType;
  currentPrice: number;
  pnlPercent: number;
}

export interface WatchAgentSummary {
  status: WatchAgentSummaryStatus;
  headline: string;
  counts: WatchAgentSummaryCounts;
  topSignals: WatchAgentTopSignal[];
  positionActions: WatchAgentPositionAction[];
  skippedSymbols: string[];
  nextHint: string;
}

export function isActionablePositionStatus(status: PositionStatus): boolean {
  return status.shouldStopLoss || status.shouldTakeProfit || status.trendReversed;
}
