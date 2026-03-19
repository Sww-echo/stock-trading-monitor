import { RiskCalculator } from '../monitoring/RiskCalculator.js';
import { SystemConfig } from '../types/config.js';
import { TakeProfitMode } from '../types/risk.js';
import { SignalType, TradingSignal } from '../types/strategy.js';
import { AdviceAction, AdviceLevel, TradingAdvice } from '../types/advice.js';

export class AdviceService {
  fromSignal(signal: TradingSignal, interval: string, config: SystemConfig): TradingAdvice {
    const riskCalculator = new RiskCalculator(config.maxRiskPerTrade, config.accountBalance);
    const risk = riskCalculator.calculate(
      signal,
      config.takeProfitMode,
      config.takeProfitMode === TakeProfitMode.FIXED_RATIO ? config.takeProfitRatio : undefined
    );

    const notes = [this.getStrategyNote(signal.type)];
    if (risk.warning) {
      notes.push(risk.warning);
    }

    return {
      symbol: signal.symbol,
      interval,
      action: this.mapAction(signal.type),
      signalType: signal.type,
      adviceLevel: this.mapAdviceLevel(signal.confidence),
      confidence: signal.confidence,
      entryPrice: signal.price,
      stopLoss: risk.stopLoss,
      takeProfit: risk.takeProfit,
      reason: signal.reason,
      riskNote: notes.filter(Boolean).join('；'),
      timestamp: signal.timestamp,
    };
  }

  fromSignals(signals: TradingSignal[], interval: string, config: SystemConfig): TradingAdvice[] {
    return signals.map((signal) => this.fromSignal(signal, interval, config));
  }

  private mapAction(type: SignalType): AdviceAction {
    switch (type) {
      case SignalType.BUY_BREAKOUT:
      case SignalType.BUY_PULLBACK:
        return 'buy';
      case SignalType.SELL_BREAKOUT:
      case SignalType.SELL_PULLBACK:
        return 'sell';
    }
  }

  private mapAdviceLevel(confidence: number): AdviceLevel {
    if (confidence >= 0.8) {
      return 'strong';
    }
    if (confidence >= 0.6) {
      return 'normal';
    }
    return 'weak';
  }

  private getStrategyNote(type: SignalType): string {
    switch (type) {
      case SignalType.BUY_BREAKOUT:
      case SignalType.SELL_BREAKOUT:
        return '突破类信号，建议等待收盘确认突破有效性';
      case SignalType.BUY_PULLBACK:
      case SignalType.SELL_PULLBACK:
        return '回踩类信号，建议确认 MA20 未有效跌破或突破后再行动';
    }
  }
}
