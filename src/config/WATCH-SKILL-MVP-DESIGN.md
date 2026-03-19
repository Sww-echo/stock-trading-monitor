# 配置扫描 + 买卖建议 + 全面提醒预留：盯盘 Skill MVP 设计稿

本文档基于当前项目现状，重新定义一个更贴近目标的 MVP 设计。

目标已经明确限定为：

1. **只扫描配置文件中的 symbols**，不做全市场自动选股/选币
2. **必须支持买卖建议输出**，不能只停留在原始策略信号层
3. **必须支持更全面的盯盘提醒能力**，但提醒通道本身可以后续再实现

因此，本设计的核心方向不是继续强化 Dashboard，而是把当前项目演进成一个适合 agent 使用的：

- 配置驱动扫描器
- 买卖建议生成器
- 盯盘提醒事件引擎（先设计，后实现）

---

## 1. 设计目标

本 MVP 的核心目标如下：

### 1.1 已明确支持

- 从 `config.json` 读取待扫描的股票/币种列表
- 对这些标的执行策略筛选
- 将策略结果转换为买卖建议
- 输出结构化结果给 agent 或 CLI 使用

### 1.2 必须为未来预留

- 新信号提醒
- 止损提醒
- 止盈提醒
- 趋势反转提醒
- 数据源异常提醒
- 增量提醒去重

### 1.3 本阶段不做

- 全市场自动扫描
- 实际发送邮件 / 声音提醒
- 引入数据库
- 全自动 agent daemon 化部署

---

## 2. 当前实现与目标的匹配情况

### 2.1 已满足的部分

当前已经支持：

- 从配置读取 symbols：[../types/config.ts](../types/config.ts)
- 数据源接入：Binance / OKX / Tushare / Yahoo Finance
- 扫描配置内标的：[../monitoring/SignalScanner.ts](../monitoring/SignalScanner.ts)
- 策略分析：[../strategy/StrategyEngine.ts](../strategy/StrategyEngine.ts)
- 持仓检查：[../monitoring/PositionMonitor.ts](../monitoring/PositionMonitor.ts)

### 2.2 还缺失的部分

当前还没有：

- “买卖建议层”
- 给 agent 使用的统一输出结构
- 更全面的提醒事件模型
- 增量去重状态存储

因此当前系统更像：

- **策略扫描内核**

而不是：

- **完整的选币/选股 + 建议 + 盯盘 skill**

---

## 3. 目标产品定义

最终要做的 MVP 应该是一个：

> 基于配置标的列表进行策略扫描，输出买卖建议，并能为后续全面提醒提供统一事件能力的盯盘 skill。

它要解决的核心问题是：

1. 配置里的哪些标的符合策略？
2. 对这些标的当前建议买、卖、观察还是持有？
3. 当前持仓是否出现风险或操作提醒？
4. 哪些提醒是新增的，哪些只是旧状态？

---

## 4. 推荐的整体架构

建议采用下面的四层结构：

```text
Agent / Skill
    ↓
CLI 单次入口
    ↓
聚合服务层
    ↓
现有扫描/持仓/策略模块
    ↓
提醒事件模型与状态存储
```

### 4.1 各层职责

#### Agent / Skill 层
负责：

- 触发命令
- 读取 JSON 输出
- 给用户做自然语言总结

#### CLI 单次入口层
负责：

- 单次执行
- 读取配置
- 调用服务层
- 输出稳定 JSON
- 退出进程

#### 聚合服务层
负责：

- 扫描配置内标的
- 生成买卖建议
- 生成持仓提醒
- 聚合统一结果

#### 提醒事件层
负责：

- 定义提醒类型
- 记录已见过的提醒
- 提供未来提醒通道扩展基础

---

## 5. 核心能力拆分

本 MVP 建议拆成三个核心能力。

### 5.1 扫描能力（Scan）

输入：

- `symbols`
- `intervals`
- `providers`

输出：

- 候选策略信号

说明：

- 只扫描配置里的标的
- 不做市场标的自动发现

### 5.2 建议能力（Advice）

输入：

- 策略信号
- 当前价格
- 止损止盈
- 信号强度
- 风险参数

输出：

- 面向用户/agent 的买卖建议

说明：

- Advice 层必须独立于 Signal 层
- Signal 是策略结果
- Advice 是操作建议

