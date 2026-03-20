import { promises as fs } from 'fs';
import { join } from 'path';
import { Position, PositionStatus } from '../types/position.js';
import { MAResult, SignalType } from '../types/strategy.js';
import { PositionStorage } from './PositionStorage.js';

/**
 * 持仓监控器
 * 负责管理和监控用户持仓，跟踪盈亏状态
 */
export class PositionMonitor {
  private positions: Map<string, Position>;
  private storage: PositionStorage;
  private readonly dataDir: string;

  constructor(dataDir: string = './data/positions') {
    this.positions = new Map();
    this.storage = new PositionStorage(dataDir);
    this.dataDir = dataDir;
  }

  /**
   * 初始化 - 从文件加载持仓数据
   */
  async initialize(): Promise<void> {
    await this.loadPositions();
  }

  /**
   * 从文件加载持仓数据
   */
  private async loadPositions(): Promise<void> {
    const positions = await this.storage.loadOpenPositions();
    this.positions.clear();
    for (const pos of positions) {
      this.positions.set(pos.id, pos);
    }
  }

  /**
   * 保存持仓数据到文件
   */
  private async savePositions(): Promise<void> {
    const positions = Array.from(this.positions.values());
    await this.storage.saveOpenPositions(positions);
  }

  /**
   * 添加持仓
   */
  addPosition(position: Position): void {
    this.positions.set(position.id, position);
    this.savePositions().catch(err => {
      console.error('Failed to save positions:', err);
    });
  }

  /**
   * 更新所有持仓状态
   * @param priceGetter 获取当前价格的函数
   * @param maGetter 获取均线数据的函数（可选，用于趋势反转检测）
   */
  async updatePositions(
    priceGetter: (symbol: string) => Promise<number>,
    maGetter?: (symbol: string) => Promise<MAResult | null>
  ): Promise<PositionStatus[]> {
    const statuses: PositionStatus[] = [];
    
    for (const position of this.positions.values()) {
      if (position.status !== 'open') continue;
      
      try {
        const currentPrice = await priceGetter(position.symbol);
        const maResult = maGetter ? await maGetter(position.symbol) : null;
        
        const status = this.checkPosition(position, currentPrice, maResult);
        statuses.push(status);
      } catch (error) {
        console.error(`Failed to update position ${position.id}:`, error);
      }
    }
    
    return statuses;
  }

  /**
   * 检查单个持仓状态
   */
  checkPosition(
    position: Position,
    currentPrice: number,
    maResult: MAResult | null = null
  ): PositionStatus {
    // 计算盈亏
    const isLong = position.strategyType === SignalType.BUY_BREAKOUT ||
                   position.strategyType === SignalType.BUY_PULLBACK;

    const pnl = isLong
      ? (currentPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - currentPrice) * position.quantity;

    const pnlPercent = isLong
      ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

    // 检查止损
    const shouldStopLoss = isLong
      ? currentPrice <= position.stopLoss
      : currentPrice >= position.stopLoss;

    const triggeredTakeProfits = position.takeProfit.filter((tp) =>
      isLong ? currentPrice >= tp : currentPrice <= tp
    );
    const shouldTakeProfit = triggeredTakeProfits.length > 0;
    const nextTakeProfit = this.findNextTakeProfit(position, currentPrice, isLong);

    // 检查趋势反转
    let trendReversed = false;
    let adjustedStopLoss: number | undefined;
    if (maResult) {
      trendReversed = this.detectTrendReversal(position, currentPrice, maResult);
      adjustedStopLoss = this.calculateAdjustedStopLoss(position, currentPrice, maResult, isLong);
    }

    const recommendedAction = this.determineRecommendedAction({
      shouldStopLoss,
      shouldTakeProfit,
      trendReversed,
      triggeredTakeProfits,
    });

    return {
      position,
      currentPrice,
      pnl,
      pnlPercent,
      shouldStopLoss,
      shouldTakeProfit,
      trendReversed,
      triggeredTakeProfits,
      nextTakeProfit,
      adjustedStopLoss,
      recommendedAction,
    };
  }

