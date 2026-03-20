import * as fs from 'fs/promises';
import * as path from 'path';
import { MarketDataProvider, MarketType, KLineData } from '../types/market.js';
import { SymbolClassifier } from './SymbolClassifier.js';

/**
 * 数据管理器
 * 负责协调多个数据提供者、管理缓存和持久化存储
 */
export class DataManager {
  private cache: Map<string, KLineData[]>;
  private providers: Map<MarketType, MarketDataProvider[]>;
  private readonly dataDir: string;
  private readonly symbolClassifier: SymbolClassifier;

  constructor(dataDir: string = './data/klines', symbolClassifier: SymbolClassifier = new SymbolClassifier()) {
    this.cache = new Map();
    this.providers = new Map();
    this.dataDir = dataDir;
    this.symbolClassifier = symbolClassifier;
  }

  /**
   * 注册数据提供者
   * @param provider 市场数据提供者实例
   */
  registerProvider(provider: MarketDataProvider): void {
    const providers = this.providers.get(provider.type) ?? [];
    providers.push(provider);
    this.providers.set(provider.type, providers);
  }

  /**
   * 替换当前所有数据提供者
   * @param providers 市场数据提供者实例列表
   */
  setProviders(providers: MarketDataProvider[]): void {
    this.providers.clear();
    for (const provider of providers) {
      this.registerProvider(provider);
    }
  }

  /**
   * 根据标的符号解析市场类型
   * @param symbol 标的符号
   * @returns 市场类型
   */
  private resolveMarketType(symbol: string): MarketType {
    return this.symbolClassifier.classify(symbol);
  }

  /**
   * 获取标的可用的数据提供者列表
   * @param symbol 标的符号
   * @returns 对应市场的数据提供者列表
   */
  private getProviderCandidates(symbol: string): MarketDataProvider[] {
    const marketType = this.resolveMarketType(symbol);
    const providers = this.providers.get(marketType) ?? [];

    if (providers.length > 0) {
      return providers;
    }

    switch (marketType) {
      case MarketType.CRYPTO:
        throw new Error(`No crypto provider registered for symbol: ${symbol}`);
      case MarketType.STOCK_CN:
        throw new Error(`No A-share provider registered for symbol: ${symbol}`);
      case MarketType.STOCK_US:
        throw new Error(`No US stock provider registered for symbol: ${symbol}`);
    }
  }

  /**
   * 按顺序尝试多个 provider，直到成功
   */
  private async tryProviders<T>(
    symbol: string,
    operationName: string,
    operation: (provider: MarketDataProvider) => Promise<T>
  ): Promise<T> {
    const providers = this.getProviderCandidates(symbol);
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        return await operation(provider);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.name}: ${message}`);
      }
    }

    throw new Error(`All providers failed for ${operationName} ${symbol}: ${errors.join(' | ')}`);
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
    const cacheKey = this.getCacheKey(symbol, interval);

    // 从API获取数据
    const klines = await this.tryProviders(symbol, `fetchKLines ${interval}`, async (provider) => {
      return provider.fetchKLines(symbol, interval, limit);
    });

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
    return this.tryProviders(symbol, 'fetchLatestPrice', async (provider) => {
      return provider.fetchLatestPrice(symbol);
    });
  }

  /**
   * 检查标的当前是否在交易时间
   * @param symbol 标的符号
   * @returns 是否在交易时间
   */
  isSymbolTradingTime(symbol: string): boolean {
    const providers = this.getProviderCandidates(symbol);
    return providers[0].isTradingTime();
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
    const marketType = this.resolveMarketType(symbol);
    const subDir = marketType === MarketType.CRYPTO ? 'crypto' : 'stock';

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
    const marketType = this.resolveMarketType(symbol);
    const subDir = marketType === MarketType.CRYPTO ? 'crypto' : 'stock';

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
