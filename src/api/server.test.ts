import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { createApiServer } from './server.js';
import { SignalType } from '../types/strategy.js';
import { TakeProfitMode } from '../types/risk.js';
import { SystemConfig } from '../types/config.js';

const baseConfig: SystemConfig = {
  symbols: ['BTC/USDT'],
  intervals: ['1h'],
  providers: {
    binance: { enabled: true },
    okx: { enabled: false },
    tushare: { enabled: false, apiToken: '' },
    yahooFinance: { enabled: false },
  },
  consolidationThreshold: 0.02,
  takeProfitMode: TakeProfitMode.FIXED_RATIO,
  takeProfitRatio: 3,
  maxRiskPerTrade: 100,
  maxLeverage: 3,
  accountBalance: 10000,
  enableSound: true,
  enableEmail: false,
  emailAddress: undefined,
  dataRetentionDays: 30,
  updateInterval: 60,
};

function createDeps() {
  return {
    dataManager: {
      getLatestPrice: vi.fn(async () => 42000),
      getKLines: vi.fn(async () => []),
    },
    positionMonitor: {
      getAllPositions: vi.fn(() => []),
      getPosition: vi.fn(() => undefined),
      addPosition: vi.fn(),
      closePosition: vi.fn(async () => undefined),
      updatePositions: vi.fn(async () => []),
    },
    signalScanner: {
      getSignalHistory: vi.fn(async () => []),
      scanSymbol: vi.fn(async () => ({
        type: SignalType.BUY_BREAKOUT,
        symbol: 'BTC/USDT',
        timestamp: 1710000000000,
        price: 42000,
        stopLoss: 41000,
        takeProfit: [],
        reason: '突破',
        confidence: 0.8,
      })),
    },
    configManager: {
      validate: vi.fn(() => true),
      save: vi.fn(async () => undefined),
    },
    getConfig: () => baseConfig,
    updateConfig: vi.fn(async (config: SystemConfig) => config),
  };
}

async function withServer(
  app: ReturnType<typeof createApiServer>,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function requestJson(
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: any }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.json(),
  };
}

describe('createApiServer', () => {
  it('应该放行健康检查且无需 API Key', async () => {
    const app = createApiServer({
      ...createDeps(),
      apiKey: 'secret-key',
    } as any);

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });
  });

  it('应该在缺少 API Key 时拒绝访问受保护接口', async () => {
    const app = createApiServer({
      ...createDeps(),
      apiKey: 'secret-key',
    } as any);

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/api/config`);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });
  });

  it('应该支持通过运行接口覆盖 symbols 和 intervals', async () => {
    const deps = createDeps();
    const app = createApiServer({
      ...deps,
      apiKey: 'secret-key',
    } as any);

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/api/watch-summary/run`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols: ['ETH/USDT'],
          intervals: ['4h'],
        }),
      });

      expect(response.status).toBe(200);
      expect(response.body.summary.symbols).toEqual(['ETH/USDT']);
      expect(response.body.summary.intervals[0].interval).toBe('4h');
      expect(response.body.agentSummary).toBeDefined();
      expect(response.body.agentSummary.status).toBe('attention');
      expect(response.body.agentSummary.counts.buy).toBe(1);
      expect(response.body.agentSummary.topSignals).toHaveLength(1);
    });
  });

  it('应该支持 skill 包装接口返回标准 output', async () => {
    const app = createApiServer({
      ...createDeps(),
      apiKey: 'secret-key',
    } as any);

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/api/skills/watch-summary`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            symbols: ['BTC/USDT'],
            intervals: ['1h'],
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.skill).toBe('watch-summary');
      expect(response.body.input.symbols).toEqual(['BTC/USDT']);
      expect(response.body.output.summary).toBeDefined();
      expect(response.body.output.agentSummary).toBeDefined();
    });
  });
});
