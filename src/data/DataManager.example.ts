/**
 * DataManager Usage Example
 * 
 * This file demonstrates how to use the DataManager class
 * to coordinate multiple data providers and manage K-line data.
 */

import { DataManager } from './DataManager.js';
import { BinanceProvider } from './providers/BinanceProvider.js';
import { OKXProvider } from './providers/OKXProvider.js';
import { YahooFinanceProvider } from './providers/YahooFinanceProvider.js';

async function main() {
  // 1. Create DataManager instance
  const dataManager = new DataManager('./data/klines');
  
  // 2. Register data providers
  console.log('Registering data providers...');
  
  // Register crypto providers
  dataManager.registerProvider(new BinanceProvider());
  dataManager.registerProvider(new OKXProvider());
  
  // Register stock providers (requires API tokens)
  // dataManager.registerProvider(new TushareProvider('your-tushare-token'));
  dataManager.registerProvider(new YahooFinanceProvider());
  
  console.log('✓ Providers registered\n');
  
  // 3. Fetch K-line data for different markets
  try {
    // Crypto: BTC/USDT
    console.log('Fetching BTC/USDT 1h data...');
    const btcData = await dataManager.getKLines('BTC/USDT', '1h', 10);
    console.log(`✓ Fetched ${btcData.length} BTC/USDT data points`);
    console.log(`  Latest close: ${btcData[btcData.length - 1].close}`);
    
    // Crypto: ETH/USDT
    console.log('\nFetching ETH/USDT 4h data...');
    const ethData = await dataManager.getKLines('ETH/USDT', '4h', 10);
    console.log(`✓ Fetched ${ethData.length} ETH/USDT data points`);
    console.log(`  Latest close: ${ethData[ethData.length - 1].close}`);
    
    // US Stock: AAPL
    console.log('\nFetching AAPL 1h data...');
    const aaplData = await dataManager.getKLines('AAPL', '1h', 10);
    console.log(`✓ Fetched ${aaplData.length} AAPL data points`);
    console.log(`  Latest close: ${aaplData[aaplData.length - 1].close}`);
    
    // 4. Check cache statistics
    console.log('\nCache statistics:');
    const stats = dataManager.getCacheStats();
    console.log(`  Total cache keys: ${stats.totalKeys}`);
    console.log(`  Total data points: ${stats.totalDataPoints}`);
    
    // 5. Update data (fetch latest from API)
    console.log('\nUpdating BTC/USDT data...');
    await dataManager.updateKLines('BTC/USDT', '1h', 120);
    console.log('✓ Data updated and saved to file');
    
    // 6. Load data from file (after restart)
    console.log('\nLoading data from file...');
    await dataManager.loadFromFile('BTC/USDT', '1h');
    console.log('✓ Data loaded from file');
    
    // 7. Clear cache for specific symbol
    console.log('\nClearing cache for ETH/USDT...');
    dataManager.clearCache('ETH/USDT');
    console.log('✓ Cache cleared');
    
    const statsAfterClear = dataManager.getCacheStats();
    console.log(`  Remaining cache keys: ${statsAfterClear.totalKeys}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
