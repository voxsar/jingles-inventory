/* global React, I, Shared */
// Core screens: Dashboard, Inventory, Products, GRNs, PRNs

const { StatusChip, TagPill, Toolbar, Page, Pagination, FSelect } = Shared;
const { useState: useS } = React;

/* ===========================================================
   DASHBOARD
   =========================================================== */
function Dashboard() {
  return (
    <Page
      title="Dashboard"
      sub="Welcome back, Admin — here's how your warehouses look today."
      actions={
        <>
          <button className="btn btn-ghost btn-sm"><I.Refresh size={14}/> Refresh</button>
          <button className="btn btn-primary btn-sm"><I.Plus size={14}/> Quick Action</button>
        </>
      }
    >
      {/* Hero AI insight */}
      <div className="glass" style={{ borderRadius:"var(--r-xl)", padding:"22px 24px", marginBottom: 22,
                                       position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, background:
          "radial-gradient(800px 200px at 0% 0%, rgba(124,92,255,0.18), transparent 60%)", pointerEvents:"none" }}/>
        <div className="row g" style={{ position:"relative", alignItems:"flex-start" }}>
          <div style={{ width:42, height:42, borderRadius:12, flexShrink:0,
                         background:"conic-gradient(from 0deg, var(--accent-1), var(--accent-2), var(--accent-3), var(--accent-1))",
                         display:"grid", placeItems:"center", color:"white",
                         boxShadow:"0 10px 28px -10px rgba(124,92,255,0.7)" }}>
            <I.Sparkles size={18}/>
          </div>
          <div style={{ flex:1 }}>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <span className="chip chip-accent" style={{ fontSize: 10.5 }}>AI INSIGHT</span>
              <span className="sm muted">Updated 2m ago</span>
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.55, color:"var(--ink)", letterSpacing:"-0.01em" }}>
              <strong>3 GRNs</strong> have been sitting in Submitted or Draft for more than 4 days. Closing them today would unlock
              <strong> 12,940 units</strong> across <strong>JINGLES WHOLSALE</strong>. Want me to draft a reconciliation note?
            </div>
            <div className="row g" style={{ marginTop: 14 }}>
              <button className="btn btn-primary btn-sm">Draft note <I.ArrowRight size={13}/></button>
              <button className="btn btn-ghost btn-sm">Show me the GRNs</button>
              <button className="btn btn-ghost btn-sm">Dismiss</button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid g-4">
        <StatCard icon={I.Box} label="Total Items" value="20,863" delta="+1.2% wk" up
                  glow="rgba(124,92,255,0.25)"/>
        <StatCard icon={I.CheckCircle} label="Shelf Ready" value="12,169"
                  delta="+58 today" up
                  iconColor="#10b981" iconBg="rgba(16,185,129,0.12)" iconBorder="rgba(16,185,129,0.25)"
                  glow="rgba(16,185,129,0.25)"/>
        <StatCard icon={I.Receipt} label="Open GRNs" value="3"
                  delta="2 over SLA" down
                  iconColor="#f59e0b" iconBg="rgba(245,158,11,0.12)" iconBorder="rgba(245,158,11,0.25)"
                  glow="rgba(245,158,11,0.22)"/>
        <StatCard icon={I.Warning} label="Damaged" value="771"
                  delta="-3.4% wk" up
                  iconColor="#ef4444" iconBg="rgba(239,68,68,0.12)" iconBorder="rgba(239,68,68,0.25)"
                  glow="rgba(239,68,68,0.22)"/>
      </div>

      <div className="grid g-3" style={{ marginTop: 22 }}>
        {/* Inventory by state */}
        <div className="card" style={{ gridColumn:"span 2", padding: 22 }}>
          <div className="row between" style={{ marginBottom: 14 }}>
            <div>
              <div className="section-title">Inventory by State</div>
              <div className="section-sub" style={{ marginTop: 0 }}>Live snapshot across all branches</div>
            </div>
            <div className="tabs">
              <button className="tab is-active">All</button>
              <button className="tab">Dubai HQ</button>
              <button className="tab">JINGLES</button>
              <button className="tab">BIZONE</button>
            </div>
          </div>
          <BarRow label="Inspected" count={12169} pct={94} color="linear-gradient(90deg, var(--accent-2), var(--accent-1))"/>
          <BarRow label="Uninspected" count={723} pct={5.5} color="linear-gradient(90deg, #f59e0b, #fbbf24)"/>
          <BarRow label="Damaged" count={48} pct={0.4} color="linear-gradient(90deg, #ef4444, #f87171)"/>
          <BarRow label="Quarantine" count={0} pct={0} color="linear-gradient(90deg, #475569, #94a3b8)" muted/>
        </div>

        {/* Top vendors */}
        <div className="card" style={{ padding: 22 }}>
          <div className="section-title" style={{ marginBottom: 14 }}>Top Vendors · 30d</div>
          {[
            { name: "UNILEVER SRI LANKA LTD", units: 4892, pct: 78 },
            { name: "THREE STAR TRADERS",       units: 2104, pct: 42 },
            { name: "A.C.K AMEEM",              units: 1530, pct: 32 },
            { name: "JANET COSMETICS (PVT)",    units: 940,  pct: 22 },
            { name: "PYRAMID WILMAR",           units: 612,  pct: 14 },
          ].map((v, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <div className="sm" style={{ color:"var(--ink)", fontWeight:500 }}>{v.name}</div>
                <div className="tiny muted">{v.units.toLocaleString()}</div>
              </div>
              <div className="bar"><span style={{ width: v.pct + "%" }}/></div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity + Quick access */}
      <div className="grid g-3" style={{ marginTop: 22 }}>
        <div className="card" style={{ gridColumn:"span 2", padding: 0 }}>
          <div className="row between" style={{ padding:"16px 22px", borderBottom:"1px solid var(--line)" }}>
            <div className="section-title" style={{ margin: 0 }}>Recent Activity</div>
            <button className="btn btn-ghost btn-sm">View all <I.ArrowRight size={13}/></button>
          </div>
          {[
            { who: "manager@jingles.com", act: "approved GRN", what: "8b5f2b7d…", when: "2m ago", icon: I.CheckCircle, c:"#10b981" },
            { who: "inspector@jingles.com", act: "transitioned 10 units", what: "EH Water → Inspected", when: "14m ago", icon: I.ArrowRight, c:"var(--accent-1)" },
            { who: "staff@jingles.com", act: "created Stock Transfer", what: "LEGACY-TN-10017 · JINGLES → BIZONE", when: "1h ago", icon: I.Transfer, c:"var(--accent-1)" },
            { who: "admin@theredsun.org", act: "ran AI import", what: "supplier-invoices-april.pdf", when: "3h ago", icon: I.Sparkles, c:"var(--accent-1)" },
            { who: "salmanmarikar@gmail.com", act: "created supplier", what: "0Xxo Beauty", when: "5h ago", icon: I.Plus, c:"#10b981" },
          ].map((a, i) => (
            <div key={i} className="row g" style={{ padding:"14px 22px", borderBottom: i < 4 ? "1px solid var(--line)" : "0" }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background:"var(--chip)",
                            display:"grid", placeItems:"center", color: a.c, flexShrink:0 }}>
                <a.icon size={15}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sm" style={{ color:"var(--ink)" }}>
                  <strong style={{ fontWeight: 500 }}>{a.who}</strong> <span className="muted">{a.act}</span> {a.what}
                </div>
                <div className="tiny muted">{a.when}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="section-title" style={{ marginBottom: 14 }}>Quick Actions</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10 }}>
            <QuickAct icon={I.Receipt} label="New GRN"/>
            <QuickAct icon={I.ReturnArrow} label="New PRN"/>
            <QuickAct icon={I.Transfer} label="Transfer"/>
            <QuickAct icon={I.Sku} label="New SKU"/>
            <QuickAct icon={I.Sparkles} label="AI Import" accent/>
            <QuickAct icon={I.Chart} label="Reports"/>
          </div>
        </div>
      </div>
    </Page>
  );
}

