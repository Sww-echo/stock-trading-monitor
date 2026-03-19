# 需求文档 - 股票交易监控和提醒系统

## 简介

股票交易监控和提醒系统是一个基于双均线MA策略的实时监控工具，用于自动筛选可买入的股票、监控持仓、并在合适时机提醒用户买入或卖出。系统不执行自动交易，仅提供决策提醒。

适用标的：BTC, ETH, SOL等高流动性加密货币资产（可扩展到股票）
推荐周期：1H, 4H（中线交易）

## 术语表

- **System**: 股票交易监控和提醒系统
- **MA**: 简单移动平均线 (Simple Moving Average)
- **EMA**: 指数移动平均线 (Exponential Moving Average)
- **Market_Data_Provider**: 市场行情数据提供方（API服务）
- **Strategy_Engine**: 策略计算引擎，负责执行MA策略逻辑
- **Alert_Module**: 提醒模块，负责向用户发送买卖信号
- **Position_Monitor**: 持仓监控器，负责跟踪用户持仓状态
- **Consolidation_State**: 均线密集状态，6条均线缠绕在一起
- **Expansion_State**: 均线发散状态，均线呈有序排列
- **Breakout_Strategy**: 策略A - 均线密集突破开仓法
- **Pullback_Strategy**: 策略B - 趋势中首次回踩MA20
- **Risk_Calculator**: 风险计算器，负责仓位和止损止盈计算

## 需求

### 需求 1: 市场数据获取

**用户故事:** 作为交易者，我希望系统能实时获取市场行情数据，以便进行策略分析和监控。

#### 验收标准

1. THE System SHALL 支持从至少一个Market_Data_Provider获取实时行情数据
2. THE System SHALL 获取BTC、ETH、SOL的1H和4H周期K线数据
3. WHEN 请求行情数据时，THE System SHALL 在5秒内返回最新数据或错误信息
4. THE System SHALL 每个周期结束时自动更新K线数据
5. IF Market_Data_Provider返回错误，THEN THE System SHALL 记录错误日志并在3次重试后通知用户

### 需求 2: 移动平均线计算

**用户故事:** 作为交易者，我希望系统能准确计算6条移动平均线，以便识别市场状态。

#### 验收标准

1. THE Strategy_Engine SHALL 基于收盘价计算MA20、MA60、MA120
2. THE Strategy_Engine SHALL 基于收盘价计算EMA20、EMA60、EMA120
3. WHEN 新的K线数据到达时，THE Strategy_Engine SHALL 在1秒内更新所有6条均线数值
4. THE Strategy_Engine SHALL 保留至少120个周期的历史数据用于均线计算
5. FOR ALL 计算结果，THE System SHALL 保留至少4位小数精度

### 需求 3: 市场状态识别

**用户故事:** 作为交易者，我希望系统能自动识别均线密集和发散状态，以便判断市场趋势。

#### 验收标准

1. THE Strategy_Engine SHALL 计算6条均线当前数值的标准差
2. WHEN 标准差低于配置阈值时，THE Strategy_Engine SHALL 标记为Consolidation_State
3. WHEN 标准差高于配置阈值且均线呈有序排列时，THE Strategy_Engine SHALL 标记为Expansion_State
4. THE Strategy_Engine SHALL 识别多头排列（MA20 > MA60 > MA120且EMA20 > EMA60 > EMA120）
5. THE Strategy_Engine SHALL 识别空头排列（MA20 < MA60 < MA120且EMA20 < EMA60 < EMA120）
6. THE System SHALL 每个周期更新一次市场状态

### 需求 4: 策略A - 均线密集突破开仓法

**用户故事:** 作为交易者，我希望系统能识别均线密集突破信号，以便捕捉趋势启动点。

#### 验收标准

1. WHEN 市场处于Consolidation_State时，THE Breakout_Strategy SHALL 监控价格突破
2. WHEN 价格向上突破密集区后回踩但未跌破时，THE Breakout_Strategy SHALL 生成做多信号
3. WHEN 价格向下跌破密集区后反弹但未突破时，THE Breakout_Strategy SHALL 生成做空信号
4. THE Breakout_Strategy SHALL 确认收盘价位于密集区相应侧才触发信号
5. THE Breakout_Strategy SHALL 计算止损位为密集区的另一侧边界

### 需求 5: 策略B - 趋势中首次回踩MA20

**用户故事:** 作为交易者，我希望系统能识别趋势中继信号，以便在趋势中加仓或上车。

#### 验收标准

1. WHEN 市场处于Expansion_State时，THE Pullback_Strategy SHALL 监控价格回踩MA20
2. WHEN 上涨趋势中价格首次回踩MA20但未有效跌破时，THE Pullback_Strategy SHALL 生成做多信号
3. WHEN 下跌趋势中价格首次反弹触碰MA20但未有效突破时，THE Pullback_Strategy SHALL 生成做空信号
4. THE Pullback_Strategy SHALL 定义"有效跌破/突破"为收盘价穿越MA20
5. THE Pullback_Strategy SHALL 计算止损位为有效跌破或突破MA20的价格

### 需求 6: 开盘期间自动筛选

**用户故事:** 作为交易者，我希望系统在开盘期间自动筛选符合买入条件的股票，以便快速发现交易机会。

#### 验收标准

1. WHEN 市场开盘时，THE System SHALL 自动扫描配置的标的列表
2. THE System SHALL 对每个标的应用Breakout_Strategy和Pullback_Strategy
3. WHEN 发现符合买入条件的标的时，THE System SHALL 生成买入提醒列表
4. THE System SHALL 在扫描完成后5分钟内向用户展示筛选结果
5. THE System SHALL 按信号强度或优先级排序筛选结果

