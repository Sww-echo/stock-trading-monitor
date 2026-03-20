import { createServer, Server } from 'http';
import path from 'path';
import { DataManager } from './data/DataManager.js';
import { BinanceProvider, OKXProvider, TushareProvider, YahooFinanceProvider } from './data/providers/index.js';
import { ConfigManager } from './config/ConfigManager.js';
import { PositionMonitor } from './monitoring/PositionMonitor.js';
import { SignalScanner } from './monitoring/SignalScanner.js';
import { MACalculator } from './strategy/MACalculator.js';
import { SystemConfig } from './types/config.js';
import { createApiServer } from './api/server.js';

export class Application {
  private readonly configManager: ConfigManager;
  private readonly dataManager: DataManager;
  private readonly positionMonitor: PositionMonitor;
  private signalScanner?: SignalScanner;
  private config?: SystemConfig;
  private server?: Server;
  private monitorTimer?: NodeJS.Timeout;
  private readonly port: number;
  private readonly host: string;
  private readonly apiKey?: string;

  constructor(options?: {
    configPath?: string;
    dataDir?: string;
    positionsDir?: string;
    signalsDir?: string;
    port?: number;
    host?: string;
    apiKey?: string;
  }) {
    this.configManager = new ConfigManager(options?.configPath ?? 'data/config.json');
    this.dataManager = new DataManager(options?.dataDir ?? 'data/klines');
    this.positionMonitor = new PositionMonitor(options?.positionsDir ?? 'data/positions');
    this.port = options?.port ?? 3000;
    this.host = options?.host ?? '0.0.0.0';
    this.apiKey = options?.apiKey ?? process.env.WATCH_API_KEY;

    if (options?.signalsDir) {
      this.signalScanner = new SignalScanner(this.dataManager, 0.02, path.resolve(process.cwd(), options.signalsDir));
    }
  }

  async initialize(): Promise<void> {
    this.config = await this.configManager.load();
    this.configureProviders(this.config);
    await this.positionMonitor.initialize();

    if (!this.signalScanner) {
      this.signalScanner = new SignalScanner(
        this.dataManager,
        this.config.consolidationThreshold,
        path.resolve(process.cwd(), 'data/signals')
      );
    }
  }

  async start(): Promise<void> {
    if (!this.config || !this.signalScanner) {
      throw new Error('Application not initialized');
    }

    const app = createApiServer({
      dataManager: this.dataManager,
      positionMonitor: this.positionMonitor,
      signalScanner: this.signalScanner,
      configManager: this.configManager,
      apiKey: this.apiKey,
      getConfig: () => {
        if (!this.config) {
          throw new Error('Config not loaded');
        }
        return this.config;
      },
      updateConfig: async (nextConfig: SystemConfig) => {
        if (!this.configManager.validate(nextConfig)) {
          throw new Error('配置无效');
        }
        await this.configManager.save(nextConfig);
        this.config = nextConfig;
        this.configureProviders(nextConfig);
        this.signalScanner?.stopScanning();
        this.signalScanner = new SignalScanner(
          this.dataManager,
          nextConfig.consolidationThreshold,
          path.resolve(process.cwd(), 'data/signals')
        );
        return nextConfig;
      },
    });

    await new Promise<void>((resolve) => {
      this.server = createServer(app);
      this.server.listen(this.port, this.host, () => resolve());
    });

    await this.runMonitoringCycle();
    this.monitorTimer = setInterval(() => {
      this.runMonitoringCycle().catch((error) => {
        console.error('Monitoring cycle failed:', error);
      });
    }, this.config.updateInterval * 1000);
  }

  async stop(): Promise<void> {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }

    this.signalScanner?.stopScanning();

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      this.server = undefined;
    }
  }

  private configureProviders(config: SystemConfig): void {
    const providers: Array<
      BinanceProvider | OKXProvider | TushareProvider | YahooFinanceProvider
    > = [];

    if (config.providers.binance?.enabled) {
      providers.push(new BinanceProvider());
    }

    if (config.providers.okx?.enabled) {
      providers.push(new OKXProvider());
    }

    if (config.providers.tushare?.enabled && config.providers.tushare.apiToken) {
      providers.push(new TushareProvider(config.providers.tushare.apiToken));
    }

    if (config.providers.yahooFinance?.enabled) {
      providers.push(new YahooFinanceProvider());
    }

    this.dataManager.setProviders(providers);
  }

  private async runMonitoringCycle(): Promise<void> {
    if (!this.config || !this.signalScanner) {
      return;
    }

    for (const interval of this.config.intervals) {
      const tradableSymbols = this.config.symbols.filter((symbol) => {
        try {
          return this.dataManager.isSymbolTradingTime(symbol);
        } catch {
          return true;
        }
      });

      await this.signalScanner.scanAllSymbols(tradableSymbols, interval);
    }

    await this.positionMonitor.updatePositions(
      async (symbol) => this.dataManager.getLatestPrice(symbol),
      async (symbol) => {
        if (!this.config) {
          return null;
        }
        const interval = this.config.intervals[0];
        if (!interval) {
          return null;
        }

        try {
          const klines = await this.dataManager.getKLines(symbol, interval, 120);
          const calculator = new MACalculator();
          return calculator.calculateAll(klines);
        } catch {
          return null;
        }
      }
    );
  }
}