function StatCard({ icon: Ic, label, value, delta, up, down, glow, iconColor, iconBg, iconBorder }) {
  return (
    <div className="stat" style={{ "--glow-color": glow }}>
      <div className="stat-icon" style={{
        "--icon-color": iconColor,
        "--icon-bg":    iconBg,
        "--icon-border": iconBorder,
      }}>
        <Ic size={18}/>
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {delta && (
        <div className={"stat-delta " + (up ? "up" : down ? "down" : "")}>
          {up ? <I.ArrowUp size={11}/> : down ? <I.ArrowDown size={11}/> : <I.Clock size={11}/>} {delta}
        </div>
      )}
    </div>
  );
}

function BarRow({ label, count, pct, color, muted }) {
  return (
    <div style={{ marginBottom: 14, opacity: muted ? 0.55 : 1 }}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="sm" style={{ fontWeight: 500 }}>{label}</div>
        <div className="row g">
          <span className="tiny muted">{pct}%</span>
          <span className="sm" style={{ fontVariantNumeric:"tabular-nums" }}>{count.toLocaleString()}</span>
        </div>
      </div>
      <div className="bar"><span style={{ width: pct + "%", background: color }}/></div>
    </div>
  );
}

function QuickAct({ icon: Ic, label, accent }) {
  return (
    <button className="hover-card" style={{
      display:"flex", flexDirection:"column", alignItems:"flex-start", gap: 10, cursor:"pointer",
      textAlign:"left", border:"1px solid var(--line)"
    }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, display:"grid", placeItems:"center",
                    background: accent ? "linear-gradient(135deg, var(--accent-2), var(--accent-3))" : "var(--chip)",
                    color: accent ? "white" : "var(--ink-2)",
                    boxShadow: accent ? "0 6px 16px -6px rgba(124,92,255,0.6)" : "none" }}>
        <Ic size={15}/>
      </div>
      <div className="sm" style={{ fontWeight: 500 }}>{label}</div>
    </button>
  );
}

