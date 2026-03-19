import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { BinanceProvider } from './BinanceProvider.js';
import { MarketType } from '../../types/market.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('BinanceProvider', () => {
  let provider: BinanceProvider;
  let mockCreate: any;
  let mockGet: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGet = vi.fn();
    mockCreate = vi.fn().mockReturnValue({
      get: mockGet,
    });
    mockedAxios.create = mockCreate;
    
    provider = new BinanceProvider();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('基本属性', () => {
    it('应该有正确的类型和名称', () => {
      expect(provider.type).toBe(MarketType.CRYPTO);
      expect(provider.name).toBe('Binance');
    });
  });

  describe('isTradingTime', () => {
    it('应该始终返回 true（24/7交易）', () => {
      expect(provider.isTradingTime()).toBe(true);
    });
  });

  describe('fetchLatestPrice', () => {
    it('应该成功获取最新价格', async () => {
      mockGet.mockResolvedValueOnce({
        data: { price: '42000.50' },
      });

      const price = await provider.fetchLatestPrice('BTC/USDT');
      
      expect(price).toBe(42000.50);
      expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/price', {
        params: { symbol: 'BTCUSDT' },
      });
    });

    it('应该标准化交易对符号', async () => {
      mockGet.mockResolvedValueOnce({
        data: { price: '42000.50' },
      });

      await provider.fetchLatestPrice('btc/usdt');
      
      expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/price', {
        params: { symbol: 'BTCUSDT' },
      });
    });

    it('应该处理无效的价格数据', async () => {
      // 所有重试都返回无效数据，避免重试延迟
      mockGet.mockResolvedValue({
        data: { price: 'invalid' },
      });

      const pricePromise = provider.fetchLatestPrice('BTC/USDT');
      const assertion = expect(pricePromise).rejects.toThrow(
        'Invalid price data from Binance'
      );
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe('fetchKLines', () => {
    it('应该成功获取K线数据', async () => {
      const mockKLineData = [
        [1704067200000, '42000.0', '42500.0', '41800.0', '42300.0', '1234.56'],
        [1704070800000, '42300.0', '42800.0', '42100.0', '42600.0', '2345.67'],
      ];

      mockGet.mockResolvedValueOnce({
        data: mockKLineData,
      });

      const klines = await provider.fetchKLines('BTC/USDT', '1h', 2);
      
      expect(klines).toHaveLength(2);
      expect(klines[0]).toEqual({
        timestamp: 1704067200000,
        open: 42000.0,
        high: 42500.0,
        low: 41800.0,
        close: 42300.0,
        volume: 1234.56,
      });
      expect(mockGet).toHaveBeenCalledWith('/api/v3/klines', {
        params: {
          symbol: 'BTCUSDT',
          interval: '1h',
          limit: 2,
        },
      });
    });

    it('应该支持不同的时间周期', async () => {
      mockGet.mockResolvedValue({ data: [] });

      await provider.fetchKLines('BTC/USDT', '4h', 10);
      expect(mockGet).toHaveBeenCalledWith('/api/v3/klines', {
        params: { symbol: 'BTCUSDT', interval: '4h', limit: 10 },
      });
    });

    it('应该拒绝不支持的时间周期', async () => {
      await expect(provider.fetchKLines('BTC/USDT', '7h', 10)).rejects.toThrow(
        'Unsupported interval: 7h'
      );
    });
  });

  describe('错误处理和重试', () => {
    it('应该在网络错误时重试3次', async () => {
      const networkError = new Error('Network error');
      (networkError as any).request = {};
      
      mockGet
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: { price: '42000.0' } });

      const pricePromise = provider.fetchLatestPrice('BTC/USDT');
      
      // 快进所有定时器
      await vi.runAllTimersAsync();
      
      const price = await pricePromise;
      expect(price).toBe(42000.0);
      expect(mockGet).toHaveBeenCalledTimes(4);
    });

    it('应该在3次重试后抛出错误', async () => {
      const networkError = new Error('Network error');
      (networkError as any).request = {};
      
      mockGet.mockRejectedValue(networkError);

      const pricePromise = provider.fetchLatestPrice('BTC/USDT');
      const assertion = expect(pricePromise).rejects.toThrow(
        'Binance API network error'
      );

      // 快进所有定时器
      await vi.runAllTimersAsync();

      await assertion;
      expect(mockGet).toHaveBeenCalledTimes(4); // 初始请求 + 3次重试
    });

    it('应该格式化API错误信息', async () => {
      const apiError = new Error('Request failed');
      (apiError as any).response = {
        status: 400,
        data: { msg: 'Invalid symbol' },
      };
      
      mockGet.mockRejectedValue(apiError);

      const pricePromise = provider.fetchLatestPrice('INVALID');
      const assertion = expect(pricePromise).rejects.toThrow(
        'Binance API error (400): Invalid symbol'
      );

      // 快进所有定时器
      await vi.runAllTimersAsync();

      await assertion;
    });
  });

  describe('符号标准化', () => {
    it('应该移除斜杠', async () => {
      mockGet.mockResolvedValue({ data: { price: '1.0' } });
      
      await provider.fetchLatestPrice('BTC/USDT');
      expect(mockGet).toHaveBeenCalledWith(expect.anything(), {
        params: { symbol: 'BTCUSDT' },
      });
    });

    it('应该移除连字符', async () => {
      mockGet.mockResolvedValue({ data: { price: '1.0' } });
      
      await provider.fetchLatestPrice('BTC-USDT');
      expect(mockGet).toHaveBeenCalledWith(expect.anything(), {
        params: { symbol: 'BTCUSDT' },
      });
    });

    it('应该转换为大写', async () => {
      mockGet.mockResolvedValue({ data: { price: '1.0' } });
      
      await provider.fetchLatestPrice('btc/usdt');
      expect(mockGet).toHaveBeenCalledWith(expect.anything(), {
        params: { symbol: 'BTCUSDT' },
      });
    });
  });
});