  private findNextTakeProfit(position: Position, currentPrice: number, isLong: boolean): number | undefined {
    const remainingTargets = position.takeProfit.filter((tp) =>
      isLong ? tp > currentPrice : tp < currentPrice
    );

    if (remainingTargets.length === 0) {
      return undefined;
    }

    return isLong
      ? Math.min(...remainingTargets)
      : Math.max(...remainingTargets);
  }

  private calculateAdjustedStopLoss(
    position: Position,
    currentPrice: number,
    maResult: MAResult,
    isLong: boolean
  ): number | undefined {
    const baseStopLoss = position.stopLoss;
    const breakEven = position.entryPrice;
    const ma20 = maResult.ma20;

    if (isLong) {
      if (currentPrice <= position.entryPrice) {
        return undefined;
      }

      return Math.max(baseStopLoss, breakEven, ma20);
    }

    if (currentPrice >= position.entryPrice) {
      return undefined;
    }

    return Math.min(baseStopLoss, breakEven, ma20);
  }

  private determineRecommendedAction(input: {
    shouldStopLoss: boolean;
    shouldTakeProfit: boolean;
    trendReversed: boolean;
    triggeredTakeProfits: number[];
  }): 'hold' | 'reduce' | 'exit' {
    if (input.shouldStopLoss || input.trendReversed) {
      return 'exit';
    }

    if (input.triggeredTakeProfits.length > 1) {
      return 'exit';
    }

    if (input.shouldTakeProfit) {
      return 'reduce';
    }

    return 'hold';
  }

  /**
   * 检测趋势反转
   */
  private detectTrendReversal(
    position: Position,
    currentPrice: number,
    maResult: MAResult
  ): boolean {
    const isLong = position.strategyType === SignalType.BUY_BREAKOUT || 
                   position.strategyType === SignalType.BUY_PULLBACK;

    if (isLong) {
      // 做多持仓：价格跌破MA20视为趋势反转
      return currentPrice < maResult.ma20;
    } else {
      // 做空持仓：价格突破MA20视为趋势反转
      return currentPrice > maResult.ma20;
    }
  }

  /**
   * 关闭持仓
   */
  async closePosition(positionId: string, closePrice: number, reason: string): Promise<void> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    // 更新持仓状态
    position.status = 'closed';
    
    // 从当前持仓中移除
    this.positions.delete(positionId);
    
    // 保存到历史记录
    await this.saveToHistory(position, closePrice, reason);
    
    // 更新open.json
    await this.savePositions();
  }

  /**
   * 保存到历史记录
   */
  private async saveToHistory(position: Position, closePrice: number, reason: string): Promise<void> {
    const historyFile = join(this.dataDir, 'history.json');
    let history: any = { positions: [] };
    
    try {
      const data = await fs.readFile(historyFile, 'utf-8');
      history = JSON.parse(data);
    } catch (error) {
      // 文件不存在，使用空历史
    }

    const isLong = position.strategyType === SignalType.BUY_BREAKOUT || 
                   position.strategyType === SignalType.BUY_PULLBACK;
    
    const pnl = isLong 
      ? (closePrice - position.entryPrice) * position.quantity
      : (position.entryPrice - closePrice) * position.quantity;
    
    const pnlPercent = isLong
      ? ((closePrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - closePrice) / position.entryPrice) * 100;

    history.positions.push({
      ...position,
      closePrice,
      closeTime: Date.now(),
      closeReason: reason,
      pnl,
      pnlPercent
    });

    await fs.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf-8');
  }

  /**
   * 获取所有持仓
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * 获取单个持仓
   */
  getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  /**
   * 获取持仓数量
   */
  getPositionCount(): number {
    return this.positions.size;
  }
}
