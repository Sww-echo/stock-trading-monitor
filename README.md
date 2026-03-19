# 股票交易监控系统

一个基于 TypeScript + Node.js 的交易监控项目，面向加密货币、A 股、美股的均线策略观察、信号扫描、持仓跟踪与简单可视化查看。

## 项目状态

当前仓库已经具备可运行的主功能：

- 多数据源行情接入
- MA / EMA 计算
- 市场状态识别
- 策略信号扫描
- 持仓管理与风险计算
- REST API
- 简易 Web Dashboard

说明：提醒通知层（如声音 / 邮件真实告警）当前未完整实现，接口层保留了占位返回。

## 功能特性

- 支持多数据源：Binance、OKX、Tushare、Yahoo Finance
- 支持多市场标的：加密货币、A 股、美股
- 支持 6 条均线计算：MA20 / MA60 / MA120 / EMA20 / EMA60 / EMA120
- 支持两类策略：
  - 均线密集突破
  - 趋势中首次回踩 MA20
- 支持持仓监控、止损止盈判断、趋势反转检测
- 提供 REST API 供前端或外部调用
- 内置简易 Dashboard 页面用于查看配置、市场、持仓与信号

## 技术栈

- TypeScript
- Node.js
- Express
- Axios
- Vitest
- ESLint

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式运行

```bash
npm run dev
```

启动后默认访问：

- Dashboard: `http://localhost:3000`

### 2.2 云端调用（适合 OpenClaw / agent）

服务端支持通过环境变量开启 API Key 鉴权：

```bash
WATCH_API_KEY=your-secret-key npm run dev
```

开放接口：

- `GET /health`：健康检查，不需要鉴权
- `GET /api/watch-summary`：使用当前配置生成一次 watch-summary
- `POST /api/watch-summary/run`：允许本次请求临时覆盖 `symbols` 与 `intervals`

请求示例：

```bash
curl -X POST http://localhost:3000/api/watch-summary/run \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "intervals": ["1h", "4h"]
  }'
```

响应示例（保留原始 `summary`，并新增 `agentSummary` 便于 agent 消费）：

```json
{
  "summary": {
    "generatedAt": 1710000000000,
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "intervals": [],
    "positions": { "openCount": 1, "alerts": [] },
    "alertReservation": {
      "enabledChannels": { "sound": true, "email": false },
      "reservedTypes": ["buy_signal", "sell_signal", "stop_loss", "take_profit", "trend_reversal"]
    },
    "errors": []
  },
  "agentSummary": {
    "status": "attention",
    "headline": "发现 1 个交易建议，1 个持仓提醒，0 个异常",
    "counts": {
      "buy": 1,
      "sell": 0,
      "hold": 0,
      "reduce": 0,
      "watch": 0,
      "positionAlerts": 1,
      "errors": 0,
      "skippedSymbols": 1
    },
    "topSignals": [
      {
        "symbol": "BTC/USDT",
        "interval": "1h",
        "action": "buy",
        "adviceLevel": "strong",
        "confidence": 0.82,
        "reason": "1h 突破"
      }
    ],
    "positionActions": [
      {
        "positionId": "pos-1",
        "symbol": "BTC/USDT",
        "action": "take_profit",
        "currentPrice": 40500,
        "pnlPercent": 1.25
      }
    ],
    "skippedSymbols": ["AAPL"],
    "nextHint": "建议优先处理持仓提醒，再结合新信号决定是否调仓。"
  }
}
```

### 3. 构建

```bash
npm run build
```

### 4. 测试

```bash
npm test
```

### 5. 代码检查

```bash
npm run lint
```

## 默认运行行为

应用启动时会：

1. 加载配置文件
2. 注册已启用的数据源
3. 初始化持仓数据
4. 启动 API 服务
5. 按配置周期执行市场扫描与持仓更新

主入口文件：

- [src/index.ts](src/index.ts)
- [src/Application.ts](src/Application.ts)

## 配置说明

默认配置文件路径：

- `data/config.json`

如果文件不存在，系统会使用内置默认配置。默认配置由 [src/config/ConfigManager.ts](src/config/ConfigManager.ts) 管理。

默认配置重点包括：

- 默认监控标的：`BTC/USDT`、`ETH/USDT`、`SOL/USDT`
- 默认周期：`1h`、`4h`
- 默认启用数据源：Binance
- 默认更新频率：60 秒

可配置项包括：

- `symbols`：监控标的列表
- `intervals`：扫描周期列表
- `providers`：数据源启用状态与 Tushare Token
- `consolidationThreshold`：盘整识别阈值
- `takeProfitMode` / `takeProfitRatio`
- `maxRiskPerTrade` / `maxLeverage` / `accountBalance`
- `enableSound` / `enableEmail` / `emailAddress`
- `dataRetentionDays`
- `updateInterval`

## 支持的数据源

### Binance

适用于加密货币行情。

### OKX

适用于加密货币行情。

### Tushare

适用于 A 股行情。

使用前需要在配置中提供 `apiToken`。

### Yahoo Finance

适用于美股行情。

## API 概览

服务实现位于 [src/api/server.ts](src/api/server.ts)。

当前主要接口：

