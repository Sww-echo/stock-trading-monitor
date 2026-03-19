import { TradingSignal, SignalType } from '../types/strategy.js';
import { TakeProfitMode, RiskCalculation } from '../types/risk.js';

/**
 * 风险计算器
 * 负责计算止损止盈位和建议仓位
 */
export class RiskCalculator {
  private maxRiskPerTrade: number;  // 单笔最大亏损
  private accountBalance: number;    // 账户余额

  constructor(maxRiskPerTrade: number, accountBalance: number) {
    this.maxRiskPerTrade = maxRiskPerTrade;
    this.accountBalance = accountBalance;
  }

  /**
   * 计算风险参数
   */
  calculate(
    signal: TradingSignal,
    mode: TakeProfitMode,
    ratio?: number
  ): RiskCalculation {
    const stopLoss = this.calculateStopLoss(signal);
    const takeProfit = this.calculateTakeProfit(signal, mode, ratio);
    const positionSize = this.calculatePositionSize(signal.price, stopLoss);
    
    const riskAmount = Math.abs(signal.price - stopLoss) * positionSize;
    const rewardAmount = Math.abs(takeProfit[0] - signal.price) * positionSize;
    const riskRewardRatio = rewardAmount / riskAmount;
    
    const positionValue = signal.price * positionSize;
    const leverage = this.calculateLeverage(positionValue);
    
    let warning: string | undefined;
    if (leverage > 3) {
      warning = `高风险警告：实际杠杆 ${leverage.toFixed(2)}x 超过 3 倍`;
    }

    return {
      stopLoss,
      takeProfit,
      positionSize,
      riskAmount,
      rewardAmount,
      riskRewardRatio,
      leverage,
      warning
    };
  }

  /**
   * 计算止损位
   */
  calculateStopLoss(signal: TradingSignal): number {
    // 信号中已经包含了止损价
    return signal.stopLoss;
  }

  /**
   * 计算止盈位（支持3种模式）
   */
  calculateTakeProfit(
    signal: TradingSignal,
    mode: TakeProfitMode,
    ratio?: number
  ): number[] {
    const { price, stopLoss, type } = signal;
    const riskDistance = Math.abs(price - stopLoss);
    const isLong = type === SignalType.BUY_BREAKOUT || type === SignalType.BUY_PULLBACK;

    switch (mode) {
      case TakeProfitMode.FIXED_RATIO: {
        // 固定盈亏比模式（默认1:3）
        const targetRatio = ratio || 3;
        const rewardDistance = riskDistance * targetRatio;
        const tp = isLong ? price + rewardDistance : price - rewardDistance;
        return [tp];
      }

      case TakeProfitMode.PREVIOUS_CONSOLIDATION: {
        // 前一密集区模式 - 简化实现，使用2倍风险距离作为目标
        const rewardDistance = riskDistance * 2;
        const tp = isLong ? price + rewardDistance : price - rewardDistance;
        return [tp];
      }

      case TakeProfitMode.FIBONACCI: {
        // 斐波那契扩展模式（1.618, 2.618, 3.618, 4.236）
        const fibLevels = [1.618, 2.618, 3.618, 4.236];
        return fibLevels.map(level => {
          const rewardDistance = riskDistance * level;
          return isLong ? price + rewardDistance : price - rewardDistance;
        });
      }

      default:
        throw new Error(`不支持的止盈模式: ${mode}`);
    }
  }

  /**
   * 计算仓位大小
   * 公式：最大亏损金额 / |开仓价格 - 止损价格|
   */
  calculatePositionSize(entryPrice: number, stopLoss: number): number {
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    if (riskPerUnit === 0) {
      throw new Error('止损价格不能等于开仓价格');
    }
    return this.maxRiskPerTrade / riskPerUnit;
  }

  /**
   * 计算实际杠杆
   */
  calculateLeverage(positionValue: number): number {
    if (this.accountBalance === 0) {
      throw new Error('账户余额不能为0');
    }
    return positionValue / this.accountBalance;
  }
}