### 5.3 提醒能力（Alert / Watch）

输入：

- 新信号
- 持仓状态
- 扫描异常

输出：

- 统一提醒事件

说明：

- 当前阶段先定义事件模型
- 提醒渠道可以不实现

---

## 6. 数据模型设计

建议新增以下类型文件：

```text
src/types/advice.ts
src/types/watch.ts
src/types/alert.ts
```

---

## 7. 买卖建议模型设计

建议新增：

### 7.1 建议动作

```ts
export type AdviceAction = 'buy' | 'sell' | 'watch' | 'hold' | 'reduce';
```

说明：

- `buy`：建议买入
- `sell`：建议卖出 / 做空 / 平仓卖出
- `watch`：有关注价值但不建议立刻动作
- `hold`：已有仓位可继续持有
- `reduce`：建议减仓

### 7.2 建议等级

```ts
export type AdviceLevel = 'strong' | 'normal' | 'weak';
```

### 7.3 交易建议对象

```ts
export interface TradingAdvice {
  symbol: string;
  interval: string;
  action: AdviceAction;
  signalType: string;
  adviceLevel: AdviceLevel;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number[];
  reason: string;
  riskNote?: string;
  timestamp: number;
}
```

### 7.4 设计说明

当前已有的 `TradingSignal` 包含：

- `type`
- `price`
- `stopLoss`
- `takeProfit`
- `reason`
- `confidence`

这些字段适合做 Advice 的输入，但不能直接当 Advice 使用，因为 Advice 还需要明确：

- 最终动作
- 建议等级
- 风险备注
- 输出场景语义

---

## 8. 建议生成规则（MVP 版）

第一版建议先采用简单清晰的规则。

### 8.1 动作映射

#### 来自策略信号

- `buy_breakout` → `buy`
- `buy_pullback` → `buy`
- `sell_breakout` → `sell`
- `sell_pullback` → `sell`

### 8.2 建议等级映射

建议可先基于 `confidence` 做分级：

- `>= 0.8` → `strong`
- `>= 0.6 && < 0.8` → `normal`
- `< 0.6` → `weak`

### 8.3 风险备注规则

例如：

- 突破类信号：`建议等待收盘确认突破有效性`
- 回踩类信号：`建议确认未有效跌破/突破 MA20 后再行动`
- 如果止损距离过近/过远：加上补充说明

---

## 9. 提醒事件模型设计

提醒层虽然本阶段不完全落地，但必须把事件结构先定义好。

建议提醒至少分三大类。

### 9.1 信号提醒

#### 类型

- `new_buy_advice`
- `new_sell_advice`

#### 场景

- 某个配置内标的首次出现新的买入/卖出建议

### 9.2 持仓提醒

#### 类型

- `stop_loss_triggered`
- `take_profit_triggered`
- `trend_reversed`
- `position_pnl_warning`

#### 场景

- 价格已达到止损条件
- 价格已达到止盈条件
- MA 趋势反转
- 盈亏超出阈值

### 9.3 系统提醒

#### 类型

- `symbol_scan_failed`
- `provider_error`
- `config_invalid`
- `runtime_error`

#### 场景

- 某个标的扫描失败
- 数据源请求失败
- 配置异常
- 运行时错误

---

## 10. 提醒对象建议结构

建议新增：

```ts
export interface AlertEvent {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  symbol?: string;
  interval?: string;
  timestamp: number;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}
```

### 字段说明

- `id`：唯一事件 ID
- `type`：提醒类型
- `severity`：严重程度
- `symbol`：关联标的
- `interval`：关联周期
- `title`：摘要标题
- `message`：详细说明
- `metadata`：扩展字段

---

## 11. 增量提醒与去重设计

盯盘系统必须支持“只报新增”。

建议新增状态文件：

```text
data/runtime/watch-state.json
```

建议结构：

```json
{
  "lastRunAt": 1710000000000,
  "seenAdviceKeys": [
    "BTC/USDT|1h|buy|1710000000000"
  ],
  "seenAlertIds": [
    "alert_stop_loss_pos_001_1710000000000"
  ]
}
```

### 作用

- 已出现过的建议不重复报
- 已发送过的提醒不重复报
- agent 每次只拿到增量结果

### 建议 key 规则

