import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { ConfigManager } from './ConfigManager.js';
import { SystemConfig } from '../types/config.js';
import { TakeProfitMode } from '../types/risk.js';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let testConfigPath: string;
  let testDataDir: string;

  beforeEach(async () => {
    // 创建临时测试目录
    testDataDir = path.join('.', `test-data-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    testConfigPath = path.join(testDataDir, 'config.json');
    configManager = new ConfigManager(testConfigPath);

    // 确保测试目录存在
    await fs.mkdir(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // 清理测试文件
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('getDefault', () => {
    it('应该返回有效的默认配置', () => {
      const defaultConfig = configManager.getDefault();

      expect(defaultConfig.symbols).toEqual(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
      expect(defaultConfig.intervals).toEqual(['1h', '4h']);
      expect(defaultConfig.providers.binance?.enabled).toBe(true);
      expect(defaultConfig.consolidationThreshold).toBe(0.02);
      expect(defaultConfig.takeProfitMode).toBe(TakeProfitMode.FIXED_RATIO);
      expect(defaultConfig.takeProfitRatio).toBe(3);
      expect(defaultConfig.maxRiskPerTrade).toBe(100);
      expect(defaultConfig.maxLeverage).toBe(3);
      expect(defaultConfig.accountBalance).toBe(10000);
      expect(defaultConfig.enableSound).toBe(false);
      expect(defaultConfig.enableEmail).toBe(false);
      expect(defaultConfig.dataRetentionDays).toBe(30);
      expect(defaultConfig.updateInterval).toBe(60);
    });

    it('默认配置应该通过验证', () => {
      const defaultConfig = configManager.getDefault();
      expect(configManager.validate(defaultConfig)).toBe(true);
    });

    it('默认配置应该支持混合标的列表', () => {
      const defaultConfig = configManager.getDefault();
      // 虽然默认只有加密货币，但结构支持混合
      expect(Array.isArray(defaultConfig.symbols)).toBe(true);
    });
  });

  describe('validate', () => {
    it('应该验证有效的配置', () => {
      const validConfig = configManager.getDefault();
      expect(configManager.validate(validConfig)).toBe(true);
    });

    it('应该拒绝空的 symbols 数组', () => {
      const invalidConfig = { ...configManager.getDefault(), symbols: [] };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该拒绝非数组的 symbols', () => {
      const invalidConfig = { ...configManager.getDefault(), symbols: 'BTC/USDT' as any };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该拒绝空的 intervals 数组', () => {
      const invalidConfig = { ...configManager.getDefault(), intervals: [] };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该拒绝没有启用任何数据源的配置', () => {
      const invalidConfig = {
        ...configManager.getDefault(),
        providers: {
          binance: { enabled: false },
          okx: { enabled: false },
          tushare: { enabled: false, apiToken: '' },
          yahooFinance: { enabled: false }
        }
      };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该拒绝启用 Tushare 但没有 apiToken 的配置', () => {
      const invalidConfig = {
        ...configManager.getDefault(),
        providers: {
          ...configManager.getDefault().providers,
          tushare: { enabled: true, apiToken: '' }
        }
      };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该接受启用 Tushare 且有 apiToken 的配置', () => {
      const validConfig = {
        ...configManager.getDefault(),
        providers: {
          ...configManager.getDefault().providers,
          tushare: { enabled: true, apiToken: 'test-token-123' }
        }
      };
      expect(configManager.validate(validConfig)).toBe(true);
    });

    it('应该拒绝负数或零的 consolidationThreshold', () => {
      const invalidConfig1 = { ...configManager.getDefault(), consolidationThreshold: 0 };
      const invalidConfig2 = { ...configManager.getDefault(), consolidationThreshold: -0.01 };
      expect(configManager.validate(invalidConfig1)).toBe(false);
      expect(configManager.validate(invalidConfig2)).toBe(false);
    });

    it('应该拒绝无效的 takeProfitMode', () => {
      const invalidConfig = { ...configManager.getDefault(), takeProfitMode: 'invalid_mode' as any };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该接受所有有效的 takeProfitMode 值', () => {
      const modes = [
        TakeProfitMode.FIXED_RATIO,
        TakeProfitMode.PREVIOUS_CONSOLIDATION,
        TakeProfitMode.FIBONACCI
      ];

      for (const mode of modes) {
        const validConfig = { ...configManager.getDefault(), takeProfitMode: mode };
        expect(configManager.validate(validConfig)).toBe(true);
      }
    });

    it('应该拒绝负数或零的 takeProfitRatio', () => {
      const invalidConfig1 = { ...configManager.getDefault(), takeProfitRatio: 0 };
      const invalidConfig2 = { ...configManager.getDefault(), takeProfitRatio: -1 };
      expect(configManager.validate(invalidConfig1)).toBe(false);
      expect(configManager.validate(invalidConfig2)).toBe(false);
    });

    it('应该拒绝负数或零的 maxRiskPerTrade', () => {
      const invalidConfig1 = { ...configManager.getDefault(), maxRiskPerTrade: 0 };
      const invalidConfig2 = { ...configManager.getDefault(), maxRiskPerTrade: -100 };
      expect(configManager.validate(invalidConfig1)).toBe(false);
      expect(configManager.validate(invalidConfig2)).toBe(false);
    });

    it('应该拒绝负数或零的 maxLeverage', () => {
      const invalidConfig1 = { ...configManager.getDefault(), maxLeverage: 0 };
      const invalidConfig2 = { ...configManager.getDefault(), maxLeverage: -1 };
      expect(configManager.validate(invalidConfig1)).toBe(false);
      expect(configManager.validate(invalidConfig2)).toBe(false);
    });

    it('应该拒绝负数或零的 accountBalance', () => {
      const invalidConfig1 = { ...configManager.getDefault(), accountBalance: 0 };
      const invalidConfig2 = { ...configManager.getDefault(), accountBalance: -1000 };
      expect(configManager.validate(invalidConfig1)).toBe(false);
      expect(configManager.validate(invalidConfig2)).toBe(false);
    });

    it('应该拒绝非布尔值的 enableSound', () => {
      const invalidConfig = { ...configManager.getDefault(), enableSound: 'true' as any };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该拒绝非布尔值的 enableEmail', () => {
      const invalidConfig = { ...configManager.getDefault(), enableEmail: 1 as any };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该拒绝启用邮件但没有 emailAddress 的配置', () => {
      const invalidConfig = {
        ...configManager.getDefault(),
        enableEmail: true,
        emailAddress: undefined
      };
      expect(configManager.validate(invalidConfig)).toBe(false);
    });

    it('应该接受启用邮件且有 emailAddress 的配置', () => {
      const validConfig = {
        ...configManager.getDefault(),
        enableEmail: true,
        emailAddress: 'test@example.com'
      };
      expect(configManager.validate(validConfig)).toBe(true);
    });

    it('应该拒绝负数、零或非整数的 dataRetentionDays', () => {
      const invalidConfig1 = { ...configManager.getDefault(), dataRetentionDays: 0 };
      const invalidConfig2 = { ...configManager.getDefault(), dataRetentionDays: -1 };
      const invalidConfig3 = { ...configManager.getDefault(), dataRetentionDays: 30.5 };
      expect(configManager.validate(invalidConfig1)).toBe(false);
      expect(configManager.validate(invalidConfig2)).toBe(false);
      expect(configManager.validate(invalidConfig3)).toBe(false);
    });

    it('应该拒绝负数或零的 updateInterval', () => {
      const invalidConfig1 = { ...configManager.getDefault(), updateInterval: 0 };
      const invalidConfig2 = { ...configManager.getDefault(), updateInterval: -60 };
      expect(configManager.validate(invalidConfig1)).toBe(false);
      expect(configManager.validate(invalidConfig2)).toBe(false);
    });

    it('应该验证混合标的列表配置', () => {
      const mixedConfig = {
        ...configManager.getDefault(),
        symbols: ['BTC/USDT', '600519.SH', 'AAPL'],
        providers: {
          binance: { enabled: true },
          okx: { enabled: false },
          tushare: { enabled: true, apiToken: 'test-token' },
          yahooFinance: { enabled: true }
        }
      };
      expect(configManager.validate(mixedConfig)).toBe(true);
    });
  });

  describe('load', () => {
    it('应该在配置文件不存在时返回默认配置', async () => {
      const config = await configManager.load();
      const defaultConfig = configManager.getDefault();
      expect(config).toEqual(defaultConfig);
    });

    it('应该成功加载有效的配置文件', async () => {
      const testConfig: SystemConfig = {
        ...configManager.getDefault(),
        symbols: ['BTC/USDT', 'ETH/USDT'],
        maxRiskPerTrade: 200
      };

      await fs.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2), 'utf-8');

      const loadedConfig = await configManager.load();
      expect(loadedConfig.symbols).toEqual(['BTC/USDT', 'ETH/USDT']);
      expect(loadedConfig.maxRiskPerTrade).toBe(200);
    });

    it('应该在配置文件无效时返回默认配置', async () => {
      const invalidConfig = {
        symbols: [],  // 无效：空数组
        intervals: ['1h']
      };

      await fs.writeFile(testConfigPath, JSON.stringify(invalidConfig, null, 2), 'utf-8');

      const loadedConfig = await configManager.load();
      const defaultConfig = configManager.getDefault();
      expect(loadedConfig).toEqual(defaultConfig);
    });

    it('应该在配置文件格式错误时返回默认配置', async () => {
      await fs.writeFile(testConfigPath, 'invalid json content', 'utf-8');

      const loadedConfig = await configManager.load();
      const defaultConfig = configManager.getDefault();
      expect(loadedConfig).toEqual(defaultConfig);
    });

    it('应该加载包含多数据源配置的文件', async () => {
      const testConfig: SystemConfig = {
        ...configManager.getDefault(),
        providers: {
          binance: { enabled: true },
          okx: { enabled: true },
          tushare: { enabled: true, apiToken: 'my-token' },
          yahooFinance: { enabled: true }
        }
      };

      await fs.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2), 'utf-8');

      const loadedConfig = await configManager.load();
      expect(loadedConfig.providers.binance?.enabled).toBe(true);
      expect(loadedConfig.providers.okx?.enabled).toBe(true);
      expect(loadedConfig.providers.tushare?.enabled).toBe(true);
      expect(loadedConfig.providers.tushare?.apiToken).toBe('my-token');
      expect(loadedConfig.providers.yahooFinance?.enabled).toBe(true);
    });
  });

  describe('save', () => {
    it('应该成功保存有效的配置', async () => {
      const testConfig = configManager.getDefault();
      testConfig.maxRiskPerTrade = 150;

      await configManager.save(testConfig);

      // 验证文件已创建
      const fileContent = await fs.readFile(testConfigPath, 'utf-8');
      const savedConfig = JSON.parse(fileContent);
      expect(savedConfig.maxRiskPerTrade).toBe(150);
    });

    it('应该拒绝保存无效的配置', async () => {
      const invalidConfig = {
        ...configManager.getDefault(),
        symbols: []  // 无效
      };

      await expect(configManager.save(invalidConfig)).rejects.toThrow('配置验证失败');
    });

    it('应该在目录不存在时自动创建目录', async () => {
      const nestedPath = path.join(testDataDir, 'nested', 'dir', 'config.json');
      const nestedConfigManager = new ConfigManager(nestedPath);

      const testConfig = configManager.getDefault();
      await nestedConfigManager.save(testConfig);

      // 验证文件已创建
      const fileExists = await fs.access(nestedPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // 清理
      await fs.rm(path.join(testDataDir, 'nested'), { recursive: true, force: true });
    });

    it('应该保存包含所有数据源配置的文件', async () => {
      const testConfig: SystemConfig = {
        ...configManager.getDefault(),
        symbols: ['BTC/USDT', '600519.SH', 'AAPL'],
        providers: {
          binance: { enabled: true },
          okx: { enabled: false },
          tushare: { enabled: true, apiToken: 'test-token-abc' },
          yahooFinance: { enabled: true }
        }
      };

      await configManager.save(testConfig);

      const fileContent = await fs.readFile(testConfigPath, 'utf-8');
      const savedConfig = JSON.parse(fileContent);
      expect(savedConfig.symbols).toEqual(['BTC/USDT', '600519.SH', 'AAPL']);
      expect(savedConfig.providers.tushare.apiToken).toBe('test-token-abc');
    });

    it('保存后应该更新内部配置状态', async () => {
      const testConfig = configManager.getDefault();
      testConfig.maxRiskPerTrade = 250;

      await configManager.save(testConfig);

      const currentConfig = configManager.getConfig();
      expect(currentConfig.maxRiskPerTrade).toBe(250);
    });
  });

  describe('getConfig', () => {
    it('应该在配置未加载时抛出错误', () => {
      expect(() => configManager.getConfig()).toThrow('配置未加载');
    });

    it('应该在加载后返回当前配置', async () => {
      await configManager.load();
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.symbols).toBeDefined();
    });

    it('应该在保存后返回更新的配置', async () => {
      const testConfig = configManager.getDefault();
      testConfig.maxRiskPerTrade = 300;

      await configManager.save(testConfig);

      const config = configManager.getConfig();
      expect(config.maxRiskPerTrade).toBe(300);
    });
  });

  describe('集成测试', () => {
    it('应该完成完整的加载-修改-保存-重新加载流程', async () => {
      // 1. 首次加载（使用默认配置）
      const config1 = await configManager.load();
      expect(config1.maxRiskPerTrade).toBe(100);

      // 2. 修改并保存
      config1.maxRiskPerTrade = 200;
      config1.symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AAPL'];
      await configManager.save(config1);

      // 3. 创建新的 ConfigManager 实例并加载
      const configManager2 = new ConfigManager(testConfigPath);
      const config2 = await configManager2.load();

      // 4. 验证配置已持久化
      expect(config2.maxRiskPerTrade).toBe(200);
      expect(config2.symbols).toEqual(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AAPL']);
    });

    it('应该处理多数据源的完整配置流程', async () => {
      // 1. 加载默认配置
      const config = await configManager.load();

      // 2. 配置多个数据源
      config.symbols = ['BTC/USDT', '600519.SH', 'AAPL'];
      config.providers = {
        binance: { enabled: true },
        okx: { enabled: true },
        tushare: { enabled: true, apiToken: 'my-tushare-token' },
        yahooFinance: { enabled: true }
      };

      // 3. 保存配置
      await configManager.save(config);

      // 4. 重新加载并验证
      const configManager2 = new ConfigManager(testConfigPath);
      const reloadedConfig = await configManager2.load();

      expect(reloadedConfig.symbols).toEqual(['BTC/USDT', '600519.SH', 'AAPL']);
      expect(reloadedConfig.providers.binance?.enabled).toBe(true);
      expect(reloadedConfig.providers.okx?.enabled).toBe(true);
      expect(reloadedConfig.providers.tushare?.enabled).toBe(true);
      expect(reloadedConfig.providers.tushare?.apiToken).toBe('my-tushare-token');
      expect(reloadedConfig.providers.yahooFinance?.enabled).toBe(true);
    });
  });
});