/* ===========================================================
   INVENTORY
   =========================================================== */
function Inventory({ onNewRecord }) {
  const rows = [
    { sku: "4791066002249", product: "EH Water", qty: 1,  state: "Uninspected", loc: "Dubai HQ Warehouse › Ground Floor › Shelf A1-1", batch: "4791066002249-B002", updated: "5/8/2026" },
    { sku: "4791066002249", product: "EH Water", qty: 10, state: "Inspected",   loc: "Dubai HQ Warehouse › Ground Floor › Shelf A1-1", batch: "—",                  updated: "5/8/2026" },
    { sku: "8140100",      product: "VGR V-917 HAIR TRIMMER", qty: 1, state: "Inspected", loc: "Stress Test Branch › Warehouse Floor 1 › Floor 1 Rack 1 Shelf 1 › Storage Box BOX-0001-1", batch: "8140100-B001", updated: "5/7/2026" },
    { sku: "Totam quaerat tempor", product: "Obcaecati ratione ve", qty: 1, state: "Inspected", loc: "Dubai HQ Warehouse › Ground Floor › Shelf A1-1", batch: "—", updated: "5/1/2026" },
  ];

  return (
    <Page
      title="Inventory"
      sub="4 records · Live across all branches"
      actions={
        <>
          <button className="btn btn-ghost btn-sm"><I.Download size={14}/> Export</button>
          <button className="btn btn-primary btn-sm" onClick={onNewRecord}>
            <I.Plus size={14}/> New Record
          </button>
        </>
      }
    >
      {/* Barcode scan strip */}
      <div className="glass" style={{ borderRadius:"var(--r-xl)", padding: 18, marginBottom: 22, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", right:-40, top:-60, width:240, height:240, borderRadius:"50%",
                       background:"radial-gradient(circle, rgba(124,92,255,0.18), transparent 70%)" }}/>
        <div className="row g" style={{ position:"relative" }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background:"var(--chip)",
                        display:"grid", placeItems:"center", color:"var(--accent-1)" }}>
            <I.Barcode size={18}/>
          </div>
          <div style={{ flex: 1 }}>
            <div className="sm" style={{ fontWeight: 500, marginBottom: 4 }}>Scan to find an item</div>
            <div className="row g">
              <div className="input-icon-wrap" style={{ flex: 1, maxWidth: 480 }}>
                <I.Barcode size={15} className="input-icon"/>
                <input className="input" placeholder="Scan or type barcode…"/>
              </div>
              <button className="btn btn-primary">Scan</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All States</option><option>Inspected</option><option>Uninspected</option></FSelect>
          <FSelect><option>All Products</option></FSelect>
          <FSelect><option>All Branches</option></FSelect>
          <FSelect><option>All Floors</option></FSelect>
          <button className="btn btn-ghost btn-sm"><I.Filter size={13}/> More</button>
        </Toolbar>
        <table className="tbl">
          <thead>
            <tr>
              <th>SKU Code</th><th>Product</th><th className="num">Qty</th>
              <th>State</th><th>Location</th><th>Batch</th><th>Updated</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.sku}</td>
                <td><strong style={{ fontWeight:500 }}>{r.product}</strong></td>
                <td className="num"><strong style={{ fontWeight:600 }}>{r.qty}</strong></td>
                <td><StatusChip value={r.state}/></td>
                <td className="sm muted">{r.loc}</td>
                <td className="mono">{r.batch}</td>
                <td className="sm muted">{r.updated}</td>
                <td>
                  <div className="row g">
                    <button className="btn btn-outline btn-sm"><I.Pencil size={12}/></button>
                    <button className="btn btn-ghost btn-sm">Transition</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={4} total={4}/>
      </div>
    </Page>
  );
}

