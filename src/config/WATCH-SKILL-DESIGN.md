# 盯盘 Skill 技术设计草案

本文档描述如何在当前项目基础上，演进出一个适合 agent 使用的“盯盘 skill”。

目标不是替换现有 Web/API 应用，而是在现有能力之上补一层 **agent-friendly 单次调用接口**。

---

## 1. 设计目标

目标能力：

1. agent 可以单次调用并得到结构化结果
2. 支持扫描市场信号
3. 支持检查当前持仓风险
4. 支持返回“新增事件”而不是每次重复全部历史
5. 后续可接入 skill、loop、cron 等外层调度能力

非目标：

- 不在第一版里完整实现声音/邮件提醒渠道
- 不把当前 Dashboard 重写成 agent 专用系统
- 不在第一版引入数据库

---

## 2. 当前实现可复用的部分

现有项目已经具备较强的业务底座。

### 可直接复用模块

- 配置管理：[ConfigManager.ts](ConfigManager.ts)
- 主应用编排：[../Application.ts](../Application.ts)
- 数据获取与缓存：`src/data/*`
- 策略计算：`src/strategy/*`
- 信号扫描：[../monitoring/SignalScanner.ts](../monitoring/SignalScanner.ts)
- 持仓监控：[../monitoring/PositionMonitor.ts](../monitoring/PositionMonitor.ts)
- 类型定义：
  - [../types/config.ts](../types/config.ts)
  - [../types/strategy.ts](../types/strategy.ts)
  - [../types/position.ts](../types/position.ts)

### 当前缺口

要变成“适合 agent 使用的 skill”，目前主要缺少：

1. 单次执行入口
2. 统一 JSON 输出结构
3. 增量事件状态存储
4. 面向 skill 的摘要层

---

## 3. 总体架构建议

建议把系统拆成三层：

```text
skill / agent
    ↓
CLI 单次入口（watch-summary / scan-once / positions-status）
    ↓
服务层（WatchSummaryService 等）
    ↓
现有业务模块（DataManager / SignalScanner / PositionMonitor / StrategyEngine）
```

### 职责划分

#### 1）现有业务模块
继续负责：

- 拉取行情
- 计算均线
- 识别市场状态
- 生成交易信号
- 计算持仓风险

#### 2）新增服务层
负责：

- 聚合多模块结果
- 统一结果格式
- 处理错误收集
- 执行增量去重

#### 3）新增 CLI 层
负责：

- 解析参数
- 读取配置
- 调用服务层
- 输出 JSON
- 退出进程

---

## 4. 建议新增的能力入口

第一阶段建议只做 3 个单次命令。

### 4.1 `watch-summary`

这是主入口，也是最适合 skill 的入口。

用途：

- 扫描市场是否有新信号
- 检查当前持仓是否有风险
- 返回统一摘要

适合回答：

- 帮我盯一下盘
- 看看现在有没有新机会
- 检查一下当前仓位风险

### 4.2 `scan-once`

用途：

- 只检查监控列表中的市场信号
- 不处理持仓风险

适合回答：

- 扫一下 BTC / ETH / AAPL
- 现在有没有开仓信号

### 4.3 `positions-status`

用途：

- 只检查当前持仓
- 不做新信号扫描

适合回答：

- 看一下我持仓有没有风险
- 哪些仓位快到止损/止盈了

---

## 5. 建议新增的目录结构

建议新增：

```text
src/
├── cli/
│   ├── watchSummary.ts
│   ├── scanOnce.ts
│   └── positionsStatus.ts
├── services/
│   ├── WatchSummaryService.ts
│   ├── MarketScanService.ts
│   ├── PositionStatusService.ts
│   └── WatchStateStore.ts
```

### 各文件职责

#### `src/cli/watchSummary.ts`
- 单次执行盯盘摘要
- 输出 JSON

#### `src/cli/scanOnce.ts`
- 单次执行信号扫描
- 输出 JSON

#### `src/cli/positionsStatus.ts`
- 单次执行持仓状态检查
- 输出 JSON

#### `src/services/WatchSummaryService.ts`
- 调用扫描与持仓检查
- 聚合统一结果

#### `src/services/MarketScanService.ts`
- 调用 `SignalScanner`
- 处理多周期、多标的扫描

#### `src/services/PositionStatusService.ts`
- 调用 `PositionMonitor`
- 生成结构化持仓告警

#### `src/services/WatchStateStore.ts`
- 存储已见过的事件键
- 实现“只返回新增事件”

---

## 6. 输出数据结构设计

建议新增统一结果类型，例如：

```ts
export interface WatchSummaryResult {
  ok: boolean;
  timestamp: number;
  summary: {
    scannedSymbolCount: number;
    intervalCount: number;
    newSignalCount: number;
    positionAlertCount: number;
    errorCount: number;
  };
  newSignals: WatchSignalEvent[];
  positionAlerts: PositionAlertEvent[];
  errors: WatchErrorItem[];
}
```

### 6.1 新信号事件

建议结构：

```ts
export interface WatchSignalEvent {
  key: string;
  symbol: string;
  interval: string;
  type: string;
  timestamp: number;
  price: number;
  stopLoss: number;
  takeProfit: number[];
  reason: string;
  confidence: number;
}
```

说明：

- `key` 用于去重
- `interval` 需要额外补上，因为现有 `TradingSignal` 本身没有 interval 字段

### 6.2 持仓告警事件

建议结构：

