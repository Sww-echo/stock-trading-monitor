import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { YahooFinanceProvider } from './YahooFinanceProvider.js';
import { MarketType } from '../../types/market.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('YahooFinanceProvider', () => {
  let provider: YahooFinanceProvider;
  let mockCreate: any;
  let mockGet: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGet = vi.fn();
    mockCreate = vi.fn().mockReturnValue({
      get: mockGet,
    });
    mockedAxios.create = mockCreate;
    
    provider = new YahooFinanceProvider();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('基本属性', () => {
    it('应该有正确的类型和名称', () => {
      expect(provider.type).toBe(MarketType.STOCK_US);
      expect(provider.name).toBe('Yahoo Finance');
    });
  });

  describe('isTradingTime', () => {
    it('应该在交易时间内返回 true', () => {
      // 设置为美东时间周三 10:00 AM
      const wednesday10AM = new Date('2024-01-10T15:00:00Z'); // UTC时间，对应ET 10:00
      vi.setSystemTime(wednesday10AM);
      
      expect(provider.isTradingTime()).toBe(true);
    });

    it('应该在交易时间外返回 false', () => {
      // 设置为美东时间周三 8:00 AM（开盘前）
      const wednesday8AM = new Date('2024-01-10T13:00:00Z');
      vi.setSystemTime(wednesday8AM);
      
      expect(provider.isTradingTime()).toBe(false);
    });

    it('应该在周末返回 false', () => {
      // 设置为周六
      const saturday = new Date('2024-01-13T15:00:00Z');
      vi.setSystemTime(saturday);
      
      expect(provider.isTradingTime()).toBe(false);
    });
  });

  describe('fetchLatestPrice', () => {
    it('应该成功获取最新价格', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          chart: {
            result: [{
              meta: {
                regularMarketPrice: 175.50,
              },
            }],
          },
        },
      });

      const price = await provider.fetchLatestPrice('AAPL');
      
      expect(price).toBe(175.50);
      expect(mockGet).toHaveBeenCalledWith('/v8/finance/chart/AAPL', {
        params: {
          interval: '1m',
          range: '1d',
        },
      });
    });

    it('应该标准化股票代码', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          chart: {
            result: [{
              meta: { regularMarketPrice: 100.0 },
            }],
          },
        },
      });

      await provider.fetchLatestPrice('aapl');
      
      expect(mockGet).toHaveBeenCalledWith('/v8/finance/chart/AAPL', expect.anything());
    });

    it('应该处理API错误', async () => {
      mockGet.mockResolvedValue({
        data: {
          chart: {
            result: [{
              error: {
                description: 'Symbol not found',
              },
            }],
          },
        },
      });

      const pricePromise = provider.fetchLatestPrice('XXXXX');
      const assertion = expect(pricePromise).rejects.toThrow('Yahoo Finance API error: Symbol not found');
      await vi.runAllTimersAsync();
      await assertion;
    });

    it('应该处理无效的响应格式', async () => {
      mockGet.mockResolvedValue({
        data: {},
      });

      const pricePromise = provider.fetchLatestPrice('AAPL');
      const assertion = expect(pricePromise).rejects.toThrow('Invalid response from Yahoo Finance API');
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe('fetchKLines', () => {
    it('应该成功获取K线数据', async () => {
      const mockResponse = {
        data: {
          chart: {
            result: [{
              timestamp: [1704067200, 1704070800],
              indicators: {
                quote: [{
                  open: [175.0, 176.0],
                  high: [177.0, 178.0],
                  low: [174.0, 175.5],
                  close: [176.5, 177.5],
                  volume: [1000000, 1100000],
                }],
              },
            }],
          },
        },
      };

      mockGet.mockResolvedValueOnce(mockResponse);

      const klines = await provider.fetchKLines('AAPL', '1h', 2);
      
      expect(klines).toHaveLength(2);
      expect(klines[0]).toEqual({
        timestamp: 1704067200000, // 转换为毫秒
        open: 175.0,
        high: 177.0,
        low: 174.0,
        close: 176.5,
        volume: 1000000,
      });
    });

    it('应该跳过null数据点', async () => {
      const mockResponse = {
        data: {
          chart: {
            result: [{
              timestamp: [1704067200, 1704070800, 1704074400],
              indicators: {
                quote: [{
                  open: [175.0, null, 176.0],
                  high: [177.0, null, 178.0],
                  low: [174.0, null, 175.5],
                  close: [176.5, null, 177.5],
                  volume: [1000000, null, 1100000],
                }],
              },
            }],
          },
        },
      };

      mockGet.mockResolvedValueOnce(mockResponse);

      const klines = await provider.fetchKLines('AAPL', '1h', 3);
      
      expect(klines).toHaveLength(2); // 应该只有2条有效数据
    });

    it('应该支持不同的时间周期', async () => {
      mockGet.mockResolvedValue({
        data: {
          chart: {
            result: [{
              timestamp: [],
              indicators: { quote: [{ open: [], high: [], low: [], close: [], volume: [] }] },
            }],
          },
        },
      });

      await provider.fetchKLines('AAPL', '4h', 10);
      
      expect(mockGet).toHaveBeenCalledWith(
        '/v8/finance/chart/AAPL',
        expect.objectContaining({
          params: expect.objectContaining({
            interval: '4h',
          }),
        })
      );
    });

    it('应该拒绝不支持的时间周期', async () => {
      await expect(provider.fetchKLines('AAPL', '7h', 10)).rejects.toThrow(
        'Unsupported interval: 7h'
      );
    });

    it('应该处理缺失的OHLCV数据', async () => {
      mockGet.mockResolvedValue({
        data: {
          chart: {
            result: [{
              timestamp: [1704067200],
              indicators: {
                quote: [{}], // 缺失OHLCV数据
              },
            }],
          },
        },
      });

      const klinesPromise = provider.fetchKLines('AAPL', '1h', 1);
      const assertion = expect(klinesPromise).rejects.toThrow('Missing OHLCV data');
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
          data: {
            chart: {
              result: [{
                meta: { regularMarketPrice: 175.0 },
              }],
            },
          },
        });

      const pricePromise = provider.fetchLatestPrice('AAPL');
      
      await vi.runAllTimersAsync();
      
      const price = await pricePromise;
      expect(price).toBe(175.0);
      expect(mockGet).toHaveBeenCalledTimes(4);
    });

    it('应该在3次重试后抛出错误', async () => {
      const networkError = new Error('Network error');
      (networkError as any).request = {};
      
      mockGet.mockRejectedValue(networkError);

      const pricePromise = provider.fetchLatestPrice('AAPL');
      const assertion = expect(pricePromise).rejects.toThrow('Yahoo Finance API network error');
      await vi.runAllTimersAsync();
      await assertion;
      expect(mockGet).toHaveBeenCalledTimes(4); // 初始请求 + 3次重试
    });

    it('应该格式化API错误信息', async () => {
      const apiError = new Error('Request failed');
      (apiError as any).response = {
        status: 404,
        data: {
          chart: {
            error: {
              description: 'No data found',
            },
          },
        },
      };
      
      mockGet.mockRejectedValue(apiError);

      const pricePromise = provider.fetchLatestPrice('XXXXX');
      const assertion = expect(pricePromise).rejects.toThrow('Yahoo Finance API error (404): No data found');
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe('符号标准化', () => {
    it('应该转换为大写', async () => {
      mockGet.mockResolvedValue({
        data: {
          chart: {
            result: [{
              meta: { regularMarketPrice: 100.0 },
            }],
          },
        },
      });
      
      await provider.fetchLatestPrice('aapl');
      expect(mockGet).toHaveBeenCalledWith('/v8/finance/chart/AAPL', expect.anything());
    });

    it('应该移除空格', async () => {
      mockGet.mockResolvedValue({
        data: {
          chart: {
            result: [{
              meta: { regularMarketPrice: 100.0 },
            }],
          },
        },
      });
      
      await provider.fetchLatestPrice('A A P L');
      expect(mockGet).toHaveBeenCalledWith('/v8/finance/chart/AAPL', expect.anything());
    });

    it('应该拒绝无效的股票代码格式', async () => {
      await expect(provider.fetchLatestPrice('123456')).rejects.toThrow(
        'Invalid US stock symbol format'
      );
    });

    it('应该拒绝过长的股票代码', async () => {
      await expect(provider.fetchLatestPrice('TOOLONG')).rejects.toThrow(
        'Invalid US stock symbol format'
      );
    });
  });
});
