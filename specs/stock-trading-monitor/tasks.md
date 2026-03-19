# 实施计划：股票交易监控和提醒系统

## 概述

本实施计划将股票交易监控和提醒系统的设计转化为可执行的编码任务。系统采用 TypeScript/Node.js 实现，基于双均线 MA 策略进行实时监控和提醒。实施将按照从底层数据层到上层应用层的顺序进行，确保每个步骤都能独立验证和测试。

## 任务列表

- [x] 1. 搭建项目基础结构和核心类型定义
  - 创建 TypeScript 项目结构（src/types, src/data, src/strategy, src/monitoring, src/alert, src/api）
  - 定义核心接口和类型（KLineData, MAResult, MarketState, TradingSignal, Position 等）
  - 配置 TypeScript 编译选项和测试框架
  - 创建 data/ 目录结构用于本地文件存储
  - _需求: 13.5, 15.3_


- [x] 2. 实现数据层 - Market Data Provider 和 Data Manager
  - [x] 2.1 实现 MarketDataProvider 接口和枚举类型
    - 定义 MarketType 枚举（CRYPTO, STOCK_CN, STOCK_US）
    - 定义 MarketDataProvider 接口（fetchKLines, fetchLatestPrice, isTradingTime）
    - _需求: 1.1_
  
  - [x] 2.2 实现 BinanceProvider（虚拟货币 - Binance）
    - 实现 fetchKLines 方法（调用 Binance API）
    - 实现 fetchLatestPrice 方法
    - 实现 isTradingTime 方法（始终返回 true）
    - 添加错误处理和重试逻辑（3次重试）
    - _需求: 1.1, 1.3, 1.5_
  
  - [x] 2.3 实现 OKXProvider（虚拟货币 - OKX）
    - 实现 fetchKLines 方法（调用 OKX API）
    - 实现 fetchLatestPrice 方法
    - 实现 isTradingTime 方法（始终返回 true）
    - 添加错误处理和重试逻辑（3次重试）
    - _需求: 1.1, 1.3, 1.5_
  
  - [x] 2.4 实现 TushareProvider（A股 - Tushare）
    - 实现 fetchKLines 方法（调用 Tushare API，需要 API Token）
    - 实现 fetchLatestPrice 方法
    - 实现 isTradingTime 方法（检查是否在 9:30-15:00 交易时间）
    - 处理 A股标的格式（如 600519.SH）
    - 添加错误处理和重试逻辑（3次重试）
    - _需求: 1.1, 1.3, 1.5_
  
  - [x] 2.5 实现 YahooFinanceProvider（美股 - Yahoo Finance）
    - 实现 fetchKLines 方法（调用 Yahoo Finance API）
    - 实现 fetchLatestPrice 方法
    - 实现 isTradingTime 方法（检查是否在 9:30-16:00 ET 交易时间）
    - 处理美股标的格式（如 AAPL）
    - 添加错误处理和重试逻辑（3次重试）
    - _需求: 1.1, 1.3, 1.5_
  
  - [ ]* 2.6 为所有 MarketDataProvider 编写单元测试
    - 测试 BinanceProvider 数据获取流程
    - 测试 OKXProvider 数据获取流程
    - 测试 TushareProvider 数据获取和交易时间判断
    - 测试 YahooFinanceProvider 数据获取和交易时间判断
    - 测试错误处理和重试机制
    - 测试超时场景
    - _需求: 1.3, 1.5_
  
  - [x] 2.7 实现 DataManager 类（支持多数据源）
    - 实现 registerProvider 方法（注册多个数据提供者）
    - 实现 selectProvider 方法（根据标的符号自动选择提供者）
    - 实现内存缓存机制（Map 结构）
    - 实现 getKLines 方法（优先从缓存读取）
    - 实现 updateKLines 方法（自动更新数据）
    - 实现 saveToFile 和 loadFromFile 方法（按市场类型分类存储）
    - _需求: 1.2, 1.4, 13.1_
  
  - [ ]* 2.8 为 DataManager 编写单元测试
    - 测试多数据源注册和自动选择
    - 测试缓存读写逻辑
    - 测试文件持久化和加载（crypto/ 和 stock/ 目录）
    - 测试数据更新机制
    - _需求: 13.1, 13.5_

