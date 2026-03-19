import express, { Express, Request, Response } from 'express';
import path from 'path';
import { DataManager } from '../data/DataManager.js';
import { MACalculator } from '../strategy/MACalculator.js';
import { MarketStateDetector } from '../strategy/MarketStateDetector.js';
import { SignalType } from '../types/strategy.js';
import { Position } from '../types/position.js';
import { SystemConfig } from '../types/config.js';
import { PositionMonitor } from '../monitoring/PositionMonitor.js';
import { SignalScanner } from '../monitoring/SignalScanner.js';
import { ConfigManager } from '../config/ConfigManager.js';

export interface ApiServerDependencies {
  dataManager: DataManager;
  positionMonitor: PositionMonitor;
  signalScanner: SignalScanner;
  configManager: ConfigManager;
  getConfig: () => SystemConfig;
  updateConfig: (config: SystemConfig) => Promise<SystemConfig>;
}

export function createApiServer(deps: ApiServerDependencies): Express {
  const app = express();
  const macCalculator = new MACalculator();
  const stateDetector = new MarketStateDetector(deps.getConfig().consolidationThreshold);

  app.use(express.json());

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
      const rawSymbol = Array.isArray(req.params.symbol) ? req.params.symbol[0] : req.params.symbol;
      const symbol = decodeURIComponent(rawSymbol);
      const interval = typeof req.query.interval === 'string' ? req.query.interval : deps.getConfig().intervals[0] ?? '1h';
      const klines = await deps.dataManager.getKLines(symbol, interval, 120);
      const latestKline = klines[klines.length - 1];
      const ma = macCalculator.calculateAll(klines);
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

  const publicDir = path.resolve(process.cwd(), 'src/api/public');
  app.use(express.static(publicDir));
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