- `GET /api/positions`：获取持仓列表
- `POST /api/positions`：新增持仓
- `DELETE /api/positions/:id`：按 ID 平仓
- `GET /api/signals`：获取信号历史
- `GET /api/config`：获取当前配置
- `PUT /api/config`：更新配置
- `GET /api/market/:symbol`：查询指定标的市场信息
- `GET /api/watch-summary`：按当前配置生成一次汇总（返回 `summary` + `agentSummary`）
- `POST /api/watch-summary/run`：按请求体临时覆盖 `symbols` / `intervals` 后生成汇总（返回 `summary` + `agentSummary`）
- `GET /api/alerts`：提醒层占位接口

`agentSummary` 字段说明（面向 OpenClaw / agent）：

- `status`：`ok | attention | warning`
- `headline`：一句话摘要（建议数、持仓提醒数、异常数）
- `counts`：买卖建议、持仓提醒、异常、跳过标的等计数
- `topSignals`：按置信度排序的前几个建议
- `positionActions`：从持仓提醒提炼出的动作（如 `stop_loss` / `take_profit` / `trend_reversal`）
- `skippedSymbols`：本次跳过的标的列表
- `nextHint`：给 agent 的下一步建议

## OpenClaw Skill 对接

如果你要把服务作为云端 skill 提供给 OpenClaw，建议使用以下配置：

- Skill 配置文件：
  - [src/config/openclaw-watch-summary.skill.json](src/config/openclaw-watch-summary.skill.json)
- Skill 调用接口：
  - `POST /api/skills/watch-summary`
- 认证方式：
  - Bearer Token（`WATCH_API_KEY`）

### 最小部署说明

1. 启动服务（示例）：

```bash
WATCH_API_KEY=your-secret-key npm run dev
```

2. 在 OpenClaw skill 配置里设置：

- `baseUrl`: `https://your-skill-domain.com`
- `auth`: Bearer API Key（值使用与你服务端一致的 `WATCH_API_KEY`）
- `transport.path`: `/api/skills/watch-summary`

3. 先做健康检查：

```bash
curl https://your-skill-domain.com/health
```

期望返回：

```json
{ "ok": true }
```

### create-skill 模板对齐（推荐）

如果你在 OpenClaw 里先执行了 `create-skill`，请按下面映射把模板改成当前后端可用配置：

- 模板里的「调用 URL / endpoint」字段 → `POST /api/skills/watch-summary`
- 模板里的「鉴权类型」字段 → `Bearer`
- 模板里的「鉴权 Header」字段 → `Authorization`
- 模板里的「鉴权值」字段 → `Bearer <WATCH_API_KEY>`
- 模板里的「请求体」字段 → 使用：

```json
{
  "input": {
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "intervals": ["1h", "4h"]
  }
}
```

- 模板里的「成功响应提取」字段（如有）→ 读取：
  - `output.summary`
  - `output.agentSummary`

> 兼容说明：后端同时支持 body 直接传 `symbols/intervals` 与 `input.symbols/input.intervals` 两种写法，建议优先使用 `input` 包装。

### 导入前 3 项检查

1. `baseUrl` 指向你的线上域名（不要带末尾斜杠）
2. OpenClaw 里配置的 API Key 与服务端 `WATCH_API_KEY` 完全一致
3. 先手动验证一次：

```bash
curl -X POST https://your-skill-domain.com/api/skills/watch-summary \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"input":{"symbols":["BTC/USDT"],"intervals":["1h"]}}'
```

返回 `ok: true` 后再导入 OpenClaw。

### 请求体（OpenClaw 建议）

```json
{
  "input": {
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "intervals": ["1h", "4h"]
  }
}
```

其中 `symbols`、`intervals` 都是可选；不传时使用系统当前配置。

### 调用示例（带 Bearer API Key）

```bash
curl -X POST https://your-skill-domain.com/api/skills/watch-summary \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "symbols": ["BTC/USDT", "ETH/USDT"],
      "intervals": ["1h", "4h"]
    }
  }'
```

### 响应体（统一 skill 包装）

```json
{
  "ok": true,
  "skill": "watch-summary",
  "input": {
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "intervals": ["1h", "4h"]
  },
  "output": {
    "summary": { "...": "..." },
    "agentSummary": { "...": "..." }
  }
}
```

> 说明：`output.agentSummary` 是面向 agent 的摘要层，适合直接用于对话总结与下一步动作决策。

## Dashboard

内置页面位于：

- [src/api/public/index.html](src/api/public/index.html)

可用于：

- 查看配置
- 查询市场数据
- 查看持仓
- 新增 / 关闭持仓
- 查看历史信号
- 查看提醒占位状态
- 一键生成 watch-summary（扫描建议 + 持仓提醒）

## 目录结构

```text
src/
├── api/            # REST API 与 Dashboard
├── config/         # 配置管理
├── data/           # 数据获取、缓存、持久化
├── monitoring/     # 持仓监控、信号扫描、风险计算
├── strategy/       # 均线计算、市场状态识别、策略引擎
├── types/          # 类型定义
└── alert/          # 提醒模块目录（当前未完整实现）
```

## 测试状态

当前测试已全部通过。

你可以使用以下命令验证：

```bash
npm test
```

## 已知说明

- 当前提醒层未完整落地，`/api/alerts` 为降级占位实现
- 项目以本地 JSON 文件作为主要持久化方式
- 更偏向原型 / 本地监控工具，而非生产级交易执行系统

## 后续可扩展方向

- 完整实现提醒渠道（声音、邮件、其他通知方式）
- 增加更多策略与过滤条件
- 增加更丰富的前端交互与图表
- 引入数据库替代 JSON 文件存储
- 增加回测与统计分析模块
