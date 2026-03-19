import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SignalScanner } from './SignalScanner.js';
import { DataManager } from '../data/DataManager.js';
import { SignalType } from '../types/strategy.js';

describe('SignalScanner', () => {
  let scanner: SignalScanner;
  let dataManager: DataManager;
  const testDataDir = `./test-data-${Date.now()}`;
  const signalsDir = path.join(testDataDir, 'signals');

  beforeEach(() => {
    dataManager = new DataManager(path.join(testDataDir, 'klines'));
    scanner = new SignalScanner(dataManager, 0.02, signalsDir);
  });

  afterEach(async () => {
    scanner.stopScanning();
    // Clean up test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('saveSignal', () => {
    it('should save signal to monthly JSON file', async () => {
      const signal = {
        type: SignalType.BUY_BREAKOUT,
        symbol: 'BTC/USDT',
        timestamp: new Date('2024-01-15').getTime(),
        price: 42000,
        stopLoss: 41000,
        takeProfit: [45000, 48000],
        reason: 'Test signal',
        confidence: 0.85,
      };

      await scanner.saveSignal(signal);

      // Verify file was created
      const fileName = 'signals_2024_01.json';
      const filePath = path.join(signalsDir, fileName);
      const content = await fs.readFile(filePath, 'utf-8');
      const fileData = JSON.parse(content);

      expect(fileData.month).toBe('2024-01');
      expect(fileData.signals).toHaveLength(1);
      expect(fileData.signals[0]).toMatchObject(signal);
    });

    it('should append signals to existing monthly file', async () => {
      const signal1 = {
        type: SignalType.BUY_BREAKOUT,
        symbol: 'BTC/USDT',
        timestamp: new Date('2024-01-15').getTime(),
        price: 42000,
        stopLoss: 41000,
        takeProfit: [45000],
        reason: 'First signal',
        confidence: 0.85,
      };

      const signal2 = {
        type: SignalType.BUY_PULLBACK,
        symbol: 'ETH/USDT',
        timestamp: new Date('2024-01-20').getTime(),
        price: 2500,
        stopLoss: 2400,
        takeProfit: [2700],
        reason: 'Second signal',
        confidence: 0.75,
      };

      await scanner.saveSignal(signal1);
      await scanner.saveSignal(signal2);

      // Verify both signals are in the file
      const fileName = 'signals_2024_01.json';
      const filePath = path.join(signalsDir, fileName);
      const content = await fs.readFile(filePath, 'utf-8');
      const fileData = JSON.parse(content);

      expect(fileData.signals).toHaveLength(2);
      expect(fileData.signals[0]).toMatchObject(signal1);
      expect(fileData.signals[1]).toMatchObject(signal2);
    });
  });

  describe('getSignalHistory', () => {
    it('should return empty array when no signals exist', async () => {
      const signals = await scanner.getSignalHistory();
      expect(signals).toEqual([]);
    });

    it('should retrieve signals for specific month', async () => {
      const signal = {
        type: SignalType.BUY_BREAKOUT,
        symbol: 'BTC/USDT',
        timestamp: new Date('2024-01-15').getTime(),
        price: 42000,
        stopLoss: 41000,
        takeProfit: [45000],
        reason: 'Test signal',
        confidence: 0.85,
      };

      await scanner.saveSignal(signal);

      const signals = await scanner.getSignalHistory(2024, 1);
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject(signal);
    });

    it('should return empty array for non-existent month', async () => {
      const signals = await scanner.getSignalHistory(2024, 12);
      expect(signals).toEqual([]);
    });

    it('should retrieve all signals when no month specified', async () => {
      const signal1 = {
        type: SignalType.BUY_BREAKOUT,
        symbol: 'BTC/USDT',
        timestamp: new Date('2024-01-15').getTime(),
        price: 42000,
        stopLoss: 41000,
        takeProfit: [45000],
        reason: 'January signal',
        confidence: 0.85,
      };

      const signal2 = {
        type: SignalType.BUY_PULLBACK,
        symbol: 'ETH/USDT',
        timestamp: new Date('2024-02-15').getTime(),
        price: 2500,
        stopLoss: 2400,
        takeProfit: [2700],
        reason: 'February signal',
        confidence: 0.75,
      };

      await scanner.saveSignal(signal1);
      await scanner.saveSignal(signal2);

      const signals = await scanner.getSignalHistory();
      expect(signals).toHaveLength(2);
    });
  });

  describe('startScanning and stopScanning', () => {
    it('should start and stop scanning without errors', () => {
      expect(() => {
        scanner.startScanning(['BTC/USDT'], '1h', 60);
        scanner.stopScanning();
      }).not.toThrow();
    });

    it('should handle stopScanning when not started', () => {
      expect(() => {
        scanner.stopScanning();
      }).not.toThrow();
    });
  });

  describe('scanAllSymbols', () => {
    it('should handle errors for individual symbols gracefully', async () => {
      // Mock dataManager to throw error for one symbol
      vi.spyOn(dataManager, 'getKLines').mockImplementation(async (symbol: string) => {
        if (symbol === 'INVALID') {
          throw new Error('Invalid symbol');
        }
        // Return insufficient data for other symbols
        return [];
      });

      const signals = await scanner.scanAllSymbols(['BTC/USDT', 'INVALID', 'ETH/USDT'], '1h');
      
      // Should return empty array but not throw
      expect(signals).toEqual([]);
    });
  });
});
