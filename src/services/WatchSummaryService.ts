import { AdviceService } from './AdviceService.js';
import { FileWatchSummaryHistoryStorage } from './FileWatchSummaryHistoryStorage.js';
import { WatchSummaryHistoryStorage } from './WatchSummaryHistoryStorage.js';
import { DataManager } from '../data/DataManager.js';
import { SignalScanner } from '../monitoring/SignalScanner.js';
import { PositionMonitor } from '../monitoring/PositionMonitor.js';
import { SystemConfig } from '../types/config.js';
import {
  WatchSummaryResult,
  WatchIntervalSummary,
  WatchPositionAlert,
  WatchErrorItem,
  WatchAgentSummary,
  WatchAgentSummaryCounts,
  WatchAgentPositionAction,
  WatchSymbolSummary,
  isActionablePositionStatus,
} from '../types/watch.js';
import { AlertType } from '../types/alert.js';
import { TradingAdvice } from '../types/advice.js';

export interface WatchSummaryDependencies {
  dataManager: Pick<DataManager, 'isSymbolTradingTime' | 'getLatestPrice'>;
  signalScanner: Pick<SignalScanner, 'scanSymbol'>;
  positionMonitor: Pick<PositionMonitor, 'updatePositions' | 'getAllPositions'>;
}

export class WatchSummaryService {
  private readonly adviceService: AdviceService;
  private readonly historyStorage: WatchSummaryHistoryStorage;

  constructor(
    private readonly deps: WatchSummaryDependencies,
    adviceService?: AdviceService,
    historyStorage: WatchSummaryHistoryStorage = new FileWatchSummaryHistoryStorage()
  ) {
    this.adviceService = adviceService ?? new AdviceService();
    this.historyStorage = historyStorage;
  }

  async build(config: SystemConfig): Promise<WatchSummaryResult> {
    const intervals: WatchIntervalSummary[] = [];
    const errors: WatchErrorItem[] = [];

    for (const interval of config.intervals) {
      const summary: WatchIntervalSummary = {
        interval,
        scannedSymbols: [],
        skippedSymbols: [],
        advices: [],
        errors: [],
      };

      for (const symbol of config.symbols) {
        let tradable = true;

        try {
          tradable = this.deps.dataManager.isSymbolTradingTime(symbol);
        } catch {
          tradable = true;
        }

        if (!tradable) {
          summary.skippedSymbols.push(symbol);
          continue;
        }

        summary.scannedSymbols.push(symbol);

        try {
          const signal = await this.deps.signalScanner.scanSymbol(symbol, interval);
          if (!signal) {
            continue;
          }

          summary.advices.push(this.adviceService.fromSignal(signal, interval, config));
        } catch (error) {
          const item: WatchErrorItem = {
            symbol,
            interval,
            stage: 'scan',
            message: error instanceof Error ? error.message : String(error),
          };
          summary.errors.push(item);
          errors.push(item);
        }
      }

      intervals.push(summary);
    }

    const statuses = await this.deps.positionMonitor.updatePositions(async (symbol) => {
      return this.deps.dataManager.getLatestPrice(symbol);
    });

    const positionAlerts: WatchPositionAlert[] = statuses
      .filter(isActionablePositionStatus)
      .map((status) => ({
        positionId: status.position.id,
        symbol: status.position.symbol,
        currentPrice: status.currentPrice,
        pnl: status.pnl,
        pnlPercent: status.pnlPercent,
        shouldStopLoss: status.shouldStopLoss,
        shouldTakeProfit: status.shouldTakeProfit,
        trendReversed: status.trendReversed,
        triggeredTakeProfits: status.triggeredTakeProfits,
        nextTakeProfit: status.nextTakeProfit,
        adjustedStopLoss: status.adjustedStopLoss,
        recommendedAction: status.recommendedAction,
      }));

    const symbolSummaries = this.buildSymbolSummaries(intervals);
    const result: WatchSummaryResult = {
      generatedAt: Date.now(),
      symbols: config.symbols,
      intervals,
      symbolSummaries,
      positions: {
        openCount: this.deps.positionMonitor.getAllPositions().length,
        alerts: positionAlerts,
      },
      alertReservation: {
        enabledChannels: {
          sound: config.enableSound,
          email: config.enableEmail,
          emailAddress: config.emailAddress,
        },
        reservedTypes: [
          AlertType.BUY_SIGNAL,
          AlertType.SELL_SIGNAL,
          AlertType.STOP_LOSS,
          AlertType.TAKE_PROFIT,
          AlertType.TREND_REVERSAL,
        ],
      },
      errors,
    };

    await this.historyStorage.save({
      generatedAt: result.generatedAt,
      summary: result,
    });

    return result;
  }

