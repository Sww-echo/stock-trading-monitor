import express, { Express, Request, Response } from 'express';
import path from 'path';
import process from 'node:process';
import { DataManager } from '../data/DataManager.js';
import { MACalculator } from '../strategy/MACalculator.js';
import { MarketStateDetector } from '../strategy/MarketStateDetector.js';
import { SignalType } from '../types/strategy.js';
import { Position } from '../types/position.js';
import { SystemConfig } from '../types/config.js';
import { PositionMonitor } from '../monitoring/PositionMonitor.js';
import { SignalScanner } from '../monitoring/SignalScanner.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { WatchSummaryService } from '../services/WatchSummaryService.js';
import { MarketChartService } from '../services/MarketChartService.js';

export interface ApiServerDependencies {
  dataManager: DataManager;
  positionMonitor: PositionMonitor;
  signalScanner: SignalScanner;
  configManager: ConfigManager;
  getConfig: () => SystemConfig;
  // eslint-disable-next-line no-unused-vars
  updateConfig: (config: SystemConfig) => Promise<SystemConfig>;
  apiKey?: string;
}

function createWatchSummaryService(
  deps: ApiServerDependencies,
  chartService: MarketChartService
): WatchSummaryService {
  return new WatchSummaryService({
    dataManager: deps.dataManager,
    signalScanner: deps.signalScanner,
    positionMonitor: deps.positionMonitor,
    chartService,
  });
}

function buildRuntimeConfig(
  base: SystemConfig,
  payload: Partial<Pick<SystemConfig, 'symbols' | 'intervals'>>
): SystemConfig {
  return {
    ...base,
    symbols: Array.isArray(payload.symbols) ? payload.symbols : base.symbols,
    intervals: Array.isArray(payload.intervals) ? payload.intervals : base.intervals,
  };
}

function requireApiKey(apiKey?: string) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    if (!apiKey) {
      next();
      return;
    }

    const authHeader = req.header('authorization');
    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };
}

function getRequestSymbol(req: Request): string {
  const rawSymbol = Array.isArray(req.params.symbol) ? req.params.symbol[0] : req.params.symbol;
  return decodeURIComponent(rawSymbol);
}

function getRequestInterval(req: Request, deps: ApiServerDependencies): string {
  return typeof req.query.interval === 'string' ? req.query.interval : deps.getConfig().intervals[0] ?? '1h';
}

function getRequestLimit(req: Request, fallback: number = 180): number {
  if (typeof req.query.limit !== 'string') {
    return fallback;
  }

  const limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }

  return limit;
}