### 需求 7: 持仓实时监控

**用户故事:** 作为交易者，我希望系统能实时监控我的持仓股票，以便及时发现卖出时机。

#### 验收标准

1. THE Position_Monitor SHALL 允许用户手动添加持仓记录（标的、开仓价、开仓时间、策略类型）
2. THE Position_Monitor SHALL 每个周期更新持仓的当前价格和盈亏状态
3. THE Position_Monitor SHALL 根据开仓策略类型应用相应的止损逻辑
4. THE Position_Monitor SHALL 根据配置的止盈策略计算目标价位
5. THE Position_Monitor SHALL 显示每个持仓的实时盈亏百分比和金额

### 需求 8: 卖出信号提醒

**用户故事:** 作为交易者，我希望系统在触发卖出条件时提醒我，以便及时止损或止盈。

#### 验收标准

1. WHEN 持仓价格触及止损位时，THE Alert_Module SHALL 立即发送止损提醒
2. WHEN 持仓价格触及止盈位时，THE Alert_Module SHALL 立即发送止盈提醒
3. WHEN 持仓触发策略反转信号时，THE Alert_Module SHALL 发送趋势反转提醒
4. THE Alert_Module SHALL 在提醒中包含标的名称、当前价格、触发原因、建议操作
5. THE System SHALL 确保同一持仓的相同提醒在1小时内不重复发送

### 需求 9: 止损止盈计算

**用户故事:** 作为交易者，我希望系统能自动计算止损止盈位，以便进行风险管理。

#### 验收标准

1. THE Risk_Calculator SHALL 根据开仓策略类型计算止损价格
2. WHERE 用户选择固定盈亏比模式，THE Risk_Calculator SHALL 支持1:3和1:5两种比例
3. WHERE 用户选择前一密集区模式，THE Risk_Calculator SHALL 识别历史密集区作为目标位
4. WHERE 用户选择斐波那契扩展模式，THE Risk_Calculator SHALL 计算1.618、2.618、3.618、4.236位置
5. THE Risk_Calculator SHALL 在生成买入信号时同时提供止损止盈建议

### 需求 10: 仓位管理计算

**用户故事:** 作为交易者，我希望系统能根据风险控制原则计算建议仓位，以便控制单笔亏损。

#### 验收标准

1. THE Risk_Calculator SHALL 允许用户配置单笔最大亏损金额（账户的1%-2%或固定金额）
2. THE Risk_Calculator SHALL 使用公式计算开仓数量：最大亏损金额 / |开仓价格 - 止损价格|
3. WHEN 生成买入信号时，THE Risk_Calculator SHALL 提供建议开仓数量
4. THE Risk_Calculator SHALL 计算并显示建议仓位的实际杠杆倍数
5. IF 计算的实际杠杆超过3倍，THEN THE System SHALL 发出高风险警告

### 需求 11: 用户配置管理

**用户故事:** 作为交易者，我希望能配置系统参数，以便根据个人偏好调整策略。

#### 验收标准

1. THE System SHALL 允许用户配置监控的标的列表（BTC、ETH、SOL等）
2. THE System SHALL 允许用户配置监控周期（1H、4H）
3. THE System SHALL 允许用户配置均线密集判断阈值
4. THE System SHALL 允许用户配置止盈策略类型和参数
5. THE System SHALL 允许用户配置单笔最大亏损金额
6. THE System SHALL 允许用户配置提醒方式（界面通知、声音、邮件等）
7. THE System SHALL 在启动时加载配置，在用户修改后立即生效

### 需求 12: 提醒通知机制

**用户故事:** 作为交易者，我希望能通过多种方式接收提醒，以便不错过交易机会。

#### 验收标准

1. THE Alert_Module SHALL 支持界面弹窗通知
2. WHERE 用户启用声音提醒，THE Alert_Module SHALL 播放提示音
3. WHERE 用户配置邮件通知，THE Alert_Module SHALL 发送邮件提醒
4. THE Alert_Module SHALL 记录所有提醒历史供用户查看
5. THE Alert_Module SHALL 在提醒中明确标注信号类型（买入/卖出/止损/止盈）

### 需求 13: 历史数据管理

**用户故事:** 作为交易者，我希望系统能保存历史数据和交易记录，以便回顾和分析。

#### 验收标准

1. THE System SHALL 保存至少30天的K线历史数据
2. THE System SHALL 保存所有生成的买卖信号记录
3. THE System SHALL 保存用户的持仓历史和平仓记录
4. THE System SHALL 允许用户查询历史信号和持仓记录
5. THE System SHALL 在本地存储数据，无需外部数据库依赖

### 需求 14: 错误处理和容错

**用户故事:** 作为交易者，我希望系统在遇到错误时能稳定运行，以便不中断监控。

#### 验收标准

1. IF Market_Data_Provider连接失败，THEN THE System SHALL 使用缓存数据并每分钟重试连接
2. IF 计算过程出现异常，THEN THE System SHALL 记录错误日志并继续处理其他标的
3. THE System SHALL 在启动时验证配置文件的有效性
4. IF 配置文件无效，THEN THE System SHALL 使用默认配置并提示用户
5. THE System SHALL 在关键错误发生时通知用户但不退出程序

### 需求 15: 性能要求

**用户故事:** 作为交易者，我希望系统能快速响应，以便实时监控市场变化。

#### 验收标准

1. WHEN 监控10个标的时，THE System SHALL 在每个周期结束后30秒内完成所有计算和提醒
2. THE System SHALL 在用户查询持仓时1秒内返回结果
3. THE System SHALL 在系统启动后60秒内完成初始化并开始监控
4. THE System SHALL 占用内存不超过500MB
5. THE System SHALL 支持同时监控至少20个标的而不影响性能
