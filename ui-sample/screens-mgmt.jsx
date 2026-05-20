/* global React, I, Shared */
// Management screens: Suppliers, Users, Branches, Tags, Categories, Pricing, Transfers, Batches

const { StatusChip, TagPill, Toolbar, Page, Pagination, FSelect } = Shared;

/* ===========================================================
   SUPPLIERS
   =========================================================== */
function Suppliers({ onNewSupplier }) {
  const rows = [
    { name:"0Xxo Beauty",                 type:"Supplier", email:"hello@0xxo.com",            phone:"+971 50 555 1100", terms:"Net 0 days",  status:"Active" },
    { name:"240 RAMAS",                   type:"Supplier", email:"orders@240ramas.com",       phone:"+94 11 234 5678",   terms:"—",            status:"Active" },
    { name:"3 STAR ENTERPRISES",          type:"Supplier", email:"sales@3starent.lk",         phone:"+94 11 345 6789",   terms:"Net 0 days",  status:"Active" },
    { name:"4EVER SKIN NATURALS (PVT)LTD", type:"Supplier", email:"info@4everskinnaturals.com", phone:"+94 11 456 7890",   terms:"Net 21 days", status:"Active" },
    { name:"A & Z",                       type:"Supplier", email:"contact@anz.com",           phone:"+94 11 567 8901",   terms:"Net 0 days",  status:"Active" },
    { name:"A F COSMETICS",               type:"Supplier", email:"afcos@gmail.com",           phone:"+94 11 678 9012",   terms:"Net 0 days",  status:"Active" },
    { name:"A.Baur & Co Ltd.",            type:"Supplier", email:"orders@baur.lk",            phone:"+94 11 789 0123",   terms:"Net 0 days",  status:"Active" },
    { name:"A.C.K AMEEM",                 type:"Supplier", email:"ameem@ack.com",             phone:"+94 11 890 1234",   terms:"Net 0 days",  status:"Active" },
    { name:"A.I.M CAKE TOOLS",            type:"Supplier", email:"aim@caketools.lk",          phone:"+94 11 901 2345",   terms:"Net 0 days",  status:"Active" },
    { name:"A.I.M ILHAM",                 type:"Supplier", email:"s102@legacy-import.local",  phone:"0914941022",         terms:"Net 30 days", status:"Active" },
    { name:"A.I.M TOOL SHOP",             type:"Supplier", email:"s146@legacy-import.local",  phone:"0775665565",         terms:"Net 0 days",  status:"Active" },
    { name:"A.K MAYU PRODUCTS",           type:"Supplier", email:"s238@legacy-import.local",  phone:"0775546323",         terms:"Net 0 days",  status:"Active" },
    { name:"A.R COSMETICS",               type:"Supplier", email:"s328@legacy-import.local",  phone:"0757148801",         terms:"Net 0 days",  status:"Active" },
    { name:"AAISHA GOLD HOUSE",           type:"Supplier", email:"s336@legacy-import.local",  phone:"0777900705",         terms:"Net 0 days",  status:"Active" },
  ];

  return (
    <Page title="Suppliers" sub="Manage suppliers and vendor contacts"
          actions={<button className="btn btn-primary btn-sm" onClick={onNewSupplier}><I.Plus size={14}/> New Supplier</button>}>
      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Types</option><option>Supplier</option><option>Vendor</option></FSelect>
          <FSelect><option>All Statuses</option><option>Active</option><option>Disabled</option></FSelect>
          <FSelect><option>All Websites</option></FSelect>
        </Toolbar>
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th><th>Type</th><th>Email</th><th>Phone</th>
              <th>Payment Terms</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="row g">
                    <div style={{ width: 32, height: 32, borderRadius: 9,
                                  background: "linear-gradient(135deg, rgba(124,92,255,0.18), rgba(124,92,255,0.04))",
                                  display:"grid", placeItems:"center", color:"var(--accent-1)",
                                  fontSize: 11, fontWeight: 600,
                                  border: "1px solid rgba(124,92,255,0.18)" }}>
                      {r.name.slice(0,2)}
                    </div>
                    <strong style={{ fontWeight: 500 }}>{r.name}</strong>
                  </div>
                </td>
                <td><span className="chip">{r.type}</span></td>
                <td className="sm muted">{r.email}</td>
                <td className="mono">{r.phone}</td>
                <td className="sm">{r.terms}</td>
                <td><StatusChip value={r.status}/></td>
                <td>
                  <div className="row g">
                    <button className="btn btn-outline btn-sm"><I.Pencil size={12}/></button>
                    <button className="btn btn-ghost btn-sm">Disable</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={14} total={342}/>
      </div>
    </Page>
  );
}