- [x] 3. 实现策略层 - MA Calculator 和 Market State Detector
  - [x] 3.1 实现 MACalculator 类
    - 实现 calculateSMA 方法（简单移动平均线）
    - 实现 calculateEMA 方法（指数移动平均线）
    - 实现 calculateAll 方法（计算所有6条均线）
    - 实现 calculateHistory 方法（批量计算历史均线）
    - _需求: 2.1, 2.2, 2.3, 2.5_
  
  - [ ]* 3.2 为 MACalculator 编写属性测试
    - **属性 1: MA 计算精度 - 所有计算结果保留至少4位小数**
    - **验证需求: 2.5**
  
  - [ ]* 3.3 为 MACalculator 编写单元测试
    - 测试 SMA 和 EMA 计算准确性
    - 测试边界条件（数据不足120个周期）
    - 测试性能（1秒内完成计算）
    - _需求: 2.3, 2.4_
  
  - [x] 3.4 实现 MarketStateDetector 类
    - 实现 detectState 方法（识别密集/发散状态）
    - 实现 calculateStdDev 方法（计算标准差）
    - 实现 isBullishAlignment 方法（检查多头排列）
    - 实现 isBearishAlignment 方法（检查空头排列）
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ]* 3.5 为 MarketStateDetector 编写单元测试
    - 测试密集状态识别
    - 测试多头/空头排列识别
    - 测试边界阈值判断
    - _需求: 3.2, 3.3, 3.6_

- [x] 4. 检查点 - 确保数据层和基础策略层测试通过
  - 确保所有测试通过，如有问题请询问用户


- [-] 5. 实现策略引擎 - Breakout Strategy 和 Pullback Strategy
  - [x] 5.1 实现 BreakoutStrategy 类（策略A）
    - 实现 detectSignal 方法（检测突破信号）
    - 实现 isInConsolidation 方法（检查密集状态）
    - 实现 detectBullishBreakout 方法（向上突破）
    - 实现 detectBearishBreakout 方法（向下突破）
    - 实现 calculateConsolidationBounds 方法（计算密集区边界）
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ]* 5.2 为 BreakoutStrategy 编写属性测试
    - **属性 2: 突破信号一致性 - 只在密集状态下生成突破信号**
    - **验证需求: 4.1, 4.4**
  
  - [ ]* 5.3 为 BreakoutStrategy 编写单元测试
    - 测试向上突破回踩场景
    - 测试向下突破反弹场景
    - 测试止损位计算准确性
    - _需求: 4.2, 4.3, 4.5_
  
  - [x] 5.4 实现 PullbackStrategy 类（策略B）
    - 实现 detectSignal 方法（检测回踩信号）
    - 实现 detectBullishPullback 方法（上涨趋势回踩）
    - 实现 detectBearishPullback 方法（下跌趋势反弹）
    - 实现 isFirstPullback 方法（检查是否首次回踩）
    - 实现 isEffectiveBreak 方法（检查有效跌破/突破）
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 5.5 为 PullbackStrategy 编写属性测试
    - **属性 3: 回踩信号一致性 - 只在发散状态下生成回踩信号**
    - **验证需求: 5.1**
  
  - [ ]* 5.6 为 PullbackStrategy 编写单元测试
    - 测试首次回踩识别
    - 测试有效跌破判断
    - 测试止损位计算
    - _需求: 5.2, 5.3, 5.4, 5.5_
  
  - [x] 5.7 实现 StrategyEngine 类
    - 实现 analyze 方法（分析单个标的）
    - 实现 scanSymbols 方法（批量扫描标的）
    - 集成 BreakoutStrategy 和 PullbackStrategy
    - _需求: 6.1, 6.2, 6.3_
  
  - [ ]* 5.8 为 StrategyEngine 编写集成测试
    - 测试多标的扫描功能
    - 测试信号优先级排序
    - 测试扫描性能（5分钟内完成）
    - _需求: 6.4, 6.5, 15.1_

- [x] 6. 实现风险管理 - Risk Calculator
  - [x] 6.1 实现 RiskCalculator 类
    - 实现 calculate 方法（计算风险参数）
    - 实现 calculateStopLoss 方法（计算止损位）
    - 实现 calculateTakeProfit 方法（计算止盈位，支持3种模式）
    - 实现 calculatePositionSize 方法（计算仓位大小）
    - 实现 calculateLeverage 方法（计算实际杠杆）
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ]* 6.2 为 RiskCalculator 编写属性测试
    - **属性 4: 仓位计算一致性 - 计算的仓位确保最大亏损不超过配置值**
    - **验证需求: 10.1, 10.2**
  
  - [ ]* 6.3 为 RiskCalculator 编写单元测试
    - 测试固定盈亏比模式（1:3, 1:5）
    - 测试前一密集区模式
    - 测试斐波那契扩展模式
    - 测试高杠杆警告（>3倍）
    - _需求: 9.2, 9.3, 9.4, 10.5_

