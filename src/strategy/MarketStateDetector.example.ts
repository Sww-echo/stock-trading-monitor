import { MarketStateDetector } from './MarketStateDetector.js';
import { MAResult } from '../types/strategy.js';

/**
 * 示例：使用 MarketStateDetector 识别市场状态
 */

// 创建检测器实例，使用默认阈值 0.02 (2%)
const detector = new MarketStateDetector(0.02);

// 示例1：密集状态（Consolidation）
console.log('=== 示例1：密集状态 ===');
const consolidationMA: MAResult = {
  ma20: 42000,
  ma60: 42100,
  ma120: 42050,
  ema20: 42020,
  ema60: 42080,
  ema120: 42030,
};

const consolidationState = detector.detectState(consolidationMA);
console.log('市场状态:', consolidationState.state); // CONSOLIDATION
console.log('标准差:', consolidationState.stdDev.toFixed(2));
console.log('极差:', consolidationState.range.toFixed(2));
console.log('多头排列:', consolidationState.isBullish);
console.log('空头排列:', consolidationState.isBearish);

// 示例2：多头发散状态（Expansion Bull）
console.log('\n=== 示例2：多头发散状态 ===');
const bullishMA: MAResult = {
  ma20: 45000,
  ma60: 43000,
  ma120: 41000,
  ema20: 45500,
  ema60: 43500,
  ema120: 41500,
};

const bullishState = detector.detectState(bullishMA);
console.log('市场状态:', bullishState.state); // EXPANSION_BULL
console.log('标准差:', bullishState.stdDev.toFixed(2));
console.log('极差:', bullishState.range.toFixed(2));
console.log('多头排列:', bullishState.isBullish); // true
console.log('空头排列:', bullishState.isBearish); // false

// 示例3：空头发散状态（Expansion Bear）
console.log('\n=== 示例3：空头发散状态 ===');
const bearishMA: MAResult = {
  ma20: 38000,
  ma60: 40000,
  ma120: 42000,
  ema20: 37500,
  ema60: 39500,
  ema120: 41500,
};

const bearishState = detector.detectState(bearishMA);
console.log('市场状态:', bearishState.state); // EXPANSION_BEAR
console.log('标准差:', bearishState.stdDev.toFixed(2));
console.log('极差:', bearishState.range.toFixed(2));
console.log('多头排列:', bearishState.isBullish); // false
console.log('空头排列:', bearishState.isBearish); // true

// 示例4：使用自定义阈值
console.log('\n=== 示例4：自定义阈值 ===');
const strictDetector = new MarketStateDetector(0.01); // 更严格的阈值 (1%)
const lenientDetector = new MarketStateDetector(0.05); // 更宽松的阈值 (5%)

const testMA: MAResult = {
  ma20: 42500,
  ma60: 42000,
  ma120: 41500,
  ema20: 42600,
  ema60: 42100,
  ema120: 41600,
};

console.log('严格阈值 (1%):', strictDetector.detectState(testMA).state);
console.log('默认阈值 (2%):', detector.detectState(testMA).state);
console.log('宽松阈值 (5%):', lenientDetector.detectState(testMA).state);

// 示例5：计算标准差
console.log('\n=== 示例5：计算标准差 ===');
const prices = [42000, 42100, 42050, 42020, 42080, 42030];
const stdDev = detector.calculateStdDev(prices);
console.log('价格数组:', prices);
console.log('标准差:', stdDev.toFixed(2));

// 示例6：检查排列方式
console.log('\n=== 示例6：检查排列方式 ===');
const mixedMA: MAResult = {
  ma20: 42000,
  ma60: 41000,
  ma120: 40000,
  ema20: 41500,
  ema60: 42500,
  ema120: 43000,
};

console.log('MA排列: MA20 > MA60 > MA120 (多头)');
console.log('EMA排列: EMA20 < EMA60 < EMA120 (空头)');
console.log('是否多头排列:', detector.isBullishAlignment(mixedMA)); // false
console.log('是否空头排列:', detector.isBearishAlignment(mixedMA)); // false
console.log('市场状态:', detector.detectState(mixedMA).state); // UNKNOWN

// 示例7：处理不完整数据
console.log('\n=== 示例7：处理不完整数据 ===');
const incompleteMA: MAResult = {
  ma20: 42000,
  ma60: NaN, // 数据不足
  ma120: NaN,
  ema20: 42020,
  ema60: NaN,
  ema120: NaN,
};

const incompleteState = detector.detectState(incompleteMA);
console.log('市场状态:', incompleteState.state); // UNKNOWN
console.log('标准差:', incompleteState.stdDev); // NaN
console.log('极差:', incompleteState.range); // NaN
