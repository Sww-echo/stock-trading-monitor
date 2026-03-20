import { promises as fs } from 'node:fs';
import path from 'node:path';
import { WatchSummaryHistoryStorage, WatchSummarySnapshot } from './WatchSummaryHistoryStorage.js';

export class FileWatchSummaryHistoryStorage implements WatchSummaryHistoryStorage {
  constructor(private readonly dataDir: string = 'data/watch-summary') {}

  async save(snapshot: WatchSummarySnapshot): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const filePath = this.getFilePath(snapshot.generatedAt);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  async list(limit: number = 20): Promise<WatchSummarySnapshot[]> {
    try {
      const files = await fs.readdir(this.dataDir);
      const snapshots = await Promise.all(
        files
          .filter((file) => file.startsWith('watch-summary-') && file.endsWith('.json'))
          .map(async (file) => {
            const content = await fs.readFile(path.join(this.dataDir, file), 'utf-8');
            return JSON.parse(content) as WatchSummarySnapshot;
          })
      );

      return snapshots
        .sort((a, b) => b.generatedAt - a.generatedAt)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  private getFilePath(timestamp: number): string {
    return path.join(this.dataDir, `watch-summary-${timestamp}.json`);
  }
}
