import * as fs from 'fs/promises';
import * as path from 'path';
import { Position } from '../types/position.js';

/**
 * 持仓文件数据格式
 */
interface PositionFileData {
  positions: Position[];
}

/**
 * 持仓存储管理器
 * 负责持仓数据的 JSON 文件读写
 */
export class PositionStorage {
  private readonly dataDir: string;
  private readonly openFilePath: string;
  private readonly historyFilePath: string;
  
  constructor(dataDir: string = './data/positions') {
    this.dataDir = dataDir;
    this.openFilePath = path.join(dataDir, 'open.json');
    this.historyFilePath = path.join(dataDir, 'history.json');
  }
  
  /**
   * 加载当前持仓
   * @returns 当前持仓数组
   */
  async loadOpenPositions(): Promise<Position[]> {
    try {
      const content = await fs.readFile(this.openFilePath, 'utf-8');
      const data: PositionFileData = JSON.parse(content);
      return data.positions || [];
    } catch (error) {
      // 文件不存在或读取失败，返回空数组
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
  
  /**
   * 保存当前持仓
   * @param positions 持仓数组
   */
  async saveOpenPositions(positions: Position[]): Promise<void> {
    // 确保目录存在
    await fs.mkdir(this.dataDir, { recursive: true });
    
    const data: PositionFileData = { positions };
    await fs.writeFile(this.openFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }
  
  /**
   * 加载历史持仓
   * @returns 历史持仓数组
   */
  async loadHistoryPositions(): Promise<Position[]> {
    try {
      const content = await fs.readFile(this.historyFilePath, 'utf-8');
      const data: PositionFileData = JSON.parse(content);
      return data.positions || [];
    } catch (error) {
      // 文件不存在或读取失败，返回空数组
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
  
  /**
   * 保存历史持仓
   * @param positions 持仓数组
   */
  async saveHistoryPositions(positions: Position[]): Promise<void> {
    // 确保目录存在
    await fs.mkdir(this.dataDir, { recursive: true });
    
    const data: PositionFileData = { positions };
    await fs.writeFile(this.historyFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }
  
  /**
   * 添加持仓到当前持仓列表
   * @param position 新持仓
   */
  async addOpenPosition(position: Position): Promise<void> {
    const positions = await this.loadOpenPositions();
    positions.push(position);
    await this.saveOpenPositions(positions);
  }
  
  /**
   * 关闭持仓（从当前持仓移到历史持仓）
   * @param positionId 持仓ID
   */
  async closePosition(positionId: string): Promise<void> {
    // 加载当前持仓
    const openPositions = await this.loadOpenPositions();
    const positionIndex = openPositions.findIndex(p => p.id === positionId);
    
    if (positionIndex === -1) {
      throw new Error(`Position not found: ${positionId}`);
    }
    
    // 移除并标记为关闭
    const [closedPosition] = openPositions.splice(positionIndex, 1);
    closedPosition.status = 'closed';
    
    // 保存更新后的当前持仓
    await this.saveOpenPositions(openPositions);
    
    // 添加到历史持仓
    const historyPositions = await this.loadHistoryPositions();
    historyPositions.push(closedPosition);
    await this.saveHistoryPositions(historyPositions);
  }
  
  /**
   * 更新持仓信息
   * @param positionId 持仓ID
   * @param updates 更新的字段
   */
  async updatePosition(positionId: string, updates: Partial<Position>): Promise<void> {
    const positions = await this.loadOpenPositions();
    const position = positions.find(p => p.id === positionId);
    
    if (!position) {
      throw new Error(`Position not found: ${positionId}`);
    }
    
    // 更新字段
    Object.assign(position, updates);
    
    await this.saveOpenPositions(positions);
  }
  
  /**
   * 根据ID查找持仓
   * @param positionId 持仓ID
   * @returns 持仓对象或undefined
   */
  async findPositionById(positionId: string): Promise<Position | undefined> {
    const positions = await this.loadOpenPositions();
    return positions.find(p => p.id === positionId);
  }
  
  /**
   * 根据标的查找持仓
   * @param symbol 标的符号
   * @returns 持仓数组
   */
  async findPositionsBySymbol(symbol: string): Promise<Position[]> {
    const positions = await this.loadOpenPositions();
    return positions.filter(p => p.symbol === symbol);
  }
}
