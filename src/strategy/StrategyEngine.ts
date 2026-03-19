import { DataManager } from '../data/DataManager.js';
import { MACalculator } from './MACalculator.js';
import { MarketStateDetector } from './MarketStateDetector.js';
import { KLineData } from '../types/market.js';
import { MAResult, MarketStateInfo, TradingSignal } from '../types/strategy.js';
import { BreakoutStrategy } from './BreakoutStrategy.js';
import { PullbackStrategy } from './PullbackStrategy.js';

/**
 * 策略执行引擎
 * 协调各个策略模块，分析标的并生成交易信号
 */
export class StrategyEngine {
  private breakoutStrategy: BreakoutStrategy;
  private pullbackStrategy: PullbackStrategy;

  constructor() {
    this.breakoutStrategy = new BreakoutStrategy();
    this.pullbackStrategy = new PullbackStrategy();
  }

  /**
   * 分析单个标的
   * @param symbol 标的符号
   * @param klines K线数据数组
   * @param maHistory 历史均线数据
   * @param stateInfo 市场状态信息
   * @returns 交易信号或null
   */
  async analyze(
    symbol: string,
    klines: KLineData[],
    maHistory: MAResult[],
    stateInfo: MarketStateInfo
  ): Promise<TradingSignal | null> {
    // 检测突破策略信号
    const breakoutSignal = this.breakoutStrategy.detectSignal(klines, maHistory, stateInfo);
    if (breakoutSignal) {
      breakoutSignal.symbol = symbol;
      return breakoutSignal;
    }

    // 检测回踩策略信号
    const pullbackSignal = this.pullbackStrategy.detectSignal(klines, maHistory, stateInfo);
    if (pullbackSignal) {
      pullbackSignal.symbol = symbol;
      return pullbackSignal;
    }

    return null;
  }

  /**
   * 批量扫描标的
   * @param symbols 标的符号数组
   * @param dataManager 数据管理器
   * @param interval 时间周期
   * @param consolidationThreshold 密集阈值
   * @returns 交易信号数组
   */
  async scanSymbols(
    symbols: string[],
    dataManager: DataManager,
    interval: string = '1h',
    consolidationThreshold: number = 0.02
  ): Promise<TradingSignal[]> {
    const calculator = new MACalculator();
    const stateDetector = new MarketStateDetector(consolidationThreshold);

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const klines = await dataManager.getKLines(symbol, interval, 120);
          if (klines.length < 120) {
            return null;
          }

          const maHistory = calculator.calculateHistory(klines);
          const latestMA = maHistory[maHistory.length - 1];
          const stateInfo = stateDetector.detectState(latestMA);
          return this.analyze(symbol, klines, maHistory, stateInfo);
        } catch {
          return null;
        }
      })
    );

    return results.filter((signal): signal is TradingSignal => signal !== null);
  }
}
