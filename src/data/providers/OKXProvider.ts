import axios, { AxiosInstance } from 'axios';
import { MarketDataProvider, MarketType, KLineData } from '../../types/market.js';

/**
 * OKX 数据提供者
 * 实现虚拟货币市场数据获取（24/7交易）
 */
export class OKXProvider implements MarketDataProvider {
  readonly type = MarketType.CRYPTO;
  readonly name = 'OKX';
  
  private client: AxiosInstance;
  private readonly baseURL = 'https://www.okx.com';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 初始重试延迟（毫秒）
  
  constructor() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 5000,
    });
  }
  
  /**
   * 获取K线数据
   * @param symbol 交易对符号，如 "BTC/USDT"
   * @param interval 时间周期，如 "1h", "4h"
   * @param limit 获取数量
   */
  async fetchKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const okxInterval = this.convertInterval(interval);
    
    return this.retryRequest(async () => {
      const response = await this.client.get('/api/v5/market/candles', {
        params: {
          instId: normalizedSymbol,
          bar: okxInterval,
          limit: limit.toString(),
        },
      });
      
      if (!response.data || response.data.code !== '0') {
        const errorMsg = response.data?.msg || 'Unknown error';
        throw new Error(`OKX API error: ${errorMsg}`);
      }
      
      return this.parseKLines(response.data.data);
    });
  }
  
  /**
   * 获取最新价格
   * @param symbol 交易对符号
   */
  async fetchLatestPrice(symbol: string): Promise<number> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    return this.retryRequest(async () => {
      const response = await this.client.get('/api/v5/market/ticker', {
        params: {
          instId: normalizedSymbol,
        },
      });
      
      if (!response.data || response.data.code !== '0') {
        const errorMsg = response.data?.msg || 'Unknown error';
        throw new Error(`OKX API error: ${errorMsg}`);
      }
      
      if (!response.data.data || response.data.data.length === 0) {
        throw new Error('Invalid response from OKX API');
      }
      
      const price = parseFloat(response.data.data[0].last);
      if (isNaN(price)) {
        throw new Error(`Invalid price data from OKX: ${response.data.data[0].last}`);
      }
      
      return price;
    });
  }
  
  /**
   * 检查是否在交易时间
   * 虚拟货币市场24/7交易，始终返回true
   */
  isTradingTime(): boolean {
    return true;
  }
  
  /**
   * 标准化交易对符号
   * 将 "BTC/USDT" 转换为 "BTC-USDT"（OKX格式）
   */
  private normalizeSymbol(symbol: string): string {
    return symbol.replace(/\//g, '-').toUpperCase();
  }
  
  /**
   * 转换时间周期格式
   * 将 "1h", "4h" 转换为 OKX API 格式
   */
  private convertInterval(interval: string): string {
    const mapping: Record<string, string> = {
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1H',
      '2h': '2H',
      '4h': '4H',
      '6h': '6H',
      '12h': '12H',
      '1d': '1D',
      '1w': '1W',
      '1M': '1M',
    };
    
    const normalized = interval.toLowerCase();
    const okxInterval = mapping[normalized];
    
    if (!okxInterval) {
      throw new Error(`Unsupported interval: ${interval}`);
    }
    
    return okxInterval;
  }
  
  /**
   * 解析K线数据
   * OKX API 返回格式：[timestamp, open, high, low, close, volume, volumeCcy, volumeCcyQuote, confirm]
   * timestamp 是毫秒级时间戳字符串
   */
  private parseKLines(data: any[]): KLineData[] {
    return data.map((item) => ({
      timestamp: parseInt(item[0]),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    })).reverse(); // OKX返回的数据是倒序的，需要反转
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
        return new Error(`OKX API error (${status}): ${message}`);
      } else if (error.request) {
        // 网络错误
        const message = error.message || 'Network error';
        return new Error(`OKX API network error: ${message}`);
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
