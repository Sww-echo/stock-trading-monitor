import axios, { AxiosInstance } from 'axios';
import { MarketDataProvider, MarketType, KLineData } from '../../types/market.js';

/**
 * Tushare 数据提供者
 * 实现A股市场数据获取（交易时间：9:30-15:00）
 */
export class TushareProvider implements MarketDataProvider {
  readonly type = MarketType.STOCK_CN;
  readonly name = 'Tushare';
  
  private client: AxiosInstance;
  private readonly baseURL = 'http://api.tushare.pro';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 初始重试延迟（毫秒）
  private readonly apiToken: string;
  
  constructor(apiToken: string) {
    if (!apiToken) {
      throw new Error('Tushare API token is required');
    }
    
    this.apiToken = apiToken;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000, // A股API可能较慢，设置10秒超时
    });
  }
  
  /**
   * 获取K线数据
   * @param symbol A股标的符号，如 "600519.SH"
   * @param interval 时间周期，如 "1h", "4h", "1d"
   * @param limit 获取数量
   */
  async fetchKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    return this.retryRequest(async () => {
      // Tushare API 使用不同的接口获取不同周期的数据
      const apiName = this.getApiName(interval);
      const freq = this.convertInterval(interval);
      
      // 计算日期范围（获取最近的数据）
      const endDate = this.formatDate(new Date());
      const startDate = this.calculateStartDate(interval, limit);
      
      const response = await this.client.post('', {
        api_name: apiName,
        token: this.apiToken,
        params: {
          ts_code: normalizedSymbol,
          freq: freq,
          start_date: startDate,
          end_date: endDate,
        },
        fields: 'trade_time,open,high,low,close,vol',
      });
      
      if (!response.data || response.data.code !== 0) {
        const errorMsg = response.data?.msg || 'Unknown error';
        throw new Error(`Tushare API error: ${errorMsg}`);
      }
      
      if (!response.data.data || !response.data.data.items) {
        throw new Error('Invalid response from Tushare API');
      }
      
      return this.parseKLines(response.data.data.items, response.data.data.fields);
    });
  }
  
  /**
   * 获取最新价格
   * @param symbol A股标的符号
   */
  async fetchLatestPrice(symbol: string): Promise<number> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    return this.retryRequest(async () => {
      const response = await this.client.post('', {
        api_name: 'query',
        token: this.apiToken,
        params: {
          api_name: 'daily',
          ts_code: normalizedSymbol,
          fields: 'close',
        },
        fields: 'close',
      });
      
      if (!response.data || response.data.code !== 0) {
        const errorMsg = response.data?.msg || 'Unknown error';
        throw new Error(`Tushare API error: ${errorMsg}`);
      }
      
      if (!response.data.data || !response.data.data.items || response.data.data.items.length === 0) {
        throw new Error('No price data available from Tushare');
      }
      
      // 获取最新的收盘价
      const latestData = response.data.data.items[0];
      const price = parseFloat(latestData[0]);
      
      if (isNaN(price)) {
        throw new Error(`Invalid price data from Tushare: ${latestData[0]}`);
      }
      
      return price;
    });
  }
  
  /**
   * 检查是否在交易时间
   * A股交易时间：9:30-11:30, 13:00-15:00（北京时间）
   */
  isTradingTime(): boolean {
    // 获取北京时间（UTC+8）
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const beijingTime = new Date(utc + (8 * 3600000));
    
    const day = beijingTime.getDay();
    const hours = beijingTime.getHours();
    const minutes = beijingTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    // 周末不交易
    if (day === 0 || day === 6) {
      return false;
    }
    
    // 上午：9:30-11:30 (570-690分钟)
    const morningStart = 9 * 60 + 30;  // 570
    const morningEnd = 11 * 60 + 30;   // 690
    
    // 下午：13:00-15:00 (780-900分钟)
    const afternoonStart = 13 * 60;    // 780
    const afternoonEnd = 15 * 60;      // 900
    
    return (timeInMinutes >= morningStart && timeInMinutes < morningEnd) ||
           (timeInMinutes >= afternoonStart && timeInMinutes < afternoonEnd);
  }
  
  /**
   * 标准化A股标的符号
   * 确保格式为 "600519.SH" 或 "000001.SZ"
   */
  private normalizeSymbol(symbol: string): string {
    // 移除空格并转大写
    const normalized = symbol.replace(/\s/g, '').toUpperCase();
    
    // 检查格式是否正确
    if (!/^\d{6}\.(SH|SZ)$/.test(normalized)) {
      throw new Error(`Invalid A-share symbol format: ${symbol}. Expected format: 600519.SH or 000001.SZ`);
    }
    
    return normalized;
  }
  
  /**
   * 根据周期选择API接口
   */
  private getApiName(interval: string): string {
    const normalized = interval.toLowerCase();
    
    // 分钟级数据使用 stk_mins 接口
    if (normalized.endsWith('m')) {
      return 'stk_mins';
    }
    
    // 小时级数据使用 stk_mins 接口
    if (normalized.endsWith('h')) {
      return 'stk_mins';
    }
    
    // 日线及以上使用 daily 接口
    return 'daily';
  }
  
  /**
   * 转换时间周期格式
   * 将 "1h", "4h" 转换为 Tushare API 格式
   */
  private convertInterval(interval: string): string {
    const mapping: Record<string, string> = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '60min',
      '2h': '120min',
      '4h': '240min',
      '1d': 'D',
      '1w': 'W',
      '1M': 'M',
    };
    
    const normalized = interval.toLowerCase();
    const tushareInterval = mapping[normalized];
    
    if (!tushareInterval) {
      throw new Error(`Unsupported interval: ${interval}`);
    }
    
    return tushareInterval;
  }
  
  /**
   * 计算起始日期
   * 根据周期和数量计算需要获取多少天的数据
   */
  private calculateStartDate(interval: string, limit: number): string {
    const now = new Date();
    const normalized = interval.toLowerCase();
    
    let daysBack = 30; // 默认30天
    
    if (normalized.endsWith('m')) {
      // 分钟级数据，每天4小时交易，240分钟
      const minutes = parseInt(normalized);
      daysBack = Math.ceil((limit * minutes) / 240) + 5; // 加5天缓冲
    } else if (normalized.endsWith('h')) {
      // 小时级数据
      const hours = parseInt(normalized);
      daysBack = Math.ceil((limit * hours) / 4) + 5; // 每天4小时交易
    } else if (normalized === '1d') {
      daysBack = limit + 10; // 日线数据，加10天缓冲（考虑周末和节假日）
    } else if (normalized === '1w') {
      daysBack = limit * 7 + 14;
    } else if (normalized === '1M') {
      daysBack = limit * 30 + 30;
    }
    
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    return this.formatDate(startDate);
  }
  
  /**
   * 格式化日期为 Tushare API 格式（YYYYMMDD）
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
  
  /**
   * 解析K线数据
   * Tushare API 返回格式：
   * fields: ['trade_time', 'open', 'high', 'low', 'close', 'vol']
   * items: [['20240101 09:30:00', '100.0', '101.0', '99.0', '100.5', '1000000'], ...]
   */
  private parseKLines(items: any[][], fields: string[]): KLineData[] {
    const timeIndex = fields.indexOf('trade_time');
    const openIndex = fields.indexOf('open');
    const highIndex = fields.indexOf('high');
    const lowIndex = fields.indexOf('low');
    const closeIndex = fields.indexOf('close');
    const volIndex = fields.indexOf('vol');
    
    if (timeIndex === -1 || openIndex === -1 || closeIndex === -1) {
      throw new Error('Missing required fields in Tushare response');
    }
    
    return items.map((item) => {
      // 解析时间字符串 "20240101 09:30:00" 或 "20240101"
      const timeStr = item[timeIndex];
      const timestamp = this.parseTimestamp(timeStr);
      
      return {
        timestamp,
        open: parseFloat(item[openIndex]),
        high: parseFloat(item[highIndex]),
        low: parseFloat(item[lowIndex]),
        close: parseFloat(item[closeIndex]),
        volume: parseFloat(item[volIndex] || '0'),
      };
    }).sort((a, b) => a.timestamp - b.timestamp); // 按时间升序排列
  }
  
  /**
   * 解析时间戳
   * 支持格式：
   * - "20240101 09:30:00" (分钟/小时数据)
   * - "20240101" (日线数据)
   */
  private parseTimestamp(timeStr: string): number {
    if (timeStr.includes(' ')) {
      // 格式：20240101 09:30:00
      const [dateStr, timeStr2] = timeStr.split(' ');
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      
      const [hours, minutes, seconds] = timeStr2.split(':').map(Number);
      
      // 创建北京时间的Date对象
      const date = new Date(year, month, day, hours, minutes, seconds);
      return date.getTime();
    } else {
      // 格式：20240101
      const year = parseInt(timeStr.substring(0, 4));
      const month = parseInt(timeStr.substring(4, 6)) - 1;
      const day = parseInt(timeStr.substring(6, 8));
      
      // 使用收盘时间 15:00
      const date = new Date(year, month, day, 15, 0, 0);
      return date.getTime();
    }
  }
  
  /**
   * 带重试逻辑的请求执行
   * 使用指数退避策略，最多重试3次
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      if (retryCount >= this.maxRetries) {
        throw this.formatError(error);
      }
      
      // 指数退避：1s, 2s, 4s
      const delay = this.retryDelay * Math.pow(2, retryCount);
      await this.sleep(delay);
      
      return this.retryRequest(requestFn, retryCount + 1);
    }
  }
  
  /**
   * 格式化错误信息
   */
  private formatError(error: any): Error {
    if (error && typeof error === 'object') {
      if (error.response) {
        // API 返回错误
        const status = error.response.status;
        const message = error.response.data?.msg || error.message || 'Unknown error';
        return new Error(`Tushare API error (${status}): ${message}`);
      } else if (error.request) {
        // 网络错误
        const message = error.message || 'Network error';
        return new Error(`Tushare API network error: ${message}`);
      } else if (error.message) {
        return new Error(error.message);
      }
    }
    
    return error instanceof Error ? error : new Error(String(error));
  }
  
  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
