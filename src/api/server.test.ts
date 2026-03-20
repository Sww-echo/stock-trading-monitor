import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { createApiServer } from './server.js';
import { SignalType } from '../types/strategy.js';
import { TakeProfitMode } from '../types/risk.js';
import { SystemConfig } from '../types/config.js';
import { KLineData } from '../types/market.js';

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
      getKLines: vi.fn(async () => createBreakoutKlines()),
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

function createBreakoutKlines(): KLineData[] {
  const closes = [
    ...Array.from({ length: 120 }, (_, index) => 100 + (index % 2 === 0 ? 0.12 : -0.12)),
    100.4,
    101.3,
    103.1,
    102.5,
    102.9,
    103.3,
  ];

  return closes.map((close, index) => {
    const previousClose = closes[Math.max(0, index - 1)] ?? close;
    const open = index === 0 ? close : previousClose;

    return {
      timestamp: 1710000000000 + index * 60 * 60 * 1000,
      open,
      high: Math.max(open, close) + 0.45,
      low: Math.min(open, close) - 0.45,
      close,
      volume: 1000 + index * 10,
    };
  });
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

async function requestText(
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: string; headers: Headers }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.text(),
    headers: response.headers,
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
      expect(response.body.agentSummary.topSignalCharts).toHaveLength(1);
      expect(response.body.agentSummary.topSignalCharts[0].chart.mimeType).toBe('image/svg+xml');
      expect(response.body.agentSummary.topSignalCharts[0].chart.svg).toContain('<svg');
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
      expect(response.body.output.agentSummary.topSignalCharts).toHaveLength(1);
    });
  });

  it('应该返回可供 agent 分析的图表数据', async () => {
    const app = createApiServer({
      ...createDeps(),
      apiKey: 'secret-key',
    } as any);

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/api/market/${encodeURIComponent('BTC/USDT')}/chart?interval=1h&limit=180`, {
        headers: {
          Authorization: 'Bearer secret-key',
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.analysis.symbol).toBe('BTC/USDT');
      expect(response.body.analysis.interval).toBe('1h');
      expect(response.body.analysis.klines.length).toBeGreaterThanOrEqual(120);
      expect(response.body.analysis.signals.length).toBeGreaterThan(0);
      expect(response.body.svgUrl).toContain('/api/market/BTC%2FUSDT/chart.svg');
    });
  });

  it('应该返回可直接发送的 SVG 图表', async () => {
    const app = createApiServer({
      ...createDeps(),
      apiKey: 'secret-key',
    } as any);

    await withServer(app, async (baseUrl) => {
      const response = await requestText(`${baseUrl}/api/market/${encodeURIComponent('BTC/USDT')}/chart.svg?interval=1h&limit=180`, {
        headers: {
          Authorization: 'Bearer secret-key',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/svg+xml');
      expect(response.body).toContain('<svg');
      expect(response.body).toContain('BTC/USDT');
    });
  });

  it('应该支持 skill 包装返回图表分析与 SVG', async () => {
    const app = createApiServer({
      ...createDeps(),
      apiKey: 'secret-key',
    } as any);

    await withServer(app, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/api/skills/market-chart`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            symbol: 'BTC/USDT',
            interval: '1h',
            limit: 180,
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.skill).toBe('market-chart');
      expect(response.body.output.analysis.symbol).toBe('BTC/USDT');
      expect(response.body.output.chart.mimeType).toBe('image/svg+xml');
      expect(response.body.output.chart.svg).toContain('<svg');
    });
  });
});