/* ===========================================================
   USERS
   =========================================================== */
function Users({ onNewUser }) {
  const rows = [
    { email:"salmanmarikar@gmail.com",      role:"Manager",   status:"Active",   created:"5/14/2026" },
    { email:"legacy-purchase-detail@legacy-import.local", role:"Staff", status:"Inactive", created:"5/8/2026" },
    { email:"zulu@legacy-import.local",     role:"Staff",     status:"Inactive", created:"5/8/2026" },
    { email:"safra-shafihan@legacy-import.local", role:"Staff", status:"Inactive", created:"5/8/2026" },
    { email:"munawwar@legacy-import.local", role:"Staff",     status:"Inactive", created:"5/8/2026" },
    { email:"luthfan@legacy-import.local",  role:"Staff",     status:"Inactive", created:"5/8/2026" },
    { email:"amrah@legacy-import.local",    role:"Staff",     status:"Inactive", created:"5/8/2026" },
    { email:"adheeb@legacy-import.local",   role:"Staff",     status:"Inactive", created:"5/8/2026" },
    { email:"ali@legacy-import.local",      role:"Staff",     status:"Inactive", created:"5/8/2026" },
    { email:"mubashshir@legacy-import.local", role:"Staff",   status:"Inactive", created:"5/8/2026" },
    { email:"salman@legacy-import.local",   role:"Staff",     status:"Inactive", created:"5/8/2026" },
    { email:"staff@jingles.com",            role:"Staff",     status:"Active",   created:"4/1/2026" },
    { email:"inspector@jingles.com",        role:"Inspector", status:"Active",   created:"4/1/2026" },
    { email:"manager@jingles.com",          role:"Manager",   status:"Active",   created:"4/1/2026" },
    { email:"admin@theredsun.org",          role:"Admin",     status:"Active",   created:"4/1/2026" },
  ];

  const roleColor = {
    Admin:    "chip-accent",
    Manager:  "chip-info",
    Inspector: "chip-warning",
    Staff:    "",
  };

  return (
    <Page title="User Management" sub="Access control for your team"
          actions={<button className="btn btn-primary btn-sm" onClick={onNewUser}><I.Plus size={14}/> Create User</button>}>
      <div className="grid g-4" style={{ marginBottom: 22 }}>
        <MiniStat label="Total Users"     value="15"  icon={I.Users}/>
        <MiniStat label="Active"          value="5"   icon={I.CheckCircle} c="#10b981"/>
        <MiniStat label="Inactive"        value="10"  icon={I.Clock} c="#f59e0b"/>
        <MiniStat label="Pending Invites" value="0"   icon={I.Mail}/>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Roles</option><option>Admin</option><option>Manager</option><option>Inspector</option><option>Staff</option></FSelect>
          <FSelect><option>All Statuses</option></FSelect>
          <FSelect><option>All Vendors</option></FSelect>
        </Toolbar>
        <table className="tbl">
          <thead>
            <tr><th>Email</th><th>Role</th><th>Vendor</th><th>Status</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="row g">
                    <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                      {r.email.slice(0,2).toUpperCase()}
                    </div>
                    <span>{r.email}</span>
                  </div>
                </td>
                <td><span className={"chip " + (roleColor[r.role] || "")}>{r.role}</span></td>
                <td className="muted">—</td>
                <td><StatusChip value={r.status}/></td>
                <td className="sm muted">{r.created}</td>
                <td>
                  <div className="row g">
                    <button className="btn btn-outline btn-sm">Edit</button>
                    <button className="btn btn-ghost btn-sm">Password</button>
                    {r.status === "Active" && <button className="btn btn-danger btn-sm">Deactivate</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={15} total={15}/>
      </div>
    </Page>
  );
}

function MiniStat({ icon: Ic, label, value, c = "var(--accent-1)" }) {
  return (
    <div className="card" style={{ padding: 16, display:"flex", alignItems:"center", gap:12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background:"var(--chip)",
                    display:"grid", placeItems:"center", color: c }}>
        <Ic size={16}/>
      </div>
      <div>
        <div className="tiny muted">{label}</div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing:"-0.02em" }}>{value}</div>
      </div>
    </div>
  );
}

