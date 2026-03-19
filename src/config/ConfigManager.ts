import { promises as fs } from 'fs';
import path from 'path';
import { SystemConfig } from '../types/config.js';
import { TakeProfitMode } from '../types/risk.js';

/**
 * 配置管理器
 * 负责加载、保存、验证系统配置
 */
export class ConfigManager {
  private config: SystemConfig | null = null;
  private configPath: string;

  constructor(configPath: string = 'data/config.json') {
    this.configPath = configPath;
  }

  /**
   * 加载配置
   * 如果配置文件不存在或无效，使用默认配置
   */
  async load(): Promise<SystemConfig> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const loadedConfig = JSON.parse(configData) as SystemConfig;
      
      if (this.validate(loadedConfig)) {
        this.config = loadedConfig;
        return this.config;
      } else {
        console.warn('配置文件无效，使用默认配置');
        this.config = this.getDefault();
        return this.config;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('配置文件不存在，使用默认配置');
      } else {
        console.error('加载配置文件失败:', error);
      }
      this.config = this.getDefault();
      return this.config;
    }
  }

  /**
   * 保存配置到文件
   */
  async save(config: SystemConfig): Promise<void> {
    if (!this.validate(config)) {
      throw new Error('配置验证失败，无法保存');
    }

    try {
      // 确保目录存在
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });

      // 保存配置
      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
      
      this.config = config;
    } catch (error) {
      throw new Error(`保存配置文件失败: ${error}`);
    }
  }

  /**
   * 验证配置有效性
   */
  validate(config: SystemConfig): boolean {
    try {
      // 验证必填字段
      if (!config.symbols || !Array.isArray(config.symbols) || config.symbols.length === 0) {
        console.error('配置验证失败: symbols 必须是非空数组');
        return false;
      }

      if (!config.intervals || !Array.isArray(config.intervals) || config.intervals.length === 0) {
        console.error('配置验证失败: intervals 必须是非空数组');
        return false;
      }

      // 验证数据源配置
      if (!config.providers || typeof config.providers !== 'object') {
        console.error('配置验证失败: providers 必须是对象');
        return false;
      }

      // 验证至少启用一个数据源
      const hasEnabledProvider = 
        (config.providers.binance?.enabled) ||
        (config.providers.okx?.enabled) ||
        (config.providers.tushare?.enabled) ||
        (config.providers.yahooFinance?.enabled);

      if (!hasEnabledProvider) {
        console.error('配置验证失败: 至少需要启用一个数据源');
        return false;
      }

      // 验证 Tushare 配置
      if (config.providers.tushare?.enabled && !config.providers.tushare.apiToken) {
        console.error('配置验证失败: Tushare 启用时必须提供 apiToken');
        return false;
      }

      // 验证数值范围
      if (typeof config.consolidationThreshold !== 'number' || 
          config.consolidationThreshold <= 0) {
        console.error('配置验证失败: consolidationThreshold 必须是正数');
        return false;
      }

      if (!Object.values(TakeProfitMode).includes(config.takeProfitMode)) {
        console.error('配置验证失败: takeProfitMode 无效');
        return false;
      }

      if (typeof config.takeProfitRatio !== 'number' || config.takeProfitRatio <= 0) {
        console.error('配置验证失败: takeProfitRatio 必须是正数');
        return false;
      }

      if (typeof config.maxRiskPerTrade !== 'number' || config.maxRiskPerTrade <= 0) {
        console.error('配置验证失败: maxRiskPerTrade 必须是正数');
        return false;
      }

      if (typeof config.maxLeverage !== 'number' || config.maxLeverage <= 0) {
        console.error('配置验证失败: maxLeverage 必须是正数');
        return false;
      }

      if (typeof config.accountBalance !== 'number' || config.accountBalance <= 0) {
        console.error('配置验证失败: accountBalance 必须是正数');
        return false;
      }

      if (typeof config.enableSound !== 'boolean') {
        console.error('配置验证失败: enableSound 必须是布尔值');
        return false;
      }

      if (typeof config.enableEmail !== 'boolean') {
        console.error('配置验证失败: enableEmail 必须是布尔值');
        return false;
      }

      if (config.enableEmail && !config.emailAddress) {
        console.error('配置验证失败: 启用邮件提醒时必须提供 emailAddress');
        return false;
      }

      if (typeof config.dataRetentionDays !== 'number' || 
          config.dataRetentionDays <= 0 || 
          !Number.isInteger(config.dataRetentionDays)) {
        console.error('配置验证失败: dataRetentionDays 必须是正整数');
        return false;
      }

      if (typeof config.updateInterval !== 'number' || config.updateInterval <= 0) {
        console.error('配置验证失败: updateInterval 必须是正数');
        return false;
      }

      return true;
    } catch (error) {
      console.error('配置验证过程中发生错误:', error);
      return false;
    }
  }

  /**
   * 获取默认配置
   */
  getDefault(): SystemConfig {
    return {
      // 监控配置 - 默认监控 BTC、ETH、SOL
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      intervals: ['1h', '4h'],
      
      // 数据源配置 - 默认启用 Binance
      providers: {
        binance: { enabled: true },
        okx: { enabled: false },
        tushare: { enabled: false, apiToken: '' },
        yahooFinance: { enabled: false }
      },
      
      // 策略配置
      consolidationThreshold: 0.02,        // 2% 标准差阈值
      takeProfitMode: TakeProfitMode.FIXED_RATIO,
      takeProfitRatio: 3,                  // 1:3 盈亏比
      
      // 风险配置
      maxRiskPerTrade: 100,                // 单笔最大亏损 100 USDT
      maxLeverage: 3,                      // 最大 3 倍杠杆
      accountBalance: 10000,               // 默认账户余额 10000 USDT
      
      // 提醒配置
      enableSound: false,
      enableEmail: false,
      emailAddress: undefined,
      
      // 数据配置
      dataRetentionDays: 30,               // 保留 30 天数据
      updateInterval: 60                   // 每 60 秒更新一次
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): SystemConfig {
    if (!this.config) {
      throw new Error('配置未加载，请先调用 load() 方法');
    }
    return this.config;
  }
}
