/**
 * 提醒类型枚举
 */
export enum AlertType {
  BUY_SIGNAL = 'buy_signal',
  SELL_SIGNAL = 'sell_signal',
  STOP_LOSS = 'stop_loss',
  TAKE_PROFIT = 'take_profit',
  TREND_REVERSAL = 'trend_reversal',
  ERROR = 'error'
}

/**
 * 提醒记录
 */
export interface Alert {
  id: string;
  type: AlertType;
  symbol: string;
  timestamp: number;
  message: string;
  data: any;      // 附加数据
  sent: boolean;
}

/**
 * 通知渠道接口
 */
export interface NotificationChannel {
  name: string;
  enabled: boolean;
  send(alert: Alert): Promise<void>;
}
