/**
 * K线数据结构
 */
export interface KLineData {
  timestamp: number;  // Unix时间戳（毫秒）
  open: number;       // 开盘价
  high: number;       // 最高价
  low: number;        // 最低价
  close: number;      // 收盘价
  volume: number;     // 成交量
}

/**
 * 市场类型枚举
 */
export enum MarketType {
  CRYPTO = 'crypto',      // 虚拟货币
  STOCK_CN = 'stock_cn',  // A股
  STOCK_US = 'stock_us'   // 美股
}

/**
 * 市场数据提供者接口
 */
export interface MarketDataProvider {
  readonly type: MarketType;
  readonly name: string;
  
  /**
   * 获取K线数据
   * @param symbol 标的符号，如 "BTC/USDT", "600519.SH", "AAPL"
   * @param interval 时间周期，如 "1h", "4h"
   * @param limit 获取数量
   */
  fetchKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]>;
  
  /**
   * 获取最新价格
   * @param symbol 标的符号
   */
  fetchLatestPrice(symbol: string): Promise<number>;
  
  /**
   * 检查是否在交易时间（股票需要，虚拟货币始终返回true）
   */
  isTradingTime(): boolean;
}
