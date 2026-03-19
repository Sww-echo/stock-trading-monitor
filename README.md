# 股票交易监控和提醒系统

基于双均线MA策略的实时监控工具，支持虚拟货币（BTC/ETH/SOL）和股票（A股/美股）的中线交易监控。

## 功能特性

- 实时市场数据获取（支持 Binance、OKX、Tushare、Yahoo Finance）
- 6条移动平均线计算（MA20/60/120 和 EMA20/60/120）
- 两种开仓策略：均线密集突破和趋势回踩MA20
- 持仓监控和风险管理
- 多渠道提醒通知（控制台、声音、邮件）

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建
npm run build

# 运行测试
npm test
```

## 配置

系统配置文件位于 `data/config.json`，首次运行会自动生成默认配置。

## 目录结构

```
src/
├── types/          # 核心类型定义
├── data/           # 数据层（数据获取和管理）
├── strategy/       # 策略层（MA计算和策略引擎）
├── monitoring/     # 监控层（持仓监控和信号扫描）
├── alert/          # 提醒层（通知模块）
└── api/            # API层（REST API和Web界面）
```
