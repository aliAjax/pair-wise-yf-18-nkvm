import type { ArchiveState } from "./types";

// 初始存档：模拟一个正在拣配中的工作室
// B-01 里 ORD-2403 已被一颗颜色/尺寸不合格的祖母绿挡住，需要补入合格替石后才能结项
export function createSeedState(): ArchiveState {
  return {
    version: 1,
    gems: [
      // 蓝宝石（ORD-2401 需要 2 颗椭圆 6x4 皇家蓝）
      { code: "ST-2048", kind: "蓝宝石", shape: "椭圆", weight: 1.02, sizeText: "6.0x4.0mm", clarity: "VVS", color: "皇家蓝", cut: "明亮切工", position: "主石位" },
      { code: "ST-2051", kind: "蓝宝石", shape: "椭圆", weight: 0.98, sizeText: "6.1x4.0mm", clarity: "VS", color: "皇家蓝", cut: "明亮切工", position: "主石位" },
      { code: "ST-2055", kind: "蓝宝石", shape: "椭圆", weight: 1.05, sizeText: "6.0x4.1mm", clarity: "VVS", color: "矢车菊蓝", cut: "阶梯切工", position: "主石位", note: "颜色偏浅，不适合本单" },
      // 钻石（ORD-2402 需要 6 颗圆形 2.0mm D-F 白钻围石）
      { code: "ST-2061", kind: "钻石", shape: "圆形", weight: 0.08, sizeText: "2.0mm", clarity: "VVS1", color: "D", cut: "理想切工", position: "围石A组" },
      { code: "ST-2062", kind: "钻石", shape: "圆形", weight: 0.08, sizeText: "2.0mm", clarity: "VVS2", color: "E", cut: "理想切工", position: "围石A组" },
      { code: "ST-2063", kind: "钻石", shape: "圆形", weight: 0.09, sizeText: "2.2mm", clarity: "VS1", color: "G", cut: "理想切工", position: "围石A组", note: "尺寸偏大、颜色超档" },
      { code: "ST-2064", kind: "钻石", shape: "圆形", weight: 0.07, sizeText: "1.95mm", clarity: "VVS1", color: "F", cut: "理想切工", position: "围石A组" },
      { code: "ST-2065", kind: "钻石", shape: "圆形", weight: 0.08, sizeText: "2.0mm", clarity: "VS2", color: "E", cut: "理想切工", position: "围石B组" },
      // 祖母绿（ORD-2403 需要 1 颗椭圆 7x5 翠绿）
      { code: "ST-2099", kind: "祖母绿", shape: "椭圆", weight: 1.31, sizeText: "7.5x5.5mm", clarity: "SI", color: "黄绿", cut: "糖塔", position: "需客户确认", note: "内含物明显，颜色与尺寸均不符本单" },
      { code: "ST-2102", kind: "祖母绿", shape: "椭圆", weight: 1.28, sizeText: "7.0x5.0mm", clarity: "VS", color: "翠绿", cut: "糖塔", position: "主石位" },
    ],
    batches: [
      { id: "B-01", name: "分拣批次 B-01", capacity: 8 },
      { id: "B-02", name: "分拣批次 B-02", capacity: 6 },
    ],
    orders: [
      {
        id: "ORD-2401",
        name: "皇家蓝蓝宝石戒指",
        kind: "蓝宝石",
        shape: "椭圆",
        sizeSpec: [6, 4],
        sizeTolerance: 0.15,
        colors: ["皇家蓝"],
        needed: 2,
        position: "主石位",
        closed: false,
      },
      {
        id: "ORD-2402",
        name: "满钻围镶项链",
        kind: "钻石",
        shape: "圆形",
        sizeSpec: [2.0],
        sizeTolerance: 0.08,
        colors: ["D", "E", "F"],
        needed: 6,
        position: "围石A组",
        closed: false,
      },
      {
        id: "ORD-2403",
        name: "翠绿祖母绿吊坠",
        kind: "祖母绿",
        shape: "椭圆",
        sizeSpec: [7, 5],
        sizeTolerance: 0.1,
        colors: ["翠绿"],
        needed: 1,
        position: "主石位",
        closed: false,
      },
    ],
    occupancies: [
      { id: "oc-1", batchId: "B-01", gemCode: "ST-2048", orderId: "ORD-2401", createdAt: "2026-09-22 10:12" },
      { id: "oc-2", batchId: "B-01", gemCode: "ST-2061", orderId: "ORD-2402", createdAt: "2026-09-22 10:20" },
      { id: "oc-3", batchId: "B-01", gemCode: "ST-2062", orderId: "ORD-2402", createdAt: "2026-09-22 10:24" },
      { id: "oc-4", batchId: "B-01", gemCode: "ST-2099", orderId: "ORD-2403", createdAt: "2026-09-22 11:05" },
      { id: "oc-5", batchId: "B-01", gemCode: "ST-2065", orderId: null, createdAt: "2026-09-23 09:30" },
    ],
    selectedBatchId: "B-01",
    selectedOrderId: "ORD-2403",
    updatedAt: "2026-09-23 09:30",
  };
}
