import { ConfigManager } from '../config/ConfigManager.js';
import { DataManager } from '../data/DataManager.js';
import { BinanceProvider, OKXProvider, TushareProvider, YahooFinanceProvider } from '../data/providers/index.js';
import { PositionMonitor } from '../monitoring/PositionMonitor.js';
import { SignalScanner } from '../monitoring/SignalScanner.js';
import { WatchSummaryService } from '../services/WatchSummaryService.js';
import { SystemConfig } from '../types/config.js';

function registerProviders(dataManager: DataManager, config: SystemConfig): void {
  if (config.providers.binance?.enabled) {
    dataManager.registerProvider(new BinanceProvider());
  }

  if (config.providers.okx?.enabled) {
    dataManager.registerProvider(new OKXProvider());
  }

  if (config.providers.tushare?.enabled && config.providers.tushare.apiToken) {
    dataManager.registerProvider(new TushareProvider(config.providers.tushare.apiToken));
  }

  if (config.providers.yahooFinance?.enabled) {
    dataManager.registerProvider(new YahooFinanceProvider());
  }
}

async function main(): Promise<void> {
  const configManager = new ConfigManager('data/config.json');
  const config = await configManager.load();
  const dataManager = new DataManager('data/klines');
  registerProviders(dataManager, config);

  const positionMonitor = new PositionMonitor('data/positions');
  await positionMonitor.initialize();

  const signalScanner = new SignalScanner(
    dataManager,
    config.consolidationThreshold,
    'data/signals'
  );

  const service = new WatchSummaryService({
    dataManager,
    signalScanner,
    positionMonitor,
  });

  const summary = await service.build(config);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error('watch-summary 执行失败:', error);
  process.exit(1);
});
