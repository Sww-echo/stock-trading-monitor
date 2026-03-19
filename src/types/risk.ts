/**
 * 止盈模式枚举
 */
export enum TakeProfitMode {
  FIXED_RATIO = 'fixed_ratio',             // 固定盈亏比
  PREVIOUS_CONSOLIDATION = 'prev_consol',  // 前一密集区
  FIBONACCI = 'fibonacci'                  // 斐波那契扩展
}

/**
 * 风险计算结果
 */
export interface RiskCalculation {
  stopLoss: number;
  takeProfit: number[];
  positionSize: number;      // 建议开仓数量
  riskAmount: number;        // 风险金额
  rewardAmount: number;      // 预期收益
  riskRewardRatio: number;   // 盈亏比
  leverage: number;          // 实际杠杆
  warning?: string;          // 风险警告
}
