import type {
  ArchiveState,
  DefectEntry,
  Gem,
  Occupancy,
  Order,
  OrderEvaluation,
  OrderSpec,
} from "./types";
import { createSeedState } from "./seed";

const STORAGE_KEY = "picking-bench-archive-v1";
const VERSION = 1;

/* ----------------------------- 匹配校验 ----------------------------- */

/** 从尺寸原始记录中解析数值，6.0x4.0mm -> [6, 4]，2.0mm -> [2] */
export function parseSize(text: string): number[] {
  const nums = text.match(/\d+(?:\.\d+)?/g);
  return nums ? nums.map(Number) : [];
}

export function formatSizeSpec(spec: OrderSpec): string {
  return spec.sizeSpec.join("×") + "mm";
}

/** 颜色要求：大小写不敏感的精确匹配（D-F 白钻按枚举逐个列出，不做字母区间猜测） */
export function colorMatches(gem: Gem, order: OrderSpec): boolean {
  const actual = gem.color.trim().toLowerCase();
  return order.colors.some((c) => c.trim().toLowerCase() === actual);
}

/** 尺寸要求：每一维都在容差内 */
export function sizeMatches(gem: Gem, order: OrderSpec): boolean {
  const actual = parseSize(gem.sizeText);
  if (actual.length !== order.sizeSpec.length) return false;
  return order.sizeSpec.every((target, i) => Math.abs(actual[i] - target) <= order.sizeTolerance + 1e-9);
}

/** 结项拦截原因：只看订单明确要求的颜色与尺寸；净度记录保留在档案里但不参与拦截 */
export function defectReasons(gem: Gem, order: OrderSpec): string[] {
  const reasons: string[] = [];
  if (!colorMatches(gem, order)) {
    reasons.push(`颜色不符：要求 ${order.colors.join("/")}，实为 ${gem.color}`);
  }
  if (!sizeMatches(gem, order)) {
    reasons.push(`尺寸不符：要求 ${formatSizeSpec(order)}±${order.sizeTolerance}，实为 ${gem.sizeText}`);
  }
  return reasons;
}

/* ----------------------------- 派生数据 ----------------------------- */

export function gemMap(state: ArchiveState): Map<string, Gem> {
  return new Map(state.gems.map((g) => [g.code, g]));
}

export function batchUsed(state: ArchiveState, batchId: string): number {
  return state.occupancies.filter((o) => o.batchId === batchId).length;
}

export function evaluateOrder(state: ArchiveState, order: Order): OrderEvaluation {
  const gems = gemMap(state);
  const entries = state.occupancies.filter((o) => o.orderId === order.id);
  const defects: DefectEntry[] = [];
  let qualifiedCount = 0;

  for (const entry of entries) {
    const gem = gems.get(entry.gemCode);
    if (!gem) continue;
    const reasons = order.closed ? [] : defectReasons(gem, order);
    if (reasons.length > 0) {
      defects.push({ occupancyId: entry.id, gem, reasons });
    } else {
      qualifiedCount += 1;
    }
  }

  const waiting = Math.max(0, order.needed - qualifiedCount);
  const surplus = Math.max(0, qualifiedCount - order.needed);
  const blocked = !order.closed && (defects.length > 0 || waiting > 0 || surplus > 0);
  return { order, entries, qualifiedCount, defects, waiting, surplus, blocked };
}

export function findDefectEntry(state: ArchiveState, occupancyId: string): DefectEntry | null {
  const occupancy = state.occupancies.find((o) => o.id === occupancyId);
  if (!occupancy || !occupancy.orderId) return null;
  const order = state.orders.find((o) => o.id === occupancy.orderId);
  const gem = state.gems.find((g) => g.code === occupancy.gemCode);
  if (!order || !gem) return null;
  const reasons = defectReasons(gem, order);
  return reasons.length ? { occupancyId, gem, reasons } : null;
}

/* ----------------------------- 存档 ----------------------------- */

