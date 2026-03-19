import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DataManager } from './DataManager.js';
import { MarketDataProvider, MarketType, KLineData } from '../types/market.js';

// Mock provider for testing
class MockCryptoProvider implements MarketDataProvider {
  readonly type = MarketType.CRYPTO;
  readonly name = 'MockCrypto';
  
  async fetchKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]> {
    const klines: KLineData[] = [];
    const now = Date.now();
    
    for (let i = 0; i < limit; i++) {
      klines.push({
        timestamp: now - (limit - i) * 3600000, // 1 hour intervals
        open: 40000 + i * 100,
        high: 40100 + i * 100,
        low: 39900 + i * 100,
        close: 40050 + i * 100,
        volume: 1000 + i * 10,
      });
    }
    
    return klines;
  }
  
  async fetchLatestPrice(symbol: string): Promise<number> {
    return 42000;
  }
  
  isTradingTime(): boolean {
    return true;
  }
}

class MockStockCNProvider implements MarketDataProvider {
  readonly type = MarketType.STOCK_CN;
  readonly name = 'MockStockCN';
  
  async fetchKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]> {
    const klines: KLineData[] = [];
    const now = Date.now();
    
    for (let i = 0; i < limit; i++) {
      klines.push({
        timestamp: now - (limit - i) * 3600000,
        open: 100 + i,
        high: 101 + i,
        low: 99 + i,
        close: 100.5 + i,
        volume: 10000 + i * 100,
      });
    }
    
    return klines;
  }
  
  async fetchLatestPrice(symbol: string): Promise<number> {
    return 150;
  }
  
  isTradingTime(): boolean {
    return true;
  }
}

class MockStockUSProvider implements MarketDataProvider {
  readonly type = MarketType.STOCK_US;
  readonly name = 'MockStockUS';
  
  async fetchKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]> {
    const klines: KLineData[] = [];
    const now = Date.now();
    
    for (let i = 0; i < limit; i++) {
      klines.push({
        timestamp: now - (limit - i) * 3600000,
        open: 150 + i,
        high: 151 + i,
        low: 149 + i,
        close: 150.5 + i,
        volume: 50000 + i * 500,
      });
    }
    
    return klines;
  }
  
  async fetchLatestPrice(symbol: string): Promise<number> {
    return 180;
  }
  
  isTradingTime(): boolean {
    return true;
  }
}

