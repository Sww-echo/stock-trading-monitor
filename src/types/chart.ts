import { KLineData } from './market.js';
import { MarketState, SignalType } from './strategy.js';

export interface ChartMovingAveragePoint {
  timestamp: number;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ema20: number | null;
  ema60: number | null;
  ema120: number | null;
}

export interface ChartDensityPoint {
  timestamp: number;
  state: MarketState;
  stdDev: number | null;
  range: number | null;
  relativeStdDev: number | null;
  upperBound: number | null;
  lowerBound: number | null;
  widthPercent: number | null;
  isBullish: boolean;
  isBearish: boolean;
}

export interface ChartSignalMarker {
  type: SignalType;
  timestamp: number;
  price: number;
  stopLoss: number;
  confidence: number;
  reason: string;
}

export interface ChartZone {
  kind: 'consolidation';
  startTimestamp: number;
  endTimestamp: number;
  upperBound: number;
  lowerBound: number;
  widthPercent: number;
}

export interface MarketChartSummary {
  latestPrice: number | null;
  latestTimestamp: number | null;
  latestDensity: ChartDensityPoint | null;
  latestSignal: ChartSignalMarker | null;
  marketBias: 'bullish' | 'bearish' | 'neutral';
  bandUpper: number | null;
  bandLower: number | null;
  analysisNotes: string[];
}

export interface MarketChartAnalysis {
  symbol: string;
  interval: string;
  limit: number;
  consolidationThreshold: number;
  klines: KLineData[];
  movingAverages: ChartMovingAveragePoint[];
  density: ChartDensityPoint[];
  zones: ChartZone[];
  signals: ChartSignalMarker[];
  summary: MarketChartSummary;
}