export function loadState(): ArchiveState {
  if (typeof window === "undefined") return createSeedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as ArchiveState;
    if (parsed.version !== VERSION) return createSeedState();
    // 简单完整性校验，缺字段时回退到初始数据
    if (!Array.isArray(parsed.gems) || !Array.isArray(parsed.batches) || !Array.isArray(parsed.orders) || !Array.isArray(parsed.occupancies)) {
      return createSeedState();
    }
    return parsed;
  } catch {
    return createSeedState();
  }
}

export function saveState(state: ArchiveState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等情况下写入失败不影响当前操作
  }
}

/* ----------------------------- Reducer ----------------------------- */

export type Action =
  | { type: "selectBatch"; batchId: string }
  | { type: "selectOrder"; orderId: string }
  | { type: "occupy"; gemCode: string }
  | { type: "assign"; occupancyId: string }
  | { type: "release"; occupancyId: string }
  | { type: "closeOrder" }
  | { type: "supplement"; gem: Gem }
  | { type: "reset" };

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 操作守卫：
 * - 占用：石头必须在石库里（未被占用），批次必须有余量
 * - 配单：占用必须存在且尚未配单；石头必须先占名额才能进订单
 * - 撤单：移除整条占用记录，石头回到石库（净度、尺寸等档案不变），之后才能换单
 * - 结项由 UI 层先 evaluateOrder 校验，不合格石头会被列出并挡住
 */
export function reducer(state: ArchiveState, action: Action): ArchiveState {
  switch (action.type) {
    case "selectBatch":
      if (!state.batches.some((b) => b.id === action.batchId)) return state;
      return { ...state, selectedBatchId: action.batchId };

    case "selectOrder":
      if (!state.orders.some((o) => o.id === action.orderId)) return state;
      return { ...state, selectedOrderId: action.orderId };

    case "occupy": {
      const batch = state.batches.find((b) => b.id === state.selectedBatchId);
      if (!batch) return state;
      if (state.occupancies.some((o) => o.gemCode === action.gemCode)) return state;
      if (batchUsed(state, batch.id) >= batch.capacity) return state;
      const occupancy: Occupancy = {
        id: newId("oc"),
        batchId: batch.id,
        gemCode: action.gemCode,
        orderId: null,
        createdAt: stamp(),
      };
      return { ...state, occupancies: [...state.occupancies, occupancy], updatedAt: stamp() };
    }

    case "assign": {
      const order = state.orders.find((o) => o.id === state.selectedOrderId);
      if (!order || order.closed) return state;
      // 只有“仅占名额”的占用记录才能配单；已配单的石头必须先撤掉占用才能改配（换单）
      const target = state.occupancies.find((o) => o.id === action.occupancyId);
      if (!target || target.orderId !== null) return state;
      return {
        ...state,
        occupancies: state.occupancies.map((o) =>
          o.id === action.occupancyId ? { ...o, orderId: order.id } : o,
        ),
        updatedAt: stamp(),
      };
    }

    case "release": {
      const target = state.occupancies.find((o) => o.id === action.occupancyId);
      if (!target) return state;
      // 已结项订单的石头随单锁定，不能撤
      if (target.orderId) {
        const linked = state.orders.find((o) => o.id === target.orderId);
        if (linked?.closed) return state;
      }
      return {
        ...state,
        occupancies: state.occupancies.filter((o) => o.id !== action.occupancyId),
        updatedAt: stamp(),
      };
    }

    case "closeOrder": {
      const order = state.orders.find((o) => o.id === state.selectedOrderId);
      if (!order || order.closed) return state;
      const evaluation = evaluateOrder(state, order);
      if (evaluation.blocked) return state; // UI 层负责列出挡住结项的石头
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === order.id ? { ...o, closed: true, closedAt: stamp() } : o,
        ),
        updatedAt: stamp(),
      };
    }

    case "supplement": {
      if (state.gems.some((g) => g.code === action.gem.code)) return state;
      return { ...state, gems: [...state.gems, action.gem], updatedAt: stamp() };
    }

    case "reset":
      return createSeedState();

    default:
      return state;
  }
}