/* ===========================================================
   BRANCHES & STORAGE
   =========================================================== */
function Branches({ onNewBranch }) {
  const rows = [
    { name:"BIZONE",              code:"04",        addr:"Abdul Wahb Mawata",                phone:"0772350165",     status:"Active", isDefault:false },
    { name:"Dubai HQ Warehouse",  code:"HQ-DXB",    addr:"Al Quoz Industrial Area 3, Dubai, UAE", phone:"+971 4 555 1000", status:"Active", isDefault:true },
    { name:"JINGLES",             code:"01",        addr:"Main road, Colombo",                phone:"0112334456",     status:"Active", isDefault:false },
    { name:"JINGLES WEBSITE",     code:"02",        addr:"Online channel",                    phone:"—",              status:"Active", isDefault:false },
    { name:"JINGLES WHOLSALE",    code:"03",        addr:"Industrial Park, Colombo",          phone:"0114455667",     status:"Active", isDefault:false },
    { name:"Stress Test Branch",  code:"STRESS-01", addr:"Internal",                          phone:"—",              status:"Active", isDefault:false },
  ];

  return (
    <Page title="Branches & Storage" sub="6 branches"
          actions={<button className="btn btn-primary btn-sm" onClick={onNewBranch}><I.Plus size={14}/> New Branch</button>}>
      <div className="card" style={{ padding: 0 }}>
        <table className="tbl">
          <thead>
            <tr><th>Branch</th><th>Code</th><th>Address</th><th>Phone</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="row g">
                    <div style={{ width: 36, height: 36, borderRadius: 10,
                                  background: "linear-gradient(135deg, rgba(124,92,255,0.15), rgba(124,92,255,0.03))",
                                  border: "1px solid rgba(124,92,255,0.2)",
                                  display:"grid", placeItems:"center", color:"var(--accent-1)" }}>
                      <I.Building size={16}/>
                    </div>
                    <div>
                      <strong style={{ fontWeight: 500 }}>{r.name}</strong>
                      {r.isDefault && <span className="chip chip-accent" style={{ fontSize:10, marginLeft:8 }}>Default</span>}
                    </div>
                  </div>
                </td>
                <td className="mono">{r.code}</td>
                <td className="sm muted">{r.addr}</td>
                <td className="mono">{r.phone}</td>
                <td><StatusChip value={r.status}/></td>
                <td>
                  <div className="row g">
                    <button className="btn btn-ghost btn-sm">Storage Zones <I.ArrowRight size={11}/></button>
                    <button className="btn btn-outline btn-sm"><I.Pencil size={12}/></button>
                    <button className="btn btn-ghost btn-sm" style={{ color:"var(--danger)" }}>Disable</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={6} total={6}/>
      </div>
    </Page>
  );
}

/* ===========================================================
   TAGS
   =========================================================== */