  async listHistory(limit: number = 20): Promise<WatchSummaryResult[]> {
    const snapshots = await this.historyStorage.list(limit);
    return snapshots.map((snapshot) => snapshot.summary);
  }

  buildAgentSummary(summary: WatchSummaryResult): WatchAgentSummary {
    const advices = summary.intervals.flatMap((item) => item.advices);
    const counts = this.countActions(advices, summary);
    const skippedSymbols = this.collectSkippedSymbols(summary);
    const positionActions = this.buildPositionActions(summary.positions.alerts);

    const hasActionableAdvice = counts.buy + counts.sell + counts.reduce > 0;

    const status = counts.errors > 0
      ? 'warning'
      : hasActionableAdvice || counts.positionAlerts > 0
        ? 'attention'
        : 'ok';

    const headline = `发现 ${counts.buy + counts.sell + counts.reduce} 个交易建议，${counts.positionAlerts} 个持仓提醒，${counts.errors} 个异常`;

    const topSignals = [...advices]
      .sort((a, b) => this.calculatePriorityScore(b) - this.calculatePriorityScore(a))
      .slice(0, 5)
      .map((advice) => ({
        symbol: advice.symbol,
        interval: advice.interval,
        action: advice.action,
        adviceLevel: advice.adviceLevel,
        confidence: advice.confidence,
        priorityScore: this.calculatePriorityScore(advice),
        reason: advice.reason,
      }));

    const nextHint = counts.errors > 0
      ? '建议先处理异常，再决定是否执行交易动作。'
      : counts.positionAlerts > 0
        ? '建议优先处理持仓提醒，再结合新信号决定是否调仓。'
        : hasActionableAdvice
          ? '可结合更高周期与风险参数进一步确认后执行。'
          : '当前无明确动作，建议继续按计划盯盘。';

    return {
      status,
      headline,
      counts: {
        ...counts,
        skippedSymbols: skippedSymbols.length,
      },
      topSignals,
      positionActions,
      skippedSymbols,
      nextHint,
    };
  }