describe('DataManager', () => {
  let dataManager: DataManager;
  let testDataDir: string;
  
  beforeEach(() => {
    testDataDir = path.join('.', `test-data-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    dataManager = new DataManager(testDataDir);
  });
  
  afterEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  describe('registerProvider', () => {
    it('should register a crypto provider', () => {
      const provider = new MockCryptoProvider();
      dataManager.registerProvider(provider);
      
      // Verify by trying to get data for a crypto symbol
      expect(async () => {
        await dataManager.getKLines('BTC/USDT', '1h', 10);
      }).not.toThrow();
    });
    
    it('should register multiple providers for different market types', () => {
      const cryptoProvider = new MockCryptoProvider();
      const stockCNProvider = new MockStockCNProvider();
      const stockUSProvider = new MockStockUSProvider();
      
      dataManager.registerProvider(cryptoProvider);
      dataManager.registerProvider(stockCNProvider);
      dataManager.registerProvider(stockUSProvider);
      
      // All should work without errors
      expect(async () => {
        await dataManager.getKLines('BTC/USDT', '1h', 10);
        await dataManager.getKLines('600519.SH', '1h', 10);
        await dataManager.getKLines('AAPL', '1h', 10);
      }).not.toThrow();
    });
  });
  
  describe('selectProvider', () => {
    beforeEach(() => {
      dataManager.registerProvider(new MockCryptoProvider());
      dataManager.registerProvider(new MockStockCNProvider());
      dataManager.registerProvider(new MockStockUSProvider());
    });
    
    it('should select crypto provider for symbols with /', async () => {
      const klines = await dataManager.getKLines('BTC/USDT', '1h', 10);
      expect(klines).toHaveLength(10);
    });
    
    it('should select crypto provider for symbols with -', async () => {
      const klines = await dataManager.getKLines('BTC-USDT', '1h', 10);
      expect(klines).toHaveLength(10);
    });
    
    it('should select crypto provider for common crypto symbols', async () => {
      const klines = await dataManager.getKLines('BTC', '1h', 10);
      expect(klines).toHaveLength(10);
    });
    
    it('should select A-share provider for XXXXXX.SH format', async () => {
      const klines = await dataManager.getKLines('600519.SH', '1h', 10);
      expect(klines).toHaveLength(10);
    });
    
    it('should select A-share provider for XXXXXX.SZ format', async () => {
      const klines = await dataManager.getKLines('000001.SZ', '1h', 10);
      expect(klines).toHaveLength(10);
    });
    
    it('should select US stock provider for letter symbols', async () => {
      const klines = await dataManager.getKLines('AAPL', '1h', 10);
      expect(klines).toHaveLength(10);
    });
    
    it('should throw error for unrecognized symbol format', async () => {
      await expect(dataManager.getKLines('INVALID@SYMBOL', '1h', 10))
        .rejects.toThrow('Unable to determine market type');
    });
    
    it('should throw error when provider not registered', async () => {
      const newManager = new DataManager(testDataDir);
      await expect(newManager.getKLines('BTC/USDT', '1h', 10))
        .rejects.toThrow('No crypto provider registered');
    });
  });
  
  describe('getKLines', () => {
    beforeEach(() => {
      dataManager.registerProvider(new MockCryptoProvider());
    });
    
    it('should fetch K-line data from API', async () => {
      const klines = await dataManager.getKLines('BTC/USDT', '1h', 10);
      
      expect(klines).toHaveLength(10);
      expect(klines[0]).toHaveProperty('timestamp');
      expect(klines[0]).toHaveProperty('open');
      expect(klines[0]).toHaveProperty('high');
      expect(klines[0]).toHaveProperty('low');
      expect(klines[0]).toHaveProperty('close');
      expect(klines[0]).toHaveProperty('volume');
    });
    
    it('should return data from cache on second call', async () => {
      const klines1 = await dataManager.getKLines('BTC/USDT', '1h', 10);
      const klines2 = await dataManager.getKLines('BTC/USDT', '1h', 10);
      
      expect(klines1).toEqual(klines2);
    });
    
    it('should return correct number of data points', async () => {
      const klines = await dataManager.getKLines('BTC/USDT', '1h', 50);
      expect(klines).toHaveLength(50);
    });
    
    it('should handle different intervals', async () => {
      const klines1h = await dataManager.getKLines('BTC/USDT', '1h', 10);
      const klines4h = await dataManager.getKLines('BTC/USDT', '4h', 10);
      
      expect(klines1h).toHaveLength(10);
      expect(klines4h).toHaveLength(10);
      expect(klines1h).not.toEqual(klines4h);
    });
  });
  
  describe('updateKLines', () => {
    beforeEach(() => {
      dataManager.registerProvider(new MockCryptoProvider());
    });
    
    it('should update cache with new data', async () => {
      await dataManager.updateKLines('BTC/USDT', '1h', 20);
      
      const klines = await dataManager.getKLines('BTC/USDT', '1h', 20);
      expect(klines).toHaveLength(20);
    });
    
    it('should use default limit of 120', async () => {
      await dataManager.updateKLines('BTC/USDT', '1h');
      
      const klines = await dataManager.getKLines('BTC/USDT', '1h', 120);
      expect(klines).toHaveLength(120);
    });
    
    it('should throw error when no data returned', async () => {
      class EmptyProvider implements MarketDataProvider {
        readonly type = MarketType.CRYPTO;
        readonly name = 'Empty';
        
        async fetchKLines(): Promise<KLineData[]> {
          return [];
        }
        
        async fetchLatestPrice(): Promise<number> {
          return 0;
        }
        
        isTradingTime(): boolean {
          return true;
        }
      }
      
      const emptyManager = new DataManager(testDataDir);
      emptyManager.registerProvider(new EmptyProvider());
      
      await expect(emptyManager.updateKLines('BTC/USDT', '1h'))
        .rejects.toThrow('No K-line data returned');
    });
  });
  
  describe('saveToFile and loadFromFile', () => {
    beforeEach(() => {
      dataManager.registerProvider(new MockCryptoProvider());
      dataManager.registerProvider(new MockStockCNProvider());
    });
    
    it('should save crypto data to crypto subdirectory', async () => {
      await dataManager.updateKLines('BTC/USDT', '1h', 10);
      
      const filePath = path.join(testDataDir, 'crypto', 'BTC_USDT_1h.json');
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      
      expect(fileExists).toBe(true);
    });
    
    it('should save stock data to stock subdirectory', async () => {
      await dataManager.updateKLines('600519.SH', '1h', 10);
      
      const filePath = path.join(testDataDir, 'stock', '600519_SH_1h.json');
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      
      expect(fileExists).toBe(true);
    });
    
    it('should save data with correct format', async () => {
      await dataManager.updateKLines('BTC/USDT', '1h', 10);
      
      const filePath = path.join(testDataDir, 'crypto', 'BTC_USDT_1h.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      expect(data).toHaveProperty('symbol', 'BTC/USDT');
      expect(data).toHaveProperty('interval', '1h');
      expect(data).toHaveProperty('lastUpdate');
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data).toHaveLength(10);
    });
    
    it('should load data from file', async () => {
      // First save data
      await dataManager.updateKLines('BTC/USDT', '1h', 10);
      
      // Clear cache
      dataManager.clearCache();
      
      // Load from file
      await dataManager.loadFromFile('BTC/USDT', '1h');
      
      // Verify data is in cache
      const klines = await dataManager.getKLines('BTC/USDT', '1h', 10);
      expect(klines).toHaveLength(10);
    });
    
    it('should throw error when loading non-existent file', async () => {
      await expect(dataManager.loadFromFile('NONEXISTENT', '1h'))
        .rejects.toThrow();
    });
  });
  
  describe('clearCache', () => {
    beforeEach(async () => {
      dataManager.registerProvider(new MockCryptoProvider());
      await dataManager.updateKLines('BTC/USDT', '1h', 10);
      await dataManager.updateKLines('BTC/USDT', '4h', 10);
      await dataManager.updateKLines('ETH/USDT', '1h', 10);
    });
    
    it('should clear specific symbol and interval', () => {
      dataManager.clearCache('BTC/USDT', '1h');
      
      const stats = dataManager.getCacheStats();
      expect(stats.totalKeys).toBe(2); // Only 4h and ETH remain
    });
    
    it('should clear all intervals for a symbol', () => {
      dataManager.clearCache('BTC/USDT');
      
      const stats = dataManager.getCacheStats();
      expect(stats.totalKeys).toBe(1); // Only ETH remains
    });
    
    it('should clear all cache', () => {
      dataManager.clearCache();
      
      const stats = dataManager.getCacheStats();
      expect(stats.totalKeys).toBe(0);
      expect(stats.totalDataPoints).toBe(0);
    });
  });
  
  describe('getCacheStats', () => {
    beforeEach(() => {
      dataManager.registerProvider(new MockCryptoProvider());
    });
    
    it('should return correct cache statistics', async () => {
      await dataManager.updateKLines('BTC/USDT', '1h', 10);
      await dataManager.updateKLines('ETH/USDT', '1h', 20);
      
      const stats = dataManager.getCacheStats();
      
      expect(stats.totalKeys).toBe(2);
      expect(stats.totalDataPoints).toBe(30);
    });
    
    it('should return zero for empty cache', () => {
      const stats = dataManager.getCacheStats();
      
      expect(stats.totalKeys).toBe(0);
      expect(stats.totalDataPoints).toBe(0);
    });
  });
  
  describe('integration tests', () => {
    beforeEach(() => {
      dataManager.registerProvider(new MockCryptoProvider());
      dataManager.registerProvider(new MockStockCNProvider());
      dataManager.registerProvider(new MockStockUSProvider());
    });
    
    it('should handle multiple symbols and intervals', async () => {
      const btc1h = await dataManager.getKLines('BTC/USDT', '1h', 10);
      const btc4h = await dataManager.getKLines('BTC/USDT', '4h', 10);
      const eth1h = await dataManager.getKLines('ETH/USDT', '1h', 10);
      const stock = await dataManager.getKLines('600519.SH', '1h', 10);
      const us = await dataManager.getKLines('AAPL', '1h', 10);
      
      expect(btc1h).toHaveLength(10);
      expect(btc4h).toHaveLength(10);
      expect(eth1h).toHaveLength(10);
      expect(stock).toHaveLength(10);
      expect(us).toHaveLength(10);
      
      const stats = dataManager.getCacheStats();
      expect(stats.totalKeys).toBe(5);
      expect(stats.totalDataPoints).toBe(50);
    });
    
    it('should persist and reload data correctly', async () => {
      // Fetch and save data
      const originalData = await dataManager.getKLines('BTC/USDT', '1h', 10);
      
      // Create new manager instance
      const newManager = new DataManager(testDataDir);
      newManager.registerProvider(new MockCryptoProvider());
      
      // Load from file
      await newManager.loadFromFile('BTC/USDT', '1h');
      const loadedData = await newManager.getKLines('BTC/USDT', '1h', 10);
      
      expect(loadedData).toEqual(originalData);
    });
  });
});
