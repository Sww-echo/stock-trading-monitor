import * as fs from 'fs/promises';
import * as path from 'path';
import { MarketDataProvider, MarketType, KLineData } from '../types/market.js';

/**
 * 数据管理器
 * 负责协调多个数据提供者、管理缓存和持久化存储
 */
export class DataManager {
  private cache: Map<string, KLineData[]>;
  private providers: Map<MarketType, MarketDataProvider>;
  private readonly dataDir: string;
  
  constructor(dataDir: string = './data/klines') {
    this.cache = new Map();
    this.providers = new Map();
    this.dataDir = dataDir;
  }
  
  /**
   * 注册数据提供者
   * @param provider 市场数据提供者实例
   */
  registerProvider(provider: MarketDataProvider): void {
    this.providers.set(provider.type, provider);
  }
  
  /**
   * 根据标的符号自动选择提供者
   * @param symbol 标的符号
   * @returns 对应的数据提供者
   */
  private selectProvider(symbol: string): MarketDataProvider {
    // 虚拟货币：包含 "/" 或 "-" 或常见币种符号
    if (symbol.includes('/') || symbol.includes('-') || 
        /^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|MATIC|AVAX|LINK|UNI|ATOM|LTC|BCH|XLM|ALGO|VET|FIL|TRX|ETC|THETA|XMR|EOS|AAVE|MKR|COMP|SNX|YFI|SUSHI|CRV|BAL|UMA|ZRX|KNC|LRC|REN|BNT|ANT|MLN|NMR|REP|GNO|STORJ|BAT|ZIL|ICX|ONT|QTUM|ZEC|DASH|DCR|SC|DGB|RVN|BTG|NANO|WAVES|LSK|STEEM|STRAT|ARK|KMD|PIVX|NXT|BTS|MAID|XEM|ARDR|GAS|NEO|OMG|POWR|REQ|SALT|SUB|TNT|VEN|WTC|ZRX)/.test(symbol.toUpperCase())) {
      // 优先使用 Binance，如果没有则使用 OKX
      const provider = this.providers.get(MarketType.CRYPTO);
      if (!provider) {
        throw new Error(`No crypto provider registered for symbol: ${symbol}`);
      }
      return provider;
    }
    
    // A股：格式为 "XXXXXX.SH" 或 "XXXXXX.SZ"
    if (/^\d{6}\.(SH|SZ)$/i.test(symbol)) {
      const provider = this.providers.get(MarketType.STOCK_CN);
      if (!provider) {
        throw new Error(`No A-share provider registered for symbol: ${symbol}`);
      }
      return provider;
    }
    
    // 美股：1-5个字母
    if (/^[A-Z]{1,5}$/i.test(symbol)) {
      const provider = this.providers.get(MarketType.STOCK_US);
      if (!provider) {
        throw new Error(`No US stock provider registered for symbol: ${symbol}`);
      }
      return provider;
    }
    
