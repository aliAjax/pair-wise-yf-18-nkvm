import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const project = {
  sourceNo: 8,
  id: "hxyfront-62006",
  port: 62006,
  title: "珠宝镶嵌宝石分拣",
};

const STORAGE_KEY = "hxyfront-62006:workbench:v1";

type Gem = {
  id: string; // 宝石编号
  type: string; // 种类
  shape: string; // 形状
  carat: number; // 克拉重量
  size: string; // 尺寸
  clarity: string; // 净度
  color: string; // 颜色
  cut: string; // 切工
  position: string; // 镶嵌位置
  defect: string; // 缺陷备注（空串 = 无）
};

type Batch = {
  id: string;
  name: string;
  capacity: number;
};

type Order = {
  id: string;
  name: string;
  batchId: string;
  requiredColor: string;
  requiredSize: string;
  requiredCount: number;
  status: "进行中" | "已结项";
};

type Allocation = {
  gemId: string;
  orderId: string;
};

type WorkState = {
  gems: Gem[];
  batches: Batch[];
  orders: Order[];
  allocations: Allocation[];
};

type Notice = { kind: "ok" | "warn" | "err"; text: string } | null;

const seedState: WorkState = {
  batches: [
    { id: "B-01", name: "主石批次", capacity: 6 },
    { id: "B-02", name: "配石批次", capacity: 10 },
  ],
  orders: [
    { id: "ORD-101", name: "蓝宝订婚戒", batchId: "B-01", requiredColor: "皇家蓝", requiredSize: "6x4mm", requiredCount: 3, status: "进行中" },
    { id: "ORD-102", name: "钻石围镶项链", batchId: "B-02", requiredColor: "D色", requiredSize: "2.0mm", requiredCount: 5, status: "进行中" },
    { id: "ORD-103", name: "祖母绿耳坠", batchId: "B-01", requiredColor: "艳绿色", requiredSize: "5x3mm", requiredCount: 2, status: "进行中" },
  ],
  gems: [
    { id: "ST-2048", type: "蓝宝石", shape: "椭圆", carat: 1.2, size: "6x4mm", clarity: "VVS", color: "皇家蓝", cut: "极好", position: "主石位", defect: "" },
    { id: "ST-2049", type: "蓝宝石", shape: "椭圆", carat: 1.15, size: "6x4mm", clarity: "VS1", color: "皇家蓝", cut: "很好", position: "主石位", defect: "台面微划痕" },
    { id: "ST-2050", type: "蓝宝石", shape: "椭圆", carat: 1.08, size: "6x4mm", clarity: "VVS", color: "皇家蓝", cut: "极好", position: "主石位", defect: "" },
    { id: "ST-2052", type: "蓝宝石", shape: "椭圆", carat: 1.02, size: "6x4mm", clarity: "VS1", color: "矢车菊蓝", cut: "很好", position: "主石位", defect: "" },
    { id: "ST-2061", type: "钻石", shape: "圆形", carat: 0.08, size: "2.0mm", clarity: "VS", color: "D色", cut: "极好", position: "围石A组", defect: "" },
    { id: "ST-2062", type: "钻石", shape: "圆形", carat: 0.08, size: "2.0mm", clarity: "VS", color: "D色", cut: "极好", position: "围石A组", defect: "" },
    { id: "ST-2063", type: "钻石", shape: "圆形", carat: 0.08, size: "2.0mm", clarity: "SI1", color: "D色", cut: "很好", position: "围石A组", defect: "针状内含物" },
    { id: "ST-2064", type: "钻石", shape: "圆形", carat: 0.1, size: "2.5mm", clarity: "VS", color: "D色", cut: "很好", position: "围石B组", defect: "" },
    { id: "ST-2099", type: "祖母绿", shape: "祖母绿切", carat: 0.9, size: "5x3mm", clarity: "SI1", color: "艳绿色", cut: "很好", position: "主石位", defect: "内含物明显，需客户确认" },
    { id: "ST-2100", type: "祖母绿", shape: "祖母绿切", carat: 0.86, size: "5x3mm", clarity: "VS", color: "艳绿色", cut: "极好", position: "主石位", defect: "" },
    { id: "ST-2101", type: "祖母绿", shape: "祖母绿切", carat: 0.8, size: "5x3mm", clarity: "VS", color: "浅绿色", cut: "很好", position: "主石位", defect: "" },
  ],
  allocations: [
    { gemId: "ST-2048", orderId: "ORD-101" },
    { gemId: "ST-2052", orderId: "ORD-101" },
    { gemId: "ST-2061", orderId: "ORD-102" },
    { gemId: "ST-2062", orderId: "ORD-102" },
    { gemId: "ST-2064", orderId: "ORD-102" },
    { gemId: "ST-2099", orderId: "ORD-103" },
  ],
};