#### Advice key

```text
symbol|interval|action|timestamp
```

#### Alert id

由业务类型生成稳定 ID，例如：

```text
stop_loss|pos_001|2026-03-19T10
```

---

## 12. 输出结果设计

建议未来的主输出结构定义为：

```ts
export interface WatchMvpResult {
  ok: boolean;
  timestamp: number;
  summary: {
    symbolCount: number;
    intervalCount: number;
    adviceCount: number;
    alertCount: number;
    errorCount: number;
  };
  advices: TradingAdvice[];
  alerts: AlertEvent[];
  errors: WatchErrorItem[];
}
```

其中：

```ts
export interface WatchErrorItem {
  scope: 'scan' | 'advice' | 'position' | 'config' | 'runtime';
  symbol?: string;
  interval?: string;
  message: string;
}
```

---

## 13. CLI 命令设计

建议先提供一个主命令即可：

### `watch-summary`

它负责：

1. 读取配置
2. 扫描配置内标的
3. 生成买卖建议
4. 检查持仓风险并转成提醒
5. 输出 JSON

### 后续可拆的命令

- `scan-advices`：只输出买卖建议
- `positions-alerts`：只输出持仓提醒

---

## 14. 推荐新增目录结构

```text
src/
├── cli/
│   └── watchSummary.ts
├── services/
│   ├── AdviceService.ts
│   ├── WatchSummaryService.ts
│   ├── AlertBuilder.ts
│   └── WatchStateStore.ts
├── types/
│   ├── advice.ts
│   ├── watch.ts
│   └── alert.ts
```

---

## 15. 核心服务设计

### 15.1 AdviceService

职责：

- 将 `TradingSignal` 转换成 `TradingAdvice`
- 统一买卖建议逻辑

输入：

- `TradingSignal`
- `interval`

输出：

- `TradingAdvice`

### 15.2 AlertBuilder

职责：

- 将持仓状态和扫描异常转换成 `AlertEvent`
- 将新增建议转换成提醒事件（未来可选）

### 15.3 WatchStateStore

职责：

- 持久化已见事件
- 执行增量去重

### 15.4 WatchSummaryService

职责：

- 协调扫描、建议、提醒
- 汇总统一输出结构

---

## 16. 与现有模块的映射关系

### 扫描层

复用：

- [../monitoring/SignalScanner.ts](../monitoring/SignalScanner.ts)

处理方式：

- 对配置内每个 `interval` 调 `scanAllSymbols(symbols, interval)`
- 收集 `TradingSignal`
- 交给 `AdviceService`

### 建议层

新增：

- `AdviceService`

### 持仓提醒层

复用：

- [../monitoring/PositionMonitor.ts](../monitoring/PositionMonitor.ts)
- [../types/position.ts](../types/position.ts)

处理方式：

- 调 `updatePositions(...)`
- 将 `PositionStatus` 转换为 `AlertEvent`

### 提醒状态层

新增：

- `WatchStateStore`

---

## 17. 推荐实现顺序

### Phase 1：Advice 层
先做：

- `src/types/advice.ts`
- `src/services/AdviceService.ts`

目标：

- 先把“信号 → 建议”打通

### Phase 2：主输出层
再做：

- `src/types/watch.ts`
- `src/services/WatchSummaryService.ts`
- `src/cli/watchSummary.ts`

目标：

- 让 agent 可以单次调用并拿到建议结果

### Phase 3：提醒模型与增量状态
再做：

- `src/types/alert.ts`
- `src/services/AlertBuilder.ts`
- `src/services/WatchStateStore.ts`

目标：

- 为全面提醒能力打基础

### Phase 4：真正提醒通道
最后做：

- 邮件 / 声音 / 外部通知

---

## 18. MVP 结论

基于你当前的真实需求，最合适的 MVP 不是“全市场扫描器”，也不是“纯 Dashboard”，而是：

> 一个从配置 symbols 扫描策略信号、输出买卖建议、并为未来全面提醒预留事件模型的盯盘 skill 内核。

这和当前项目是连续演进关系：

- 扫描层：已具备基础
- 建议层：必须新增
- 提醒层：必须设计，稍后实现

也就是说：

**当前项目方向没错，但还需要补 Advice 层和 Alert 预留层，才真正贴近你的目标。**
