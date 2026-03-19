import { describe, it, expect } from 'vitest';
import { MarketType, type MarketDataProvider, type KLineData } from './market.js';

describe('MarketType 枚举', () => {
  it('应该定义 CRYPTO 类型', () => {
    expect(MarketType.CRYPTO).toBe('crypto');
  });

  it('应该定义 STOCK_CN 类型', () => {
    expect(MarketType.STOCK_CN).toBe('stock_cn');
  });

  it('应该定义 STOCK_US 类型', () => {
    expect(MarketType.STOCK_US).toBe('stock_us');
  });

  it('应该包含所有三种市场类型', () => {
    const types = Object.values(MarketType);
    expect(types).toHaveLength(3);
    expect(types).toContain('crypto');
    expect(types).toContain('stock_cn');
    expect(types).toContain('stock_us');
  });
});

describe('KLineData 接口', () => {
  it('应该接受有效的 K线数据', () => {
    const kline: KLineData = {
      timestamp: 1704067200000,
      open: 42000.5,
      high: 42500.0,
      low: 41800.0,
      close: 42300.0,
      volume: 1234.56
    };

    expect(kline.timestamp).toBe(1704067200000);
    expect(kline.open).toBe(42000.5);
    expect(kline.high).toBe(42500.0);
    expect(kline.low).toBe(41800.0);
    expect(kline.close).toBe(42300.0);
    expect(kline.volume).toBe(1234.56);
  });
});

describe('MarketDataProvider 接口', () => {
  it('应该定义正确的接口结构', () => {
    // 创建一个模拟的 MarketDataProvider 实现
    const mockProvider: MarketDataProvider = {
      type: MarketType.CRYPTO,
      name: 'MockProvider',
      fetchKLines: async (symbol: string, interval: string, limit: number): Promise<KLineData[]> => {
        return [{
          timestamp: Date.now(),
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000
        }];
      },
      fetchLatestPrice: async (symbol: string): Promise<number> => {
        return 105.5;
      },
      isTradingTime: (): boolean => {
        return true;
      }
    };

    expect(mockProvider.type).toBe(MarketType.CRYPTO);
    expect(mockProvider.name).toBe('MockProvider');
    expect(typeof mockProvider.fetchKLines).toBe('function');
    expect(typeof mockProvider.fetchLatestPrice).toBe('function');
    expect(typeof mockProvider.isTradingTime).toBe('function');
  });

  it('fetchKLines 应该返回 KLineData 数组', async () => {
    const mockProvider: MarketDataProvider = {
      type: MarketType.CRYPTO,
      name: 'TestProvider',
      fetchKLines: async (symbol: string, interval: string, limit: number): Promise<KLineData[]> => {
        return [
          {
            timestamp: 1704067200000,
            open: 42000,
            high: 42500,
            low: 41800,
            close: 42300,
            volume: 1234.56
          },
          {
            timestamp: 1704070800000,
            open: 42300,
            high: 42800,
            low: 42100,
            close: 42600,
            volume: 2345.67
          }
        ];
      },
      fetchLatestPrice: async () => 42600,
      isTradingTime: () => true
    };

    const klines = await mockProvider.fetchKLines('BTC/USDT', '1h', 2);
    expect(klines).toHaveLength(2);
    expect(klines[0].timestamp).toBe(1704067200000);
    expect(klines[1].close).toBe(42600);
  });

  it('fetchLatestPrice 应该返回数字', async () => {
    const mockProvider: MarketDataProvider = {
      type: MarketType.STOCK_US,
      name: 'TestProvider',
      fetchKLines: async () => [],
      fetchLatestPrice: async (symbol: string): Promise<number> => {
        return 150.25;
      },
      isTradingTime: () => true
    };

    const price = await mockProvider.fetchLatestPrice('AAPL');
    expect(typeof price).toBe('number');
    expect(price).toBe(150.25);
  });

  it('isTradingTime 应该返回布尔值', () => {
    const cryptoProvider: MarketDataProvider = {
      type: MarketType.CRYPTO,
      name: 'CryptoProvider',
      fetchKLines: async () => [],
      fetchLatestPrice: async () => 100,
      isTradingTime: (): boolean => true
    };

    const stockProvider: MarketDataProvider = {
      type: MarketType.STOCK_CN,
      name: 'StockProvider',
      fetchKLines: async () => [],
      fetchLatestPrice: async () => 100,
      isTradingTime: (): boolean => {
        const now = new Date();
        const hour = now.getHours();
        return hour >= 9 && hour < 15;
      }
    };

    expect(typeof cryptoProvider.isTradingTime()).toBe('boolean');
    expect(cryptoProvider.isTradingTime()).toBe(true);
    expect(typeof stockProvider.isTradingTime()).toBe('boolean');
  });

  it('应该支持不同的市场类型', () => {
    const cryptoProvider: MarketDataProvider = {
      type: MarketType.CRYPTO,
      name: 'Binance',
      fetchKLines: async () => [],
      fetchLatestPrice: async () => 100,
      isTradingTime: () => true
    };

    const stockCNProvider: MarketDataProvider = {
      type: MarketType.STOCK_CN,
      name: 'Tushare',
      fetchKLines: async () => [],
      fetchLatestPrice: async () => 100,
      isTradingTime: () => false
    };

    const stockUSProvider: MarketDataProvider = {
      type: MarketType.STOCK_US,
      name: 'Yahoo Finance',
      fetchKLines: async () => [],
      fetchLatestPrice: async () => 100,
      isTradingTime: () => false
    };

    expect(cryptoProvider.type).toBe(MarketType.CRYPTO);
    expect(stockCNProvider.type).toBe(MarketType.STOCK_CN);
    expect(stockUSProvider.type).toBe(MarketType.STOCK_US);
  });
});
