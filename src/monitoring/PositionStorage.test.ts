import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PositionStorage } from './PositionStorage.js';
import { Position } from '../types/position.js';
import { SignalType } from '../types/strategy.js';

describe('PositionStorage', () => {
  const testDataDir = `./test-data-${Date.now()}`;
  let storage: PositionStorage;
  
  beforeEach(async () => {
    storage = new PositionStorage(testDataDir);
  });
  
  afterEach(async () => {
    // 清理测试数据
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });
  
  const createTestPosition = (id: string, symbol: string): Position => ({
    id,
    symbol,
    entryPrice: 42000,
    entryTime: Date.now(),
    quantity: 0.1,
    strategyType: SignalType.BUY_BREAKOUT,
    stopLoss: 41000,
    takeProfit: [45000, 48000],
    status: 'open',
  });
  
  describe('loadOpenPositions', () => {
    it('should return empty array when file does not exist', async () => {
      const positions = await storage.loadOpenPositions();
      expect(positions).toEqual([]);
    });
    
    it('should load positions from file', async () => {
      const testPosition = createTestPosition('pos1', 'BTC/USDT');
      await storage.saveOpenPositions([testPosition]);
      
      const positions = await storage.loadOpenPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].id).toBe('pos1');
      expect(positions[0].symbol).toBe('BTC/USDT');
    });
  });
  
  describe('saveOpenPositions', () => {
    it('should create directory if not exists', async () => {
      const testPosition = createTestPosition('pos1', 'BTC/USDT');
      await storage.saveOpenPositions([testPosition]);
      
      const dirExists = await fs.access(testDataDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });
    
    it('should save positions to file', async () => {
      const testPosition = createTestPosition('pos1', 'BTC/USDT');
      await storage.saveOpenPositions([testPosition]);
      
      const filePath = path.join(testDataDir, 'open.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      expect(data.positions).toHaveLength(1);
      expect(data.positions[0].id).toBe('pos1');
    });
  });
  
  describe('addOpenPosition', () => {
    it('should add position to empty list', async () => {
      const testPosition = createTestPosition('pos1', 'BTC/USDT');
      await storage.addOpenPosition(testPosition);
      
      const positions = await storage.loadOpenPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].id).toBe('pos1');
    });
    
    it('should append position to existing list', async () => {
      const pos1 = createTestPosition('pos1', 'BTC/USDT');
      const pos2 = createTestPosition('pos2', 'ETH/USDT');
      
      await storage.addOpenPosition(pos1);
      await storage.addOpenPosition(pos2);
      
      const positions = await storage.loadOpenPositions();
      expect(positions).toHaveLength(2);
      expect(positions[0].id).toBe('pos1');
      expect(positions[1].id).toBe('pos2');
    });
  });
  
  describe('closePosition', () => {
    it('should move position from open to history', async () => {
      const testPosition = createTestPosition('pos1', 'BTC/USDT');
      await storage.addOpenPosition(testPosition);
      
      await storage.closePosition('pos1');
      
      const openPositions = await storage.loadOpenPositions();
      expect(openPositions).toHaveLength(0);
      
      const historyPositions = await storage.loadHistoryPositions();
      expect(historyPositions).toHaveLength(1);
      expect(historyPositions[0].id).toBe('pos1');
      expect(historyPositions[0].status).toBe('closed');
    });
    
    it('should throw error if position not found', async () => {
      await expect(storage.closePosition('nonexistent')).rejects.toThrow('Position not found');
    });
  });
  
  describe('updatePosition', () => {
    it('should update position fields', async () => {
      const testPosition = createTestPosition('pos1', 'BTC/USDT');
      await storage.addOpenPosition(testPosition);
      
      await storage.updatePosition('pos1', { stopLoss: 40000 });
      
      const positions = await storage.loadOpenPositions();
      expect(positions[0].stopLoss).toBe(40000);
    });
    
    it('should throw error if position not found', async () => {
      await expect(storage.updatePosition('nonexistent', { stopLoss: 40000 }))
        .rejects.toThrow('Position not found');
    });
  });
  
  describe('findPositionById', () => {
    it('should find position by id', async () => {
      const testPosition = createTestPosition('pos1', 'BTC/USDT');
      await storage.addOpenPosition(testPosition);
      
      const found = await storage.findPositionById('pos1');
      expect(found).toBeDefined();
      expect(found?.id).toBe('pos1');
    });
    
    it('should return undefined if not found', async () => {
      const found = await storage.findPositionById('nonexistent');
      expect(found).toBeUndefined();
    });
  });
  
  describe('findPositionsBySymbol', () => {
    it('should find all positions for a symbol', async () => {
      const pos1 = createTestPosition('pos1', 'BTC/USDT');
      const pos2 = createTestPosition('pos2', 'BTC/USDT');
      const pos3 = createTestPosition('pos3', 'ETH/USDT');
      
      await storage.addOpenPosition(pos1);
      await storage.addOpenPosition(pos2);
      await storage.addOpenPosition(pos3);
      
      const btcPositions = await storage.findPositionsBySymbol('BTC/USDT');
      expect(btcPositions).toHaveLength(2);
      expect(btcPositions.every(p => p.symbol === 'BTC/USDT')).toBe(true);
    });
    
    it('should return empty array if no positions found', async () => {
      const positions = await storage.findPositionsBySymbol('BTC/USDT');
      expect(positions).toEqual([]);
    });
  });
  
  describe('loadHistoryPositions', () => {
    it('should return empty array when file does not exist', async () => {
      const positions = await storage.loadHistoryPositions();
      expect(positions).toEqual([]);
    });
    
    it('should load history positions from file', async () => {
      const testPosition = createTestPosition('pos1', 'BTC/USDT');
      testPosition.status = 'closed';
      await storage.saveHistoryPositions([testPosition]);
      
      const positions = await storage.loadHistoryPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].status).toBe('closed');
    });
  });
});
