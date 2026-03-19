import { MACalculator } from './MACalculator.js';
import { KLineData } from '../types/market.js';

/**
 * MACalculator 使用示例
 */

const calculator = new MACalculator();

// 示例1: 计算简单移动平均线 (SMA)
console.log('=== 示例1: 计算SMA ===');
const prices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109];
const sma5 = calculator.calculateSMA(prices, 5);
console.log(`最近5个周期的SMA: ${sma5.toFixed(2)}`);

// 示例2: 计算指数移动平均线 (EMA)
console.log('\n=== 示例2: 计算EMA ===');
const ema5 = calculator.calculateEMA(prices, 5);
console.log(`最近5个周期的EMA: ${ema5.toFixed(2)}`);
console.log(`注意: EMA (${ema5.toFixed(2)}) 对最近价格更敏感`);

// 示例3: 计算所有6条均线
console.log('\n=== 示例3: 计算所有6条均线 ===');
const klines: KLineData[] = [];
for (let i = 0; i < 120; i++) {
  klines.push({
    timestamp: Date.now() - (120 - i) * 3600000, // 从120小时前开始
    open: 100 + Math.sin(i / 10) * 10,
    high: 105 + Math.sin(i / 10) * 10,
    low: 95 + Math.sin(i / 10) * 10,
    close: 100 + Math.sin(i / 10) * 10 + i * 0.1, // 带有上升趋势的波动
    volume: 1000 + Math.random() * 500,
  });
}

const maResult = calculator.calculateAll(klines);
console.log('当前均线值:');
console.log(`  MA20:  ${maResult.ma20.toFixed(4)}`);
console.log(`  MA60:  ${maResult.ma60.toFixed(4)}`);
console.log(`  MA120: ${maResult.ma120.toFixed(4)}`);
console.log(`  EMA20:  ${maResult.ema20.toFixed(4)}`);
console.log(`  EMA60:  ${maResult.ema60.toFixed(4)}`);
console.log(`  EMA120: ${maResult.ema120.toFixed(4)}`);

// 示例4: 批量计算历史均线
console.log('\n=== 示例4: 批量计算历史均线 ===');
const history = calculator.calculateHistory(klines);
console.log(`计算了 ${history.length} 个历史点的均线值`);
console.log(`第20个K线的MA20: ${history[19].ma20.toFixed(4)}`);
console.log(`第60个K线的MA60: ${history[59].ma60.toFixed(4)}`);
console.log(`第120个K线的MA120: ${history[119].ma120.toFixed(4)}`);

// 示例5: 检测多头排列
console.log('\n=== 示例5: 检测多头排列 ===');
const isBullish = 
  maResult.ma20 > maResult.ma60 && 
  maResult.ma60 > maResult.ma120 &&
  maResult.ema20 > maResult.ema60 && 
  maResult.ema60 > maResult.ema120;
console.log(`是否多头排列: ${isBullish ? '是' : '否'}`);

// 示例6: 计算均线标准差（用于判断密集/发散）
console.log('\n=== 示例6: 计算均线标准差 ===');
const maValues = [
  maResult.ma20,
  maResult.ma60,
  maResult.ma120,
  maResult.ema20,
  maResult.ema60,
  maResult.ema120,
];
const mean = maValues.reduce((sum, val) => sum + val, 0) / maValues.length;
const variance = maValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / maValues.length;
const stdDev = Math.sqrt(variance);
console.log(`均线标准差: ${stdDev.toFixed(4)}`);
console.log(`标准差越小，均线越密集`);
