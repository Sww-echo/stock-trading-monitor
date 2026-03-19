import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { OKXProvider } from './OKXProvider.js';
import { MarketType } from '../../types/market.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('OKXProvider', () => {
  let provider: OKXProvider;
  let mockCreate: any;
  let mockGet: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGet = vi.fn();
    mockCreate = vi.fn().mockReturnValue({
      get: mockGet,
    });
    mockedAxios.create = mockCreate;
    
    provider = new OKXProvider();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('基本属性', () => {
    it('应该有正确的类型和名称', () => {
      expect(provider.type).toBe(MarketType.CRYPTO);
      expect(provider.name).toBe('OKX');
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
        data: {
          code: '0',
          data: [{ last: '42000.50' }],
        },
      });

      const price = await provider.fetchLatestPrice('BTC/USDT');
      
      expect(price).toBe(42000.50);
      expect(mockGet).toHaveBeenCalledWith('/api/v5/market/ticker', {
        params: { instId: 'BTC-USDT' },
      });
    });

    it('应该标准化交易对符号', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          code: '0',
          data: [{ last: '42000.50' }],
        },
      });

      await provider.fetchLatestPrice('btc/usdt');
      
      expect(mockGet).toHaveBeenCalledWith('/api/v5/market/ticker', {
        params: { instId: 'BTC-USDT' },
      });
    });

    it('应该处理API错误响应', async () => {
      mockGet.mockResolvedValue({
        data: {
          code: '50001',
          msg: 'Invalid instrument ID',
        },
      });

      const pricePromise = provider.fetchLatestPrice('INVALID');
      const assertion = expect(pricePromise).rejects.toThrow('OKX API error: Invalid instrument ID');
      await vi.runAllTimersAsync();
      await assertion;
    });

    it('应该处理无效的价格数据', async () => {
      mockGet.mockResolvedValue({
        data: {
          code: '0',
          data: [{ last: 'invalid' }],
        },
      });

      const pricePromise = provider.fetchLatestPrice('BTC/USDT');
      const assertion = expect(pricePromise).rejects.toThrow('Invalid price data from OKX');
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe('fetchKLines', () => {
    it('应该成功获取K线数据', async () => {
      const mockKLineData = [
        ['1704070800000', '42300.0', '42800.0', '42100.0', '42600.0', '2345.67'],
        ['1704067200000', '42000.0', '42500.0', '41800.0', '42300.0', '1234.56'],
      ];

      mockGet.mockResolvedValueOnce({
        data: {
          code: '0',
          data: mockKLineData,
        },
      });

      const klines = await provider.fetchKLines('BTC/USDT', '1h', 2);
      
      expect(klines).toHaveLength(2);
      // OKX返回倒序数据，应该被反转
      expect(klines[0]).toEqual({
        timestamp: 1704067200000,
        open: 42000.0,
        high: 42500.0,
        low: 41800.0,
        close: 42300.0,
        volume: 1234.56,
      });
      expect(mockGet).toHaveBeenCalledWith('/api/v5/market/candles', {
        params: {
          instId: 'BTC-USDT',
          bar: '1H',
          limit: '2',
        },
      });
    });

    it('应该支持不同的时间周期', async () => {
      mockGet.mockResolvedValue({
        data: { code: '0', data: [] },
      });

      await provider.fetchKLines('BTC/USDT', '4h', 10);
      expect(mockGet).toHaveBeenCalledWith('/api/v5/market/candles', {
        params: { instId: 'BTC-USDT', bar: '4H', limit: '10' },
      });
    });

    it('应该拒绝不支持的时间周期', async () => {
      await expect(provider.fetchKLines('BTC/USDT', '7h', 10)).rejects.toThrow(
        'Unsupported interval: 7h'
      );
    });

    it('应该处理API错误响应', async () => {
      mockGet.mockResolvedValue({
        data: {
          code: '50001',
          msg: 'Invalid bar parameter',
        },
      });

      const klinesPromise = provider.fetchKLines('BTC/USDT', '1h', 10);
      const assertion = expect(klinesPromise).rejects.toThrow('OKX API error: Invalid bar parameter');
      await vi.runAllTimersAsync();
      await assertion;
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
        .mockResolvedValueOnce({
          data: { code: '0', data: [{ last: '42000.0' }] },
        });

      const pricePromise = provider.fetchLatestPrice('BTC/USDT');
      
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
      const assertion = expect(pricePromise).rejects.toThrow('OKX API network error');
      await vi.runAllTimersAsync();
      await assertion;
      
      expect(mockGet).toHaveBeenCalledTimes(4);
    });

    it('应该格式化API错误信息', async () => {
      const apiError = new Error('Request failed');
      (apiError as any).response = {
        status: 400,
        data: { msg: 'Invalid instrument ID' },
      };
      
      mockGet.mockRejectedValue(apiError);

      const pricePromise = provider.fetchLatestPrice('INVALID');
      const assertion = expect(pricePromise).rejects.toThrow('OKX API error (400): Invalid instrument ID');
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe('符号标准化', () => {
    it('应该将斜杠转换为连字符', async () => {
      mockGet.mockResolvedValue({
        data: { code: '0', data: [{ last: '1.0' }] },
      });
      
      await provider.fetchLatestPrice('BTC/USDT');
      expect(mockGet).toHaveBeenCalledWith(expect.anything(), {
        params: { instId: 'BTC-USDT' },
      });
    });

    it('应该转换为大写', async () => {
      mockGet.mockResolvedValue({
        data: { code: '0', data: [{ last: '1.0' }] },
      });
      
      await provider.fetchLatestPrice('btc/usdt');
      expect(mockGet).toHaveBeenCalledWith(expect.anything(), {
        params: { instId: 'BTC-USDT' },
      });
    });
  });
});
