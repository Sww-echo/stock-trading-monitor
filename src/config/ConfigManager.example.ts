/**
 * ConfigManager 使用示例
 */

import { ConfigManager } from './ConfigManager.js';
import { TakeProfitMode } from '../types/risk.js';

async function main() {
  // 创建 ConfigManager 实例
  const configManager = new ConfigManager('data/config.json');

  console.log('=== ConfigManager 使用示例 ===\n');

  // 1. 加载配置（如果文件不存在，将使用默认配置）
  console.log('1. 加载配置...');
  const config = await configManager.load();
  console.log('当前配置:', JSON.stringify(config, null, 2));
  console.log();

  // 2. 修改配置
  console.log('2. 修改配置...');
  config.symbols = ['BTC/USDT', 'ETH/USDT', '600519.SH', 'AAPL'];
  config.maxRiskPerTrade = 200;
  config.takeProfitMode = TakeProfitMode.FIBONACCI;
  config.takeProfitRatio = 5;

  // 启用多个数据源
  config.providers = {
    binance: { enabled: true },
    okx: { enabled: true },
    tushare: { enabled: true, apiToken: 'your-tushare-token-here' },
    yahooFinance: { enabled: true }
  };

  console.log('修改后的配置:', JSON.stringify(config, null, 2));
  console.log();

  // 3. 保存配置
  console.log('3. 保存配置到文件...');
  await configManager.save(config);
  console.log('配置已保存到 data/config.json');
  console.log();

  // 4. 获取当前配置
  console.log('4. 获取当前配置...');
  const currentConfig = configManager.getConfig();
  console.log('当前配置的标的列表:', currentConfig.symbols);
  console.log('当前配置的最大风险:', currentConfig.maxRiskPerTrade);
  console.log();

  // 5. 验证配置
  console.log('5. 验证配置...');
  const isValid = configManager.validate(config);
  console.log('配置是否有效:', isValid);
  console.log();

  // 6. 获取默认配置
  console.log('6. 获取默认配置...');
  const defaultConfig = configManager.getDefault();
  console.log('默认配置:', JSON.stringify(defaultConfig, null, 2));
  console.log();

  // 7. 验证无效配置
  console.log('7. 测试无效配置验证...');
  const invalidConfig = { ...config, symbols: [] };
  const isInvalid = configManager.validate(invalidConfig);
  console.log('空标的列表配置是否有效:', isInvalid);
  console.log();

  console.log('=== 示例完成 ===');
}

// 运行示例
main().catch(console.error);