function loadState(): WorkState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkState;
      if (
        Array.isArray(parsed.gems) &&
        Array.isArray(parsed.batches) &&
        Array.isArray(parsed.orders) &&
        Array.isArray(parsed.allocations)
      ) {
        return parsed;
      }
    }
  } catch {
    // 存档损坏时回退到初始数据
  }
  return structuredClone(seedState);
}

/** 宝石相对订单要求的不符项（净度等档案不参与卡控，仅颜色/尺寸卡结项） */
function conformIssues(gem: Gem, order: Order): string[] {
  const issues: string[] = [];
  if (gem.color !== order.requiredColor) {
    issues.push(`颜色需${order.requiredColor}，实为${gem.color}`);
  }
  if (gem.size !== order.requiredSize) {
    issues.push(`尺寸需${order.requiredSize}，实为${gem.size}`);
  }
  return issues;
}

type AllocateControlProps = {
  gemId: string;
  options: { id: string; label: string; disabled: boolean }[];
  onAllocate: (gemId: string, orderId: string) => void;
};

function AllocateControl({ gemId, options, onAllocate }: AllocateControlProps) {
  const [target, setTarget] = useState("");
  if (options.length === 0) {
    return <span className="muted">暂无开放订单</span>;
  }
  const usable = options.filter((o) => !o.disabled);
  const value = usable.some((o) => o.id === target) ? target : usable[0]?.id ?? "";
  return (
    <div className="allocate">
      <select value={value} onChange={(e) => setTarget(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        className="primary small"
        disabled={!value}
        onClick={() => onAllocate(gemId, value)}
      >
        占用名额
      </button>
    </div>
  );
}

const emptyGemForm = {
  id: "",
  type: "",
  shape: "圆形",
  carat: "",
  size: "",
  clarity: "",
  color: "",
  cut: "",
  position: "",
  defect: "",
};

function App() {
  const [state, setState] = useState<WorkState>(loadState);
  const [notice, setNotice] = useState<Notice>(null);
  const [shapeFilter, setShapeFilter] = useState("全部");
  const [gemForm, setGemForm] = useState(emptyGemForm);

  // 每次占用、撤掉、换单或补录后都写入存档，关掉页面再打开可接着做
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const orderById = (id: string) => state.orders.find((o) => o.id === id);
  const batchById = (id: string) => state.batches.find((b) => b.id === id);
  const allocationsOf = (orderId: string) =>
    state.allocations.filter((a) => a.orderId === orderId);
  const allocationOfGem = (gemId: string) =>
    state.allocations.find((a) => a.gemId === gemId);
  const batchUsed = (batchId: string) =>
    state.allocations.filter((a) => orderById(a.orderId)?.batchId === batchId).length;
  const orderPending = (order: Order) =>
    Math.max(0, order.requiredCount - allocationsOf(order.id).length);

  // 指标全部从当前存档推导
  const metrics = useMemo(() => {
    const remaining = state.batches.reduce(
      (sum, b) => sum + (b.capacity - batchUsed(b.id)),
      0
    );
    const capacity = state.batches.reduce((sum, b) => sum + b.capacity, 0);
    const pending = state.orders
      .filter((o) => o.status === "进行中")
      .reduce((sum, o) => sum + orderPending(o), 0);
    const defects = state.gems.filter((g) => g.defect.trim() !== "").length;
    const carat = state.gems.reduce((sum, g) => sum + g.carat, 0);
    return { remaining, capacity, pending, defects, carat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** 占用：宝石进订单前占用一个批次名额 */
  const allocate = (gemId: string, orderId: string) => {
    const order = orderById(orderId);
    const gem = state.gems.find((g) => g.id === gemId);
    if (!order || !gem) return;
    if (order.status === "已结项") {
      setNotice({ kind: "err", text: `${order.name} 已结项，不能再占用名额。` });
      return;
    }
    if (allocationOfGem(gemId)) {
      setNotice({ kind: "warn", text: `${gemId} 已被占用，需先撤掉占用才能改配。` });
      return;
    }
    if (allocationsOf(orderId).length >= order.requiredCount) {
      setNotice({ kind: "warn", text: `${order.name} 已配齐，无需再占用。` });
      return;
    }
    const batch = batchById(order.batchId);
    if (batch && batchUsed(batch.id) >= batch.capacity) {
      setNotice({ kind: "err", text: `${batch.name} 名额已满，无法占用。` });
      return;
    }
    setState((s) => ({ ...s, allocations: [...s.allocations, { gemId, orderId }] }));
    setNotice({
      kind: "ok",
      text: `${gemId} 已占用 ${batch?.name ?? order.batchId} 一个名额，进入 ${order.name}；净度 ${gem.clarity}、尺寸 ${gem.size} 档案保留。`,
    });
  };

  /** 撤掉占用：释放批次名额，之后才能改配 */
  const release = (gemId: string) => {
    const alloc = allocationOfGem(gemId);
    if (!alloc) return;
    const order = orderById(alloc.orderId);
    if (order?.status === "已结项") {
      setNotice({ kind: "err", text: `${order.name} 已结项，占用已锁定，不能撤掉。` });
      return;
    }
    setState((s) => ({
      ...s,
      allocations: s.allocations.filter((a) => a.gemId !== gemId),
    }));
    setNotice({
      kind: "ok",
      text: `${gemId} 已撤掉占用，批次名额已释放，现在可以改配到其他订单。`,
    });
  };

  /** 结项：有不符颜色/尺寸的石头则挡住并列出，补入合格替石后才放行 */
  const closeOrder = (orderId: string) => {
    const order = orderById(orderId);
    if (!order || order.status === "已结项") return;
    const gems = allocationsOf(orderId)
      .map((a) => state.gems.find((g) => g.id === a.gemId))
      .filter((g): g is Gem => Boolean(g));
    const bad = gems
      .map((g) => ({ gem: g, issues: conformIssues(g, order) }))
      .filter((x) => x.issues.length > 0);
    if (bad.length > 0) {
      setNotice({
        kind: "err",
        text: `${order.name} 结项被挡住，不符宝石：${bad
          .map((x) => `${x.gem.id}（${x.issues.join("；")}）`)
          .join("，")}。请撤掉后补入合格替石。`,
      });
      return;
    }
    if (gems.length < order.requiredCount) {
      setNotice({
        kind: "warn",
        text: `${order.name} 还差 ${order.requiredCount - gems.length} 颗待配，配齐合格宝石后才能结项。`,
      });
      return;
    }
    setState((s) => ({
      ...s,
      orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: "已结项" } : o)),
    }));
    setNotice({ kind: "ok", text: `${order.name} 全部合格，已结项放行。` });
  };

  /** 补录：新宝石登记入库存档 */
  const addGem = () => {
    const id = gemForm.id.trim();
    if (!id) {
      setNotice({ kind: "err", text: "补录失败：宝石编号不能为空。" });
      return;
    }
    if (state.gems.some((g) => g.id === id)) {
      setNotice({ kind: "err", text: `补录失败：${id} 已存在存档中。` });
      return;
    }
    if (!gemForm.color.trim() || !gemForm.size.trim()) {
      setNotice({ kind: "err", text: "补录失败：颜色与尺寸必填，结项卡控要用。" });
      return;
    }
    const gem: Gem = {
      id,
      type: gemForm.type.trim() || "未分类",
      shape: gemForm.shape.trim() || "圆形",
      carat: Number.parseFloat(gemForm.carat) || 0,
      size: gemForm.size.trim(),
      clarity: gemForm.clarity.trim() || "未分级",
      color: gemForm.color.trim(),
      cut: gemForm.cut.trim() || "未评级",
      position: gemForm.position.trim() || "待定",
      defect: gemForm.defect.trim(),
    };
    setState((s) => ({ ...s, gems: [...s.gems, gem] }));
    setGemForm(emptyGemForm);
    setNotice({ kind: "ok", text: `${id} 已补录入库，可为其占用批次名额。` });
  };

  const resetAll = () => {
    setState(structuredClone(seedState));
    setNotice({ kind: "ok", text: "已恢复初始存档。" });
  };

  const shapes = ["全部", ...new Set(state.gems.map((g) => g.shape))];
  const visibleGems =
    shapeFilter === "全部"
      ? state.gems
      : state.gems.filter((g) => g.shape === shapeFilter);

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-top">
          <p>
            {project.id} · 源提示词{project.sourceNo} · Port {project.port}
          </p>
          <button onClick={resetAll}>重置存档</button>
        </div>
        <h1>{project.title}</h1>
        <span>
          宝石进订单前先占用批次名额；撤掉占用才能改配，净度尺寸档案始终保留。
          结项时若批次内宝石的颜色或尺寸不符订单要求会被挡住并逐颗列出，补入合格替石后才放行。
          批次余量、订单待配数、缺陷条数均按当前存档实时显示，关掉页面再打开可接着做。
        </span>
      </section>

      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

      <section className="metrics">
        <article>
          <small>批次余量</small>
          <strong>
            {metrics.remaining}
            <em>/{metrics.capacity}</em>
          </strong>
        </article>
        <article>
          <small>订单待配数</small>
          <strong>{metrics.pending}</strong>
        </article>
        <article>
          <small>缺陷条数</small>
          <strong>{metrics.defects}</strong>
        </article>
        <article>
          <small>总克拉</small>
          <strong>{metrics.carat.toFixed(2)}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>批次名额</h2>
          <div className="batch-list">
            {state.batches.map((b) => {
              const used = batchUsed(b.id);
              const left = b.capacity - used;
              return (
                <div className="batch-card" key={b.id}>
                  <div className="batch-head">
                    <b>{b.name}</b>
                    <span className="muted">
                      余量 {left}/{b.capacity}
                    </span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(used / b.capacity) * 100}%` }} />
                  </div>
                  <small className="muted">已占用 {used} 个名额</small>
                </div>
              );
            })}
          </div>

          <h2 className="mt">形状筛选</h2>
          <div className="chips">
            {shapes.map((s) => (
              <button
                key={s}
                className={shapeFilter === s ? "chip-active" : ""}
                onClick={() => setShapeFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>按订单查看</p>
              <h2>订单配单</h2>
            </div>
          </div>
          <div className="order-grid">
            {state.orders.map((order) => {
              const allocs = allocationsOf(order.id);
              const gems = allocs
                .map((a) => state.gems.find((g) => g.id === a.gemId))
                .filter((g): g is Gem => Boolean(g));
              const bad = gems
                .map((g) => ({ gem: g, issues: conformIssues(g, order) }))
                .filter((x) => x.issues.length > 0);
              const pending = orderPending(order);
              const closed = order.status === "已结项";
              return (
                <article className="order-card" key={order.id}>
                  <div className="order-head">
                    <div>
                      <h3>{order.name}</h3>
                      <p className="muted">
                        {order.id} · {batchById(order.batchId)?.name ?? order.batchId}
                      </p>
                    </div>
                    <span className={`tag ${closed ? "closed" : "open"}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="req-chips">
                    <span>颜色 {order.requiredColor}</span>
                    <span>尺寸 {order.requiredSize}</span>
                    <span>
                      已配 {gems.length}/{order.requiredCount} · 待配 {pending}
                    </span>
                  </div>
                  <ul className="alloc-list">
                    {gems.length === 0 && <li className="muted">尚未配石</li>}
                    {gems.map((g) => {
                      const issues = conformIssues(g, order);
                      return (
                        <li key={g.id}>
                          <div>
                            <b>{g.id}</b>{" "}
                            <span className="muted">
                              {g.type} · 净度 {g.clarity} · {g.size} · {g.color}
                              {g.defect && (
                                <em className="defect">（缺陷：{g.defect}）</em>
                              )}
                            </span>
                          </div>
                          <div className="alloc-actions">
                            {issues.length === 0 ? (
                              <span className="badge ok">合格</span>
                            ) : (
                              issues.map((i) => (
                                <span className="badge bad" key={i}>
                                  {i}
                                </span>
                              ))
                            )}
                            {!closed && (
                              <button className="small" onClick={() => release(g.id)}>
                                撤掉
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {bad.length > 0 && !closed && (
                    <div className="warn-box">
                      结项被挡住，不符宝石：
                      {bad
                        .map((x) => `${x.gem.id}（${x.issues.join("；")}）`)
                        .join("，")}
                      。请撤掉后补入合格替石。
                    </div>
                  )}
                  <div className="order-foot">
                    <small className="muted">
                      {closed
                        ? "已结项，占用锁定。"
                        : "结项将校验颜色与尺寸，不符会被挡住。"}
                    </small>
                    <button
                      className="primary"
                      disabled={closed}
                      onClick={() => closeOrder(order.id)}
                    >
                      结项
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>库存清单</p>
            <h2>宝石库存（{visibleGems.length} 颗）</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="gem-table">
            <thead>
              <tr>
                <th>宝石编号</th>
                <th>种类</th>
                <th>形状</th>
                <th>克拉</th>
                <th>尺寸</th>
                <th>净度</th>
                <th>颜色</th>
                <th>切工</th>
                <th>镶嵌位置</th>
                <th>缺陷备注</th>
                <th>配单状态 / 操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleGems.map((g) => {
                const alloc = allocationOfGem(g.id);
                const allocOrder = alloc ? orderById(alloc.orderId) : undefined;
                const locked = allocOrder?.status === "已结项";
                return (
                  <tr key={g.id}>
                    <td>
                      <b>{g.id}</b>
                    </td>
                    <td>{g.type}</td>
                    <td>{g.shape}</td>
                    <td>{g.carat.toFixed(2)}</td>
                    <td>{g.size}</td>
                    <td>{g.clarity}</td>
                    <td>{g.color}</td>
                    <td>{g.cut}</td>
                    <td>{g.position}</td>
                    <td>{g.defect ? <span className="defect">{g.defect}</span> : "—"}</td>
                    <td>
                      {alloc && allocOrder ? (
                        <div className="allocate">
                          <span className={`tag ${locked ? "closed" : "open"}`}>
                            已配 {allocOrder.name}
                          </span>
                          {locked ? (
                            <small className="muted">已锁定</small>
                          ) : (
                            <>
                              <button className="small" onClick={() => release(g.id)}>
                                撤掉占用
                              </button>
                              <small className="muted">改配需先撤掉</small>
                            </>
                          )}
                        </div>
                      ) : (
                        <AllocateControl
                          gemId={g.id}
                          options={state.orders.map((o) => {
                            const batch = batchById(o.batchId);
                            const full =
                              o.status === "已结项" ||
                              orderPending(o) === 0 ||
                              (batch ? batchUsed(batch.id) >= batch.capacity : true);
                            return {
                              id: o.id,
                              label: `${o.name}（待配 ${orderPending(o)}）`,
                              disabled: full,
                            };
                          })}
                          onAllocate={allocate}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel form-panel">
        <div className="heading">
          <div>
            <p>补录</p>
            <h2>登记新宝石</h2>
          </div>
          <button className="primary" onClick={addGem}>
            补录入库
          </button>
        </div>
        <div className="field-grid">
          <label>
            <span>宝石编号 *</span>
            <input
              placeholder="如 ST-2105"
              value={gemForm.id}
              onChange={(e) => setGemForm({ ...gemForm, id: e.target.value })}
            />
          </label>
          <label>
            <span>种类</span>
            <input
              placeholder="如 红宝石"
              value={gemForm.type}
              onChange={(e) => setGemForm({ ...gemForm, type: e.target.value })}
            />
          </label>
          <label>
            <span>形状</span>
            <select
              value={gemForm.shape}
              onChange={(e) => setGemForm({ ...gemForm, shape: e.target.value })}
            >
              {["圆形", "椭圆", "梨形", "祖母绿切", "公主方", "马眼"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span>克拉重量</span>
            <input
              placeholder="如 0.75"
              value={gemForm.carat}
              onChange={(e) => setGemForm({ ...gemForm, carat: e.target.value })}
            />
          </label>
          <label>
            <span>尺寸 *</span>
            <input
              placeholder="如 6x4mm"
              value={gemForm.size}
              onChange={(e) => setGemForm({ ...gemForm, size: e.target.value })}
            />
          </label>
          <label>
            <span>净度</span>
            <input
              placeholder="如 VS1"
              value={gemForm.clarity}
              onChange={(e) => setGemForm({ ...gemForm, clarity: e.target.value })}
            />
          </label>
          <label>
            <span>颜色 *</span>
            <input
              placeholder="如 皇家蓝"
              value={gemForm.color}
              onChange={(e) => setGemForm({ ...gemForm, color: e.target.value })}
            />
          </label>
          <label>
            <span>切工</span>
            <input
              placeholder="如 极好"
              value={gemForm.cut}
              onChange={(e) => setGemForm({ ...gemForm, cut: e.target.value })}
            />
          </label>
          <label>
            <span>镶嵌位置</span>
            <input
              placeholder="如 主石位"
              value={gemForm.position}
              onChange={(e) => setGemForm({ ...gemForm, position: e.target.value })}
            />
          </label>
          <label>
            <span>缺陷备注</span>
            <input
              placeholder="无缺陷可留空"
              value={gemForm.defect}
              onChange={(e) => setGemForm({ ...gemForm, defect: e.target.value })}
            />
          </label>
        </div>
      </section>
    </main>
  );
}

export default App;