export function createApiServer(deps: ApiServerDependencies): Express {
  const app = express();
  const macCalculator = new MACalculator();
  const chartService = new MarketChartService({
    dataManager: deps.dataManager,
  });
  const watchSummaryService = createWatchSummaryService(deps, chartService);

  const buildWatchSummaryResponse = async (config: SystemConfig) => {
    const summary = await watchSummaryService.build(config);
    const agentSummary = await watchSummaryService.buildAgentSummary(summary, {
      consolidationThreshold: config.consolidationThreshold,
    });

    return {
      summary,
      agentSummary,
    };
  };

  app.use(express.json());
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use('/api', requireApiKey(deps.apiKey));

  app.get('/api/positions', (_req: Request, res: Response) => {
    res.json({ positions: deps.positionMonitor.getAllPositions() });
  });

  app.post('/api/positions', async (req: Request, res: Response) => {
    try {
      const payload = req.body as Partial<Position>;
      if (!payload.symbol || typeof payload.symbol !== 'string') {
        return res.status(400).json({ error: 'symbol is required' });
      }

      if (typeof payload.entryPrice !== 'number' || payload.entryPrice <= 0) {
        return res.status(400).json({ error: 'entryPrice must be a positive number' });
      }

      if (typeof payload.quantity !== 'number' || payload.quantity <= 0) {
        return res.status(400).json({ error: 'quantity must be a positive number' });
      }

      if (!payload.strategyType || !Object.values(SignalType).includes(payload.strategyType)) {
        return res.status(400).json({ error: 'strategyType is invalid' });
      }

      if (typeof payload.stopLoss !== 'number' || payload.stopLoss <= 0) {
        return res.status(400).json({ error: 'stopLoss must be a positive number' });
      }

      const position: Position = {
        id: payload.id ?? `pos_${Date.now()}`,
        symbol: payload.symbol,
        entryPrice: payload.entryPrice,
        entryTime: payload.entryTime ?? Date.now(),
        quantity: payload.quantity,
        strategyType: payload.strategyType,
        stopLoss: payload.stopLoss,
        takeProfit: Array.isArray(payload.takeProfit) ? payload.takeProfit : [],
        status: 'open',
      };

      deps.positionMonitor.addPosition(position);
      return res.status(201).json({ position });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/positions/:id', async (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const position = deps.positionMonitor.getPosition(id);
      if (!position) {
        return res.status(404).json({ error: 'Position not found' });
      }

      const closePrice = await deps.dataManager.getLatestPrice(position.symbol);
      await deps.positionMonitor.closePosition(position.id, closePrice, 'closed via api');
      return res.json({ success: true, closePrice });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/signals', async (req: Request, res: Response) => {
    try {
      const year = typeof req.query.year === 'string' ? Number(req.query.year) : undefined;
      const month = typeof req.query.month === 'string' ? Number(req.query.month) : undefined;
      const signals = await deps.signalScanner.getSignalHistory(year, month);
      return res.json({ signals });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/watch-summary', async (_req: Request, res: Response) => {
    try {
      return res.json(await buildWatchSummaryResponse(deps.getConfig()));
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/watch-summary/history', async (req: Request, res: Response) => {
    try {
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const history = await watchSummaryService.listHistory(
        Number.isFinite(limit) && limit && limit > 0 ? limit : undefined
      );
      return res.json({ history });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/watch-summary/run', async (req: Request, res: Response) => {
    try {
      const payload = (req.body ?? {}) as Partial<SystemConfig>;
      const runtimeConfig = buildRuntimeConfig(deps.getConfig(), payload);
      return res.json(await buildWatchSummaryResponse(runtimeConfig));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/skills/watch-summary', async (req: Request, res: Response) => {
    try {
      const payload = ((req.body ?? {}) as { input?: Partial<SystemConfig> }).input ?? ((req.body ?? {}) as Partial<SystemConfig>);
      const runtimeConfig = buildRuntimeConfig(deps.getConfig(), payload);
      const { summary, agentSummary } = await buildWatchSummaryResponse(runtimeConfig);

      return res.json({
        ok: true,
        skill: 'watch-summary',
        input: {
          symbols: runtimeConfig.symbols,
          intervals: runtimeConfig.intervals,
        },
        output: {
          summary,
          agentSummary,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post('/api/skills/market-chart', async (req: Request, res: Response) => {
    try {
      const payload = ((req.body ?? {}) as { input?: { symbol?: string; interval?: string; limit?: number } }).input
        ?? ((req.body ?? {}) as { symbol?: string; interval?: string; limit?: number });
      const symbol = payload.symbol?.trim();

      if (!symbol) {
        return res.status(400).json({
          ok: false,
          error: 'symbol is required',
        });
      }

      const interval = payload.interval?.trim() || deps.getConfig().intervals[0] || '1h';
      const limit = Number.isFinite(payload.limit) ? payload.limit : 180;
      const analysis = await chartService.buildAnalysis(symbol, interval, {
        limit,
        consolidationThreshold: deps.getConfig().consolidationThreshold,
      });
      const svg = chartService.renderSvg(analysis);

      return res.json({
        ok: true,
        skill: 'market-chart',
        input: {
          symbol,
          interval,
          limit: analysis.limit,
        },
        output: {
          analysis,
          chart: {
            mimeType: 'image/svg+xml',
            svg,
          },
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/alerts', (_req: Request, res: Response) => {
    res.json({ alerts: [], skipped: true, reason: 'task 9 skipped' });
  });

  app.get('/api/config', async (_req: Request, res: Response) => {
    try {
      const config = deps.getConfig();
      return res.json({ config });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put('/api/config', async (req: Request, res: Response) => {
    try {
      const config = req.body as SystemConfig;
      const updated = await deps.updateConfig(config);
      return res.json({ config: updated });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/market/:symbol', async (req: Request, res: Response) => {
    try {
      const symbol = getRequestSymbol(req);
      const interval = getRequestInterval(req, deps);
      const klines = await deps.dataManager.getKLines(symbol, interval, 120);
      const latestKline = klines[klines.length - 1];
      const ma = macCalculator.calculateAll(klines);
      const stateDetector = new MarketStateDetector(deps.getConfig().consolidationThreshold);
      const state = stateDetector.detectState(ma);

      return res.json({
        symbol,
        interval,
        latestPrice: latestKline?.close ?? null,
        latestKline: latestKline ?? null,
        ma,
        state,
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/market/:symbol/chart', async (req: Request, res: Response) => {
    try {
      const symbol = getRequestSymbol(req);
      const interval = getRequestInterval(req, deps);
      const analysis = await chartService.buildAnalysis(symbol, interval, {
        limit: getRequestLimit(req),
        consolidationThreshold: deps.getConfig().consolidationThreshold,
      });

      return res.json({
        analysis,
        svgUrl: `/api/market/${encodeURIComponent(symbol)}/chart.svg?interval=${encodeURIComponent(interval)}&limit=${analysis.limit}`,
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/market/:symbol/chart.svg', async (req: Request, res: Response) => {
    try {
      const symbol = getRequestSymbol(req);
      const interval = getRequestInterval(req, deps);
      const analysis = await chartService.buildAnalysis(symbol, interval, {
        limit: getRequestLimit(req),
        consolidationThreshold: deps.getConfig().consolidationThreshold,
      });
      const svg = chartService.renderSvg(analysis);

      res.type('image/svg+xml');
      return res.send(svg);
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  const publicDir = path.resolve(process.cwd(), 'src/api/public');
  app.use(express.static(publicDir));
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
