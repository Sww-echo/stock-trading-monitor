# 配置示例说明

本文档说明这个项目在三种常见场景下怎么配置：

- 只监控加密货币
- 只监控 A 股
- 只监控美股

配置结构定义见：

- [ConfigManager.ts](ConfigManager.ts)
- [../types/config.ts](../types/config.ts)
- [../types/risk.ts](../types/risk.ts)

## 配置文件位置

默认配置文件路径为：

```text
data/config.json
```

如果该文件不存在，系统会在启动时使用默认配置。

## 通用说明

无论配置哪一种市场，下面这些规则都必须满足：

1. `symbols` 必须是非空数组
2. `intervals` 必须是非空数组
3. `providers` 里至少启用一个数据源
4. 如果启用 `tushare`，必须提供 `apiToken`
5. `takeProfitMode` 可选值只有：
   - `fixed_ratio`
   - `prev_consol`
   - `fibonacci`
6. `updateInterval` 单位是秒

## 一、只监控加密货币怎么配

### 适用场景

适合监控：

- `BTC/USDT`
- `ETH/USDT`
- `SOL/USDT`
- 其他常见交易对

### 数据源怎么选

加密货币可以启用：

- `binance`
- `okx`

通常建议先启用一个，最简单的是启用 Binance。

### 示例配置

```json
{
  "symbols": ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
  "intervals": ["1h", "4h"],
  "providers": {
    "binance": { "enabled": true },
    "okx": { "enabled": false },
    "tushare": { "enabled": false, "apiToken": "" },
    "yahooFinance": { "enabled": false }
  },
  "consolidationThreshold": 0.02,
  "takeProfitMode": "fixed_ratio",
  "takeProfitRatio": 3,
  "maxRiskPerTrade": 100,
  "maxLeverage": 3,
  "accountBalance": 10000,
  "enableSound": false,
  "enableEmail": false,
  "dataRetentionDays": 30,
  "updateInterval": 60
}
```

### 说明

- `symbols` 建议用标准交易对格式，如 `BTC/USDT`
- `intervals` 常用 `1h`、`4h`
- 如果你更想用 OKX，也可以把 `okx.enabled` 设为 `true`

---

## 二、只监控 A 股怎么配

### 适用场景

适合监控：

- `600519.SH`
- `000001.SZ`
- 其他 A 股代码

### 数据源怎么选

A 股使用：

- `tushare`

### 代码格式要求

A 股代码必须是这种格式：

- 上海：`600519.SH`
- 深圳：`000001.SZ`

### 示例配置

```json
{
  "symbols": ["600519.SH", "000001.SZ"],
  "intervals": ["1h", "1d"],
  "providers": {
    "binance": { "enabled": false },
    "okx": { "enabled": false },
    "tushare": { "enabled": true, "apiToken": "你的_tushare_token" },
    "yahooFinance": { "enabled": false }
  },
  "consolidationThreshold": 0.02,
  "takeProfitMode": "fixed_ratio",
  "takeProfitRatio": 3,
  "maxRiskPerTrade": 100,
  "maxLeverage": 1,
  "accountBalance": 100000,
  "enableSound": false,
  "enableEmail": false,
  "dataRetentionDays": 30,
  "updateInterval": 60
}
```

### 说明

- `tushare.apiToken` 必填，不填配置验证不会通过
- A 股不是加密货币场景，一般 `maxLeverage` 建议设为 `1`
- 周期可以用 `1h`、`4h`、`1d`

---

## 三、只监控美股怎么配

### 适用场景

适合监控：

- `AAPL`
- `TSLA`
- `NVDA`
- `MSFT`

### 数据源怎么选

美股使用：

- `yahooFinance`

### 代码格式要求

美股代码格式一般是纯字母，例如：

- `AAPL`
- `TSLA`
- `SPY`

### 示例配置

```json
{
  "symbols": ["AAPL", "TSLA", "NVDA"],
  "intervals": ["1h", "4h"],
  "providers": {
    "binance": { "enabled": false },
    "okx": { "enabled": false },
    "tushare": { "enabled": false, "apiToken": "" },
    "yahooFinance": { "enabled": true }
  },
  "consolidationThreshold": 0.02,
  "takeProfitMode": "fixed_ratio",
  "takeProfitRatio": 3,
  "maxRiskPerTrade": 100,
  "maxLeverage": 1,
  "accountBalance": 10000,
  "enableSound": false,
  "enableEmail": false,
  "dataRetentionDays": 30,
  "updateInterval": 60
}
```

### 说明

- 美股代码建议使用大写字母
- 美股场景通常也建议 `maxLeverage` 设为 `1`
- 如果只是本地观察信号，这个配置已经够用

---

## 四、如果你想混合监控怎么配

虽然你这次问的是分别怎么配，但这个项目也支持混合配置。

例如同时监控：

- 加密货币：`BTC/USDT`
- A 股：`600519.SH`
- 美股：`AAPL`

示例：

```json
{
  "symbols": ["BTC/USDT", "600519.SH", "AAPL"],
  "intervals": ["1h", "4h"],
  "providers": {
    "binance": { "enabled": true },
    "okx": { "enabled": false },
    "tushare": { "enabled": true, "apiToken": "你的_tushare_token" },
    "yahooFinance": { "enabled": true }
  },
  "consolidationThreshold": 0.02,
  "takeProfitMode": "fixed_ratio",
  "takeProfitRatio": 3,
  "maxRiskPerTrade": 100,
  "maxLeverage": 1,
  "accountBalance": 10000,
  "enableSound": false,
  "enableEmail": false,
  "dataRetentionDays": 30,
  "updateInterval": 60
}
```

## 五、怎么实际使用

### 方法 1：手动创建配置文件

在项目根目录下创建：

```text
data/config.json
```

然后把上面的某个示例复制进去即可。

### 方法 2：先直接启动，再修改配置

先运行：

```bash
npm install
npm run dev
```

程序启动后，如果 `data/config.json` 不存在，会使用默认配置。你之后再手动创建或修改这个文件即可。

## 六、启动命令

```bash
npm install
npm run dev
```

启动后访问：

```text
http://localhost:3000
```

## 七、补充说明

- 当前提醒层没有完整实现，所以 `enableSound` / `enableEmail` 先保守设置为 `false` 更合适
- 如果你只是想先验证系统能跑起来，最简单的是先用“只监控加密货币”的配置
- 如果你要使用 A 股，记得先准备好 Tushare Token
