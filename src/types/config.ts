import { TakeProfitMode } from './risk.js';

/**
 * 系统配置
 */
export interface SystemConfig {
  // 监控配置
  symbols: string[];                    // 监控标的列表（支持混合：["BTC/USDT", "600519.SH", "AAPL"]）
  intervals: string[];                  // 监控周期
  
  // 数据源配置
  providers: {
    binance?: { enabled: boolean };
    okx?: { enabled: boolean };
    tushare?: { enabled: boolean; apiToken: string };
    yahooFinance?: { enabled: boolean };
  };
  
  // 策略配置
  consolidationThreshold: number;       // 密集判断阈值
  takeProfitMode: TakeProfitMode;      // 止盈模式
  takeProfitRatio: number;             // 盈亏比
  
  // 风险配置
  maxRiskPerTrade: number;             // 单笔最大亏损
  maxLeverage: number;                 // 最大杠杆
  accountBalance: number;              // 账户余额
  
  // 提醒配置
  enableSound: boolean;                // 声音提醒
  enableEmail: boolean;                // 邮件提醒
  emailAddress?: string;               // 邮件地址
  
  // 数据配置
  dataRetentionDays: number;           // 数据保留天数
  updateInterval: number;              // 更新间隔（秒）
}
