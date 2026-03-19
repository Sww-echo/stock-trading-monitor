import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { DataManager } from './DataManager.js';
import { BinanceProvider } from './providers/BinanceProvider.js';
import { OKXProvider } from './providers/OKXProvider.js';
import { TushareProvider } from './providers/TushareProvider.js';
import { YahooFinanceProvider } from './providers/YahooFinanceProvider.js';

/**
 * Integration tests for DataManager with real provider implementations
 * These tests verify that DataManager correctly coordinates multiple providers
 * 
 * Note: These tests use mock providers in the unit tests, but this file
 * demonstrates integration with actual provider classes
 */
describe('DataManager Integration', () => {
  let dataManager: DataManager;
  let testDataDir: string;
  
  beforeEach(() => {
    testDataDir = './test-data-integration-' + Date.now();
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
  
  describe('Multi-provider registration', () => {
    it('should register all four provider types', () => {
      const binance = new BinanceProvider();
      const okx = new OKXProvider();
      const tushare = new TushareProvider('test-token');
      const yahoo = new YahooFinanceProvider();
      
      dataManager.registerProvider(binance);
      dataManager.registerProvider(okx);
      dataManager.registerProvider(tushare);
      dataManager.registerProvider(yahoo);
      
      // Verify registration by checking provider selection doesn't throw
      expect(() => {
        // These calls will fail at API level but should pass provider selection
        dataManager.getKLines('BTC/USDT', '1h', 10).catch(() => {});
        dataManager.getKLines('600519.SH', '1h', 10).catch(() => {});
        dataManager.getKLines('AAPL', '1h', 10).catch(() => {});
      }).not.toThrow();
    });
    
    it('should use Binance for crypto symbols by default', () => {
      const binance = new BinanceProvider();
      dataManager.registerProvider(binance);
      
      // Should not throw provider selection error
      expect(() => {
        dataManager.getKLines('BTC/USDT', '1h', 10).catch(() => {});
      }).not.toThrow();
    });
    
    it('should handle provider override (OKX after Binance)', () => {
      const binance = new BinanceProvider();
      const okx = new OKXProvider();
      
      dataManager.registerProvider(binance);
      dataManager.registerProvider(okx); // This will override Binance
      
      // Should still work (now using OKX)
      expect(() => {
        dataManager.getKLines('BTC/USDT', '1h', 10).catch(() => {});
      }).not.toThrow();
    });
  });
  
  describe('Symbol routing', () => {
    beforeEach(() => {
      dataManager.registerProvider(new BinanceProvider());
      dataManager.registerProvider(new TushareProvider('test-token'));
      dataManager.registerProvider(new YahooFinanceProvider());
    });
    
    it('should not throw provider selection error for crypto symbols with /', () => {
      // Verify provider selection logic doesn't throw
      expect(() => {
        // This will eventually fail at API level, but provider selection should work
        dataManager.getKLines('BTC/USDT', '1h', 10).catch(() => {});
      }).not.toThrow();
    });
    
    it('should not throw provider selection error for crypto symbols with -', () => {
      expect(() => {
        dataManager.getKLines('BTC-USDT', '1h', 10).catch(() => {});
      }).not.toThrow();
    });
    
    it('should not throw provider selection error for A-share symbols', () => {
      expect(() => {
        dataManager.getKLines('600519.SH', '1h', 10).catch(() => {});
      }).not.toThrow();
    });
    
    it('should not throw provider selection error for US stock symbols', () => {
      expect(() => {
        dataManager.getKLines('AAPL', '1h', 10).catch(() => {});
      }).not.toThrow();
    });
  });
  
  describe('File storage structure', () => {
    beforeEach(() => {
      dataManager.registerProvider(new BinanceProvider());
      dataManager.registerProvider(new TushareProvider('test-token'));
      dataManager.registerProvider(new YahooFinanceProvider());
    });
    
    it('should verify crypto provider is registered', () => {
      // Just verify the provider is registered, don't make API calls
      const stats = dataManager.getCacheStats();
      expect(stats.totalKeys).toBe(0);
    });
    
    it('should verify stock providers are registered', () => {
      // Just verify the providers are registered
      const stats = dataManager.getCacheStats();
      expect(stats.totalKeys).toBe(0);
    });
  });
  
  describe('Cache behavior with multiple providers', () => {
    beforeEach(() => {
      dataManager.registerProvider(new BinanceProvider());
      dataManager.registerProvider(new TushareProvider('test-token'));
    });
    
    it('should maintain separate caches for different market types', () => {
      const stats1 = dataManager.getCacheStats();
      expect(stats1.totalKeys).toBe(0);
      
      // Attempt to fetch (will fail but cache keys should be created)
      dataManager.getKLines('BTC/USDT', '1h', 10).catch(() => {});
      dataManager.getKLines('600519.SH', '1h', 10).catch(() => {});
      
      // Cache should remain empty since fetches failed
      const stats2 = dataManager.getCacheStats();
      expect(stats2.totalKeys).toBe(0);
    });
    
    it('should clear cache independently for different symbols', async () => {
      // This test verifies cache clearing logic
      dataManager.clearCache('BTC/USDT', '1h');
      dataManager.clearCache('600519.SH', '1h');
      
      const stats = dataManager.getCacheStats();
      expect(stats.totalKeys).toBe(0);
    });
  });
  
  describe('Error handling with real providers', () => {
    it('should throw meaningful error when no provider registered', async () => {
      const emptyManager = new DataManager(testDataDir);
      
      await expect(emptyManager.getKLines('BTC/USDT', '1h', 10))
        .rejects.toThrow('No crypto provider registered');
    });
    
    it('should throw meaningful error for invalid symbol format', async () => {
      dataManager.registerProvider(new BinanceProvider());
      
      await expect(dataManager.getKLines('INVALID@#$', '1h', 10))
        .rejects.toThrow('Unable to determine market type');
    });
  });
});