- [x] 7. 检查点 - 确保策略引擎和风险管理测试通过
  - 确保所有测试通过，如有问题请询问用户


- [x] 8. 实现监控层 - Position Monitor 和 Signal Scanner
  - [x] 8.1 实现 Position 数据模型和文件存储
    - 定义 Position 和 PositionStatus 接口
    - 实现持仓数据的 JSON 文件读写
    - 实现 open.json 和 history.json 管理
    - _需求: 7.1, 13.3_
  
  - [x] 8.2 实现 PositionMonitor 类
    - 实现 addPosition 方法（添加持仓）
    - 实现 updatePositions 方法（更新所有持仓状态）
    - 实现 checkPosition 方法（检查单个持仓）
    - 实现 closePosition 方法（关闭持仓）
    - 实现 getAllPositions 方法（获取所有持仓）
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ]* 8.3 为 PositionMonitor 编写属性测试
    - **属性 5: 持仓状态一致性 - 持仓盈亏计算准确反映当前价格变化**
    - **验证需求: 7.2, 7.5**
  
  - [ ]* 8.4 为 PositionMonitor 编写单元测试
    - 测试持仓添加和查询
    - 测试盈亏计算准确性
    - 测试止损止盈触发判断
    - 测试持仓关闭和历史记录
    - _需求: 7.1, 7.2, 7.3, 7.5_
  
  - [x] 8.5 实现 SignalScanner 类
    - 实现定时扫描逻辑（基于配置的更新间隔）
    - 集成 StrategyEngine 进行标的扫描
    - 实现信号历史记录（按月存储 JSON 文件）
    - _需求: 6.1, 6.2, 6.4, 13.2_
  
  - [ ]* 8.6 为 SignalScanner 编写单元测试
    - 测试定时扫描触发
    - 测试信号历史记录
    - 测试多标的并发扫描
    - _需求: 6.4, 13.2, 15.1_

- [ ] 9. 实现提醒层 - Alert Module 和通知渠道
  - [ ] 9.1 实现 Alert 数据模型和 NotificationChannel 接口
    - 定义 Alert 和 AlertType 接口
    - 定义 NotificationChannel 接口
    - 实现提醒历史的 JSON 文件存储（按月）
    - _需求: 12.4, 13.2_
  
  - [ ] 9.2 实现 AlertModule 类
    - 实现 createAlert 方法（创建提醒）
    - 实现 sendAlert 方法（发送提醒到所有启用的渠道）
    - 实现 isDuplicate 方法（防止1小时内重复提醒）
    - 实现 getAlertHistory 方法（查询提醒历史）
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5, 12.4_
  
  - [ ]* 9.3 为 AlertModule 编写属性测试
    - **属性 6: 提醒去重一致性 - 同一持仓的相同提醒在1小时内不重复发送**
    - **验证需求: 8.5**
  
  - [ ] 9.4 实现 ConsoleNotificationChannel（控制台通知）
    - 实现 send 方法输出到控制台
    - 格式化提醒消息
    - _需求: 12.1, 12.5_
  
  - [ ] 9.5 实现 SoundNotificationChannel（声音提醒）
    - 实现 send 方法播放提示音
    - 支持启用/禁用配置
    - _需求: 12.2_
  
  - [ ] 9.6 实现 EmailNotificationChannel（邮件通知）
    - 使用 nodemailer 发送邮件
    - 实现邮件模板格式化
    - 支持启用/禁用和邮箱配置
    - _需求: 12.3_
  
  - [ ]* 9.7 为通知渠道编写单元测试
    - 测试控制台通知输出
    - 测试声音提醒触发
    - 测试邮件发送（使用 mock）
    - _需求: 12.1, 12.2, 12.3_

- [ ] 10. 检查点 - 确保监控层和提醒层测试通过
  - 确保所有测试通过，如有问题请询问用户


- [x] 11. 实现配置管理 - Configuration Manager
  - [x] 11.1 实现 SystemConfig 接口和 ConfigManager 类
    - 定义 SystemConfig 接口（包含所有配置项，包括多数据源配置）
    - 实现 load 方法（从 config.json 加载配置）
    - 实现 save 方法（保存配置到文件）
    - 实现 validate 方法（验证配置有效性，包括数据源配置）
    - 实现 getDefault 方法（返回默认配置，包含所有数据源的默认设置）
    - 支持混合标的列表配置（如 ["BTC/USDT", "600519.SH", "AAPL"]）
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 14.3, 14.4_
  
  - [ ]* 11.2 为 ConfigManager 编写单元测试
    - 测试配置加载和保存
    - 测试配置验证逻辑
    - 测试默认配置生成
    - 测试无效配置处理
    - _需求: 14.3, 14.4_

