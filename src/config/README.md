# 配置管理模块

## 概述

配置管理模块负责系统配置的加载、保存、验证和管理。支持多数据源配置（Binance、OKX、Tushare、Yahoo Finance），以及混合标的列表（加密货币、A股、美股）。

## 核心类

### ConfigManager

配置管理器，提供配置的完整生命周期管理。

#### 主要方法

- `load()`: 从文件加载配置，如果文件不存在或无效则使用默认配置
- `save(config)`: 保存配置到文件，保存前会进行验证
- `validate(config)`: 验证配置的有效性
- `getDefault()`: 获取默认配置
- `getConfig()`: 获取当前加载的配置

## 配置项说明

### 监控配置

- `symbols`: 监控标的列表，支持混合配置
  - 加密货币格式: `"BTC/USDT"`, `"ETH/USDT"`
  - A股格式: `"600519.SH"`, `"000001.SZ"`
  - 美股格式: `"AAPL"`, `"TSLA"`
- `intervals`: 监控周期，如 `["1h", "4h"]`

### 数据源配置

- `providers.binance`: Binance 配置
  - `enabled`: 是否启用
- `providers.okx`: OKX 配置
  - `enabled`: 是否启用
- `providers.tushare`: Tushare 配置（A股）
  - `enabled`: 是否启用
  - `apiToken`: API Token（启用时必填）
- `providers.yahooFinance`: Yahoo Finance 配置（美股）
  - `enabled`: 是否启用

**注意**: 至少需要启用一个数据源

### 策略配置

- `consolidationThreshold`: 均线密集判断阈值（标准差），默认 0.02
- `takeProfitMode`: 止盈模式
  - `fixed_ratio`: 固定盈亏比
  - `prev_consol`: 前一密集区
  - `fibonacci`: 斐波那契扩展
- `takeProfitRatio`: 盈亏比，默认 3（1:3）

### 风险配置

- `maxRiskPerTrade`: 单笔最大亏损金额，默认 100 USDT
- `maxLeverage`: 最大杠杆倍数，默认 3
- `accountBalance`: 账户余额，默认 10000 USDT

### 提醒配置

- `enableSound`: 是否启用声音提醒，默认 false
- `enableEmail`: 是否启用邮件提醒，默认 false
- `emailAddress`: 邮件地址（启用邮件提醒时必填）

### 数据配置

- `dataRetentionDays`: 数据保留天数，默认 30
- `updateInterval`: 更新间隔（秒），默认 60

## 使用示例

### 基本使用

```typescript
import { ConfigManager } from './config/ConfigManager.js';

const configManager = new ConfigManager('data/config.json');

// 加载配置
const config = await configManager.load();

// 修改配置
config.maxRiskPerTrade = 200;

// 保存配置
await configManager.save(config);
```

### 配置多数据源

```typescript
const config = await configManager.load();

// 配置多个数据源以支持混合标的
config.symbols = ['BTC/USDT', '600519.SH', 'AAPL'];
config.providers = {
  binance: { enabled: true },           // 加密货币
  okx: { enabled: true },               // 加密货币
  tushare: { 
    enabled: true, 
    apiToken: 'your-token'              // A股
  },
  yahooFinance: { enabled: true }       // 美股
};

await configManager.save(config);
```

### 验证配置

```typescript
const config = configManager.getDefault();
config.symbols = ['BTC/USDT', 'ETH/USDT'];

if (configManager.validate(config)) {
  await configManager.save(config);
} else {
  console.error('配置无效');
}
```

## 配置文件格式

配置文件使用 JSON 格式，示例：

```json
{
  "symbols": ["BTC/USDT", "ETH/USDT", "600519.SH", "AAPL"],
  "intervals": ["1h", "4h"],
  "providers": {
    "binance": { "enabled": true },
    "okx": { "enabled": false },
    "tushare": { "enabled": true, "apiToken": "your-token" },
    "yahooFinance": { "enabled": true }
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

## 验证规则

ConfigManager 会验证以下规则：

1. `symbols` 必须是非空数组
2. `intervals` 必须是非空数组
3. 至少启用一个数据源
4. 启用 Tushare 时必须提供 `apiToken`
5. 所有数值配置必须为正数
6. `dataRetentionDays` 必须为正整数
7. `takeProfitMode` 必须是有效的枚举值
8. 启用邮件提醒时必须提供 `emailAddress`
9. 布尔值配置必须是 boolean 类型

## 错误处理

- 配置文件不存在：自动使用默认配置
- 配置文件格式错误：自动使用默认配置并输出警告
- 配置验证失败：拒绝保存并抛出错误
- 保存失败：抛出错误并保留原配置

## 测试

运行测试：

```bash
npm test -- ConfigManager.test.ts
```

测试覆盖：
- 默认配置生成和验证
- 配置加载（正常、文件不存在、格式错误、验证失败）
- 配置保存（正常、验证失败、目录自动创建）
- 配置验证（所有字段的有效性检查）
- 多数据源配置
- 混合标的列表配置
- 完整的配置生命周期

## 相关文件

- `ConfigManager.ts`: 配置管理器实现
- `ConfigManager.test.ts`: 单元测试
- `ConfigManager.example.ts`: 使用示例
- `../types/config.ts`: 配置类型定义
- `../../data/config.example.json`: 配置文件示例
