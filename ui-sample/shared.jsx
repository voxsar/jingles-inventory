/* global React, I */
// Shared UI helpers reused across screens

const { useState: useStateS, useMemo: useMemoS } = React;

// ---- Status pill that matches semantic value ----
const statusToChip = (s) => {
  const v = (s || "").toLowerCase();
  if (["active", "completed", "closed", "approved"].includes(v))
    return { cls: "chip-success", dot: true };
  if (["draft", "uninspected", "pending"].includes(v))
    return { cls: "chip-warning", dot: true };
  if (["submitted", "inspected", "intransit", "in transit"].includes(v))
    return { cls: "chip-info", dot: true };
  if (["inactive", "disabled", "cancelled", "rejected"].includes(v))
    return { cls: "chip-danger", dot: true };
  return { cls: "", dot: false };
};

const StatusChip = ({ value }) => {
  const { cls, dot } = statusToChip(value);
  return <span className={"chip " + cls}>{dot && <span className="chip-dot"/>}{value}</span>;
};

// ---- Tag pill with hex color ----
const TagPill = ({ name, color }) => (
  <span className="tag-pill" style={{
    background: color ? `${color}1F` : "var(--chip)",
    borderColor: color ? `${color}3a` : "var(--line)",
    color: color || "var(--ink-2)"
  }}>
    <span style={{ width:7, height:7, borderRadius:"50%", background: color || "currentColor" }}/>
    {name}
  </span>
);

// ---- Toolbar with search + filters ----
function Toolbar({ children, search, onSearch }) {
  return (
    <div className="toolbar">
      <div className="input-icon-wrap grow">
        <I.Search size={15} className="input-icon"/>
        <input className="input" placeholder="Search…" value={search || ""}
               onChange={(e)=> onSearch && onSearch(e.target.value)}/>
      </div>
      {children}
    </div>
  );
}

// ---- Page wrapper ----
function Page({ title, sub, actions, children }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
        <div className="row g">{actions}</div>
      </div>
      {children}
    </div>
  );
}

// ---- Pagination footer ----
function Pagination({ from = 1, to = 20, total = 100, perPage = 20 }) {
  return (
    <div className="row between" style={{ padding:"14px 18px", borderTop:"1px solid var(--line)" }}>
      <div className="sm muted">Showing <strong style={{ color:"var(--ink)" }}>{from}-{to}</strong> of <strong style={{ color:"var(--ink)" }}>{total.toLocaleString()}</strong></div>
      <div className="row g">
        <select className="select" defaultValue={perPage} style={{ width: 110, padding:"6px 28px 6px 10px", fontSize: 12.5 }}>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" style={{ width:30, height:30 }}><I.ChevronLeft size={15}/></button>
          <button className="icon-btn" style={{ width:30, height:30, background:"var(--chip)" }}>1</button>
          <button className="icon-btn" style={{ width:30, height:30 }}>2</button>
          <button className="icon-btn" style={{ width:30, height:30 }}>3</button>
          <button className="icon-btn" style={{ width:30, height:30 }}><I.ChevronRight size={15}/></button>
        </div>
      </div>
    </div>
  );
}

// ---- Filter select (display-only) ----
const FSelect = ({ children, w = 160 }) => (
  <select className="select" style={{ width: w, padding: "8px 28px 8px 12px", fontSize: 12.5 }}>
    {children}
  </select>
);

window.Shared = { StatusChip, TagPill, Toolbar, Page, Pagination, FSelect };