  private buildSymbolSummaries(intervals: WatchIntervalSummary[]): WatchSymbolSummary[] {
    const grouped = new Map<string, TradingAdvice[]>();

    for (const interval of intervals) {
      for (const advice of interval.advices) {
        const advices = grouped.get(advice.symbol) ?? [];
        advices.push(advice);
        grouped.set(advice.symbol, advices);
      }
    }

    return Array.from(grouped.entries())
      .map(([symbol, advices]) => {
        const actions = advices.map((advice) => advice.action);
        const intervals = advices.map((advice) => advice.interval);
        const adviceLevels = advices.map((advice) => advice.adviceLevel);
        const priorityScore = Math.max(...advices.map((advice) => this.calculatePriorityScore(advice)));
        const maxConfidence = Math.max(...advices.map((advice) => advice.confidence));
        const reasons = advices.map((advice) => advice.reason);
        const uniqueActionCount = new Set(actions).size;

        const primaryAdvice = [...advices].sort(
          (a, b) => this.calculatePriorityScore(b) - this.calculatePriorityScore(a)
        )[0];

        return {
          symbol,
          intervals: Array.from(new Set(intervals)),
          actions: Array.from(new Set(actions)),
          adviceLevels: Array.from(new Set(adviceLevels)),
          maxConfidence,
          priorityScore,
          primaryAction: primaryAdvice.action,
          hasConflict: uniqueActionCount > 1,
          reasons,
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  private calculatePriorityScore(advice: TradingAdvice): number {
    const actionScoreMap: Record<TradingAdvice['action'], number> = {
      buy: 100,
      sell: 95,
      reduce: 80,
      hold: 50,
      watch: 40,
    };

    const adviceLevelScoreMap: Record<TradingAdvice['adviceLevel'], number> = {
      strong: 20,
      normal: 10,
      weak: 0,
    };

    const intervalWeightMap: Record<string, number> = {
      '1m': 1,
      '5m': 2,
      '15m': 3,
      '30m': 4,
      '1h': 5,
      '4h': 8,
      '1d': 13,
      '1w': 21,
    };

    const confidenceScore = Math.round(advice.confidence * 100);
    const actionScore = actionScoreMap[advice.action] ?? 0;
    const adviceLevelScore = adviceLevelScoreMap[advice.adviceLevel] ?? 0;
    const intervalScore = intervalWeightMap[advice.interval] ?? 0;

    return actionScore + adviceLevelScore + intervalScore + confidenceScore;
  }

  private countActions(advices: TradingAdvice[], summary: WatchSummaryResult): WatchAgentSummaryCounts {
    const counts: WatchAgentSummaryCounts = {
      buy: 0,
      sell: 0,
      hold: 0,
      reduce: 0,
      watch: 0,
      positionAlerts: summary.positions.alerts.length,
      errors: summary.errors.length,
      skippedSymbols: 0,
    };

    for (const advice of advices) {
      counts[advice.action] += 1;
    }

    return counts;
  }

  private collectSkippedSymbols(summary: WatchSummaryResult): string[] {
    const unique = new Set<string>();
    for (const interval of summary.intervals) {
      for (const symbol of interval.skippedSymbols) {
        unique.add(symbol);
      }
    }

    return Array.from(unique);
  }

  private buildPositionActions(alerts: WatchPositionAlert[]): WatchAgentPositionAction[] {
    const actions: WatchAgentPositionAction[] = [];

    for (const alert of alerts) {
      if (alert.shouldStopLoss) {
        actions.push({
          positionId: alert.positionId,
          symbol: alert.symbol,
          action: 'stop_loss',
          currentPrice: alert.currentPrice,
          pnlPercent: alert.pnlPercent,
        });
        continue;
      }

      if (alert.trendReversed) {
        actions.push({
          positionId: alert.positionId,
          symbol: alert.symbol,
          action: 'trend_reversal',
          currentPrice: alert.currentPrice,
          pnlPercent: alert.pnlPercent,
        });
        continue;
      }

      if (alert.recommendedAction === 'exit') {
        actions.push({
          positionId: alert.positionId,
          symbol: alert.symbol,
          action: 'exit',
          currentPrice: alert.currentPrice,
          pnlPercent: alert.pnlPercent,
        });
        continue;
      }

      if (alert.recommendedAction === 'reduce') {
        actions.push({
          positionId: alert.positionId,
          symbol: alert.symbol,
          action: 'reduce',
          currentPrice: alert.currentPrice,
          pnlPercent: alert.pnlPercent,
        });
        continue;
      }

      if (alert.shouldTakeProfit) {
        actions.push({
          positionId: alert.positionId,
          symbol: alert.symbol,
          action: 'take_profit',
          currentPrice: alert.currentPrice,
          pnlPercent: alert.pnlPercent,
        });
        continue;
      }

      actions.push({
        positionId: alert.positionId,
        symbol: alert.symbol,
        action: 'hold',
        currentPrice: alert.currentPrice,
        pnlPercent: alert.pnlPercent,
      });
    }

    return actions;
  }
}
