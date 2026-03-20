import { WatchSummaryResult } from '../types/watch.js';

export interface WatchSummarySnapshot {
  generatedAt: number;
  summary: WatchSummaryResult;
}

export interface WatchSummaryHistoryStorage {
  save(snapshot: WatchSummarySnapshot): Promise<void>;
  list(limit?: number): Promise<WatchSummarySnapshot[]>;
}
