# 项目技术文档（stock-trading-monitor）

本文档面向开发者、运维以及后续接入方，描述当前项目的架构、关键模块、核心数据流与接口约定。

## 1. 项目定位

本项目是一个基于均线策略的交易监控系统，提供：

- 配置驱动的标的扫描（不做全市场自动发现）
- 策略信号转交易建议（Advice Layer）
- 持仓风险检查
- 面向 agent 的汇总输出（`agentSummary`）
- REST API 与简易 Dashboard

主入口：

- [src/index.ts](../src/index.ts)
- [src/Application.ts](../src/Application.ts)

---

## 2. 技术栈

- 语言：TypeScript（ESM）
- 运行时：Node.js
- Web 框架：Express
- 测试：Vitest
- 静态检查：ESLint

构建与脚本见 [package.json](../package.json)。

---

## 3. 总体架构

```text
Application (编排层)
  ├─ ConfigManager (配置)
  ├─ DataManager + Providers (行情)
  ├─ SignalScanner (信号扫描)
  ├─ PositionMonitor (持仓监控)
  └─ ApiServer (HTTP接口 + Dashboard)
        └─ WatchSummaryService
              └─ AdviceService
```

核心编排逻辑在 [src/Application.ts:44-183](../src/Application.ts#L44-L183)。

---

## 4. 模块说明

## 4.1 Application 编排层

文件： [src/Application.ts](../src/Application.ts)

职责：

1. 加载配置并注册数据源
2. 初始化持仓监控
3. 启动 HTTP 服务
4. 定时执行监控循环（scan + position update）

关键点：

- API Key 从 `process.env.WATCH_API_KEY` 注入（[src/Application.ts:37](../src/Application.ts#L37)）
- 默认监听 `0.0.0.0:3000`（[src/Application.ts:35-37](../src/Application.ts#L35-L37)）

## 4.2 API 层

文件： [src/api/server.ts](../src/api/server.ts)

职责：

- 对外暴露 REST API
- 对 `/api` 路由统一 Bearer 鉴权
- 提供 watch-summary 及 skill 专用接口

关键接口：

- 健康检查：`GET /health`（[src/api/server.ts:66-68](../src/api/server.ts#L66-L68)）
- 汇总接口：`GET /api/watch-summary`（[src/api/server.ts:145-153](../src/api/server.ts#L145-L153)）
- 运行接口：`POST /api/watch-summary/run`（[src/api/server.ts:155-165](../src/api/server.ts#L155-L165)）
- skill 接口：`POST /api/skills/watch-summary`（[src/api/server.ts:167-192](../src/api/server.ts#L167-L192)）

## 4.3 WatchSummaryService（汇总层）

文件： [src/services/WatchSummaryService.ts](../src/services/WatchSummaryService.ts)

职责：

1. 遍历配置中的 symbols/intervals 做信号扫描
2. 将策略信号转为 `TradingAdvice`
3. 执行持仓状态更新并提取可操作提醒
4. 生成两类结果：
   - 原始汇总：`WatchSummaryResult`
   - agent 摘要：`WatchAgentSummary`

核心方法：

- `build(config)`（[src/services/WatchSummaryService.ts:34](../src/services/WatchSummaryService.ts#L34)）
- `buildAgentSummary(summary)`（[src/services/WatchSummaryService.ts:128](../src/services/WatchSummaryService.ts#L128)）

## 4.4 AdviceService（建议层）

文件： [src/services/AdviceService.ts](../src/services/AdviceService.ts)

职责：

- 把 `TradingSignal` 转为 `TradingAdvice`
- 计算建议动作（buy/sell...）
- 计算建议等级（strong/normal/weak）
- 结合 `RiskCalculator` 生成止损止盈与风险提示

关键入口：

- `fromSignal(...)`（[src/services/AdviceService.ts:7](../src/services/AdviceService.ts#L7)）

---

## 5. 核心数据模型

## 5.1 汇总输出

类型文件： [src/types/watch.ts](../src/types/watch.ts)

- `WatchSummaryResult`：扫描明细、持仓提醒、错误汇总
- `WatchAgentSummary`：面向 agent 的高层摘要

`WatchAgentSummary` 关键字段：

- `status`: `ok | attention | warning`
- `headline`: 一句话概览
- `counts`: 各类计数
- `topSignals`: 高置信度建议
- `positionActions`: 持仓动作建议
- `skippedSymbols`: 跳过标的
- `nextHint`: 下一步提示

## 5.2 建议输出

类型文件： [src/types/advice.ts](../src/types/advice.ts)

- `AdviceAction`: `buy | sell | hold | reduce | watch`
- `AdviceLevel`: `strong | normal | weak`
- `TradingAdvice`: 具体建议对象（价格、止损止盈、置信度、理由）

---

## 6. 关键业务流程

## 6.1 定时监控流程

在 [src/Application.ts:145-182](../src/Application.ts#L145-L182)：

1. 对每个 interval 过滤可交易 symbol
2. 调用 `SignalScanner.scanAllSymbols(...)`
3. 调用 `PositionMonitor.updatePositions(...)`

## 6.2 单次 skill 调用流程

以 `POST /api/skills/watch-summary` 为例：

1. 读取请求体（优先 `input`，兼容平铺）
2. 与当前配置合并得到 runtimeConfig
3. `WatchSummaryService.build(runtimeConfig)`
4. `WatchSummaryService.buildAgentSummary(summary)`
5. 返回统一包装：`{ ok, skill, input, output }`

实现参考 [src/api/server.ts:167-192](../src/api/server.ts#L167-L192)。

---

## 7. 鉴权与安全边界

- 鉴权中间件： [src/api/server.ts:42-57](../src/api/server.ts#L42-L57)
- 生效范围：`/api/*`
- 机制：`Authorization: Bearer <WATCH_API_KEY>`

注意：

- `/health` 不走鉴权，便于监控探活
- 部署时应配合 HTTPS 与反向代理

---

## 8. 接口契约（面向 OpenClaw）

## 8.1 请求

`POST /api/skills/watch-summary`

推荐请求体：

```json
{
  "input": {
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "intervals": ["1h", "4h"]
  }
}
```

## 8.2 响应

```json
{
  "ok": true,
  "skill": "watch-summary",
  "input": {
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "intervals": ["1h", "4h"]
  },
  "output": {
    "summary": {},
    "agentSummary": {}
  }
}
```

配置草案见：

- [src/config/openclaw-watch-summary.skill.json](../src/config/openclaw-watch-summary.skill.json)

---

## 9. 配置与环境变量

运行关键配置：

- `WATCH_API_KEY`：开启 API 鉴权

业务配置文件默认：

- `data/config.json`

配置管理：

- [src/config/ConfigManager.ts](../src/config/ConfigManager.ts)

---

## 10. 测试与质量保证

相关测试：

- API： [src/api/server.test.ts](../src/api/server.test.ts)
- Advice： [src/services/AdviceService.test.ts](../src/services/AdviceService.test.ts)
- Summary： [src/services/WatchSummaryService.test.ts](../src/services/WatchSummaryService.test.ts)

命令：

```bash
npm run build
npm test
```

补充说明：该仓库历史上 `npm test`（forks）路径出现过偶发识别异常；若出现可用 `npx vitest --run` 复核。

---

## 11. 已知限制

1. 提醒通道（声音/邮件）仍是预留层，不是完整发送系统
2. 数据持久化以本地文件为主，未引入数据库
3. 当前更偏向监控与建议，不是自动交易执行系统

---

## 12. 后续演进建议

1. 引入持久化存储（PostgreSQL/Redis）
2. 完整提醒通道与去重机制
3. 增加更多策略组合与回测统计
4. 为 skill 接口补充更细粒度 SLA / 指标监控
