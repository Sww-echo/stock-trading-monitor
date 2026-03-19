import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { TushareProvider } from './TushareProvider.js';
import { MarketType } from '../../types/market.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('TushareProvider', () => {
  let provider: TushareProvider;
  let mockCreate: any;
  let mockPost: any;
  const testApiToken = 'test_token_123456';

  beforeEach(() => {
    vi.useFakeTimers();
    mockPost = vi.fn();
    mockCreate = vi.fn().mockReturnValue({
      post: mockPost,
    });
    mockedAxios.create = mockCreate;
    
    provider = new TushareProvider(testApiToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('基本属性', () => {
    it('应该有正确的类型和名称', () => {
      expect(provider.type).toBe(MarketType.STOCK_CN);
      expect(provider.name).toBe('Tushare');
    });

    it('应该在没有API token时抛出错误', () => {
      expect(() => new TushareProvider('')).toThrow('Tushare API token is required');
    });
  });

  describe('isTradingTime', () => {
    it('应该在交易时间内返回 true（上午9:30-11:30）', () => {
      // 设置为周一上午10:00（北京时间）
      const monday10am = new Date('2024-01-08T02:00:00.000Z'); // UTC+8 = 10:00
      vi.setSystemTime(monday10am);
      
      expect(provider.isTradingTime()).toBe(true);
    });

    it('应该在交易时间内返回 true（下午13:00-15:00）', () => {
      // 设置为周一下午14:00（北京时间）
      const monday2pm = new Date('2024-01-08T06:00:00.000Z'); // UTC+8 = 14:00
      vi.setSystemTime(monday2pm);
      
      expect(provider.isTradingTime()).toBe(true);
    });

    it('应该在非交易时间返回 false（午休）', () => {
      // 设置为周一中午12:00（北京时间）
      const mondayNoon = new Date('2024-01-08T04:00:00.000Z'); // UTC+8 = 12:00
      vi.setSystemTime(mondayNoon);
      
      expect(provider.isTradingTime()).toBe(false);
    });

    it('应该在非交易时间返回 false（收盘后）', () => {
      // 设置为周一下午16:00（北京时间）
      const monday4pm = new Date('2024-01-08T08:00:00.000Z'); // UTC+8 = 16:00
      vi.setSystemTime(monday4pm);
      
      expect(provider.isTradingTime()).toBe(false);
    });

    it('应该在周末返回 false', () => {
      // 设置为周六上午10:00（北京时间）
      const saturday10am = new Date('2024-01-06T02:00:00.000Z'); // UTC+8 = 10:00
      vi.setSystemTime(saturday10am);
      
      expect(provider.isTradingTime()).toBe(false);
    });

    it('应该在周日返回 false', () => {
      // 设置为周日上午10:00（北京时间）
      const sunday10am = new Date('2024-01-07T02:00:00.000Z'); // UTC+8 = 10:00
      vi.setSystemTime(sunday10am);
      
      expect(provider.isTradingTime()).toBe(false);
    });
  });

  describe('fetchLatestPrice', () => {
    it('应该成功获取最新价格', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          code: 0,
          data: {
            fields: ['close'],
            items: [['100.50']],
          },
        },
      });

      const price = await provider.fetchLatestPrice('600519.SH');
      
      expect(price).toBe(100.50);
      expect(mockPost).toHaveBeenCalledWith('', expect.objectContaining({
        token: testApiToken,
        params: expect.objectContaining({
          ts_code: '600519.SH',
        }),
      }));
    });

    it('应该标准化A股标的符号', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          code: 0,
          data: {
            fields: ['close'],
            items: [['100.50']],
          },
        },
      });

      await provider.fetchLatestPrice('600519.sh');
      
      expect(mockPost).toHaveBeenCalledWith('', expect.objectContaining({
        params: expect.objectContaining({
          ts_code: '600519.SH',
        }),
      }));
    });

    it('应该拒绝无效的A股标的格式', async () => {
      await expect(provider.fetchLatestPrice('AAPL')).rejects.toThrow(
        'Invalid A-share symbol format'
      );
    });

    it('应该处理API错误', async () => {
      mockPost.mockResolvedValue({
        data: {
          code: -1,
          msg: 'Invalid token',
        },
      });

      const pricePromise = provider.fetchLatestPrice('600519.SH');
      const assertion = expect(pricePromise).rejects.toThrow('Tushare API error: Invalid token');
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe('fetchKLines', () => {
    it('应该成功获取K线数据（小时级）', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          code: 0,
          data: {
            fields: ['trade_time', 'open', 'high', 'low', 'close', 'vol'],
            items: [
              ['20240108 09:30:00', '100.0', '102.0', '99.0', '101.0', '1000000'],
              ['20240108 10:30:00', '101.0', '103.0', '100.5', '102.5', '1200000'],
            ],
          },
        },
      });

      const klines = await provider.fetchKLines('600519.SH', '1h', 2);
      
      expect(klines).toHaveLength(2);
      expect(klines[0]).toEqual({
        timestamp: expect.any(Number),
        open: 100.0,
        high: 102.0,
        low: 99.0,
        close: 101.0,
        volume: 1000000,
      });
      expect(mockPost).toHaveBeenCalledWith('', expect.objectContaining({
        api_name: 'stk_mins',
        token: testApiToken,
        params: expect.objectContaining({
          ts_code: '600519.SH',
          freq: '60min',
        }),
      }));
    });

    it('应该成功获取K线数据（日线）', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          code: 0,
          data: {
            fields: ['trade_time', 'open', 'high', 'low', 'close', 'vol'],
            items: [
              ['20240108', '100.0', '102.0', '99.0', '101.0', '1000000'],
            ],
          },
        },
      });

      const klines = await provider.fetchKLines('600519.SH', '1d', 1);
      
      expect(klines).toHaveLength(1);
      expect(klines[0].close).toBe(101.0);
      expect(mockPost).toHaveBeenCalledWith('', expect.objectContaining({
        api_name: 'daily',
        params: expect.objectContaining({
          freq: 'D',
        }),
      }));
    });

    it('应该支持不同的时间周期', async () => {
      mockPost.mockResolvedValue({
        data: {
          code: 0,
          data: {
            fields: ['trade_time', 'open', 'high', 'low', 'close', 'vol'],
            items: [],
          },
        },
      });

      await provider.fetchKLines('600519.SH', '4h', 10);
      expect(mockPost).toHaveBeenCalledWith('', expect.objectContaining({
        params: expect.objectContaining({
          freq: '240min',
        }),
      }));
    });

    it('应该拒绝不支持的时间周期', async () => {
      const promise = provider.fetchKLines('600519.SH', '7h', 10);
      const assertion = expect(promise).rejects.toThrow('Unsupported interval: 7h');

      // 快进所有定时器（重试逻辑）
      await vi.runAllTimersAsync();

      await assertion;
    });

    it('应该按时间升序排列K线数据', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          code: 0,
          data: {
            fields: ['trade_time', 'open', 'high', 'low', 'close', 'vol'],
            items: [
              ['20240108 10:30:00', '101.0', '103.0', '100.5', '102.5', '1200000'],
              ['20240108 09:30:00', '100.0', '102.0', '99.0', '101.0', '1000000'],
            ],
          },
        },
      });

      const klines = await provider.fetchKLines('600519.SH', '1h', 2);
      
      // 应该按时间升序排列
      expect(klines[0].open).toBe(100.0); // 09:30
      expect(klines[1].open).toBe(101.0); // 10:30
    });
  });

  describe('错误处理和重试', () => {
    it('应该在网络错误时重试3次', async () => {
      const networkError = new Error('Network error');
      (networkError as any).request = {};
      
      mockPost
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          data: {
            code: 0,
            data: {
              fields: ['close'],
              items: [['100.50']],
            },
          },
        });

      const pricePromise = provider.fetchLatestPrice('600519.SH');
      
      // 快进所有定时器
      await vi.runAllTimersAsync();
      
      const price = await pricePromise;
      expect(price).toBe(100.50);
      expect(mockPost).toHaveBeenCalledTimes(4);
    });

    it('应该在3次重试后抛出错误', async () => {
      const networkError = new Error('Network error');
      (networkError as any).request = {};
      
      mockPost.mockRejectedValue(networkError);

      const pricePromise = provider.fetchLatestPrice('600519.SH');
      const assertion = expect(pricePromise).rejects.toThrow(
        'Tushare API network error'
      );

      // 快进所有定时器
      await vi.runAllTimersAsync();

      await assertion;
      expect(mockPost).toHaveBeenCalledTimes(4); // 初始请求 + 3次重试
    });

    it('应该格式化API错误信息', async () => {
      const apiError = new Error('Request failed');
      (apiError as any).response = {
        status: 401,
        data: { msg: 'Invalid API token' },
      };
      
      mockPost.mockRejectedValue(apiError);

      const pricePromise = provider.fetchLatestPrice('600519.SH');
      const assertion = expect(pricePromise).rejects.toThrow(
        'Tushare API error (401): Invalid API token'
      );

      // 快进所有定时器
      await vi.runAllTimersAsync();

      await assertion;
    });
  });

  describe('符号标准化', () => {
    it('应该接受上海证券交易所标的（SH）', async () => {
      mockPost.mockResolvedValue({
        data: {
          code: 0,
          data: {
            fields: ['close'],
            items: [['100.50']],
          },
        },
      });
      
      await provider.fetchLatestPrice('600519.SH');
      expect(mockPost).toHaveBeenCalledWith('', expect.objectContaining({
        params: expect.objectContaining({
          ts_code: '600519.SH',
        }),
      }));
    });

    it('应该接受深圳证券交易所标的（SZ）', async () => {
      mockPost.mockResolvedValue({
        data: {
          code: 0,
          data: {
            fields: ['close'],
            items: [['100.50']],
          },
        },
      });
      
      await provider.fetchLatestPrice('000001.SZ');
      expect(mockPost).toHaveBeenCalledWith('', expect.objectContaining({
        params: expect.objectContaining({
          ts_code: '000001.SZ',
        }),
      }));
    });

    it('应该转换为大写', async () => {
      mockPost.mockResolvedValue({
        data: {
          code: 0,
          data: {
            fields: ['close'],
            items: [['100.50']],
          },
        },
      });
      
      await provider.fetchLatestPrice('600519.sh');
      expect(mockPost).toHaveBeenCalledWith('', expect.objectContaining({
        params: expect.objectContaining({
          ts_code: '600519.SH',
        }),
      }));
    });

    it('应该拒绝无效格式', async () => {
      await expect(provider.fetchLatestPrice('AAPL')).rejects.toThrow(
        'Invalid A-share symbol format'
      );
      await expect(provider.fetchLatestPrice('60051.SH')).rejects.toThrow(
        'Invalid A-share symbol format'
      );
      await expect(provider.fetchLatestPrice('600519')).rejects.toThrow(
        'Invalid A-share symbol format'
      );
    });
  });
});
