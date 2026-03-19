/**
 * SignalScanner 使用示例
 * 演示如何使用信号扫描器进行定时扫描和信号记录
 */

import { DataManager } from '../data/DataManager.js';
import { SignalScanner } from './SignalScanner.js';
import { BinanceProvider } from '../data/providers/BinanceProvider.js';

async function main() {
  // 1. 创建 DataManager 并注册数据提供者
  const dataManager = new DataManager('./data/klines');
  const binanceProvider = new BinanceProvider();
  dataManager.registerProvider(binanceProvider);

  // 2. 创建 SignalScanner
  const scanner = new SignalScanner(
    dataManager,
    0.02,  // 密集阈值 2%
    './data/signals'
  );

  // 3. 手动扫描单个标的
  console.log('扫描 BTC/USDT...');
  const signal = await scanner.scanSymbol('BTC/USDT', '1h');
  if (signal) {
    console.log('发现信号:', signal);
  } else {
    console.log('未发现信号');
  }

  // 4. 批量扫描多个标的
  console.log('\n批量扫描标的...');
  const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
  const signals = await scanner.scanAllSymbols(symbols, '1h');
  console.log(`发现 ${signals.length} 个信号`);
  signals.forEach(s => {
    console.log(`- ${s.symbol}: ${s.type} at ${s.price}`);
  });

  // 5. 启动定时扫描（每60秒扫描一次）
  console.log('\n启动定时扫描...');
  scanner.startScanning(symbols, '1h', 60);

  // 6. 查询信号历史
  console.log('\n查询2024年1月的信号历史...');
  const history = await scanner.getSignalHistory(2024, 1);
  console.log(`找到 ${history.length} 个历史信号`);

  // 7. 查询所有信号历史
  console.log('\n查询所有信号历史...');
  const allHistory = await scanner.getSignalHistory();
  console.log(`总共 ${allHistory.length} 个历史信号`);

  // 8. 停止扫描（在实际应用中，通常在程序退出时调用）
  setTimeout(() => {
    console.log('\n停止扫描...');
    scanner.stopScanning();
    console.log('扫描已停止');
  }, 5000);
}

// 运行示例
main().catch(console.error);
