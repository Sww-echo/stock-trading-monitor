import { PositionStorage } from './PositionStorage.js';
import { Position } from '../types/position.js';
import { SignalType } from '../types/strategy.js';

/**
 * PositionStorage 使用示例
 */
async function example() {
  // 创建存储实例
  const storage = new PositionStorage('./data/positions');
  
  // 创建新持仓
  const newPosition: Position = {
    id: 'pos_20240101_001',
    symbol: 'BTC/USDT',
    entryPrice: 42000,
    entryTime: Date.now(),
    quantity: 0.1,
    strategyType: SignalType.BUY_BREAKOUT,
    stopLoss: 41000,
    takeProfit: [45000, 48000, 51000],
    status: 'open',
  };
  
  // 添加持仓
  await storage.addOpenPosition(newPosition);
  console.log('持仓已添加');
  
  // 查询所有当前持仓
  const openPositions = await storage.loadOpenPositions();
  console.log('当前持仓:', openPositions);
  
  // 根据标的查询持仓
  const btcPositions = await storage.findPositionsBySymbol('BTC/USDT');
  console.log('BTC持仓:', btcPositions);
  
  // 更新持仓止损
  await storage.updatePosition('pos_20240101_001', { stopLoss: 40000 });
  console.log('止损已更新');
  
  // 关闭持仓
  await storage.closePosition('pos_20240101_001');
  console.log('持仓已关闭');
  
  // 查询历史持仓
  const historyPositions = await storage.loadHistoryPositions();
  console.log('历史持仓:', historyPositions);
}

// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}
