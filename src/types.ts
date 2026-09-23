// 拣配工作台领域模型

/** 石头档案：净度、尺寸等原始记录始终保留在石头主档上，占用/撤单不会改动 */
export interface Gem {
  code: string; // 宝石编号
  kind: string; // 种类
  shape: string; // 形状
  weight: number; // 克拉重量
  sizeText: string; // 尺寸原始记录，如 6x4mm
  clarity: string; // 净度
  color: string; // 颜色
  cut: string; // 切工
  position: string; // 镶嵌位置
  note?: string; // 缺陷备注
}

export interface Batch {
  id: string; // 分拣批次
  name: string;
  capacity: number; // 批次名额
}

export interface OrderSpec {
  id: string;
  name: string;
  kind: string;
  shape: string;
  sizeSpec: number[]; // 尺寸要求（mm），圆形一个直径，异形为 长×宽
  sizeTolerance: number; // 尺寸容差（mm）
  colors: string[]; // 接受的颜色
  needed: number; // 需配颗数
  position: string; // 镶嵌位置
}

export interface Order extends OrderSpec {
  closed: boolean;
  closedAt?: string;
}

/**
 * 占用记录：石头进订单前先占一个批次名额（orderId 为 null 表示仅占名额、尚未配单）。
 * 撤掉占用后石头回到石库，才能重新配单（换单）。
 */
export interface Occupancy {
  id: string;
  batchId: string;
  gemCode: string;
  orderId: string | null;
  createdAt: string;
}

export interface ArchiveState {
  version: number;
  gems: Gem[];
  batches: Batch[];
  orders: Order[];
  occupancies: Occupancy[];
  selectedBatchId: string;
  selectedOrderId: string;
  updatedAt: string;
}

export interface DefectEntry {
  occupancyId: string;
  gem: Gem;
  reasons: string[];
}

export interface OrderEvaluation {
  order: Order;
  entries: Occupancy[];
  qualifiedCount: number;
  defects: DefectEntry[];
  waiting: number; // 订单待配数（只统计合格石头）
  surplus: number; // 合格石头超出需求的颗数
  blocked: boolean;
}
