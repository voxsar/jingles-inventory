/* global React, I, Shared */
// Special screens: AI Imports, Spreadsheet, Reports, Warehouse 3D, Settings

const { StatusChip, Toolbar, Page, Pagination, FSelect } = Shared;
const { useState: useSp } = React;

/* ===========================================================
   AI IMPORTS
   =========================================================== */
function AIImports() {
  return (
    <Page
      title="AI Imports"
      sub="Upload source documents — Claude maps them to the inventory database for human review."
    >
      <div className="grid" style={{ gridTemplateColumns: "minmax(340px, 1fr) 2fr", gap: 22 }}>
        {/* Left: New import + recent */}
        <div style={{ display:"flex", flexDirection:"column", gap: 18 }}>
          <div className="card" style={{ padding: 22, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", right:-30, top:-30, width:160, height:160, borderRadius:"50%",
                           background:"radial-gradient(circle, rgba(124,92,255,0.22), transparent 70%)" }}/>
            <div className="row g" style={{ marginBottom: 14, position:"relative" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10,
                             background: "conic-gradient(from 0deg, var(--accent-1), var(--accent-2), var(--accent-3), var(--accent-1))",
                             display:"grid", placeItems:"center", color:"white",
                             boxShadow: "0 8px 24px -8px rgba(124,92,255,0.6)" }}>
                <I.Sparkles size={16}/>
              </div>
              <div>
                <div style={{ fontWeight: 600, letterSpacing:"-0.015em" }}>New Import</div>
                <div className="tiny muted">GRN and PRN imports are drafts on approval</div>
              </div>
            </div>

            <div className="field" style={{ marginTop: 16 }}>
              <label className="label">Import Type</label>
              <select className="select">
                <option>GRNs</option>
                <option>PRNs</option>
                <option>Products / SKUs</option>
                <option>Inventory levels</option>
              </select>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label className="label">Source File</label>
              <div style={{
                border: "1.5px dashed var(--line-strong)",
                borderRadius: 12,
                padding: "26px 16px",
                textAlign: "center",
                background: "var(--glass-pop)",
                cursor: "pointer",
                transition: "border-color .15s, background .15s"
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, margin:"0 auto 10px auto",
                              background:"var(--chip)", display:"grid", placeItems:"center", color:"var(--accent-1)" }}>
                  <I.Upload size={17}/>
                </div>
                <div className="sm" style={{ fontWeight: 500 }}>Drop your file here</div>
                <div className="tiny muted" style={{ marginTop: 4 }}>or click to browse</div>
              </div>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Supports CSV, Excel, JSON, text, PDF, and image documents
              </div>
            </div>

            <button className="btn btn-primary" style={{ width:"100%", marginTop: 16, justifyContent:"center" }}>
              <I.Sparkles size={14}/> Upload &amp; Map
            </button>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div className="section-title" style={{ marginBottom: 10 }}>Recent Jobs</div>
            <div className="sm muted" style={{ marginBottom: 14 }}>Resume review where you left off.</div>
            {[
              { name: "april-grns.csv",     status: "Review", c: "chip-warning", time: "12m ago", rows: 48 },
              { name: "supplier-invoices.pdf", status: "Mapping", c: "chip-info", time: "1h ago", rows: 23 },
              { name: "stocktake-mar.xlsx", status: "Approved", c: "chip-success", time: "yesterday", rows: 312 },
            ].map((j, i) => (
              <div key={i} className="row g" style={{ padding: "10px 0", borderBottom: i < 2 ? "1px solid var(--line)" : "0" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background:"var(--chip)",
                              display:"grid", placeItems:"center", color:"var(--ink-2)" }}>
                  <I.File size={14}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sm" style={{ fontWeight: 500, textOverflow:"ellipsis", overflow:"hidden", whiteSpace:"nowrap" }}>{j.name}</div>
                  <div className="tiny muted">{j.rows} rows · {j.time}</div>
                </div>
                <span className={"chip " + j.c} style={{ fontSize: 10.5 }}>{j.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Live import review */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row between" style={{ padding:"18px 22px", borderBottom:"1px solid var(--line)" }}>
            <div>
              <div className="section-title" style={{ margin: 0 }}>april-grns.csv</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>48 rows · 47 mapped · 1 needs review</div>
            </div>
            <div className="row g">
              <button className="btn btn-ghost btn-sm"><I.History size={13}/> History</button>
              <button className="btn btn-primary btn-sm">Approve All <I.Check size={13}/></button>
            </div>
          </div>

          {/* AI summary */}
          <div style={{ padding:"16px 22px", background:"var(--glass-pop)", borderBottom:"1px solid var(--line)" }}>
            <div className="row g" style={{ alignItems:"flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink:0,
                             background:"conic-gradient(from 0deg, var(--accent-1), var(--accent-2), var(--accent-3), var(--accent-1))",
                             display:"grid", placeItems:"center", color:"white" }}>
                <I.Sparkles size={13}/>
              </div>
              <div style={{ flex: 1 }}>
                <div className="sm">
                  Mapped <strong>47/48 rows</strong> to existing GRN structure. <strong>1 row</strong> uses a supplier name (Unilever SL) close to two existing vendors —
                  I picked <strong>UNILEVER SRI LANKA LTD</strong> but you can swap. Cost totals reconcile to <strong>LKR 124,830.22</strong>.
                </div>
              </div>
            </div>
          </div>

          <table className="tbl">
            <thead>
              <tr>
                <th>Source row</th><th>Supplier (mapped)</th><th>Product (mapped)</th>
                <th className="num">Qty</th><th className="num">Cost</th><th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {[
                { src:"GRN-APR-001 · Unilever SL", sup:"UNILEVER SRI LANKA LTD", prd:"EH Water · 4791066002249", qty:24, cost:1440, conf: 96 },
                { src:"GRN-APR-002 · Three Star",  sup:"THREE STAR TRADERS",     prd:"GOLECHA HEENA PASTE · 8120032", qty:12, cost:1300, conf: 92 },
                { src:"GRN-APR-003 · A.C.K Ameem", sup:"A.C.K AMEEM",            prd:"FATHIMA MEHINDE CONE · 8120127", qty:50, cost:15000, conf: 88 },
                { src:"GRN-APR-004 · Pyramid Wilmar", sup:"PYRAMID WILMAR",      prd:"WILLIAMS BLACK 3GR · 6180118", qty:30, cost:6000, conf: 79, warn:true },
                { src:"GRN-APR-005 · Janet Cosmetics", sup:"JANET COSMETICS (PVT)LTD", prd:"BIRTHDAY CURTAIN · 8040389", qty:4, cost:280, conf: 95 },
                { src:"GRN-APR-006 · Bellose Lanka", sup:"BELLOSE LANKA (PVT) LTD", prd:"MAXX CARROM COINS · 8220325", qty:18, cost:2160, conf: 91 },
                { src:"GRN-APR-007 · S&S Distributors", sup:"S&S Distributors", prd:"NOSSEL 352 · 6050120", qty:60, cost:4500, conf: 94 },
              ].map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize:12 }}>{r.src}</td>
                  <td>{r.sup}</td>
                  <td className="sm">{r.prd}</td>
                  <td className="num">{r.qty}</td>
                  <td className="num">{r.cost.toLocaleString()}</td>
                  <td>
                    <div className="row g">
                      <div className="bar" style={{ width: 60 }}>
                        <span style={{ width: r.conf + "%", background:
                          r.conf >= 90 ? "linear-gradient(90deg, #10b981, #34d399)"
                          : r.conf >= 80 ? "linear-gradient(90deg, var(--accent-2), var(--accent-1))"
                          : "linear-gradient(90deg, #f59e0b, #fbbf24)" }}/>
                      </div>
                      <span className="sm" style={{ minWidth: 32, color: r.warn ? "var(--warning)" : "var(--ink-2)" }}>{r.conf}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row between" style={{ padding:"14px 22px", borderTop:"1px solid var(--line)" }}>
            <div className="sm muted">Showing first 7 of 48 mapped rows</div>
            <button className="btn btn-ghost btn-sm">Show all <I.ArrowRight size={13}/></button>
          </div>
        </div>
      </div>
    </Page>
  );
}

/* ===========================================================
   SPREADSHEET INTERFACE
   =========================================================== */
function Spreadsheet({ onOpenEntity }) {
  const entities = [
    { id:"sku",       icon:I.Sku,        title:"Products (SKUs)", group:"Inventory",  desc:"Manage product catalog with variants, barcodes, and pricing", c:"#a78bfa" },
    { id:"inv",       icon:I.Box,        title:"Inventory Records", group:"Inventory", desc:"Track inventory quantities, states, and locations",         c:"#fbbf24" },
    { id:"batches",   icon:I.Coins,      title:"Batches", group:"Inventory",          desc:"Manage batch pricing and expiry dates",                     c:"#f59e0b" },
    { id:"cats",      icon:I.Folder,     title:"Categories", group:"Inventory",       desc:"Product categories and hierarchies",                        c:"#34d399" },
    { id:"tags",      icon:I.Tag,        title:"Tags", group:"Inventory",             desc:"Product tags and labels",                                   c:"#f59e0b" },
    { id:"branches",  icon:I.Building,   title:"Branches", group:"Warehouse",         desc:"Warehouse branches and locations",                          c:"#60a5fa" },
    { id:"floors",    icon:I.Floor,      title:"Floors", group:"Warehouse",           desc:"Warehouse floors with dimensions",                          c:"#fbbf24" },
    { id:"racks",     icon:I.Rack,       title:"Racks", group:"Warehouse",            desc:"Storage racks with 3D positioning",                         c:"#a78bfa" },
    { id:"shelves",   icon:I.Shelf,      title:"Shelves", group:"Warehouse",          desc:"Storage shelves with capacity info",                        c:"#f87171" },
    { id:"boxes",     icon:I.Box,        title:"Storage Boxes", group:"Warehouse",    desc:"Individual storage boxes and containers",                   c:"#34d399" },
    { id:"grns",      icon:I.Receipt,    title:"GRNs", group:"Purchasing",            desc:"Goods Receipt Notes and receiving",                         c:"#fbbf24" },
    { id:"vendors",   icon:I.Briefcase,  title:"Vendors/Suppliers", group:"Purchasing", desc:"Vendor and supplier information",                         c:"#fbbf24" },
    { id:"transfers", icon:I.Transfer,   title:"Stock Transfers", group:"Purchasing", desc:"Inter-location stock movements",                            c:"#60a5fa" },
    { id:"users",     icon:I.Users,      title:"Users", group:"Settings",             desc:"User accounts and access control",                          c:"#a78bfa" },
    { id:"uom",       icon:I.Ruler,      title:"Units of Measure", group:"Settings",  desc:"Measurement units and conversions",                         c:"#a78bfa" },
    { id:"attrs",     icon:I.Puzzle,     title:"Attributes", group:"Settings",        desc:"Product attributes and variant options",                    c:"#f87171" },
  ];

  return (
    <Page
      title="Spreadsheet Interface"
      sub="Access and edit all data types with inline editing and dropdown search"
      actions={<button className="btn btn-ghost btn-sm"><I.Help size={14}/> What's this?</button>}
    >
      <div className="row g" style={{ marginBottom: 22 }}>
        <div className="input-icon-wrap" style={{ flex: 1, maxWidth: 520 }}>
          <I.Search size={15} className="input-icon"/>
          <input className="input" placeholder="Search entity types…"/>
        </div>
        <select className="select" style={{ width: 200 }}>
          <option>All Categories</option><option>Inventory</option><option>Warehouse</option>
          <option>Purchasing</option><option>Settings</option>
        </select>
      </div>

      <div className="grid g-4">
        {entities.map((e, i) => (
          <div key={i} className="feature-card" onClick={() => onOpenEntity && onOpenEntity(e)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div className="fc-icon" style={{ background:`linear-gradient(135deg, ${e.c}33, ${e.c}0a)`, color:e.c, borderColor:`${e.c}33` }}>
                <e.icon size={18}/>
              </div>
              <span className="chip" style={{ fontSize: 9.5, letterSpacing: "0.08em" }}>{e.group.toUpperCase()}</span>
            </div>
            <h3>{e.title}</h3>
            <p>{e.desc}</p>
            <div className="fc-cta">Open spreadsheet <I.ArrowRight size={12}/></div>
          </div>
        ))}
      </div>
    </Page>
  );
}

/* ===========================================================
   SPREADSHEET DRILL (records view)
   =========================================================== */
function SpreadsheetDrill({ onBack }) {
  return (
    <Page
      title="Inventory Records Spreadsheet"
      sub="Edit quantities, states, and locations with dropdown search"
      actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <I.ChevronLeft size={14}/> Back
          </button>
          <button className="btn btn-primary btn-sm"><I.Plus size={14}/> Add Row</button>
        </>
      }
    >
      <div className="card" style={{ padding: 0 }}>
        <div className="row between" style={{ padding:"14px 18px", borderBottom:"1px solid var(--line)" }}>
          <div className="input-icon-wrap" style={{ width: 360 }}>
            <I.Search size={15} className="input-icon"/>
            <input className="input" placeholder="Search rows…"/>
          </div>
          <div className="row g">
            <span className="chip chip-success" style={{ fontSize: 11 }}><span className="chip-dot"/> Ready</span>
            <span className="sm muted">4 of 4 rows</span>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>SKU</th><th className="num">Qty</th><th>State</th>
                <th>Branch</th><th>Floor</th><th>Rack</th><th>Shelf</th><th>Box</th>
                <th>Batch</th><th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {[
                { sku:"4791066002249 — EH Water",      qty:1,  state:"Uninspected", branch:"Dubai HQ Warehouse",  floor:"Dubai HQ Warehouse › Gro…", rack:"Dubai HQ Warehous…", shelf:"Dubai HQ Warehous…", box:"—",                    batch:"4791066002249-B0…", updated:"5/8/2026" },
                { sku:"4791066002249 — EH Water",      qty:10, state:"Inspected",   branch:"Dubai HQ Warehouse",  floor:"Dubai HQ Warehouse › Gro…", rack:"Dubai HQ Warehous…", shelf:"Dubai HQ Warehous…", box:"—",                    batch:"—",                  updated:"5/8/2026" },
                { sku:"8140100 — VGR V-917 HAIR TRIMM…", qty:1, state:"Inspected", branch:"Stress Test Branch",  floor:"Stress Test Branch › Wareho…", rack:"Stress Test Branch › …", shelf:"Stress Test Branch › …", box:"Floor 1 Rack 1 Shelf …", batch:"8140100-B001",      updated:"5/7/2026" },
                { sku:"Totam quaerat tempor - Obcaecat…", qty:1, state:"Inspected", branch:"Dubai HQ Warehouse",  floor:"Dubai HQ Warehouse › Gro…", rack:"Dubai HQ Warehous…", shelf:"Dubai HQ Warehous…", box:"—",                    batch:"—",                  updated:"5/1/2026" },
              ].map((r, i) => (
                <tr key={i}>
                  <td className="sm muted">{i + 1}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.sku}</td>
                  <td className="num">{r.qty}</td>
                  <td><StatusChip value={r.state}/></td>
                  <td className="sm">{r.branch}</td>
                  <td className="sm muted">{r.floor}</td>
                  <td className="sm muted">{r.rack}</td>
                  <td className="sm muted">{r.shelf}</td>
                  <td className="sm muted">{r.box}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{r.batch}</td>
                  <td className="sm muted">{r.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  );
}

/* ===========================================================
   REPORTS
   =========================================================== */
function Reports() {
  const [active, setActive] = useSp("grn-note");
  const reports = [
    { group: "Inventory", items: [
      { id:"po-note", title:"Purchase order note report", desc:"Purchase orders by supplier, status, product, and date range." },
      { id:"grn-note", title:"GRN note report", desc:"Goods received notes with supplier, line, quantity, and cost totals." },
      { id:"prn-note", title:"Purchase return note report", desc:"Supplier return notes with picked-up quantities and return value." },
      { id:"tog-note", title:"Transfer of good note report", desc:"Transfer notes by origin, destination, status, and requested date." },
      { id:"tog-prod", title:"Product-wise TOG in/out report", desc:"Transfer note lines split by product with TOG in/out quantities." },
      { id:"adj-note", title:"Stock adjustment note report", desc:"Manual stock adjustments and damage records." },
      { id:"quote",   title:"Quotation report", desc:"Quotation activity by product, supplier, status, and date range." },
      { id:"sales-ret", title:"Sales return note report", desc:"Sales return events with product, receipt, and quantity details." },
    ]},
    { group: "Stock", items: [
      { id:"balance", title:"Stock balance report", desc:"Current stock by product, state, branch, floor, shelf, box, and batch." },
    ]},
  ];

  return (
    <Page
      title="Reports"
      sub="Inventory, stock, management, and sales reports with date filters and CSV, Excel, and PDF views."
      actions={
        <>
          <button className="btn btn-ghost btn-sm"><I.Print size={14}/> PDF View</button>
          <button className="btn btn-ghost btn-sm"><I.Download size={14}/> Export CSV</button>
          <button className="btn btn-primary btn-sm"><I.Download size={14}/> Export Excel</button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: "320px 1fr", gap: 22 }}>
        {/* Library */}
        <div className="card" style={{ padding: 14, height: "fit-content" }}>
          <div style={{ padding: "8px 10px 12px 10px", fontWeight: 600 }}>Report Library</div>
          {reports.map((g) => (
            <div key={g.group}>
              <div className="nav-section" style={{ padding: "10px 10px 4px 10px" }}>{g.group}</div>
              {g.items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setActive(r.id)}
                  style={{
                    width: "100%", textAlign:"left", padding:"10px 12px", borderRadius: 10,
                    background: active === r.id ? "linear-gradient(90deg, rgba(124,92,255,0.12), rgba(124,92,255,0.02))" : "transparent",
                    border: active === r.id ? "1px solid rgba(124,92,255,0.25)" : "1px solid transparent",
                    cursor: "pointer",
                    marginBottom: 4
                  }}
                >
                  <div className="sm" style={{ fontWeight: 500, color: active === r.id ? "var(--ink)" : "var(--ink-2)" }}>{r.title}</div>
                  <div className="tiny muted" style={{ marginTop: 4, lineHeight: 1.45 }}>{r.desc}</div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Report runner */}
        <div style={{ display:"flex", flexDirection:"column", gap: 22 }}>
          <div className="card" style={{ padding: 22 }}>
            <div className="row between" style={{ marginBottom: 16 }}>
              <div>
                <div className="section-title" style={{ margin:0 }}>GRN note report</div>
                <div className="sm muted" style={{ marginTop: 4 }}>Goods received notes with supplier, line, quantity, and cost totals.</div>
              </div>
              <div className="row g">
                <button className="btn btn-ghost btn-sm">Reset</button>
                <button className="btn btn-primary btn-sm"><I.Bolt size={13}/> Run Report</button>
              </div>
            </div>
            <div className="grid g-4">
              <Field label="From date"><input className="input" type="date"/></Field>
              <Field label="To date"><input className="input" type="date"/></Field>
              <Field label="Search"><input className="input" placeholder="Reference, product, receipt"/></Field>
              <Field label="Supplier / vendor"><select className="select"><option>All suppliers</option></select></Field>
              <Field label="Branch"><select className="select"><option>All branches</option></select></Field>
              <Field label="Floor"><select className="select"><option>All floors</option></select></Field>
              <Field label="Product"><select className="select"><option>All products</option></select></Field>
              <Field label="Status / state"><input className="input" placeholder="Draft, Closed, ShelfReady"/></Field>
              <Field label="Event type"><input className="input" placeholder="SALE_DEDUCTED"/></Field>
              <Field label="Group by"><select className="select"><option>Product</option></select></Field>
              <Field label="Expiry window"><input className="input" defaultValue="90"/></Field>
              <Field label="Rows"><select className="select"><option>50</option></select></Field>
            </div>
          </div>

          {/* Summary */}
          <div className="card" style={{ padding: 22 }}>
            <div className="section-title" style={{ marginBottom: 14 }}>Summary</div>
            <div className="grid g-4">
              <SummaryStat label="Total GRNs" value="50"/>
              <SummaryStat label="Total Lines" value="384"/>
              <SummaryStat label="Total Quantity" value="12,940"/>
              <SummaryStat label="Total Accepted" value="12,169"/>
              <SummaryStat label="Total Rejected" value="771" c="#f87171"/>
              <SummaryStat label="Total Cost" value="3,513,112.32" prefix="LKR" c="var(--accent-1)"/>
            </div>
          </div>

          {/* Result table */}
          <div className="card" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice Ref</th><th>Supplier</th><th>Status</th>
                  <th>Delivery</th><th className="num">Lines</th>
                  <th className="num">Expected</th><th className="num">Received</th>
                  <th className="num">Cost</th><th>Created</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { ref:"8b5f2b7d-dabd-46d5-919b-687f788b781b", sup:"UNILEVER SRI LANKA LTD", status:"Submitted", del:"5/8/2026", lines:1, exp:1,  rec:1,  cost:60.00,    created:"5/8/2026" },
                  { ref:"001",                                  sup:"UNILEVER SRI LANKA LTD", status:"Draft",     del:"—",        lines:1, exp:20, rec:0,  cost:0.00,     created:"5/8/2026" },
                  { ref:"LEGACY-PUR-1355856", sup:"A.C.K AMEEM",       status:"Closed", del:"5/6/2026", lines:3,  exp:156, rec:156, cost:20399.76, created:"5/6/2026" },
                  { ref:"LEGACY-PUR-1355855", sup:"THREE STAR TRADERS",status:"Closed", del:"5/6/2026", lines:4,  exp:244, rec:244, cost:23500.00, created:"5/6/2026" },
                  { ref:"LEGACY-PUR-1355854", sup:"THREE STAR TRADERS",status:"Closed", del:"5/6/2026", lines:11, exp:140, rec:140, cost:27700.00, created:"5/6/2026" },
                ].map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{r.ref}</td>
                    <td className="sm">{r.sup}</td>
                    <td><StatusChip value={r.status}/></td>
                    <td className="sm muted">{r.del}</td>
                    <td className="num">{r.lines}</td>
                    <td className="num">{r.exp}</td>
                    <td className="num">{r.rec}</td>
                    <td className="num">{r.cost.toLocaleString()}</td>
                    <td className="sm muted">{r.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Page>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function SummaryStat({ label, value, prefix, c }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, background:"var(--glass-pop)", border:"1px solid var(--line)" }}>
      <div className="tiny muted" style={{ letterSpacing:"0.08em", textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing:"-0.02em", marginTop: 4,
                    fontVariantNumeric:"tabular-nums", color: c || "var(--ink)" }}>
        {prefix && <span style={{ fontSize: 13, color:"var(--ink-3)", marginRight: 6 }}>{prefix}</span>}
        {value}
      </div>
    </div>
  );
}

/* ===========================================================
   WAREHOUSE 3D
   =========================================================== */
function Warehouse3D() {
  return (
    <Page
      title="Warehouse 3D"
      sub="Visualize racks, shelves, boxes, and occupancy across your branches"
      actions={
        <>
          <button className="btn btn-ghost btn-sm"><I.Refresh size={13}/> Reset View</button>
          <button className="btn btn-primary btn-sm"><I.Plus size={14}/> New Rack</button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: "280px 1fr 280px", gap: 22 }}>
        {/* Tree */}
        <div className="card" style={{ padding: 14, height: "fit-content" }}>
          <div className="row between" style={{ padding: "6px 10px 12px 10px" }}>
            <div style={{ fontWeight: 600 }}>Storage</div>
            <button className="icon-btn" style={{ width: 26, height: 26 }}><I.Plus size={13}/></button>
          </div>
          <Tree node={{
            label: "Dubai HQ Warehouse",
            icon: I.Building,
            open: true,
            children: [
              { label: "Ground Floor", icon: I.Floor, open: true, children: [
                { label: "Rack A1", icon: I.Rack, children: [
                  { label: "Shelf A1-1", icon: I.Shelf, active: true },
                  { label: "Shelf A1-2", icon: I.Shelf },
                ]},
                { label: "Rack A2", icon: I.Rack },
                { label: "Rack A3", icon: I.Rack },
              ]},
              { label: "Mezzanine", icon: I.Floor },
            ]
          }}/>
        </div>

        {/* 3D viewport */}
        <div className="card" style={{ padding: 0, overflow: "hidden", minHeight: 540, position: "relative" }}>
          <div className="row between" style={{ padding:"14px 18px", borderBottom:"1px solid var(--line)" }}>
            <div className="row g">
              <span className="chip">Dubai HQ › Ground Floor</span>
              <span className="chip chip-info"><span className="chip-dot"/> Live</span>
            </div>
            <div className="tabs">
              <button className="tab is-active">3D</button>
              <button className="tab">Top-down</button>
              <button className="tab">Heatmap</button>
            </div>
          </div>
          <Iso3D/>
          <div style={{ position:"absolute", bottom: 16, right: 16, display:"flex", flexDirection:"column", gap: 6 }}>
            <button className="icon-btn" style={{ background:"var(--glass-strong)", border:"1px solid var(--line)" }}><I.Plus size={14}/></button>
            <button className="icon-btn" style={{ background:"var(--glass-strong)", border:"1px solid var(--line)" }}><I.Eraser size={14}/></button>
            <button className="icon-btn" style={{ background:"var(--glass-strong)", border:"1px solid var(--line)" }}><I.Globe size={14}/></button>
          </div>
        </div>

        {/* Inspector */}
        <div className="card" style={{ padding: 18, height: "fit-content" }}>
          <div className="tiny muted" style={{ letterSpacing:"0.08em", textTransform:"uppercase", marginBottom: 6 }}>Selected</div>
          <div style={{ fontWeight: 600, fontSize: 15, letterSpacing:"-0.015em" }}>Shelf A1-1</div>
          <div className="sm muted" style={{ marginTop: 2 }}>SH-A1-1 · Capacity 11 / 24</div>
          <div className="divider"/>
          <div className="bar"><span style={{ width: "46%" }}/></div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="tiny muted">Occupancy</span>
            <span className="sm" style={{ fontWeight: 500 }}>46%</span>
          </div>
          <div className="divider"/>
          <div className="tiny muted" style={{ letterSpacing:"0.08em", textTransform:"uppercase", marginBottom: 10 }}>Contents</div>
          {[
            { sku: "4791066002249", name:"EH Water", qty: 11, state:"Mixed" },
          ].map((r, i) => (
            <div key={i} className="hover-card" style={{ marginBottom: 8 }}>
              <div className="row between">
                <div className="sm" style={{ fontWeight: 500 }}>{r.name}</div>
                <span className="chip" style={{ fontSize: 10.5 }}>{r.qty} units</span>
              </div>
              <div className="mono tiny muted" style={{ marginTop: 4 }}>{r.sku}</div>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ width:"100%", marginTop: 10, justifyContent:"center" }}>
            <I.LinkExt size={13}/> Open in Inventory
          </button>
        </div>
      </div>
    </Page>
  );
}

function Tree({ node, depth = 0 }) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", borderRadius: 8, cursor: "pointer",
        background: node.active ? "linear-gradient(90deg, rgba(124,92,255,0.14), transparent)" : "transparent",
        marginLeft: depth * 12,
        color: node.active ? "var(--accent-1)" : "var(--ink-2)"
      }}>
        {node.children && <I.ChevronDown size={12} style={{ opacity: 0.5 }}/>}
        {!node.children && <div style={{ width: 12 }}/>}
        <node.icon size={14}/>
        <span className="sm">{node.label}</span>
      </div>
      {node.open && node.children?.map((c, i) => <Tree key={i} node={c} depth={depth + 1}/>)}
    </div>
  );
}

function Iso3D() {
  // Pretty isometric SVG mock of a warehouse floor
  return (
    <svg viewBox="0 0 800 500" style={{ width:"100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="floorG" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(124,92,255,0.18)"/>
          <stop offset="100%" stopColor="rgba(124,92,255,0.02)"/>
        </linearGradient>
        <linearGradient id="rackG" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(167,139,250,0.85)"/>
          <stop offset="100%" stopColor="rgba(109,40,217,0.85)"/>
        </linearGradient>
        <linearGradient id="rackG2" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(96,165,250,0.85)"/>
          <stop offset="100%" stopColor="rgba(29,78,216,0.85)"/>
        </linearGradient>
        <linearGradient id="actv" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa"/>
          <stop offset="100%" stopColor="#6d28d9"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(124,92,255,0.55)"/>
          <stop offset="100%" stopColor="rgba(124,92,255,0)"/>
        </radialGradient>
        <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse" patternTransform="skewX(-30) scale(1)">
          <path d="M0 0H40M0 20H40" stroke="rgba(255,255,255,0.04)"/>
          <path d="M0 0V20M40 0V20" stroke="rgba(255,255,255,0.04)"/>
        </pattern>
      </defs>

      {/* glow */}
      <ellipse cx="400" cy="380" rx="380" ry="90" fill="url(#glow)" opacity="0.6"/>

      {/* floor */}
      <g transform="translate(400,260)">
        <polygon points="-320,80 0,-80 320,80 0,240" fill="url(#floorG)" stroke="rgba(167,139,250,0.35)" strokeWidth="1"/>
        <polygon points="-320,80 0,-80 320,80 0,240" fill="url(#grid)" opacity="0.5"/>
      </g>

      {/* Racks (isometric boxes) */}
      {[
        { x: 280, y: 200, h: 80, type: 1 },
        { x: 340, y: 230, h: 70, type: 1 },
        { x: 400, y: 260, h: 90, type: "active" },
        { x: 460, y: 230, h: 65, type: 2 },
        { x: 520, y: 200, h: 75, type: 2 },
        { x: 220, y: 170, h: 70, type: 1 },
        { x: 580, y: 170, h: 80, type: 2 },
      ].map((r, i) => {
        const w = 50, d = 30;
        const fill = r.type === "active" ? "url(#actv)" : r.type === 1 ? "url(#rackG)" : "url(#rackG2)";
        return (
          <g key={i}>
            {/* top */}
            <polygon points={`${r.x},${r.y - r.h} ${r.x + w},${r.y - r.h + d/2} ${r.x},${r.y - r.h + d} ${r.x - w},${r.y - r.h + d/2}`}
                     fill={fill} opacity="0.95"/>
            {/* left */}
            <polygon points={`${r.x - w},${r.y - r.h + d/2} ${r.x},${r.y - r.h + d} ${r.x},${r.y + d} ${r.x - w},${r.y + d/2}`}
                     fill={fill} opacity="0.72"/>
            {/* right */}
            <polygon points={`${r.x + w},${r.y - r.h + d/2} ${r.x},${r.y - r.h + d} ${r.x},${r.y + d} ${r.x + w},${r.y + d/2}`}
                     fill={fill} opacity="0.55"/>
            {r.type === "active" && (
              <>
                <polygon points={`${r.x},${r.y - r.h - 6} ${r.x + w - 4},${r.y - r.h + d/2 - 4} ${r.x},${r.y - r.h + d - 6} ${r.x - w + 4},${r.y - r.h + d/2 - 4}`}
                         fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.9"/>
                <circle cx={r.x} cy={r.y - r.h - 16} r="4" fill="#fff"/>
              </>
            )}
          </g>
        );
      })}

      {/* Label for active */}
      <g transform="translate(420, 130)">
        <rect x="-2" y="-16" width="120" height="28" rx="6" fill="rgba(15,12,25,0.85)" stroke="rgba(167,139,250,0.5)"/>
        <text x="8" y="2" fill="#a78bfa" fontSize="11" fontFamily="ui-monospace,monospace">SHELF A1-1</text>
        <text x="8" y="14" fill="#b9b3cf" fontSize="9">46% occupied · 11 units</text>
      </g>
    </svg>
  );
}

/* ===========================================================
   SETTINGS
   =========================================================== */
function Settings({ onOpen }) {
  const items = [
    { id:"uom",    title:"Units of Measure",  icon:I.Ruler,   c:"#a78bfa", desc:"Define and manage custom measurement units for products (weight, volume, length, etc.)" },
    { id:"status", title:"Status Management", icon:I.Status,  c:"#fbbf24", desc:"Configure status options for inventory, products, GRNs, branches, suppliers, and transfers",
      chips:["Inventory","GRN","Damage","Product","+5 more"] },
    { id:"attrs",  title:"Product Attributes", icon:I.Puzzle, c:"#34d399", desc:"Define global attributes (Size, Color, Flavor, etc.) and their allowed values for generating SKU variants",
      chips:["dropdown","text","numeric","boolean","color"] },
    { id:"search", title:"Typesense Search Sync", icon:I.Search, c:"#60a5fa", desc:"Sync SKUs, inventory, and vendors to Typesense for fast full-text search" },
    { id:"appearance", title:"Appearance", icon:I.Wand, c:"#f472b6", desc:"Tune theme, density, glass intensity, and color accents" },
    { id:"webhooks", title:"Webhooks & API", icon:I.Globe2, c:"#94a3b8", desc:"Connect AviInv to your e-commerce, POS, and finance systems" },
  ];

  return (
    <Page title="Settings" sub="System configuration"
          actions={<button className="btn btn-ghost btn-sm"><I.Help size={14}/> Docs</button>}>
      <div className="grid g-3">
        {items.map((s, i) => (
          <div key={i} className="feature-card" onClick={() => onOpen && onOpen(s.id)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div className="fc-icon" style={{ background:`linear-gradient(135deg, ${s.c}33, ${s.c}0a)`, color:s.c, borderColor:`${s.c}33` }}>
                <s.icon size={20}/>
              </div>
            </div>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
            {s.chips && (
              <div className="row g" style={{ flexWrap:"wrap", gap: 6 }}>
                {s.chips.map(c => <span key={c} className="chip" style={{ fontSize: 10.5 }}>{c}</span>)}
              </div>
            )}
            <div className="fc-cta">Manage <I.ArrowRight size={12}/></div>
          </div>
        ))}
      </div>
    </Page>
  );
}

Object.assign(window, { AIImports, Spreadsheet, SpreadsheetDrill, Reports, Warehouse3D, Settings });