/* ===========================================================
   PRODUCTS
   =========================================================== */
function Products({ onNewProduct, onEditProduct }) {
  const rows = [
    { sku:"4791066002249", name:"EH Water", cat:"GENERAL ITEMS", vendor:"UNILEVER SRI LANKA LTD", uom:"NOS", tag:{name:"Best Seller",c:"#f59e0b"}, low:"≤5", fragile:false, status:"Active" },
    { sku:"8101018", name:"KASSSHI MEHENDI BEETROOT", cat:"DEFAULT", vendor:"A.C.K AMEEM", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8220326", name:"FOLDABLE WRIST SLINGSHOT", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8040389", name:"BIRTHDAY CURTAIN", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8220325", name:"MAXX CARROM COINS", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"5030625", name:"FAST RACE REMOTE CONTROL SERIES CAR", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8101017", name:"ROOM DECOR CAR DESIGNS", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8101016", name:"BUTTER FLY 3D WALL STICKERS", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8101015", name:"ROOM DECOR PEACOCK DESIGN", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8101014", name:"ROOM DECOR ANIMAL WORLD", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8101013", name:"ROOM DECOR 3D NEW", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
    { sku:"8101012", name:"QIANQIAN WIND CHIME", cat:"DEFAULT", vendor:"JINGLES WHOLSALE", uom:"NOS", low:"≤0", fragile:false, status:"Active" },
  ];

  return (
    <Page
      title="Products"
      sub="20,863 SKUs in catalog"
      actions={
        <>
          <button className="btn btn-ghost btn-sm"><I.Upload size={14}/> Import</button>
          <button className="btn btn-primary btn-sm" onClick={onNewProduct}>
            <I.Plus size={14}/> New Product
          </button>
        </>
      }
    >
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className="tab is-active">Products <span className="chip" style={{ fontSize: 10, padding:"1px 6px", marginLeft: 4 }}>20,863</span></button>
        <button className="tab">Duplicates <span className="chip chip-warning" style={{ fontSize: 10, padding:"1px 6px", marginLeft: 4 }}>14</span></button>
      </div>

      <div className="glass" style={{ borderRadius:"var(--r-md)", padding:"12px 16px", marginBottom: 18,
                                       display:"flex", alignItems:"center", gap:10 }}>
        <I.Info size={15} style={{ color:"var(--accent-1)" }}/>
        <span className="sm">Creating a product now flows straight into the full editor — upload images and video immediately after first save.</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Categories</option></FSelect>
          <FSelect><option>All Vendors</option></FSelect>
          <FSelect><option>All Units</option></FSelect>
          <FSelect><option>All Statuses</option></FSelect>
        </Toolbar>
        <table className="tbl">
          <thead>
            <tr>
              <th>SKU</th><th>Product</th><th>Category</th><th>Vendor</th>
              <th>UoM</th><th>Tags</th><th>Low Stock</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.sku}</td>
                <td>
                  <strong style={{ fontWeight:500 }}>{r.name}</strong>
                </td>
                <td className="sm muted">{r.cat}</td>
                <td className="sm">{r.vendor}</td>
                <td><span className="chip">{r.uom}</span></td>
                <td>{r.tag ? <TagPill {...r.tag}/> : <span className="muted">—</span>}</td>
                <td className="sm" style={{ color: r.low === "≤5" ? "var(--warning)" : "var(--ink-3)" }}>{r.low}</td>
                <td><StatusChip value={r.status}/></td>
                <td>
                  <div className="row g">
                    <button className="btn btn-outline btn-sm" onClick={() => onEditProduct && onEditProduct(r)}><I.Pencil size={12}/> Edit</button>
                    <button className="btn btn-ghost btn-sm"><I.Plus size={12}/> GRN</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={12} total={20863}/>
      </div>
    </Page>
  );
}