- [ ] 12. 实现主应用逻辑 - Application Core
  - [ ] 12.1 实现 Application 类（主应用入口）
    - 实现 initialize 方法（初始化所有模块，注册所有数据提供者）
    - 实现 start 方法（启动监控循环，支持股票交易时间判断）
    - 实现 stop 方法（优雅停止）
    - 集成 DataManager（支持多数据源）, StrategyEngine, PositionMonitor, AlertModule
    - 实现定时更新逻辑（基于配置的更新间隔）
    - 实现股票开盘时间检测（仅在交易时间扫描股票标的）
    - _需求: 1.4, 6.1, 7.2, 11.7, 15.3_
  
  - [ ] 12.2 实现错误处理和容错机制
    - 实现 API 连接失败重试逻辑（每分钟重试）
    - 实现计算异常捕获和日志记录
    - 实现关键错误通知机制
    - 确保单个标的错误不影响其他标的处理
    - _需求: 14.1, 14.2, 14.5_
  
  - [ ]* 12.3 为 Application 编写集成测试
    - 测试完整的初始化流程
    - 测试监控循环执行
    - 测试错误恢复机制
    - 测试优雅停止
    - _需求: 14.1, 14.2, 14.5, 15.3_

- [ ] 13. 实现 REST API 和 Web Dashboard
  - [ ] 13.1 使用 Express.js 实现 REST API
    - 实现 GET /api/positions（获取所有持仓）
    - 实现 POST /api/positions（添加持仓）
    - 实现 DELETE /api/positions/:id（关闭持仓）
    - 实现 GET /api/signals（获取信号历史）
    - 实现 GET /api/alerts（获取提醒历史）
    - 实现 GET /api/config（获取配置）
    - 实现 PUT /api/config（更新配置）
    - 实现 GET /api/market/:symbol（获取实时行情和均线数据）
    - _需求: 7.1, 11.7, 13.4, 15.2_
  
  - [ ] 13.2 实现简单的 Web Dashboard 前端
    - 创建 HTML/CSS/JavaScript 页面
    - 实现实时行情展示（标的、价格、均线、市场状态）
    - 实现持仓列表展示（标的、开仓价、当前价、盈亏）
    - 实现信号列表展示（时间、标的、类型、价格）
    - 实现提醒历史展示
    - 实现配置编辑界面
    - 实现添加/关闭持仓功能
    - _需求: 6.5, 7.5, 11.7, 13.4_
  
  - [ ]* 13.3 为 REST API 编写集成测试
    - 测试所有 API 端点
    - 测试错误处理和状态码
    - 测试并发请求处理
    - _需求: 15.2_

- [ ] 14. 性能优化和最终集成
  - [ ] 14.1 实现性能优化
    - 优化内存缓存策略（只保留必要的120个周期数据）
    - 实现数据清理机制（删除超过30天的历史数据）
    - 优化批量扫描性能（并发处理多个标的）
    - _需求: 13.1, 15.1, 15.4_
  
  - [ ] 14.2 集成所有模块并测试完整流程
    - 将所有模块连接到 Application 主类
    - 测试从数据获取到信号生成到提醒发送的完整流程
    - 测试持仓监控和卖出提醒的完整流程
    - 验证配置修改立即生效
    - _需求: 11.7, 15.1_
  
  - [ ]* 14.3 进行端到端性能测试
    - 测试监控10个标的的响应时间（<30秒）
    - 测试监控20个标的的性能和内存占用（<500MB）
    - 测试启动时间（<60秒）
    - 测试查询响应时间（<1秒）
    - _需求: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 15. 最终检查点 - 确保所有测试通过并准备交付
  - 确保所有测试通过，验证系统满足所有需求，如有问题请询问用户

## 注意事项

- 标记 `*` 的任务为可选任务，可以跳过以加快 MVP 开发
- 每个任务都引用了具体的需求编号，确保可追溯性
- 检查点任务确保增量验证，及时发现问题
- 属性测试用于验证通用正确性属性
- 单元测试用于验证具体示例和边界情况
- 集成测试用于验证模块间协作和端到端流程