```ts
export interface PositionAlertEvent {
  key: string;
  positionId: string;
  symbol: string;
  alertType: 'stop_loss' | 'take_profit' | 'trend_reversed';
  severity: 'high' | 'medium';
  timestamp: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}
```

### 6.3 错误项

```ts
export interface WatchErrorItem {
  scope: 'signal_scan' | 'position_check' | 'config' | 'runtime';
  symbol?: string;
  interval?: string;
  message: string;
}
```

---

## 7. 增量状态设计

盯盘 skill 最关键的是“不要重复报旧消息”。

因此建议新增一个运行状态文件：

```text
data/runtime/watch-state.json
```

建议结构：

```json
{
  "lastRunAt": 1710000000000,
  "seenSignalKeys": [
    "BTC/USDT|1h|buy_breakout|1710000000000"
  ],
  "seenPositionAlertKeys": [
    "pos_001|take_profit|1710000000000"
  ]
}
```

### 作用

下次执行时：

- 相同信号不再重复返回
- 相同持仓告警不再重复返回
- 只把本次新增事件返回给 agent

### key 生成建议

#### 信号 key

```text
symbol|interval|type|timestamp
```

#### 持仓告警 key

```text
positionId|alertType|timestampBucket
```

说明：

- 持仓告警如果完全用 `Date.now()`，会每次都变成新事件
- 因此建议用状态变化时间、或按固定时间桶归并
- 第一版可以先采用“只有状态从 false -> true 时产生事件”

---

## 8. 具体命令设计

建议在 `package.json` 中未来增加脚本：

```json
{
  "scripts": {
    "watch:summary": "tsx src/cli/watchSummary.ts",
    "watch:scan": "tsx src/cli/scanOnce.ts",
    "watch:positions": "tsx src/cli/positionsStatus.ts"
  }
}
```

### 参数建议

第一版可以支持可选参数：

- `--config data/config.json`
- `--symbols BTC/USDT,ETH/USDT`
- `--intervals 1h,4h`
- `--json`

如果不传，就直接用配置文件里的默认值。

---

## 9. 与现有模块的映射关系

### 市场扫描

当前已有：

- [../monitoring/SignalScanner.ts](../monitoring/SignalScanner.ts)

建议复用方式：

- `MarketScanService` 内部调用 `scanAllSymbols(symbols, interval)`
- 对多个 interval 做循环
- 把返回的 `TradingSignal` 转成 `WatchSignalEvent`
- 同时追加 interval 信息

### 持仓检查

当前已有：

- [../monitoring/PositionMonitor.ts](../monitoring/PositionMonitor.ts)
- [../types/position.ts](../types/position.ts)

建议复用方式：

- `PositionStatusService` 调用 `updatePositions(...)`
- 把 `PositionStatus` 转成 `PositionAlertEvent`
- 仅保留满足风险条件的项：
  - `shouldStopLoss === true`
  - `shouldTakeProfit === true`
  - `trendReversed === true`

### 配置读取

当前已有：

- [ConfigManager.ts](ConfigManager.ts)

建议复用方式：

- CLI 层统一用 `ConfigManager.load()` 读取
- 若命令行传了临时 symbols / intervals，则覆盖配置值

---

## 10. 推荐的第一阶段实现顺序

### Phase 1：统一 DTO
先新增类型文件，例如：

```text
src/types/watch.ts
```

定义：

- `WatchSummaryResult`
- `WatchSignalEvent`
- `PositionAlertEvent`
- `WatchErrorItem`

### Phase 2：服务层
新增：

- `MarketScanService`
- `PositionStatusService`
- `WatchStateStore`
- `WatchSummaryService`

### Phase 3：CLI 单次入口
新增：

- `watchSummary.ts`

第一版只做一个主命令也可以。

### Phase 4：外层 skill 封装
当 CLI 输出 JSON 稳定后，再封装成 skill。

---

## 11. skill 层如何调用

未来 skill 不应该直接操作内部类，而是直接调用 CLI。

例如：

```bash
npm run watch:summary
```

或：

```bash
node dist/cli/watchSummary.js --json
```

skill 只需要：

1. 执行命令
2. 读取 JSON
3. 用自然语言总结

这样耦合最小，也最稳。

---

## 12. agent 使用时的理想行为

### 场景 1：用户手动问

用户：

- 帮我盯一下盘

skill 行为：

- 运行 `watch-summary`
- 读取新增信号与持仓风险
- 总结输出

### 场景 2：周期性检查

用户：

- 每 5 分钟帮我看一下盘

外层调度：

- 用 loop / cron 每隔几分钟调用一次 skill
- skill 每次只返回“新增事件”

### 场景 3：特定市场检查

用户：

- 扫一下美股 AAPL 和 TSLA

skill 行为：

- 传临时 symbols 覆盖配置
- 输出该次扫描结果

---

## 13. 第一版不建议做的事

以下内容可以放到后续：

- 真正的邮件通知发送
- 真正的声音通知播放
- MCP 化改造
- 引入数据库
- 做成全自动长驻 agent daemon

第一版优先级应该始终是：

**单次执行 + 结构化输出 + 增量事件**

---

## 14. 设计结论

当前项目已经适合作为“盯盘 skill 的后端核心”，但还不适合作为 skill 成品直接交给 agent 使用。

最小可行路线是：

1. 新增统一 watch 类型
2. 新增服务层聚合扫描与持仓检查
3. 新增 `watch-summary` CLI 单次入口
4. 新增 `watch-state.json` 做增量去重
5. 最后再包装为 skill

这条路线可以最大限度复用现有代码，改造成本低，且最符合 agent 的调用方式。