/* ===========================================================
   GRNs
   =========================================================== */
function GRNs({ onNewGRN }) {
  const rows = [
    { id:"8b5f2b7d…", supplier:"UNILEVER SRI LANKA LTD", inv:"—",                   loc:"Dubai HQ Warehouse › Ground Floor › Shelf A1-1", status:"Submitted", lines:1,  created:"5/8/2026" },
    { id:"64d74c87…", supplier:"UNILEVER SRI LANKA LTD", inv:"001",                 loc:"BIZONE › Main Floor",   status:"Draft",     lines:1,  created:"5/8/2026" },
    { id:"038e21c7…", supplier:"A.C.K AMEEM",            inv:"LEGACY-PUR-1355856", loc:"JINGLES › Main Floor",  status:"Closed",    lines:3,  created:"5/6/2026" },
    { id:"b70e0f78…", supplier:"THREE STAR TRADERS",     inv:"LEGACY-PUR-1355855", loc:"JINGLES › Main Floor",  status:"Closed",    lines:4,  created:"5/6/2026" },
    { id:"60453a7f…", supplier:"THREE STAR TRADERS",     inv:"LEGACY-PUR-1355854", loc:"JINGLES › Main Floor",  status:"Closed",    lines:11, created:"5/6/2026" },
    { id:"1b567c2f…", supplier:"JINGLES WHOLSALE",       inv:"LEGACY-PUR-1355853", loc:"JINGLES › Main Floor",  status:"Closed",    lines:16, created:"5/6/2026" },
    { id:"d9227320…", supplier:"JANET COSMETICS (PVT)LTD", inv:"LEGACY-PUR-1355852", loc:"JINGLES › Main Floor", status:"Closed", lines:9, created:"5/6/2026" },
    { id:"4a122a69…", supplier:"PYRAMID WILMAR",         inv:"LEGACY-PUR-1355851", loc:"JINGLES › Main Floor",  status:"Closed",    lines:1,  created:"5/6/2026" },
    { id:"eb4d205f…", supplier:"JINGLES WHOLSALE",       inv:"LEGACY-PUR-1355850", loc:"JINGLES › Main Floor",  status:"Closed",    lines:6,  created:"5/4/2026" },
    { id:"0df4b63c…", supplier:"NASRULL BOSS",           inv:"LEGACY-PUR-1355849", loc:"JINGLES › Main Floor",  status:"Closed",    lines:6,  created:"5/4/2026" },
    { id:"d7a3df16…", supplier:"S&S Distributors",       inv:"LEGACY-PUR-1355848", loc:"JINGLES › Main Floor",  status:"Closed",    lines:6,  created:"5/4/2026" },
  ];

  return (
    <Page
      title="Goods Receipt Notes"
      sub="5,748 GRNs total"
      actions={
        <>
          <button className="btn btn-ghost btn-sm"><I.Download size={14}/> Export</button>
          <button className="btn btn-primary btn-sm" onClick={onNewGRN}><I.Plus size={14}/> New GRN</button>
        </>
      }
    >
      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Statuses</option></FSelect>
          <FSelect><option>All Suppliers</option></FSelect>
          <FSelect><option>All Branches</option></FSelect>
          <FSelect><option>All Floors</option></FSelect>
          <input className="input" type="date" style={{ width: 150 }}/>
          <input className="input" type="date" style={{ width: 150 }}/>
        </Toolbar>
        <table className="tbl">
          <thead>
            <tr>
              <th>GRN ID</th><th>Supplier</th><th>Invoice Ref</th><th>Location</th>
              <th>Status</th><th className="num">Lines</th><th>Created</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.id}</td>
                <td>{r.supplier}</td>
                <td className="mono">{r.inv}</td>
                <td className="sm muted">{r.loc}</td>
                <td><StatusChip value={r.status}/></td>
                <td className="num">{r.lines}</td>
                <td className="sm muted">{r.created}</td>
                <td>
                  <div className="row g">
                    {r.status === "Draft" && <button className="btn btn-outline btn-sm">Edit</button>}
                    <button className="btn btn-ghost btn-sm"><I.Eye size={12}/> View</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={11} total={5748}/>
      </div>
    </Page>
  );
}

