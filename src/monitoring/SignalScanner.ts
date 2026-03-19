import * as fs from 'fs/promises';
import * as path from 'path';
import { DataManager } from '../data/DataManager.js';
import { MACalculator } from '../strategy/MACalculator.js';
import { MarketStateDetector } from '../strategy/MarketStateDetector.js';
import { StrategyEngine } from '../strategy/StrategyEngine.js';
import { TradingSignal } from '../types/strategy.js';

/**
 * 信号扫描器
 * 负责定时扫描标的、生成交易信号并记录历史
 */
export class SignalScanner {
  private dataManager: DataManager;
  private strategyEngine: StrategyEngine;
  private maCalculator: MACalculator;
  private stateDetector: MarketStateDetector;
  private readonly signalsDir: string;
  private scanInterval?: NodeJS.Timeout;

  constructor(
    dataManager: DataManager,
    consolidationThreshold: number = 0.02,
    signalsDir: string = './data/signals'
  ) {
    this.dataManager = dataManager;
    this.strategyEngine = new StrategyEngine();
    this.maCalculator = new MACalculator();
    this.stateDetector = new MarketStateDetector(consolidationThreshold);
    this.signalsDir = signalsDir;
  }

  /**
   * 启动定时扫描
   * @param symbols 标的列表
   * @param interval 时间周期
   * @param updateIntervalSeconds 更新间隔（秒）
   */
  startScanning(symbols: string[], interval: string, updateIntervalSeconds: number): void {
    // 立即执行一次扫描
    this.scanAllSymbols(symbols, interval).catch(console.error);

    // 设置定时扫描
    this.scanInterval = setInterval(() => {
      this.scanAllSymbols(symbols, interval).catch(console.error);
    }, updateIntervalSeconds * 1000);
  }

  /**
   * 停止定时扫描
   */
  stopScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }
  }

  /**
   * 扫描所有标的
   * @param symbols 标的列表
   * @param interval 时间周期
   * @returns 交易信号数组
   */
  async scanAllSymbols(symbols: string[], interval: string): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];

    for (const symbol of symbols) {
      try {
        const signal = await this.scanSymbol(symbol, interval);
        if (signal) {
          signals.push(signal);
          // 保存信号到历史记录
          await this.saveSignal(signal);
        }
      } catch (error) {
        console.error(`Error scanning symbol ${symbol}:`, error);
        // 继续处理其他标的
      }
    }

    return signals;
  }

  /**
   * 扫描单个标的
   * @param symbol 标的符号
   * @param interval 时间周期
   * @returns 交易信号或null
   */
  async scanSymbol(symbol: string, interval: string): Promise<TradingSignal | null> {
    // 获取K线数据（至少120个周期用于计算MA120）
    const klines = await this.dataManager.getKLines(symbol, interval, 120);

    if (klines.length < 120) {
      console.warn(`Insufficient data for ${symbol}: ${klines.length} < 120`);
      return null;
    }

    // 计算历史均线
    const maHistory = this.maCalculator.calculateHistory(klines);

    // 获取最新的市场状态
    const latestMA = maHistory[maHistory.length - 1];
    const stateInfo = this.stateDetector.detectState(latestMA);

    // 使用策略引擎分析
    const signal = await this.strategyEngine.analyze(symbol, klines, maHistory, stateInfo);

    return signal;
  }

  /**
   * 保存信号到历史记录（按月存储）
   * @param signal 交易信号
   */
  async saveSignal(signal: TradingSignal): Promise<void> {
    // 确定月份文件名
    const date = new Date(signal.timestamp);
    const monthKey = `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}`;
    const fileName = `signals_${monthKey}.json`;
    const filePath = path.join(this.signalsDir, fileName);

    // 创建目录
    await fs.mkdir(this.signalsDir, { recursive: true });

    // 读取现有数据
    let fileData: { month: string; signals: TradingSignal[] };
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      fileData = JSON.parse(content);
    } catch {
      // 文件不存在，创建新的
      fileData = {
        month: monthKey.replace('_', '-'),
        signals: [],
      };
    }

    // 添加新信号
    fileData.signals.push(signal);

    // 写入文件
    await fs.writeFile(filePath, JSON.stringify(fileData, null, 2), 'utf-8');
  }

  /**
   * 获取信号历史
   * @param year 年份（可选）
   * @param month 月份（可选，1-12）
   * @returns 信号数组
   */
  async getSignalHistory(year?: number, month?: number): Promise<TradingSignal[]> {
    if (year && month) {
      // 读取指定月份的信号
      const monthKey = `${year}_${String(month).padStart(2, '0')}`;
      const fileName = `signals_${monthKey}.json`;
      const filePath = path.join(this.signalsDir, fileName);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const fileData = JSON.parse(content);
        return fileData.signals || [];
      } catch {
        return [];
      }
    }

    // 读取所有信号文件
    const allSignals: TradingSignal[] = [];
    try {
      const files = await fs.readdir(this.signalsDir);
      for (const file of files) {
        if (file.startsWith('signals_') && file.endsWith('.json')) {
          const filePath = path.join(this.signalsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const fileData = JSON.parse(content);
          allSignals.push(...(fileData.signals || []));
        }
      }
    } catch {
      // 目录不存在或为空
    }

    return allSignals;
  }
}
