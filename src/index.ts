/**
 * 股票交易监控和提醒系统
 * 主入口文件
 */

import { Application } from './Application.js';

async function main(): Promise<void> {
  const app = new Application();
  await app.initialize();
  await app.start();

  console.log('股票交易监控和提醒系统 v1.0.0');
  console.log('应用已启动: http://localhost:3000');

  const shutdown = async () => {
    console.log('正在停止应用...');
    await app.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown().catch((error) => {
      console.error('停止应用失败:', error);
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    shutdown().catch((error) => {
      console.error('停止应用失败:', error);
      process.exit(1);
    });
  });
}

main().catch((error) => {
  console.error('应用启动失败:', error);
  process.exit(1);
});