/* ===========================================================
   PRNs
   =========================================================== */
function PRNs({ onNewPRN }) {
  return (
    <Page
      title="Purchase Return Notes"
      sub="0 PRNs total"
      actions={
        <button className="btn btn-primary btn-sm" onClick={onNewPRN}><I.Plus size={14}/> New PRN</button>
      }
    >
      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Statuses</option></FSelect>
          <FSelect><option>All Suppliers</option></FSelect>
          <FSelect><option>All Branches</option></FSelect>
          <FSelect><option>All Floors</option></FSelect>
          <input className="input" type="date" style={{ width: 150 }}/>
          <input className="input" type="date" style={{ width: 150 }}/>
        </Toolbar>
        <table className="tbl">
          <thead>
            <tr>
              <th>PRN ID</th><th>Supplier</th><th>Return Reason</th>
              <th>Location</th><th>Status</th><th>Lines</th><th>Created</th>
            </tr>
          </thead>
        </table>
        <div className="empty">
          <div className="empty-icon"><I.ReturnArrow size={22}/></div>
          <h4>No PRNs yet</h4>
          <p>Returns to suppliers will appear here. Create your first to get going.</p>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={onNewPRN}><I.Plus size={14}/> New PRN</button>
          </div>
        </div>
      </div>
    </Page>
  );
}

Object.assign(window, { Dashboard, Inventory, Products, GRNs, PRNs });
