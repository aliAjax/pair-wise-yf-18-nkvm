import { useEffect, useMemo, useReducer, useState } from "react";
import "./styles.css";
import type { Gem, Occupancy } from "./types";
import {
  defectReasons,
  evaluateOrder,
  formatSizeSpec,
  loadState,
  reducer,
  saveState,
} from "./store";

const SHAPE_FILTERS = ["全部", "圆形", "椭圆", "梨形", "祖母绿切"];

interface Notice {
  kind: "ok" | "warn" | "err";
  text: string;
}

function App() {
  // 关掉页面再打开还能接着做：首次渲染从 localStorage 读档，之后每次操作自动写回
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [shapeFilter, setShapeFilter] = useState("全部");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [closeAttempted, setCloseAttempted] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const gemsByCode = useMemo(() => new Map(state.gems.map((g) => [g.code, g])), [state.gems]);

  const batch = state.batches.find((b) => b.id === state.selectedBatchId) ?? state.batches[0];
  const order = state.orders.find((o) => o.id === state.selectedOrderId) ?? state.orders[0];
  const evaluation = useMemo(() => evaluateOrder(state, order), [state, order]);

  const used = state.occupancies.filter((o) => o.batchId === batch.id).length;
  const remaining = batch.capacity - used;

  const occupiedCodes = useMemo(
    () => new Set(state.occupancies.map((o) => o.gemCode)),
    [state.occupancies],
  );

  const batchEntries = useMemo(() => {
    const entries = state.occupancies.filter((o) => o.batchId === batch.id);
    const rank = (o: Occupancy) =>
      o.orderId === order.id ? 0 : o.orderId === null ? 1 : 2;
    return [...entries].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
  }, [state.occupancies, batch.id, order.id]);

  const freeGems = useMemo(() => {
    const gems = state.gems.filter((g) => !occupiedCodes.has(g.code) && (shapeFilter === "全部" || g.shape === shapeFilter));
    // 合格替石排在前面，结项被挡时方便快速补入
    return [...gems].sort((a, b) => defectReasons(a, order).length - defectReasons(b, order).length);
  }, [state.gems, occupiedCodes, shapeFilter, order]);

  const batchCarats = batchEntries.reduce((sum, o) => sum + (gemsByCode.get(o.gemCode)?.weight ?? 0), 0);
  const evaluations = state.orders.map((o) => evaluateOrder(state, o));

  function handleOccupy(gem: Gem) {
    if (remaining <= 0) {
      setNotice({ kind: "err", text: `批次 ${batch.id} 名额已满，先撤掉一颗再占。` });
      return;
    }
    dispatch({ type: "occupy", gemCode: gem.code });
    setNotice({ kind: "ok", text: `${gem.code} 已在批次 ${batch.id} 占用一个名额（尚未配单）。` });
  }

  function handleAssign(entry: Occupancy) {
    if (order.closed) {
      setNotice({ kind: "warn", text: `${order.name} 已结项，不能再配入石头，请切换其他订单。` });
      return;
    }
    dispatch({ type: "assign", occupancyId: entry.id });
    const gem = gemsByCode.get(entry.gemCode);
    setNotice({ kind: "ok", text: `${gem?.code ?? "石头"} 已配入 ${order.name}。` });
  }

  function handleRelease(occupancyId: string) {
    const entry = state.occupancies.find((o) => o.id === occupancyId);
    const gem = entry ? gemsByCode.get(entry.gemCode) : undefined;
    dispatch({ type: "release", occupancyId });
    setNotice({ kind: "ok", text: `已撤掉 ${gem?.code ?? "石头"} 的占用，回到石库，净度与尺寸记录保留。` });
  }

  function handleClose() {
    setCloseAttempted(true);
    if (order.closed) return;
    if (evaluation.defects.length > 0) {
      const list = evaluation.defects.map((d) => d.gem.code).join("、");
      setNotice({ kind: "err", text: `结项被挡住：${list} 不符合「${order.name}」的颜色或尺寸要求。` });
      return;
    }
    if (evaluation.waiting > 0) {
      setNotice({ kind: "warn", text: `结项被挡住：还缺 ${evaluation.waiting} 颗合格石头，补入替石后才能放行。` });
      return;
    }
    if (evaluation.surplus > 0) {
      setNotice({ kind: "warn", text: `结项被挡住：合格石头超出需求 ${evaluation.surplus} 颗，请撤掉多余占用。` });
      return;
    }
    dispatch({ type: "closeOrder" });
    setNotice({ kind: "ok", text: `${order.name} 已结项放行。` });
  }

  function handleSupplement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const code = String(data.get("code") ?? "").trim();
    const weight = Number(data.get("weight"));
    if (!code) {
      setNotice({ kind: "warn", text: "补录失败：宝石编号必填。" });
      return;
    }
    if (state.gems.some((g) => g.code === code)) {
      setNotice({ kind: "err", text: `补录失败：编号 ${code} 已存在。` });
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setNotice({ kind: "warn", text: "补录失败：克拉重量需为正数。" });
      return;
    }
    const gem: Gem = {
      code,
      kind: String(data.get("kind") ?? "").trim() || "未分类",
      shape: String(data.get("shape") ?? "").trim() || "其他",
      weight,
      sizeText: String(data.get("sizeText") ?? "").trim() || "未记录",
      clarity: String(data.get("clarity") ?? "").trim() || "未检",
      color: String(data.get("color") ?? "").trim() || "未分级",
      cut: String(data.get("cut") ?? "").trim() || "未记录",
      position: String(data.get("position") ?? "").trim() || "待定",
      note: String(data.get("note") ?? "").trim() || undefined,
    };
    dispatch({ type: "supplement", gem });
    form.reset();
    setNotice({ kind: "ok", text: `已补录 ${code} 到石库，可占用为合格替石。` });
  }

  function handleReset() {
    if (window.confirm("恢复演示数据将清掉当前存档，确定继续吗？")) {
      dispatch({ type: "reset" });
      setCloseAttempted(false);
      setNotice({ kind: "ok", text: "已恢复初始演示存档。" });
    }
  }

  return (
    <main className="app">
      <section className="hero hero-slim">
        <p>hxyfront-62006 · 珠宝镶嵌拣配工作台</p>
        <h1>宝石分拣与订单拣配</h1>
        <span>
          流程：石头先进批次占用名额 → 配入当前订单；已占用的石头不能直接改配，撤掉占用后才能换单。结项前按订单的颜色与尺寸要求逐颗校验，
          不合格的石头会列出并挡住放行，补入合格替石后才能结项。所有操作自动存档，刷新或重开页面不丢失。
        </span>
      </section>

      {/* 批次 / 订单切换 + 存档状态 */}
      <section className="panel toolbar">
        <div className="toolbar-group">
          <span className="toolbar-label">分拣批次</span>
          <div className="tabs">
            {state.batches.map((b) => {
              const bUsed = state.occupancies.filter((o) => o.batchId === b.id).length;
              return (
                <button
                  key={b.id}
                  className={"tab" + (b.id === batch.id ? " active" : "")}
                  onClick={() => dispatch({ type: "selectBatch", batchId: b.id })}
                >
                  {b.id}
                  <small>
                    {bUsed}/{b.capacity}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="toolbar-group">
          <span className="toolbar-label">当前拣配单</span>
          <select className="order-select" value={order.id} onChange={(e) => { setCloseAttempted(false); dispatch({ type: "selectOrder", orderId: e.target.value }); }}>
            {state.orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.name}
                {o.closed ? "（已结项）" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-group archive">
          <span className="toolbar-label">当前存档</span>
          <small>更新于 {state.updatedAt} · 自动写入本机浏览器</small>
          <button className="ghost" onClick={handleReset}>恢复演示数据</button>
        </div>
      </section>

      {notice && <div className={"notice " + notice.kind}>{notice.text}</div>}

      {/* 实时计数：占用/撤掉/换单/补录后立即按当前存档重算 */}
      <section className="metrics">
        <article>
          <small>批次余量（{batch.id}）</small>
          <strong>{remaining}</strong>
          <p>名额 {batch.capacity} · 已占 {used}</p>
        </article>
        <article>
          <small>订单待配数（{order.id}）</small>
          <strong>{order.closed ? 0 : evaluation.waiting}</strong>
          <p>
            合格 {evaluation.qualifiedCount}/{order.needed} 颗
          </p>
        </article>
        <article className={evaluation.defects.length > 0 ? "alarm" : ""}>
          <small>缺陷条数（颜色/尺寸不符）</small>
          <strong>{order.closed ? 0 : evaluation.defects.length}</strong>
          <p>{order.closed ? "订单已结项" : evaluation.defects.length ? "结项被挡住" : "本单暂无缺陷"}</p>
        </article>
        <article>
          <small>本批占用总克拉</small>
          <strong>{batchCarats.toFixed(2)}</strong>
          <p>{batchEntries.length} 颗在批石头</p>
        </article>
      </section>

      <section className="workbench">
        <div className="column">
          {/* 当前订单要求与结项 */}
          <section className="panel">
            <div className="heading">
              <div>
                <p>按订单拣配</p>
                <h2>
                  {order.name}
                  {order.closed && <span className="badge closed">已结项 {order.closedAt}</span>}
                </h2>
              </div>
              <button className="primary" disabled={order.closed} onClick={handleClose}>
                {order.closed ? "已放行" : "结项放行"}
              </button>
            </div>
            <div className="spec-grid">
              <span><b>种类</b>{order.kind}</span>
              <span><b>形状</b>{order.shape}</span>
              <span><b>尺寸</b>{formatSizeSpec(order)} ±{order.sizeTolerance}mm</span>
              <span><b>颜色</b>{order.colors.join(" / ")}</span>
              <span><b>需配</b>{order.needed} 颗</span>
              <span><b>镶嵌位置</b>{order.position}</span>
            </div>

            {order.closed ? (
              <div className="alert ok">订单已于 {order.closedAt} 结项放行，占用石头随单锁定。</div>
            ) : (
              <>
                {evaluation.defects.length > 0 && (
                  <div className="alert err">
                    <h3>结项被挡住：以下 {evaluation.defects.length} 颗石头不符合颜色或尺寸要求</h3>
                    {evaluation.defects.map((d) => (
                      <div key={d.occupancyId} className="defect-row">
                        <div>
                          <b>{d.gem.code}</b>
                          <ul>
                            {d.reasons.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="defect-actions">
                          <span className="muted">净度记录：{d.gem.clarity}</span>
                          <button className="danger" onClick={() => handleRelease(d.occupancyId)}>
                            撤掉占用
                          </button>
                        </div>
                      </div>
                    ))}
                    <p className="hint">撤掉不合格石头后，从右侧石库补入合格替石再结项；净度、尺寸等原始记录仍保留在石头档案中。</p>
                  </div>
                )}
                {evaluation.defects.length === 0 && evaluation.waiting > 0 && (
                  <div className={"alert " + (closeAttempted ? "err" : "warn")}>
                    {closeAttempted
                      ? `结项被挡住：还缺 ${evaluation.waiting} 颗合格石头，补入后才放行。`
                      : `还差 ${evaluation.waiting} 颗合格石头达到 ${order.needed} 颗的配石要求。`}
                  </div>
                )}
                {!evaluation.blocked && (
                  <div className="alert ok">颜色与尺寸全部合格，数量齐备，可以结项放行。</div>
                )}
                {evaluation.surplus > 0 && (
                  <div className={"alert " + (closeAttempted ? "err" : "warn")}>
                    {closeAttempted
                      ? `结项被挡住：合格石头超出需求 ${evaluation.surplus} 颗，撤掉多余占用后才放行。`
                      : `合格石头超出需求 ${evaluation.surplus} 颗，结项前请撤掉多余占用。`}
                  </div>
                )}
              </>
            )}
          </section>

          {/* 批次占用清单 */}
          <section className="panel">
            <div className="heading">
              <div>
                <p>批次名额</p>
                <h2>{batch.name} 占用清单</h2>
              </div>
              <span className={"quota" + (remaining === 0 ? " full" : "")}>
                余量 {remaining}/{batch.capacity}
              </span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${(used / batch.capacity) * 100}%` }} />
            </div>
            {batchEntries.length === 0 && <p className="muted empty">本批次还没有占用石头，从右侧石库占入。</p>}
            <div className="entry-list">
              {batchEntries.map((entry) => {
                const gem = gemsByCode.get(entry.gemCode);
                if (!gem) return null;
                const entryOrder = state.orders.find((o) => o.id === entry.orderId);
                const reasons = entryOrder ? defectReasons(gem, entryOrder) : [];
                const locked = entryOrder?.closed;
                return (
                  <article key={entry.id} className={"entry" + (reasons.length ? " defect" : "")}>
                    <div className="entry-main">
                      <h3>
                        {gem.code}
                        {entry.orderId === order.id && <span className="badge current">本单 · {order.id}</span>}
                        {entry.orderId && entry.orderId !== order.id && (
                          <span className="badge other">属 {entryOrder?.id}</span>
                        )}
                        {entry.orderId === null && <span className="badge free">仅占名额</span>}
                        {locked && <span className="badge closed">已结项锁定</span>}
                      </h3>
                      <p>
                        {gem.kind} · {gem.shape} · {gem.sizeText} · {gem.color} · {gem.weight}ct
                        {gem.position ? ` · ${gem.position}` : ""}
                      </p>
                      <p className="muted">净度 {gem.clarity} · 切工 {gem.cut} · 占用时间 {entry.createdAt}</p>
                      {reasons.length > 0 && (
                        <ul className="reason-list">
                          {reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="entry-actions">
                      {entry.orderId === null && (
                        <button className="mini primary" disabled={order.closed} onClick={() => handleAssign(entry)}>
                          配入{order.closed ? "" : ` ${order.id}`}
                        </button>
                      )}
                      {entry.orderId === order.id && !locked && (
                        <span className="muted">撤掉后才能改配其他订单</span>
                      )}
                      <button className="mini" disabled={locked} onClick={() => handleRelease(entry.id)}>
                        撤掉占用
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <div className="column">
          {/* 石库 */}
          <section className="panel">
            <div className="heading">
              <div>
                <p>石库（未占用）</p>
                <h2>拣选石头</h2>
              </div>
              <span className="muted">{freeGems.length} 颗可选</span>
            </div>
            <div className="chips">
              {SHAPE_FILTERS.map((s) => (
                <button
                  key={s}
                  className={shapeFilter === s ? "active" : ""}
                  onClick={() => setShapeFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            {freeGems.length === 0 && <p className="muted empty">没有符合筛选的空闲石头，可在下方补录。</p>}
            <div className="gem-grid">
              {freeGems.map((gem) => {
                const reasons = defectReasons(gem, order);
                const eligible = reasons.length === 0;
                return (
                  <article key={gem.code} className={"gem" + (eligible ? "" : " mismatch")}>
                    <h3>
                      {gem.code}
                      <span className={"badge " + (eligible ? "ok" : "bad")}>
                        {order.closed ? "—" : eligible ? "合格本单" : "不合格"}
                      </span>
                    </h3>
                    <p>
                      {gem.kind} · {gem.shape} · {gem.sizeText} · {gem.color} · {gem.weight}ct
                    </p>
                    <p className="muted">净度 {gem.clarity} · {gem.position}</p>
                    {!eligible && !order.closed && (
                      <ul className="reason-list compact">
                        {reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                    {gem.note && <p className="gem-note">缺陷备注：{gem.note}</p>}
                    <button className="mini primary" disabled={remaining <= 0} onClick={() => handleOccupy(gem)}>
                      {remaining <= 0 ? "批次已满" : `占用名额到 ${batch.id}`}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          {/* 补录 */}
          <section className="panel">
            <div className="heading">
              <div>
                <p>补录石头</p>
                <h2>合格替石 / 新石建档</h2>
              </div>
            </div>
            <form className="field-grid" onSubmit={handleSupplement}>
              <label><span>宝石编号 *</span><input name="code" placeholder="如 ST-2108" /></label>
              <label><span>种类</span><input name="kind" placeholder="蓝宝石 / 钻石 / 祖母绿" /></label>
              <label>
                <span>形状</span>
                <select name="shape" className="input-select">
                  <option>椭圆</option>
                  <option>圆形</option>
                  <option>梨形</option>
                  <option>祖母绿切</option>
                </select>
              </label>
              <label><span>克拉重量 *</span><input name="weight" type="number" step="0.01" min="0" placeholder="1.00" /></label>
              <label><span>尺寸</span><input name="sizeText" placeholder="7.0x5.0mm / 2.0mm" /></label>
              <label><span>净度</span><input name="clarity" placeholder="VVS / VS / SI" /></label>
              <label><span>颜色</span><input name="color" placeholder="翠绿 / 皇家蓝 / D" /></label>
              <label><span>切工</span><input name="cut" placeholder="糖塔 / 理想切工" /></label>
              <label><span>镶嵌位置</span><input name="position" placeholder="主石位 / 围石A组" /></label>
              <label><span>缺陷备注</span><input name="note" placeholder="无则留空，记录长期保留" /></label>
              <div className="form-actions">
                <button className="primary" type="submit">补录到石库</button>
              </div>
            </form>
          </section>
        </div>
      </section>

      {/* 全部订单概览 */}
      <section className="panel">
        <div className="heading">
          <div>
            <p>按订单查看</p>
            <h2>全部拣配单进度</h2>
          </div>
        </div>
        <div className="order-grid">
          {evaluations.map((ev: ReturnType<typeof evaluateOrder>) => (
            <button
              key={ev.order.id}
              className={"order-card" + (ev.order.id === order.id ? " active" : "") + (ev.defects.length ? " alarm-border" : "")}
              onClick={() => { setCloseAttempted(false); dispatch({ type: "selectOrder", orderId: ev.order.id }); }}
            >
              <h3>{ev.order.id} · {ev.order.name}</h3>
              <p>
                {ev.order.closed ? "已结项放行" : ev.defects.length ? `${ev.defects.length} 颗不合格挡住结项` : ev.waiting > 0 ? `待配 ${ev.waiting} 颗` : "可结项"}
              </p>
              <p className="muted">
                合格 {ev.qualifiedCount}/{ev.order.needed} · 尺寸 {formatSizeSpec(ev.order)} · 颜色 {ev.order.colors.join("/")}
              </p>
            </button>
          ))}
        </div>
      </section>

      <p className="footer-note">
        净度与尺寸是石头档案的原始记录，占用、撤单、换单都不会改动；结项仅按订单的颜色与尺寸要求校验。
      </p>
    </main>
  );
}

export default App;
