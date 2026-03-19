/**
 * BreakoutStrategy 使用示例
 * 
 * 演示如何使用突破策略检测交易信号
 */

import { BreakoutStrategy } from './BreakoutStrategy.js';
import { MACalculator } from './MACalculator.js';
import { MarketStateDetector } from './MarketStateDetector.js';
import { KLineData } from '../types/market.js';
import { MarketState } from '../types/strategy.js';

// 创建策略实例
const strategy = new BreakoutStrategy();
const maCalculator = new MACalculator();
const stateDetector = new MarketStateDetector(0.02); // 2%密集阈值

// 示例1：向上突破后回踩 - 生成做多信号
console.log('=== 示例1：向上突破后回踩 ===');

// 生成足够的历史数据（120+周期）用于计算均线
const bullishKlines: KLineData[] = [
  // 前115根K线：价格在99-101之间震荡（密集区）
  ...Array.from({ length: 115 }, (_, i) => ({
    timestamp: (i + 1) * 3600000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  })),
  
  // 向上突破
  { timestamp: 116 * 3600000, open: 100, high: 105, low: 100, close: 104, volume: 1500 },
  { timestamp: 117 * 3600000, open: 104, high: 106, low: 103, close: 105, volume: 1400 },
  
  // 回踩但未跌破密集区上边界
  { timestamp: 118 * 3600000, open: 105, high: 105, low: 102, close: 103, volume: 1200 },
  { timestamp: 119 * 3600000, open: 103, high: 104, low: 101, close: 102, volume: 1100 },
  
  // 当前K线：收盘在密集区上方
  { timestamp: 120 * 3600000, open: 102, high: 103, low: 101, close: 102, volume: 1000 },
];

// 计算均线
const bullishMAHistory = maCalculator.calculateHistory(bullishKlines);
const bullishCurrentMA = bullishMAHistory[bullishMAHistory.length - 1];

// 检测市场状态
const bullishState = stateDetector.detectState(bullishCurrentMA);
console.log('市场状态:', bullishState.state);
console.log('是否密集:', bullishState.state === MarketState.CONSOLIDATION);

// 检测信号
const bullishSignal = strategy.detectSignal(bullishKlines, bullishMAHistory, bullishState);
if (bullishSignal) {
  console.log('✅ 检测到做多信号！');
  console.log('信号类型:', bullishSignal.type);
  console.log('触发价格:', bullishSignal.price);
  console.log('止损价:', bullishSignal.stopLoss);
  console.log('原因:', bullishSignal.reason);
  console.log('信号强度:', bullishSignal.confidence);
} else {
  console.log('❌ 未检测到信号');
}

console.log('\n=== 示例2：向下突破后反弹 ===');

const bearishKlines: KLineData[] = [
  // 前115根K线：价格在99-101之间震荡（密集区）
  ...Array.from({ length: 115 }, (_, i) => ({
    timestamp: (i + 1) * 3600000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  })),
  
  // 向下突破
  { timestamp: 116 * 3600000, open: 100, high: 100, low: 95, close: 96, volume: 1500 },
  { timestamp: 117 * 3600000, open: 96, high: 96, low: 94, close: 95, volume: 1400 },
  
  // 反弹但未突破密集区下边界
  { timestamp: 118 * 3600000, open: 95, high: 98, low: 95, close: 97, volume: 1200 },
  { timestamp: 119 * 3600000, open: 97, high: 99, low: 97, close: 98, volume: 1100 },
  
  // 当前K线：收盘在密集区下方
  { timestamp: 120 * 3600000, open: 98, high: 99, low: 97, close: 98, volume: 1000 },
];

// 计算均线
const bearishMAHistory = maCalculator.calculateHistory(bearishKlines);
const bearishCurrentMA = bearishMAHistory[bearishMAHistory.length - 1];

// 检测市场状态
const bearishState = stateDetector.detectState(bearishCurrentMA);
console.log('市场状态:', bearishState.state);

// 检测信号
const bearishSignal = strategy.detectSignal(bearishKlines, bearishMAHistory, bearishState);
if (bearishSignal) {
  console.log('✅ 检测到做空信号！');
  console.log('信号类型:', bearishSignal.type);
  console.log('触发价格:', bearishSignal.price);
  console.log('止损价:', bearishSignal.stopLoss);
  console.log('原因:', bearishSignal.reason);
  console.log('信号强度:', bearishSignal.confidence);
} else {
  console.log('❌ 未检测到信号');
}

console.log('\n=== 示例3：非密集状态 - 不生成信号 ===');

const expansionKlines: KLineData[] = [
  // 前110根K线：价格在99-101之间震荡
  ...Array.from({ length: 110 }, (_, i) => ({
    timestamp: (i + 1) * 3600000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  })),
  
  // 明显的上涨趋势，均线发散
  { timestamp: 111 * 3600000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { timestamp: 112 * 3600000, open: 101, high: 104, low: 100, close: 103, volume: 1000 },
  { timestamp: 113 * 3600000, open: 103, high: 106, low: 102, close: 105, volume: 1000 },
  { timestamp: 114 * 3600000, open: 105, high: 108, low: 104, close: 107, volume: 1000 },
  { timestamp: 115 * 3600000, open: 107, high: 110, low: 106, close: 109, volume: 1000 },
  { timestamp: 116 * 3600000, open: 109, high: 112, low: 108, close: 111, volume: 1000 },
  { timestamp: 117 * 3600000, open: 111, high: 114, low: 110, close: 113, volume: 1000 },
  { timestamp: 118 * 3600000, open: 113, high: 116, low: 112, close: 115, volume: 1000 },
  { timestamp: 119 * 3600000, open: 115, high: 118, low: 114, close: 117, volume: 1000 },
  { timestamp: 120 * 3600000, open: 117, high: 120, low: 116, close: 119, volume: 1000 },
];

// 计算均线
const expansionMAHistory = maCalculator.calculateHistory(expansionKlines);
const expansionCurrentMA = expansionMAHistory[expansionMAHistory.length - 1];

// 检测市场状态
const expansionState = stateDetector.detectState(expansionCurrentMA);
console.log('市场状态:', expansionState.state);
console.log('是否多头排列:', expansionState.isBullish);

// 检测信号
const expansionSignal = strategy.detectSignal(expansionKlines, expansionMAHistory, expansionState);
if (expansionSignal) {
  console.log('✅ 检测到信号');
} else {
  console.log('❌ 未检测到信号（策略A只在密集状态下工作）');
}

console.log('\n=== 使用建议 ===');
console.log('1. BreakoutStrategy（策略A）只在市场处于CONSOLIDATION状态时工作');
console.log('2. 需要配合MarketStateDetector使用，先判断市场状态');
console.log('3. 信号生成条件：');
console.log('   - 做多：价格向上突破密集区后回踩但未跌破，收盘价在密集区上方');
console.log('   - 做空：价格向下跌破密集区后反弹但未突破，收盘价在密集区下方');
console.log('4. 止损位自动设置在密集区的另一侧边界');
console.log('5. 止盈位需要由RiskCalculator根据配置计算');
