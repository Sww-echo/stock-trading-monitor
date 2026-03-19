# Strategy Module

策略模块负责计算技术指标和识别交易信号。

## MACalculator - 移动平均线计算器

`MACalculator` 类负责计算简单移动平均线(SMA)和指数移动平均线(EMA)。

### 功能

- **calculateSMA**: 计算简单移动平均线
- **calculateEMA**: 计算指数移动平均线
- **calculateAll**: 一次性计算所有6条均线（MA20/60/120, EMA20/60/120）
- **calculateHistory**: 批量计算历史K线的均线值

### 使用示例

```typescript
import { MACalculator } from './MACalculator.js';
import { KLineData } from '../types/market.js';

const calculator = new MACalculator();

// 准备K线数据
const klines: KLineData[] = [...]; // 至少120个数据点

// 计算当前所有均线
const maResult = calculator.calculateAll(klines);
console.log(maResult);
// {
//   ma20: 42150.5,
//   ma60: 41800.2,
//   ma120: 41200.8,
//   ema20: 42300.1,
//   ema60: 42000.5,
//   ema120: 41500.3
// }

// 计算历史均线值
const history = calculator.calculateHistory(klines);
// 返回数组，每个元素对应一个K线位置的均线值
```

### 技术说明

#### SMA (Simple Moving Average)
简单移动平均线是最近N个周期收盘价的算术平均值：

```
SMA = (P1 + P2 + ... + Pn) / n
```

#### EMA (Exponential Moving Average)
指数移动平均线对最近的价格赋予更高的权重：

```
EMA = (Price - PreviousEMA) × Multiplier + PreviousEMA
Multiplier = 2 / (Period + 1)
```

初始EMA值使用前N个周期的SMA。

### 数据要求

- **MA20/EMA20**: 至少需要20个数据点
- **MA60/EMA60**: 至少需要60个数据点
- **MA120/EMA120**: 至少需要120个数据点

如果数据不足，对应的均线值将返回 `NaN`。

### 性能考虑

- `calculateAll`: O(n)，其中n是K线数据长度
- `calculateHistory`: O(n²)，适合一次性计算历史数据
- 建议缓存计算结果，只在新K线到达时增量更新

### 测试

运行单元测试：

```bash
npm run test -- MACalculator.test.ts
```

查看使用示例：

```bash
npx tsx src/strategy/MACalculator.example.ts
```

### 相关需求

- 需求 2.1: 基于收盘价计算MA20、MA60、MA120
- 需求 2.2: 基于收盘价计算EMA20、EMA60、EMA120
- 需求 2.3: 新K线数据到达时在1秒内更新所有均线
- 需求 2.5: 计算结果保留至少4位小数精度

---

## MarketStateDetector - 市场状态检测器

`MarketStateDetector` 类负责识别市场状态（密集/发散）和判断多空排列。

### 功能

- **detectState**: 检测当前市场状态
- **calculateStdDev**: 计算6条均线的标准差
- **isBullishAlignment**: 检查是否多头排列
- **isBearishAlignment**: 检查是否空头排列

### 市场状态类型

- **CONSOLIDATION**: 均线密集状态（6条均线缠绕在一起）
- **EXPANSION_BULL**: 多头发散状态（均线呈多头排列且发散）
- **EXPANSION_BEAR**: 空头发散状态（均线呈空头排列且发散）
- **UNKNOWN**: 未知状态（数据不足或不符合上述条件）

### 使用示例

```typescript
import { MarketStateDetector } from './MarketStateDetector.js';
import { MACalculator } from './MACalculator.js';

const detector = new MarketStateDetector(0.02); // 2%密集阈值
const calculator = new MACalculator();

const klines = [...]; // K线数据
const maResult = calculator.calculateAll(klines);
const stateInfo = detector.detectState(maResult);

console.log('市场状态:', stateInfo.state);
console.log('标准差:', stateInfo.stdDev);
console.log('是否多头排列:', stateInfo.isBullish);
```

### 相关需求

- 需求 3.1: 计算6条均线的标准差
- 需求 3.2: 标准差低于阈值时标记为密集状态
- 需求 3.3: 标准差高于阈值且有序排列时标记为发散状态
- 需求 3.4: 识别多头排列
- 需求 3.5: 识别空头排列

---

## BreakoutStrategy - 突破策略（策略A）

`BreakoutStrategy` 类实现均线密集突破开仓法，用于捕捉趋势启动点。

