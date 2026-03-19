# Market Data Providers

This directory contains implementations of market data providers for different exchanges and markets.

## BinanceProvider

Cryptocurrency market data provider for Binance exchange.

### Features

- 24/7 trading support (always returns `true` for `isTradingTime()`)
- Fetches K-line (candlestick) data
- Fetches latest prices
- Automatic retry logic with exponential backoff (3 retries)
- Error handling for network and API errors
- 5-second timeout for all requests

### Usage Example

```typescript
import { BinanceProvider } from './providers/BinanceProvider.js';

const provider = new BinanceProvider();

// Check if trading (always true for crypto)
console.log(provider.isTradingTime()); // true

// Fetch latest price
const price = await provider.fetchLatestPrice('BTC/USDT');
console.log(`BTC price: $${price}`);

// Fetch K-line data
const klines = await provider.fetchKLines('BTC/USDT', '1h', 120);
console.log(`Fetched ${klines.length} candles`);
```

### Supported Intervals

- `1m`, `5m`, `15m`, `30m` - Minutes
- `1h`, `2h`, `4h`, `6h`, `8h`, `12h` - Hours
- `1d`, `3d` - Days
- `1w` - Week
- `1M` - Month

### Symbol Format

The provider accepts flexible symbol formats:
- `BTC/USDT` (recommended)
- `BTC-USDT`
- `BTCUSDT`
- `btc/usdt` (case-insensitive)

All formats are normalized to Binance's format (`BTCUSDT`).

### Error Handling

The provider implements automatic retry logic:
- Initial request
- 3 retries with exponential backoff (1s, 2s, 4s)
- Formatted error messages for debugging

Error types:
- `Binance API error (status): message` - API returned an error
- `Binance API network error: message` - Network/connection issue
- `Invalid price data from Binance: value` - Invalid data format

### Requirements

Validates requirements:
- **1.1**: 支持从至少一个Market_Data_Provider获取实时行情数据
- **1.3**: 请求行情数据时在5秒内返回最新数据或错误信息
- **1.5**: Market_Data_Provider返回错误时记录错误日志并在3次重试后通知用户
