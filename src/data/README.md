# Data Layer - DataManager

## Overview

The DataManager class is the central coordinator for market data in the stock trading monitor system. It manages multiple data providers (Binance, OKX, Tushare, Yahoo Finance), handles caching, and persists data to the file system.

## Features

- **Multi-Provider Support**: Automatically routes symbols to the appropriate data provider
- **Intelligent Caching**: In-memory cache for fast data access
- **File Persistence**: Saves data to disk organized by market type (crypto/stock)
- **Automatic Provider Selection**: Detects market type from symbol format
- **Cache Management**: Tools to clear and monitor cache usage

## Architecture

```
DataManager
├── Cache (Map<string, KLineData[]>)
├── Providers (Map<MarketType, MarketDataProvider>)
│   ├── BinanceProvider (CRYPTO)
│   ├── OKXProvider (CRYPTO)
│   ├── TushareProvider (STOCK_CN)
│   └── YahooFinanceProvider (STOCK_US)
└── File Storage
    ├── data/klines/crypto/
    │   ├── BTC_USDT_1h.json
    │   └── ETH_USDT_4h.json
    └── data/klines/stock/
        ├── 600519_SH_1h.json
        └── AAPL_1h.json
```

## Usage

### Basic Setup

```typescript
import { DataManager } from './DataManager.js';
import { BinanceProvider } from './providers/BinanceProvider.js';
import { YahooFinanceProvider } from './providers/YahooFinanceProvider.js';

// Create instance
const dataManager = new DataManager('./data/klines');

// Register providers
dataManager.registerProvider(new BinanceProvider());
dataManager.registerProvider(new YahooFinanceProvider());
```

### Fetching Data

```typescript
// Fetch crypto data (automatically uses Binance)
const btcData = await dataManager.getKLines('BTC/USDT', '1h', 120);

// Fetch US stock data (automatically uses Yahoo Finance)
const aaplData = await dataManager.getKLines('AAPL', '1h', 120);

// Fetch A-share data (automatically uses Tushare)
const stockData = await dataManager.getKLines('600519.SH', '1h', 120);
```

### Updating Data

```typescript
// Update data from API and save to file
await dataManager.updateKLines('BTC/USDT', '1h', 120);
```

### Cache Management

```typescript
// Get cache statistics
const stats = dataManager.getCacheStats();
console.log(`Keys: ${stats.totalKeys}, Points: ${stats.totalDataPoints}`);

// Clear specific cache
dataManager.clearCache('BTC/USDT', '1h');

// Clear all caches for a symbol
dataManager.clearCache('BTC/USDT');

// Clear all caches
dataManager.clearCache();
```

### File Operations

```typescript
// Save to file
await dataManager.saveToFile('BTC/USDT', '1h');

// Load from file
await dataManager.loadFromFile('BTC/USDT', '1h');
```

## Symbol Format Detection

The DataManager automatically detects the market type based on symbol format:

| Market Type | Symbol Format | Examples | Provider |
|-------------|---------------|----------|----------|
| Crypto | Contains `/` or `-` | `BTC/USDT`, `BTC-USDT` | Binance/OKX |
| Crypto | Common crypto symbols | `BTC`, `ETH`, `SOL` | Binance/OKX |
| A-Share | `XXXXXX.SH` or `XXXXXX.SZ` | `600519.SH`, `000001.SZ` | Tushare |
| US Stock | 1-5 letters | `AAPL`, `MSFT`, `GOOGL` | Yahoo Finance |

## File Storage Format

Data is stored in JSON format with the following structure:

```json
{
  "symbol": "BTC/USDT",
  "interval": "1h",
  "lastUpdate": 1704067200000,
  "data": [
    {
      "timestamp": 1704067200000,
      "open": 42000.5,
      "high": 42500.0,
      "low": 41800.0,
      "close": 42300.0,
      "volume": 1234.56
    }
  ]
}
```

## API Reference

### Constructor

```typescript
constructor(dataDir: string = './data/klines')
```

Creates a new DataManager instance.

- `dataDir`: Directory for storing K-line data files

### Methods

#### registerProvider

```typescript
registerProvider(provider: MarketDataProvider): void
```

Registers a data provider for a specific market type.

#### getKLines

```typescript
async getKLines(symbol: string, interval: string, limit: number): Promise<KLineData[]>
```

Gets K-line data, prioritizing cache, then file, then API.

- `symbol`: Trading symbol (e.g., "BTC/USDT", "AAPL")
- `interval`: Time interval (e.g., "1h", "4h")
- `limit`: Number of data points to retrieve
- Returns: Array of K-line data

#### updateKLines

```typescript
async updateKLines(symbol: string, interval: string, limit?: number): Promise<void>
```

Updates K-line data from API and saves to cache and file.

- `symbol`: Trading symbol
- `interval`: Time interval
- `limit`: Number of data points (default: 120)

#### saveToFile

```typescript
async saveToFile(symbol: string, interval: string): Promise<void>
```

Saves cached data to file.

#### loadFromFile

```typescript
async loadFromFile(symbol: string, interval: string): Promise<void>
```

Loads data from file into cache.

#### clearCache

```typescript
clearCache(symbol?: string, interval?: string): void
```

Clears cache entries.

- No parameters: Clear all cache
- `symbol` only: Clear all intervals for symbol
- `symbol` and `interval`: Clear specific entry

#### getCacheStats

```typescript
getCacheStats(): { totalKeys: number; totalDataPoints: number }
```

Returns cache statistics.

## Testing

The DataManager has comprehensive test coverage:

- **Unit Tests** (`DataManager.test.ts`): 29 tests covering all core functionality
- **Integration Tests** (`DataManager.integration.test.ts`): 13 tests verifying provider coordination

Run tests:

```bash
npm run test -- DataManager
```

## Requirements Mapping

This implementation satisfies the following requirements:

- **需求 1.2**: 支持从多个Market_Data_Provider获取实时行情数据
- **需求 1.4**: 每个周期结束时自动更新K线数据
- **需求 13.1**: 保存至少30天的K线历史数据

## Example

See `DataManager.example.ts` for a complete usage example.

## Error Handling

The DataManager handles various error scenarios:

- **No provider registered**: Throws error with clear message
- **Invalid symbol format**: Throws error indicating unrecognized format
- **API failures**: Propagates provider errors with context
- **File not found**: Falls back to API fetch
- **Invalid file format**: Throws validation error

## Performance Considerations

- **Cache-first strategy**: Minimizes API calls
- **Lazy loading**: Only fetches data when needed
- **Efficient file I/O**: Uses async file operations
- **Memory management**: Cache can be cleared to free memory