### 策略逻辑

策略A只在市场处于**CONSOLIDATION（密集）**状态时工作：

1. **向上突破做多**：
   - 价格向上突破密集区上边界
   - 突破后价格回踩但未跌破密集区上边界
   - 当前收盘价位于密集区上方
   - 止损位设在密集区下边界

2. **向下突破做空**：
   - 价格向下跌破密集区下边界
   - 突破后价格反弹但未突破密集区下边界
   - 当前收盘价位于密集区下方
   - 止损位设在密集区上边界

### 密集区定义

密集区边界由6条均线的最大值和最小值确定：
- **上边界**: max(MA20, MA60, MA120, EMA20, EMA60, EMA120)
- **下边界**: min(MA20, MA60, MA120, EMA20, EMA60, EMA120)

### 功能

- **detectSignal**: 检测突破信号（主入口）
- **isInConsolidation**: 检查是否处于密集状态
- **detectBullishBreakout**: 检测向上突破后回踩
- **detectBearishBreakout**: 检测向下突破后反弹
- **calculateConsolidationBounds**: 计算密集区边界

### 使用示例

```typescript
import { BreakoutStrategy } from './BreakoutStrategy.js';
import { MACalculator } from './MACalculator.js';
import { MarketStateDetector } from './MarketStateDetector.js';

const strategy = new BreakoutStrategy();
const calculator = new MACalculator();
const detector = new MarketStateDetector(0.02);

// 准备数据
const klines = [...]; // 至少120个K线数据
const maHistory = calculator.calculateHistory(klines);
const currentMA = maHistory[maHistory.length - 1];
const stateInfo = detector.detectState(currentMA);

// 检测信号
const signal = strategy.detectSignal(klines, maHistory, stateInfo);

if (signal) {
  console.log('信号类型:', signal.type); // 'buy_breakout' 或 'sell_breakout'
  console.log('触发价格:', signal.price);
  console.log('止损价:', signal.stopLoss);
  console.log('原因:', signal.reason);
  console.log('信号强度:', signal.confidence);
}
```

### 信号输出

```typescript
{
  type: 'buy_breakout',           // 信号类型
  symbol: '',                     // 标的符号（由调用者填充）
  timestamp: 1704067200000,       // 触发时间
  price: 102.5,                   // 触发价格
  stopLoss: 99.8,                 // 止损价（密集区下边界）
  takeProfit: [],                 // 止盈价（由RiskCalculator计算）
  reason: '向上突破密集区[99.80-101.20]后回踩支撑',
  confidence: 0.8                 // 信号强度
}
```

### 使用建议

1. **必须配合MarketStateDetector使用**：先判断市场状态是否为CONSOLIDATION
2. **需要足够的历史数据**：至少120个K线周期用于计算均线
3. **回测窗口**：策略检查最近5-10根K线的突破和回踩行为
4. **止盈计算**：信号中的`takeProfit`为空数组，需要由`RiskCalculator`根据配置计算
5. **仓位管理**：建议配合`RiskCalculator`计算建议开仓数量

### 测试

运行单元测试：

```bash
npm run test -- BreakoutStrategy.test.ts
```

查看使用示例：

```bash
npx tsx src/strategy/BreakoutStrategy.example.ts
```

### 相关需求

- 需求 4.1: 市场处于密集状态时监控价格突破
- 需求 4.2: 价格向上突破后回踩但未跌破时生成做多信号
- 需求 4.3: 价格向下跌破后反弹但未突破时生成做空信号
- 需求 4.4: 确认收盘价位于密集区相应侧才触发信号
- 需求 4.5: 计算止损位为密集区的另一侧边界

### 性能考虑

- 时间复杂度: O(n)，其中n是回测窗口大小（5-10）
- 空间复杂度: O(1)
- 建议在每个周期结束时调用一次

---

## 模块依赖关系

```
MACalculator
    ↓
MarketStateDetector
    ↓
BreakoutStrategy
```

1. **MACalculator** 计算6条移动平均线
2. **MarketStateDetector** 使用均线数据判断市场状态
3. **BreakoutStrategy** 根据市场状态和K线数据生成交易信号

## 下一步开发

- [ ] **PullbackStrategy**: 策略B - 趋势中首次回踩MA20
- [ ] **StrategyEngine**: 策略执行引擎，协调多个策略
- [ ] **RiskCalculator**: 风险计算器，计算止盈位和仓位大小