function Tags({ onNewTag }) {
  const rows = [
    { name:"Best Seller",          c:"#f59e0b", skuCount:1, created:"5/1/2026" },
    { name:"Bulky",                c:"#0f766e", skuCount:0, created:"5/1/2026" },
    { name:"Clearance",            c:"#dc2626", skuCount:0, created:"5/1/2026" },
    { name:"Fragile",              c:"#ef4444", skuCount:0, created:"5/1/2026" },
    { name:"Heavy",                c:"#475569", skuCount:0, created:"5/1/2026" },
    { name:"Imported",             c:"#3b82f6", skuCount:0, created:"5/1/2026" },
    { name:"Limited Stock",        c:"#f97316", skuCount:0, created:"5/1/2026" },
    { name:"Local",                c:"#64748b", skuCount:0, created:"5/1/2026" },
    { name:"New Arrival",          c:"#22c55e", skuCount:0, created:"5/1/2026" },
    { name:"Non-returnable",       c:"#dc2626", skuCount:0, created:"5/1/2026" },
    { name:"Premium",              c:"#8b5cf6", skuCount:0, created:"5/1/2026" },
    { name:"Returnable",           c:"#10b981", skuCount:0, created:"5/1/2026" },
    { name:"Seasonal",             c:"#06b6d4", skuCount:0, created:"5/1/2026" },
    { name:"Temperature Controlled", c:"#0ea5e9", skuCount:0, created:"5/1/2026" },
  ];

  return (
    <Page title="Tags" sub="Label SKUs to filter and organize them"
          actions={<button className="btn btn-primary btn-sm" onClick={onNewTag}><I.Plus size={14}/> Create Tag</button>}>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div>
            <div className="section-title" style={{ margin:0 }}>Tag cloud</div>
            <div className="sm muted" style={{ marginTop: 4 }}>Click a tag to filter products by it</div>
          </div>
        </div>
        <div className="row g" style={{ flexWrap:"wrap", gap: 8 }}>
          {rows.map((r, i) => (
            <TagPill key={i} name={r.name} color={r.c}/>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Colors</option></FSelect>
          <FSelect><option>All Usage</option><option>Used</option><option>Unused</option></FSelect>
        </Toolbar>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Color</th><th className="num">SKUs</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><TagPill name={r.name} color={r.c}/></td>
                <td className="mono"><span style={{ display:"inline-flex", alignItems:"center", gap: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: r.c }}/>
                  {r.c}
                </span></td>
                <td className="num">{r.skuCount}</td>
                <td className="sm muted">{r.created}</td>
                <td>
                  <div className="row g">
                    <button className="btn btn-outline btn-sm"><I.Pencil size={12}/> Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color:"var(--danger)" }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={14} total={14}/>
      </div>
    </Page>
  );
}

/* ===========================================================
   CATEGORIES
   =========================================================== */
function Categories({ onNewCategory }) {
  const rows = [
    { name:"1 GARMENT ACCESSORIS",  slug:"1-1-garment-accessoris", desc:"Imported department code: 1", lvl:0, status:"Active" },
    { name:"101 LACE",              slug:"1-1-1-lace",   desc:"Imported category code: 101", lvl:1, status:"Active" },
    { name:"102 GARMENT TOOLS",     slug:"1-1-1-garment-tools", desc:"Imported category code: 102", lvl:1, status:"Active" },
    { name:"103 BUTTONS",           slug:"1-1-1-buttons", desc:"Imported category code: 103", lvl:1, status:"Active" },
    { name:"104 PAINT",             slug:"1-1-1-paint", desc:"Imported category code: 104", lvl:1, status:"Active" },
    { name:"106 FABRIC PAINTS",     slug:"1-1-1-fabric-paints", desc:"Imported category code: 106", lvl:1, status:"Active" },
    { name:"107 BEEDS",             slug:"1-1-1-beeds", desc:"Imported category code: 107", lvl:1, status:"Active" },
    { name:"108 NEEDLES",           slug:"1-1-1-needles", desc:"Imported category code: 108", lvl:1, status:"Active" },
    { name:"109 THREADS",           slug:"1-1-1-threads", desc:"Imported category code: 109", lvl:1, status:"Active" },
    { name:"111 LADIESE WERE",      slug:"1-1-1-ladiese-were", desc:"Imported category code: 111", lvl:1, status:"Active" },
    { name:"113 ELASTIC",           slug:"1-1-1-elastic", desc:"Imported category code: 113", lvl:1, status:"Active" },
    { name:"116 STIFF & MATERIAL",  slug:"1-1-1-stiff-material", desc:"Imported category code: 116", lvl:1, status:"Active" },
    { name:"121 CHARCOAL STICKS",   slug:"1-1-1-charcoal-sticks", desc:"Imported category code: 121", lvl:1, status:"Active" },
  ];

  return (
    <Page title="Categories" sub="Manage nested product categories and sub-categories"
          actions={<button className="btn btn-primary btn-sm" onClick={onNewCategory}><I.Plus size={14}/> New Category</button>}>
      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Statuses</option></FSelect>
          <FSelect><option>All Levels</option><option>Top Level</option><option>Sub-category</option></FSelect>
        </Toolbar>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Slug</th><th>Description</th><th className="num">Order</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="row g" style={{ paddingLeft: r.lvl * 22 }}>
                    {r.lvl > 0 && <div style={{ width: 8, height: 1, background:"var(--line-2)" }}/>}
                    <I.Folder size={15} style={{ color: r.lvl === 0 ? "var(--accent-1)" : "var(--ink-3)" }}/>
                    <strong style={{ fontWeight: r.lvl === 0 ? 600 : 500 }}>{r.name}</strong>
                  </div>
                </td>
                <td className="mono">{r.slug}</td>
                <td className="sm muted">{r.desc}</td>
                <td className="num">0</td>
                <td><StatusChip value={r.status}/></td>
                <td>
                  <div className="row g">
                    <button className="btn btn-outline btn-sm"><I.Pencil size={12}/></button>
                    <button className="btn btn-ghost btn-sm" style={{ color:"var(--danger)" }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={13} total={186}/>
      </div>
    </Page>
  );
}

/* ===========================================================
   PRICING OVERLAYS
   =========================================================== */
function PricingOverlays({ onNewOverlay }) {
  return (
    <Page title="Pricing Overlays" sub="Manage dynamic pricing rules and adjustments"
          actions={<button className="btn btn-primary btn-sm" onClick={onNewOverlay}><I.Plus size={14}/> Create Overlay</button>}>

      <div className="grid g-3" style={{ marginBottom: 22 }}>
        <ExampleOverlayCard
          name="Eid Promo · 15% off"
          status="Active"
          type="Percentage Discount" value="15%"
          applies="All Products in Cosmetics" priority="High"
          c="#10b981"
        />
        <ExampleOverlayCard
          name="Bulk B2B"
          status="Active"
          type="Tiered Discount" value="up to 22%"
          applies="JINGLES WHOLSALE only" priority="Medium"
          c="#3b82f6"
        />
        <ExampleOverlayCard
          name="Clearance · Q2"
          status="Scheduled"
          type="Fixed Markdown" value="−LKR 50"
          applies="Tagged · Clearance" priority="Low"
          c="#f59e0b"
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Types</option></FSelect>
          <FSelect><option>All Statuses</option></FSelect>
          <FSelect><option>All Priorities</option></FSelect>
        </Toolbar>
        <div className="empty">
          <div className="empty-icon"><I.Target size={22}/></div>
          <h4>No overlays match your filters</h4>
          <p>Try clearing filters, or create a new overlay to apply pricing rules dynamically.</p>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={onNewOverlay}>
              <I.Plus size={14}/> Create Overlay
            </button>
          </div>
        </div>
      </div>
    </Page>
  );
}

function ExampleOverlayCard({ name, status, type, value, applies, priority, c }) {
  return (
    <div className="card" style={{ padding: 18, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", left:-30, top:-30, width:120, height:120, borderRadius:"50%",
                     background:`radial-gradient(circle, ${c}30, transparent 70%)` }}/>
      <div className="row between" style={{ position:"relative" }}>
        <div className="row g">
          <div style={{ width: 36, height: 36, borderRadius: 10, background:"var(--chip)",
                         display:"grid", placeItems:"center", color: c }}>
            <I.Target size={16}/>
          </div>
          <div>
            <div style={{ fontWeight: 600, letterSpacing:"-0.01em" }}>{name}</div>
            <div className="tiny muted">{type}</div>
          </div>
        </div>
        <StatusChip value={status}/>
      </div>
      <div style={{ marginTop: 14, fontSize: 24, fontWeight: 600, letterSpacing:"-0.02em", color: c }}>{value}</div>
      <div className="tiny muted" style={{ marginTop: 2 }}>{applies}</div>
      <div className="divider"/>
      <div className="row between">
        <span className="chip" style={{ fontSize: 10.5 }}>Priority · {priority}</span>
        <button className="btn btn-ghost btn-sm"><I.Pencil size={12}/> Edit</button>
      </div>
    </div>
  );
}

/* ===========================================================
   BATCH PRICING
   =========================================================== */
function BatchPricing() {
  const rows = [
    { batch:"LEG-01-8120127-PD1398109-G01057-NA", productName:"FATHIMA MEHINDE CONE",  productSku:"8120127", cost:300.00, sell:495.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-8101018-PD1398108-G01057-NA", productName:"KASSSHI MEHENDI BEETROOT", productSku:"8101018", cost:125.00, sell:295.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-8120032-PD1398107-G01057-NA", productName:"GOLECHA HEENA PASTE",   productSku:"8120032", cost:108.33, sell:195.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-6050120-PD1398106-G01057-NA", productName:"NOSSEL 352",            productSku:"6050120", cost:75.00,  sell:150.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-6180047-PD1398105-G01057-NA", productName:"GOLD EDIBLE LEAF PAPER",productSku:"6180047", cost:50.00,  sell:85.00,  ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-6070198-PD1398104-G01057-NA", productName:"FOOD EDIBLE COLOURING PEN", productSku:"6070198", cost:275.00, sell:395.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-6071334-PD1398103-G01057-NA", productName:"CAKE BOLL DECORATER ITEM", productSku:"6071334", cost:220.00, sell:300.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-6070452-PD1398102-G01057-NA", productName:"LAURUSTINUS PLUNGER CUTTER 3", productSku:"6070452", cost:200.00, sell:320.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-6180118-PD1398101-G01057-NA", productName:"WILLIAMS BLACK 3GR",   productSku:"6180118", cost:200.00, sell:225.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-6180117-PD1398100-G01057-NA", productName:"WILLIAMS GREEN 3GR",   productSku:"6180117", cost:200.00, sell:225.00, ws:"—", bulk:"—", margin:"—" },
    { batch:"LEG-01-6180127-PD1398099-G01057-NA", productName:"WILLIAMS ORANGE 3G",   productSku:"6180127", cost:200.00, sell:225.00, ws:"—", bulk:"—", margin:"—" },
  ];

  return (
    <Page title="Batch Pricing" sub="Manage pricing for product batches"
          actions={
            <>
              <button className="btn btn-ghost btn-sm"><I.Download size={14}/> Export</button>
              <button className="btn btn-primary btn-sm"><I.Plus size={14}/> Update Tier Pricing</button>
            </>
          }>
      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Vendors</option></FSelect>
          <FSelect><option>All Statuses</option></FSelect>
        </Toolbar>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 30 }}><label className="checkbox"><input type="checkbox"/><span className="box"><I.Check/></span></label></th>
              <th>Batch #</th><th>Product</th>
              <th className="num">Cost</th><th className="num">Selling</th>
              <th className="num">Wholesale</th><th className="num">Bulk</th><th className="num">Margin</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><label className="checkbox"><input type="checkbox"/><span className="box"><I.Check/></span></label></td>
                <td className="mono" style={{ fontSize:11.5 }}>{r.batch}</td>
                <td>
                  <strong style={{ fontWeight: 500 }}>{r.productName}</strong>
                  <div className="cell-sub mono">{r.productSku}</div>
                </td>
                <td className="num">{r.cost.toFixed(2)}</td>
                <td className="num"><strong>{r.sell.toFixed(2)}</strong></td>
                <td className="num muted">{r.ws}</td>
                <td className="num muted">{r.bulk}</td>
                <td className="num muted">{r.margin}</td>
                <td>
                  <div className="row g">
                    <button className="btn btn-outline btn-sm" title="Apply overlay">
                      <I.Target size={12} style={{ color:"var(--accent-1)" }}/>
                    </button>
                    <button className="btn btn-ghost btn-sm">Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={11} total={20863}/>
      </div>
    </Page>
  );
}

/* ===========================================================
   STOCK TRANSFERS
   =========================================================== */
function StockTransfers({ onNewTransfer }) {
  const rows = [
    { ref:"LEGACY-TN-10017", from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"Completed", req:"10/31/2025" },
    { ref:"LEGACY-TN-17",    from:"JINGLES",          to:"JINGLES WHOLESALE", lines:2, status:"Completed", req:"10/14/2025" },
    { ref:"LEGACY-TN-16",    from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"Completed", req:"8/24/2025" },
    { ref:"LEGACY-TN-15",    from:"JINGLES",          to:"JINGLES WHOLESALE", lines:3, status:"Completed", req:"5/29/2025" },
    { ref:"LEGACY-TN-14",    from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"Completed", req:"5/28/2025" },
    { ref:"LEGACY-TN-13",    from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"Completed", req:"5/2/2025" },
    { ref:"LEGACY-TN-12",    from:"JINGLES",          to:"JINGLES WHOLESALE", lines:5, status:"Completed", req:"3/25/2025" },
    { ref:"LEGACY-TN-11",    from:"JINGLES",          to:"JINGLES WHOLESALE", lines:2, status:"Completed", req:"2/27/2025" },
    { ref:"LEGACY-TN-10",    from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"Completed", req:"1/2/2025" },
    { ref:"LEGACY-TN-9",     from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"Completed", req:"10/26/2024" },
    { ref:"LEGACY-TN-8",     from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"Completed", req:"10/21/2024" },
    { ref:"LEGACY-TN-7",     from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"Completed", req:"9/2/2024" },
    { ref:"LEGACY-TN-6",     from:"JINGLES",          to:"JINGLES WHOLESALE", lines:2, status:"InTransit", req:"8/14/2023" },
    { ref:"LEGACY-TN-4",     from:"JINGLES",          to:"JINGLES WHOLESALE", lines:1, status:"InTransit", req:"2/1/2023" },
    { ref:"LEGACY-TN-5",     from:"JINGLES",          to:"JINGLES WHOLESALE", lines:2, status:"InTransit", req:"2/1/2023" },
    { ref:"LEGACY-TN-2",     from:"JINGLES WEBSITE",  to:"JINGLES",           lines:1, status:"InTransit", req:"10/16/2021" },
  ];

  return (
    <Page title="Stock Transfers" sub="Transfer stock between branches and locations · 18 transfers"
          actions={<button className="btn btn-primary btn-sm" onClick={onNewTransfer}><I.Plus size={14}/> New Transfer</button>}>
      <div className="card" style={{ padding: 0 }}>
        <Toolbar>
          <FSelect><option>All Statuses</option></FSelect>
          <FSelect><option>All From Branches</option></FSelect>
          <FSelect><option>All To Branches</option></FSelect>
          <input className="input" type="date" style={{ width: 150 }}/>
          <input className="input" type="date" style={{ width: 150 }}/>
        </Toolbar>
        <table className="tbl">
          <thead>
            <tr><th>Reference</th><th>From</th><th></th><th>To</th><th className="num">Lines</th><th>Status</th><th>Requested</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.ref}</td>
                <td>{r.from}</td>
                <td style={{ color:"var(--ink-4)", textAlign:"center", width: 32 }}><I.ArrowRight size={14}/></td>
                <td>{r.to}</td>
                <td className="num">{r.lines}</td>
                <td><StatusChip value={r.status}/></td>
                <td className="sm muted">{r.req}</td>
                <td>
                  {r.status === "InTransit"
                    ? <button className="btn btn-danger btn-sm">Cancel</button>
                    : <button className="btn btn-ghost btn-sm"><I.Eye size={12}/> View</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination from={1} to={16} total={18}/>
      </div>
    </Page>
  );
}

Object.assign(window, { Suppliers, Users, Branches, Tags, Categories, PricingOverlays, BatchPricing, StockTransfers });