    throw new Error(`Unable to determine market type for symbol: ${symbol}`);
  }
  
  /**
   * 获取K线数据（优先从缓存读取）
   * @param symbol 标的符号
   * @param interval 时间周期
   * @param limit 获取数量
   * @returns K线数据数组
   */
  async getKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]> {
    const cacheKey = this.getCacheKey(symbol, interval);
    
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && cached.length >= limit) {
      // 返回最近的 limit 条数据
      return cached.slice(-limit);
    }
    
    // 缓存未命中或数据不足，从文件加载
    try {
      await this.loadFromFile(symbol, interval);
      const loaded = this.cache.get(cacheKey);
      if (loaded && loaded.length >= limit) {
        return loaded.slice(-limit);
      }
    } catch (error) {
      // 文件不存在或加载失败，继续从API获取
    }
    
    // 从API获取数据
    await this.updateKLines(symbol, interval, limit);
    const updated = this.cache.get(cacheKey);
    if (!updated) {
      throw new Error(`Failed to fetch K-line data for ${symbol} ${interval}`);
    }
    
    return updated.slice(-limit);
  }
  
  /**
   * 更新K线数据（从API获取并更新缓存）
   * @param symbol 标的符号
   * @param interval 时间周期
   * @param limit 获取数量（默认120，用于计算MA120）
   */
  async updateKLines(symbol: string, interval: string, limit: number = 120): Promise<void> {
    const provider = this.selectProvider(symbol);
    const cacheKey = this.getCacheKey(symbol, interval);
    
    // 从API获取数据
    const klines = await provider.fetchKLines(symbol, interval, limit);
    
    if (!klines || klines.length === 0) {
      throw new Error(`No K-line data returned for ${symbol} ${interval}`);
    }
    
    // 更新缓存
    this.cache.set(cacheKey, klines);
    
    // 保存到文件
    await this.saveToFile(symbol, interval);
  }
  
  /**
   * 获取最新价格
   * @param symbol 标的符号
   * @returns 最新价格
   */
  async getLatestPrice(symbol: string): Promise<number> {
    const provider = this.selectProvider(symbol);
    return provider.fetchLatestPrice(symbol);
  }

  /**
   * 检查标的当前是否在交易时间
   * @param symbol 标的符号
   * @returns 是否在交易时间
   */
  isSymbolTradingTime(symbol: string): boolean {
    const provider = this.selectProvider(symbol);
    return provider.isTradingTime();
  }

  /**
   * 保存历史数据到文件
   * @param symbol 标的符号
   * @param interval 时间周期
   */
  async saveToFile(symbol: string, interval: string): Promise<void> {
    const cacheKey = this.getCacheKey(symbol, interval);
    const data = this.cache.get(cacheKey);
    
    if (!data || data.length === 0) {
      return;
    }
    
    // 确定市场类型和子目录
    const provider = this.selectProvider(symbol);
    const subDir = provider.type === MarketType.CRYPTO ? 'crypto' : 'stock';
    
    // 创建目录
    const dirPath = path.join(this.dataDir, subDir);
    await fs.mkdir(dirPath, { recursive: true });
    
    // 生成文件名（替换特殊字符）
    const fileName = this.getFileName(symbol, interval);
    const filePath = path.join(dirPath, fileName);
    
    // 构建文件内容
    const fileContent = {
      symbol,
      interval,
      lastUpdate: Date.now(),
      data,
    };
    
    // 写入文件
    await fs.writeFile(filePath, JSON.stringify(fileContent, null, 2), 'utf-8');
  }
  
  /**
   * 从文件加载历史数据
   * @param symbol 标的符号
   * @param interval 时间周期
   */
  async loadFromFile(symbol: string, interval: string): Promise<void> {
    // 确定市场类型和子目录
    const provider = this.selectProvider(symbol);
    const subDir = provider.type === MarketType.CRYPTO ? 'crypto' : 'stock';
    
    // 生成文件路径
    const fileName = this.getFileName(symbol, interval);
    const filePath = path.join(this.dataDir, subDir, fileName);
    
    // 读取文件
    const content = await fs.readFile(filePath, 'utf-8');
    const fileData = JSON.parse(content);
    
    // 验证数据格式
    if (!fileData.symbol || !fileData.interval || !Array.isArray(fileData.data)) {
      throw new Error(`Invalid data format in file: ${filePath}`);
    }
    
    // 更新缓存
    const cacheKey = this.getCacheKey(symbol, interval);
    this.cache.set(cacheKey, fileData.data);
  }
  
  /**
   * 生成缓存键
   * @param symbol 标的符号
   * @param interval 时间周期
   * @returns 缓存键
   */
  private getCacheKey(symbol: string, interval: string): string {
    return `${symbol}_${interval}`;
  }
  
  /**
   * 生成文件名（替换特殊字符）
   * @param symbol 标的符号
   * @param interval 时间周期
   * @returns 文件名
   */
  private getFileName(symbol: string, interval: string): string {
    // 替换特殊字符为下划线
    const safeSymbol = symbol.replace(/[\/\-\.]/g, '_');
    return `${safeSymbol}_${interval}.json`;
  }
  
  /**
   * 清除缓存
   * @param symbol 可选，指定标的符号。如果不提供，清除所有缓存
   * @param interval 可选，指定时间周期
   */
  clearCache(symbol?: string, interval?: string): void {
    if (symbol && interval) {
      const cacheKey = this.getCacheKey(symbol, interval);
      this.cache.delete(cacheKey);
    } else if (symbol) {
      // 清除指定标的的所有周期缓存
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${symbol}_`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // 清除所有缓存
      this.cache.clear();
    }
  }
  
  /**
   * 获取缓存统计信息
   * @returns 缓存统计
   */
  getCacheStats(): { totalKeys: number; totalDataPoints: number } {
    let totalDataPoints = 0;
    for (const data of this.cache.values()) {
      totalDataPoints += data.length;
    }
    
    return {
      totalKeys: this.cache.size,
      totalDataPoints,
    };
  }
}
