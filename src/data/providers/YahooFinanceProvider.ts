import axios, { AxiosInstance } from 'axios';
import { MarketDataProvider, MarketType, KLineData } from '../../types/market.js';

/**
 * Yahoo Finance 数据提供者
 * 实现美股市场数据获取（交易时间：9:30-16:00 ET）
 */
export class YahooFinanceProvider implements MarketDataProvider {
  readonly type = MarketType.STOCK_US;
  readonly name = 'Yahoo Finance';
  
  private client: AxiosInstance;
  private readonly baseURL = 'https://query1.finance.yahoo.com';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 初始重试延迟（毫秒）
  
  constructor() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }
  
  /**
   * 获取K线数据
   * @param symbol 美股标的符号，如 "AAPL"
   * @param interval 时间周期，如 "1h", "4h", "1d"
   * @param limit 获取数量
   */
  async fetchKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const yahooInterval = this.convertInterval(interval);
    
    return this.retryRequest(async () => {
      // 计算时间范围
      const period2 = Math.floor(Date.now() / 1000); // 当前时间（秒）
      const period1 = this.calculateStartTime(interval, limit, period2);
      
      const response = await this.client.get(`/v8/finance/chart/${normalizedSymbol}`, {
        params: {
          interval: yahooInterval,
          period1,
          period2,
        },
      });
      
      if (!response.data || !response.data.chart || !response.data.chart.result) {
        throw new Error('Invalid response from Yahoo Finance API');
      }
      
      const result = response.data.chart.result[0];
      if (!result || result.error) {
        const errorMsg = result?.error?.description || 'Unknown error';
        throw new Error(`Yahoo Finance API error: ${errorMsg}`);
      }
      
      return this.parseKLines(result);
    });
  }
  
  /**
   * 获取最新价格
   * @param symbol 美股标的符号
   */
  async fetchLatestPrice(symbol: string): Promise<number> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    return this.retryRequest(async () => {
      const response = await this.client.get(`/v8/finance/chart/${normalizedSymbol}`, {
        params: {
          interval: '1m',
          range: '1d',
        },
      });
      
      if (!response.data || !response.data.chart || !response.data.chart.result) {
        throw new Error('Invalid response from Yahoo Finance API');
      }
      
      const result = response.data.chart.result[0];
      if (!result || result.error) {
        const errorMsg = result?.error?.description || 'Unknown error';
        throw new Error(`Yahoo Finance API error: ${errorMsg}`);
      }
      
      // 获取最新价格
      const meta = result.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number') {
        throw new Error('No price data available from Yahoo Finance');
      }
      
      return meta.regularMarketPrice;
    });
  }
  
  /**
   * 检查是否在交易时间
   * 美股交易时间：9:30-16:00 ET（东部时间）
   */
  isTradingTime(): boolean {
    // 获取当前UTC时间
    const now = new Date();
    
    // 转换为东部时间（ET）
    // 注意：ET可能是EST（UTC-5）或EDT（UTC-4），取决于夏令时
    // 使用toLocaleString获取ET时间
    const etTimeStr = now.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour12: false,
    });
    
    // 解析ET时间
    const etDate = new Date(etTimeStr);
    const day = etDate.getDay();
    const hours = etDate.getHours();
    const minutes = etDate.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    // 周末不交易
    if (day === 0 || day === 6) {
      return false;
    }
    
    // 交易时间：9:30-16:00 (570-960分钟)
    const marketOpen = 9 * 60 + 30;   // 570
    const marketClose = 16 * 60;      // 960
    
    return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
  }
  
  /**
   * 标准化美股标的符号
   * 确保格式为大写，如 "AAPL"
   */
  private normalizeSymbol(symbol: string): string {
    // 移除空格并转大写
    const normalized = symbol.replace(/\s/g, '').toUpperCase();
    
    // 基本验证：美股代码通常是1-5个字母
    if (!/^[A-Z]{1,5}$/.test(normalized)) {
      throw new Error(`Invalid US stock symbol format: ${symbol}. Expected format: AAPL, MSFT, etc.`);
    }
    
    return normalized;
  }
  
  /**
   * 转换时间周期格式
   * 将 "1h", "4h" 转换为 Yahoo Finance API 格式
   */
  private convertInterval(interval: string): string {
    const mapping: Record<string, string> = {
      '1m': '1m',
      '2m': '2m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1h',
      '2h': '2h',
      '4h': '4h',
      '1d': '1d',
      '1w': '1wk',
      '1M': '1mo',
    };
    
    const normalized = interval.toLowerCase();
    const yahooInterval = mapping[normalized];
    
    if (!yahooInterval) {
      throw new Error(`Unsupported interval: ${interval}`);
    }
    
    return yahooInterval;
  }
  
  /**
   * 计算起始时间（Unix秒时间戳）
   * 根据周期和数量计算需要获取多少时间的数据
   */
  private calculateStartTime(interval: string, limit: number, endTime: number): number {
    const normalized = interval.toLowerCase();
    
    let secondsBack = 30 * 24 * 60 * 60; // 默认30天
    
    if (normalized.endsWith('m')) {
      // 分钟级数据
      const minutes = parseInt(normalized);
      // 美股每天6.5小时交易（390分钟）
      const tradingMinutesPerDay = 390;
      const daysNeeded = Math.ceil((limit * minutes) / tradingMinutesPerDay);
      secondsBack = (daysNeeded + 5) * 24 * 60 * 60; // 加5天缓冲
    } else if (normalized.endsWith('h')) {
      // 小时级数据
      const hours = parseInt(normalized);
      const tradingHoursPerDay = 6.5;
      const daysNeeded = Math.ceil((limit * hours) / tradingHoursPerDay);
      secondsBack = (daysNeeded + 5) * 24 * 60 * 60;
    } else if (normalized === '1d') {
      // 日线数据，考虑周末和节假日
      secondsBack = (limit + 10) * 24 * 60 * 60;
    } else if (normalized === '1w') {
      secondsBack = (limit * 7 + 14) * 24 * 60 * 60;
    } else if (normalized === '1M') {
      secondsBack = (limit * 30 + 30) * 24 * 60 * 60;
    }
    
    return endTime - secondsBack;
  }
  
  /**
   * 解析K线数据
   * Yahoo Finance API 返回格式：
   * {
   *   timestamp: [1234567890, ...],
   *   indicators: {
   *     quote: [{
   *       open: [100.0, ...],
   *       high: [101.0, ...],
   *       low: [99.0, ...],
   *       close: [100.5, ...],
   *       volume: [1000000, ...]
   *     }]
   *   }
   * }
   */
  private parseKLines(result: any): KLineData[] {
    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    
    if (!timestamps || !quote) {
      throw new Error('Missing required data in Yahoo Finance response');
    }
    
    const { open, high, low, close, volume } = quote;
    
    if (!open || !high || !low || !close || !volume) {
      throw new Error('Missing OHLCV data in Yahoo Finance response');
    }
    
    const klines: KLineData[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      // 跳过空数据点（Yahoo Finance有时会返回null值）
      if (open[i] === null || close[i] === null) {
        continue;
      }
      
      klines.push({
        timestamp: timestamps[i] * 1000, // 转换为毫秒
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
        volume: volume[i] || 0,
      });
    }
    
    return klines;
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
        const message = error.response.data?.chart?.error?.description || 
                       error.message || 
                       'Unknown error';
        return new Error(`Yahoo Finance API error (${status}): ${message}`);
      } else if (error.request) {
        // 网络错误
        const message = error.message || 'Network error';
        return new Error(`Yahoo Finance API network error: ${message}`);
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
