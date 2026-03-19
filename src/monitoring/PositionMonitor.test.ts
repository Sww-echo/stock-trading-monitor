import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PositionMonitor } from './PositionMonitor.js';
import { Position } from '../types/position.js';
import { SignalType, MAResult } from '../types/strategy.js';

describe('PositionMonitor', () => {
  let monitor: PositionMonitor;
  let testDataDir: string;

  beforeEach(async () => {
    // 使用临时测试目录
    testDataDir = join('.', `test-data-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    monitor = new PositionMonitor(testDataDir);
    await monitor.initialize();
  });

  afterEach(async () => {
    // 清理测试数据
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('addPosition', () => {
    it('should add a position to the monitor', () => {
      const position: Position = {
        id: 'pos_001',
        symbol: 'BTC/USDT',
        entryPrice: 42000,
        entryTime: Date.now(),
        quantity: 0.1,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 41000,
        takeProfit: [45000, 48000],
        status: 'open'
      };

      monitor.addPosition(position);
      
      const positions = monitor.getAllPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toEqual(position);
    });

    it('should persist position to file', async () => {
      const position: Position = {
        id: 'pos_002',
        symbol: 'ETH/USDT',
        entryPrice: 2200,
        entryTime: Date.now(),
        quantity: 1,
        strategyType: SignalType.BUY_PULLBACK,
        stopLoss: 2100,
        takeProfit: [2500],
        status: 'open'
      };

      monitor.addPosition(position);
      
      // 等待文件写入
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 创建新的monitor实例并加载
      const newMonitor = new PositionMonitor(testDataDir);
      await newMonitor.initialize();
      
      const positions = newMonitor.getAllPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].id).toBe('pos_002');
    });
  });

  describe('checkPosition', () => {
    it('should calculate PnL correctly for long position', () => {
      const position: Position = {
        id: 'pos_003',
        symbol: 'BTC/USDT',
        entryPrice: 40000,
        entryTime: Date.now(),
        quantity: 0.5,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 38000,
        takeProfit: [44000],
        status: 'open'
      };

      const currentPrice = 42000;
      const status = monitor.checkPosition(position, currentPrice);

      expect(status.currentPrice).toBe(42000);
      expect(status.pnl).toBe(1000); // (42000 - 40000) * 0.5
      expect(status.pnlPercent).toBe(5); // ((42000 - 40000) / 40000) * 100
      expect(status.shouldStopLoss).toBe(false);
      expect(status.shouldTakeProfit).toBe(false);
    });

    it('should calculate PnL correctly for short position', () => {
      const position: Position = {
        id: 'pos_004',
        symbol: 'BTC/USDT',
        entryPrice: 42000,
        entryTime: Date.now(),
        quantity: 0.5,
        strategyType: SignalType.SELL_BREAKOUT,
        stopLoss: 44000,
        takeProfit: [40000],
        status: 'open'
      };

      const currentPrice = 40000;
      const status = monitor.checkPosition(position, currentPrice);

      expect(status.currentPrice).toBe(40000);
      expect(status.pnl).toBe(1000); // (42000 - 40000) * 0.5
      expect(status.pnlPercent).toBeCloseTo(4.76, 1); // ((42000 - 40000) / 42000) * 100
      expect(status.shouldStopLoss).toBe(false);
      expect(status.shouldTakeProfit).toBe(true);
    });

    it('should detect stop loss trigger for long position', () => {
      const position: Position = {
        id: 'pos_005',
        symbol: 'BTC/USDT',
        entryPrice: 42000,
        entryTime: Date.now(),
        quantity: 0.1,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 41000,
        takeProfit: [45000],
        status: 'open'
      };

      const currentPrice = 40500;
      const status = monitor.checkPosition(position, currentPrice);

      expect(status.shouldStopLoss).toBe(true);
      expect(status.pnl).toBeLessThan(0);
    });

    it('should detect take profit trigger for long position', () => {
      const position: Position = {
        id: 'pos_006',
        symbol: 'BTC/USDT',
        entryPrice: 42000,
        entryTime: Date.now(),
        quantity: 0.1,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 41000,
        takeProfit: [45000, 48000],
        status: 'open'
      };

      const currentPrice = 45500;
      const status = monitor.checkPosition(position, currentPrice);

      expect(status.shouldTakeProfit).toBe(true);
      expect(status.pnl).toBeGreaterThan(0);
    });

    it('should detect trend reversal for long position', () => {
      const position: Position = {
        id: 'pos_007',
        symbol: 'BTC/USDT',
        entryPrice: 42000,
        entryTime: Date.now(),
        quantity: 0.1,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 41000,
        takeProfit: [45000],
        status: 'open'
      };

      const currentPrice = 41500;
      const maResult: MAResult = {
        ma20: 42000,
        ma60: 41000,
        ma120: 40000,
        ema20: 42100,
        ema60: 41100,
        ema120: 40100
      };

      const status = monitor.checkPosition(position, currentPrice, maResult);

      expect(status.trendReversed).toBe(true);
    });
  });

  describe('updatePositions', () => {
    it('should update all open positions', async () => {
      const position1: Position = {
        id: 'pos_008',
        symbol: 'BTC/USDT',
        entryPrice: 40000,
        entryTime: Date.now(),
        quantity: 0.1,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 38000,
        takeProfit: [44000],
        status: 'open'
      };

      const position2: Position = {
        id: 'pos_009',
        symbol: 'ETH/USDT',
        entryPrice: 2200,
        entryTime: Date.now(),
        quantity: 1,
        strategyType: SignalType.BUY_PULLBACK,
        stopLoss: 2100,
        takeProfit: [2500],
        status: 'open'
      };

      monitor.addPosition(position1);
      monitor.addPosition(position2);

      const priceGetter = async (symbol: string) => {
        if (symbol === 'BTC/USDT') return 42000;
        if (symbol === 'ETH/USDT') return 2300;
        throw new Error('Unknown symbol');
      };

      const statuses = await monitor.updatePositions(priceGetter);

      expect(statuses).toHaveLength(2);
      expect(statuses[0].currentPrice).toBe(42000);
      expect(statuses[1].currentPrice).toBe(2300);
    });
  });

  describe('closePosition', () => {
    it('should close a position and save to history', async () => {
      const position: Position = {
        id: 'pos_010',
        symbol: 'BTC/USDT',
        entryPrice: 40000,
        entryTime: Date.now(),
        quantity: 0.1,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 38000,
        takeProfit: [44000],
        status: 'open'
      };

      monitor.addPosition(position);
      expect(monitor.getPositionCount()).toBe(1);

      await monitor.closePosition('pos_010', 42000, 'Take profit');

      expect(monitor.getPositionCount()).toBe(0);
      
      // 验证历史文件
      const historyFile = join(testDataDir, 'history.json');
      const historyData = await fs.readFile(historyFile, 'utf-8');
      const history = JSON.parse(historyData);
      
      expect(history.positions).toHaveLength(1);
      expect(history.positions[0].id).toBe('pos_010');
      expect(history.positions[0].closePrice).toBe(42000);
      expect(history.positions[0].closeReason).toBe('Take profit');
    });

    it('should throw error when closing non-existent position', async () => {
      await expect(
        monitor.closePosition('non_existent', 42000, 'Test')
      ).rejects.toThrow('Position non_existent not found');
    });
  });

  describe('getAllPositions', () => {
    it('should return all open positions', () => {
      const position1: Position = {
        id: 'pos_011',
        symbol: 'BTC/USDT',
        entryPrice: 40000,
        entryTime: Date.now(),
        quantity: 0.1,
        strategyType: SignalType.BUY_BREAKOUT,
        stopLoss: 38000,
        takeProfit: [44000],
        status: 'open'
      };

      const position2: Position = {
        id: 'pos_012',
        symbol: 'ETH/USDT',
        entryPrice: 2200,
        entryTime: Date.now(),
        quantity: 1,
        strategyType: SignalType.BUY_PULLBACK,
        stopLoss: 2100,
        takeProfit: [2500],
        status: 'open'
      };

      monitor.addPosition(position1);
      monitor.addPosition(position2);

      const positions = monitor.getAllPositions();
      expect(positions).toHaveLength(2);
    });

    it('should return empty array when no positions', () => {
      const positions = monitor.getAllPositions();
      expect(positions).toHaveLength(0);
    });
  });
});
