/* global React, I, Shared */
// All dialogs

const { useState: useDS, useEffect: useDE } = React;
const { StatusChip, TagPill } = Shared;

function Modal({ open, onClose, icon: Ic, title, sub, size = "md", children, footer }) {
  useDE(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal" + (size === "lg" ? " is-lg" : size === "xl" ? " is-xl" : "")}
           onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {Ic && <div className="modal-icon"><Ic size={17}/></div>}
          <div style={{ flex: 1 }}>
            <h3 className="modal-title">{title}</h3>
            {sub && <p className="modal-sub">{sub}</p>}
          </div>
          <button className="modal-close" onClick={onClose}><I.X size={14}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, req, hint, children, col = 1 }) {
  return (
    <div className="field" style={{ gridColumn: `span ${col}` }}>
      <label className="label">{label}{req && <span className="req">*</span>}</label>
      {children}
      {hint && <div className="tiny muted" style={{ marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/* ===========================================================
   CREATE USER
   =========================================================== */
function CreateUserDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} icon={I.User} title="Create User"
           sub="Add a teammate and assign their role"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">Create User</button>
             </>
           }>
      <div className="grid g-2">
        <Field label="Email" req col={2}>
          <input className="input" placeholder="teammate@theredsun.org"/>
        </Field>
        <Field label="Password" req hint="Minimum 6 characters" col={2}>
          <input className="input" type="password" placeholder="•••••••••••"/>
        </Field>
        <Field label="Role" req>
          <select className="select">
            <option>Staff</option><option>Inspector</option><option>Manager</option><option>Admin</option>
          </select>
        </Field>
        <Field label="Vendor (optional)">
          <select className="select"><option>None</option></select>
        </Field>
      </div>
      <div className="hover-card" style={{ marginTop: 14 }}>
        <div className="row g">
          <I.Info size={15} style={{ color:"var(--accent-1)" }}/>
          <div className="sm">User receives an email invite. They'll set their own password on first login.</div>
        </div>
      </div>
    </Modal>
  );
}

/* ===========================================================
   CREATE SUPPLIER
   =========================================================== */
function CreateSupplierDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} icon={I.Briefcase} title="New Supplier"
           size="lg"
           sub="Add a supplier or vendor to the catalog"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">Create Supplier</button>
             </>
           }>
      <div className="grid g-2">
        <Field label="Name" req><input className="input" placeholder="Acme Distributing Co."/></Field>
        <Field label="Type" req>
          <select className="select"><option>Supplier</option><option>Vendor</option><option>Both</option></select>
        </Field>
        <Field label="Email" req><input className="input" placeholder="orders@acme.com"/></Field>
        <Field label="Phone"><input className="input" placeholder="+1 555 123 4567"/></Field>
        <Field label="Address" col={2}>
          <input className="input" placeholder="Street, City, Country"/>
        </Field>
        <Field label="Website"><input className="input" placeholder="https://…"/></Field>
        <Field label="Tax ID"><input className="input" placeholder="TIN / VAT"/></Field>
        <Field label="Payment Terms"><input className="input" placeholder="e.g. Net 30"/></Field>
        <Field label="Notes"><input className="input" placeholder="Optional"/></Field>
      </div>
    </Modal>
  );
}

/* ===========================================================
   CREATE BRANCH
   =========================================================== */
function CreateBranchDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} icon={I.Building} title="New Branch"
           size="lg"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">Create</button>
             </>
           }>
      <div className="grid g-2">
        <Field label="Name" req><input className="input" placeholder="e.g. Main Branch"/></Field>
        <Field label="Code" req><input className="input" placeholder="e.g. MAIN"/></Field>
        <Field label="Address" col={2}><input className="input"/></Field>
        <Field label="Phone"><input className="input"/></Field>
        <Field label="Email"><input className="input" type="email"/></Field>
        <div style={{ gridColumn: "span 2" }}>
          <label className="checkbox">
            <input type="checkbox"/><span className="box"><I.Check/></span>
            <span>Set as Default Branch</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

/* ===========================================================
   CREATE TAG
   =========================================================== */
function CreateTagDialog({ open, onClose }) {
  const [color, setColor] = useDS("#7c5cff");
  const presets = ["#7c5cff", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#475569"];
  return (
    <Modal open={open} onClose={onClose} icon={I.Tag} title="Create Tag" size="md"
           footer={
             <>
               <button className="btn btn-primary" style={{ flex: 1, justifyContent:"center" }}>Create</button>
               <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent:"center" }}>Cancel</button>
             </>
           }>
      <Field label="Name" req><input className="input" placeholder="e.g. Limited Edition"/></Field>
      <Field label="Color"><div className="row g">
          <input className="input" value={color} onChange={(e)=> setColor(e.target.value)} style={{ fontFamily:"var(--font-mono)" }}/>
          <button style={{ width: 38, height: 38, borderRadius: 10, border:"1px solid var(--line-2)",
                            background: color, cursor:"pointer" }}/>
        </div>
        <div className="row g" style={{ marginTop: 10, flexWrap:"wrap" }}>
          {presets.map(p => (
            <button key={p} onClick={() => setColor(p)}
                    style={{ width: 26, height: 26, borderRadius: 7, border: "2px solid " + (color === p ? "var(--accent-1)" : "transparent"),
                             background: p, cursor:"pointer" }}/>
          ))}
        </div>
      </Field>
      <div style={{ marginTop: 16 }}>
        <div className="tiny muted" style={{ marginBottom: 6 }}>Preview</div>
        <TagPill name="Limited Edition" color={color}/>
      </div>
    </Modal>
  );
}

/* ===========================================================
   CREATE CATEGORY
   =========================================================== */
function CreateCategoryDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} icon={I.Folder} title="New Category" size="lg"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">Create Category</button>
             </>
           }>
      <div className="grid g-2">
        <Field label="Name" req><input className="input" placeholder="e.g. Electronics"/></Field>
        <Field label="Slug" req><input className="input" placeholder="e.g. electronics" style={{ fontFamily:"var(--font-mono)" }}/></Field>
        <Field label="Parent Category">
          <select className="select"><option>— Top Level —</option></select>
        </Field>
        <Field label="Sort Order"><input className="input" type="number" defaultValue="0"/></Field>
        <Field label="Description" col={2}><textarea className="textarea" placeholder="Optional"/></Field>
      </div>
    </Modal>
  );
}

/* ===========================================================
   CREATE PRICING OVERLAY
   =========================================================== */
function CreatePricingOverlayDialog({ open, onClose }) {
  const [type, setType] = useDS("pct");
  return (
    <Modal open={open} onClose={onClose} icon={I.Target} title="Create Overlay" size="lg"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">Create Overlay</button>
             </>
           }>
      <div className="grid g-2">
        <Field label="Name" req><input className="input" placeholder="e.g. Eid Promo"/></Field>
        <Field label="Status"><select className="select"><option>Active</option><option>Scheduled</option><option>Disabled</option></select></Field>
        <Field label="Description" col={2}><textarea className="textarea"/></Field>
      </div>

      <div className="section-head" style={{ margin:"22px 0 12px 0" }}>
        <div>
          <div className="section-title">Pricing Adjustment</div>
        </div>
      </div>
      <div className="grid g-2">
        <Field label="Type" req>
          <select className="select" value={type} onChange={(e)=>setType(e.target.value)}>
            <option value="pct">Percentage Discount</option>
            <option value="fix">Fixed Markdown</option>
            <option value="tier">Tiered</option>
          </select>
        </Field>
        <Field label="Value" req>
          <input className="input" placeholder={type === "pct" ? "10 (for 10%)" : "50.00"}/>
        </Field>
      </div>

      <div className="section-head" style={{ margin:"22px 0 12px 0" }}>
        <div className="section-title">Priority &amp; Stacking</div>
      </div>
      <div className="grid g-2">
        <Field label="Priority" hint="Higher values are applied first"><input className="input" type="number" defaultValue="0"/></Field>
        <div className="field">
          <label className="label">&nbsp;</label>
          <label className="checkbox">
            <input type="checkbox" defaultChecked/><span className="box"><I.Check/></span>
            <span>Allow stacking with other overlays</span>
          </label>
        </div>
      </div>

      <div className="section-head" style={{ margin:"22px 0 12px 0" }}>
        <div className="section-title">Validity Period</div>
      </div>
      <div className="grid g-2">
        <Field label="Valid From"><input className="input" type="datetime-local"/></Field>
        <Field label="Valid To"><input className="input" type="datetime-local"/></Field>
      </div>

      <div className="section-head" style={{ margin:"22px 0 12px 0" }}>
        <div className="section-title">Applies To</div>
      </div>
      <Field label="Target">
        <select className="select"><option>All Products</option><option>Category</option><option>Tagged products</option><option>Specific SKUs</option></select>
      </Field>
      <div style={{ marginTop: 12 }}>
        <label className="checkbox">
          <input type="checkbox"/><span className="box"><I.Check/></span>
          <span>Add Activation Conditions</span>
        </label>
      </div>
    </Modal>
  );
}

/* ===========================================================
   CREATE STOCK TRANSFER
   =========================================================== */
function CreateTransferDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} icon={I.Transfer} title="New Stock Transfer" size="lg"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">Create Transfer</button>
             </>
           }>
      <div className="grid g-2">
        <Field label="From Branch"><select className="select"><option>— Select Branch —</option></select></Field>
        <Field label="To Branch"><select className="select"><option>— Select Branch —</option></select></Field>
        <Field label="From Location"><select className="select"><option>— Select Location —</option></select></Field>
        <Field label="To Location"><select className="select"><option>— Select Location —</option></select></Field>
        <Field label="Notes" col={2}><input className="input"/></Field>
      </div>
      <div className="row between" style={{ margin: "20px 0 10px 0" }}>
        <div className="label">Transfer Lines <span className="req">*</span></div>
        <button className="btn btn-ghost btn-sm"><I.Plus size={13}/> Add Line</button>
      </div>
      <div className="hover-card" style={{ display:"grid", gridTemplateColumns:"2fr 90px 1fr auto", gap:8, alignItems:"center" }}>
        <select className="select"><option>— Select SKU —</option></select>
        <input className="input" type="number" defaultValue="1"/>
        <input className="input" placeholder="Notes"/>
        <button className="icon-btn" style={{ width:36, height:36 }}><I.Trash size={14}/></button>
      </div>
    </Modal>
  );
}

/* ===========================================================
   CREATE GRN
   =========================================================== */
function CreateGRNDialog({ open, onClose, productCtx }) {
  if (productCtx) {
    return (
      <Modal open={open} onClose={onClose} icon={I.Receipt} title="Create GRN"
             sub={`${productCtx.sku} — ${productCtx.name}`}
             footer={
               <>
                 <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                 <button className="btn btn-primary">Create GRN</button>
               </>
             }>
        <div className="grid g-2">
          <Field label="Supplier" req col={2}><select className="select"><option>{productCtx.vendor}</option></select></Field>
          <Field label="Expected Quantity" req><input className="input" type="number" defaultValue="1"/></Field>
          <Field label="Expected Delivery"><input className="input" type="date" defaultValue="2026-05-20"/></Field>
          <Field label="Floor" col={2}><select className="select"><option>— No Floor —</option></select></Field>
          <Field label="Invoice Reference"><input className="input"/></Field>
          <div className="field">
            <label className="label">Batch Mode</label>
            <label className="checkbox" style={{ marginTop: 8 }}>
              <input type="checkbox" defaultChecked/><span className="box"><I.Check/></span>
              <span>Create new batch</span>
            </label>
          </div>
          <Field label="Cost Price"><input className="input" type="number"/></Field>
          <Field label="Selling Price"><input className="input" type="number"/></Field>
        </div>
      </Modal>
    );
  }
  // Full GRN
  return (
    <Modal open={open} onClose={onClose} icon={I.Receipt} title="Create New GRN" size="lg"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">Create GRN</button>
             </>
           }>
      <div className="grid g-2">
        <Field label="Supplier" req><select className="select"><option>Select supplier</option></select></Field>
        <Field label="Invoice Reference"><input className="input" placeholder="e.g. INV-2024-001"/></Field>
        <Field label="Expected Delivery"><input className="input" type="date" defaultValue="2026-05-20"/></Field>
        <Field label="Notes"><input className="input" placeholder="Optional"/></Field>
        <Field label="Receive Location — Floor" col={2}><select className="select"><option>— No Floor —</option></select></Field>
      </div>

      <div className="hover-card" style={{ marginTop: 16, background:"rgba(245,158,11,0.08)", borderColor:"rgba(245,158,11,0.2)" }}>
        <div className="row g">
          <I.Warning size={14} style={{ color:"var(--warning)" }}/>
          <span className="sm">Select a supplier first to load available products.</span>
        </div>
      </div>

      <div className="row between" style={{ margin:"22px 0 10px 0" }}>
        <div className="label">Line Items</div>
        <button className="btn btn-ghost btn-sm"><I.Plus size={13}/> Add Line</button>
      </div>
      <input className="input" placeholder="Filter products by name or code…"/>
      <div className="hover-card" style={{ marginTop: 10, padding: 14 }}>
        <div className="grid g-2">
          <Field label="Product" req><select className="select"><option>Select product</option></select></Field>
          <Field label="Quantity" req><input className="input" type="number" defaultValue="1"/></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ===========================================================
   CREATE PRN
   =========================================================== */
function CreatePRNDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} icon={I.ReturnArrow} title="Create New PRN" size="lg"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">Create PRN</button>
             </>
           }>
      <div className="grid g-2">
        <Field label="Supplier" req><select className="select"><option>Select supplier</option></select></Field>
        <Field label="Return Reason"><input className="input" placeholder="e.g. Damaged on arrival"/></Field>
        <Field label="Expected Pickup Date"><input className="input" type="date" defaultValue="2026-05-20"/></Field>
        <Field label="Notes"><input className="input" placeholder="Optional notes…"/></Field>
        <Field label="Return Location — Floor" col={2}><select className="select"><option>— No Floor —</option></select></Field>
      </div>

      <div className="hover-card" style={{ marginTop: 16, background:"rgba(245,158,11,0.08)", borderColor:"rgba(245,158,11,0.2)" }}>
        <div className="row g">
          <I.Warning size={14} style={{ color:"var(--warning)" }}/>
          <span className="sm">Please select a supplier first to load available products.</span>
        </div>
      </div>

      <div className="row between" style={{ margin:"22px 0 10px 0" }}>
        <div className="label">Line Items</div>
        <button className="btn btn-ghost btn-sm"><I.Plus size={13}/> Add Line</button>
      </div>
      <input className="input" placeholder="Filter products by name or code…"/>
      <div className="hover-card" style={{ marginTop: 10, padding: 14 }}>
        <div className="grid g-2">
          <Field label="Product" req><select className="select"><option>Select product</option></select></Field>
          <Field label="Return Qty" req><input className="input" type="number" defaultValue="1"/></Field>
          <Field label="Line Notes" col={2}><input className="input" placeholder="Optional line notes…"/></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ===========================================================
   ADD INVENTORY / NEW RECORD
   =========================================================== */
function NewInventoryDialog({ open, onClose, productCtx }) {
  return (
    <Modal open={open} onClose={onClose} icon={I.Box}
           title={productCtx ? "Add Inventory" : "New Inventory Record"}
           sub={productCtx ? `${productCtx.sku} — ${productCtx.name}` : undefined}
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary">{productCtx ? "Add Inventory" : "Create Record"}</button>
             </>
           }>
      <div className="grid g-2">
        {!productCtx && (
          <Field label="Product (SKU)" req col={2}><select className="select"><option>— Select Product —</option></select></Field>
        )}
        <Field label="Quantity" req>
          <input className="input" type="number" defaultValue="1"/>
        </Field>
        <Field label="State">
          <select className="select"><option>Uninspected</option><option>Inspected</option></select>
        </Field>
        {!productCtx && (
          <div style={{ gridColumn:"span 2" }}>
            <div className="row g" style={{ flexWrap:"wrap" }}>
              {[-10, -1, 1, 10, 20, 100, 500].map(n => (
                <button key={n} className="btn btn-sm" style={{
                  background: n < 0 ? "rgba(239,68,68,0.12)" : n > 50 ? "rgba(124,92,255,0.16)" : "rgba(16,185,129,0.12)",
                  color: n < 0 ? "var(--danger)" : n > 50 ? "var(--accent-1)" : "#10b981",
                  border: "1px solid transparent"
                }}>{n > 0 ? "+" : ""}{n}</button>
              ))}
            </div>
          </div>
        )}
        <Field label="Floor" req={!productCtx} col={2}><select className="select"><option>— Select Floor —</option></select></Field>
        <Field label="Batch ID" col={2}><select className="select"><option>— No Batch —</option></select></Field>
      </div>
    </Modal>
  );
}

/* ===========================================================
   PRODUCT EDITOR (tabbed)
   =========================================================== */
const PRODUCT_TABS = [
  { id:"details",   label:"Details",   icon:I.File },
  { id:"tags",      label:"Tags",      icon:I.Tag },
  { id:"barcodes",  label:"Barcodes",  icon:I.Barcode },
  { id:"locations", label:"Locations", icon:I.Pin },
  { id:"variants",  label:"Variants",  icon:I.Variants },
  { id:"duplicates",label:"Duplicates",icon:I.Copy },
  { id:"images",    label:"Images",    icon:I.Image },
  { id:"pricing",   label:"Pricing",   icon:I.Money },
];

function ProductEditorDialog({ open, onClose, product, openCreateGRN }) {
  const [tab, setTab] = useDS("details");
  if (!open) return null;
  const p = product || { sku:"4791066002249", name:"EH Water" };
  return (
    <Modal open={open} onClose={onClose} title={p.name} sub={p.sku} size="xl"
           footer={
             <>
               <button className="btn btn-ghost" onClick={onClose}>Close</button>
               {tab === "details" && <button className="btn btn-primary"><I.Check size={13}/> Save Changes</button>}
             </>
           }>
      <div className="tabs" style={{ marginBottom: 18, flexWrap:"wrap" }}>
        {PRODUCT_TABS.map(t => (
          <button key={t.id} className={"tab" + (tab === t.id ? " is-active" : "")}
                  onClick={() => setTab(t.id)}>
            <t.icon size={13}/> {t.label}
          </button>
        ))}
      </div>

      {tab === "details" && <ProductDetails p={p}/>}
      {tab === "tags" && <ProductTags/>}
      {tab === "barcodes" && <ProductBarcodes p={p}/>}
      {tab === "locations" && <ProductLocations/>}
      {tab === "variants" && <ProductVariants/>}
      {tab === "duplicates" && <ProductDuplicates/>}
      {tab === "images" && <ProductImages/>}
      {tab === "pricing" && <ProductPricing/>}
    </Modal>
  );
}

function ProductDetails({ p }) {
  return (
    <>
      <div className="grid g-2">
        <Field label="SKU Code"><input className="input" defaultValue={p.sku} style={{ fontFamily:"var(--font-mono)" }}/></Field>
        <Field label="Product Name"><input className="input" defaultValue={p.name}/></Field>
        <Field label="Category"><select className="select"><option>└ GENERAL ITEMS</option></select></Field>
        <Field label="Vendors">
          <div className="input" style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", minHeight: 40 }}>
            <span className="chip chip-accent" style={{ padding:"2px 8px" }}>UNILEVER SRI LANKA LTD <I.X size={10}/></span>
          </div>
        </Field>
        <Field label="Unit of Measure"><select className="select"><option>NOS (nos)</option></select></Field>
        <Field label="Low Stock Threshold"><input className="input" type="number" defaultValue="5"/></Field>
        <Field label="Max Stack Height (cm)"><input className="input" type="number"/></Field>
        <Field label="Description" col={2}><textarea className="textarea"/></Field>
      </div>

      <div className="section-head" style={{ margin:"22px 0 12px 0" }}>
        <div>
          <div className="section-title">Default Pricing</div>
          <div className="section-sub">Used as defaults when creating GRNs and when no batch-specific pricing exists.</div>
        </div>
      </div>
      <div className="grid g-2">
        <Field label="Cost Price"><input className="input" type="number" defaultValue="50"/></Field>
        <Field label="Selling Price"><input className="input" type="number" defaultValue="100"/></Field>
        <Field label="Wholesale Price"><input className="input" type="number" placeholder="0.00"/></Field>
        <Field label="Bulk Price"><input className="input" type="number" placeholder="0.00"/></Field>
        <Field label="Margin Type"><select className="select"><option>— No Margin —</option></select></Field>
        <Field label="Margin Value"><input className="input" placeholder="0.00"/></Field>
        <Field label="Currency"><input className="input" defaultValue="LKR"/></Field>
      </div>
    </>
  );
}

function ProductTags() {
  const all = ["Best Seller","Bulky","Clearance","Fragile","Heavy","Imported","Limited Stock","Local","New Arrival","Non-returnable","Premium","Returnable","Seasonal","Temperature Controlled"];
  const colors = { "Best Seller":"#f59e0b","Fragile":"#ef4444","Premium":"#8b5cf6","New Arrival":"#22c55e","Seasonal":"#06b6d4" };
  return (
    <>
      <div className="sm muted" style={{ marginBottom: 14 }}>Assign tags for filtering and organization.</div>
      <div className="row g" style={{ flexWrap:"wrap", marginBottom: 18 }}>
        <span className="chip chip-accent" style={{ padding:"5px 10px" }}>
          Best Seller <I.X size={11} style={{ marginLeft:4 }}/>
        </span>
      </div>
      <div className="divider"/>
      <div className="row g" style={{ alignItems:"stretch", marginBottom: 18 }}>
        <input className="input" placeholder="Type tag name…" style={{ flex: 1 }}/>
        <button className="btn btn-primary"><I.Plus size={13}/> Add</button>
      </div>
      <div className="tiny muted" style={{ marginBottom: 6 }}>New tags are created automatically.</div>
      <div className="divider"/>
      <div className="label" style={{ marginBottom: 10 }}>Available Tags</div>
      <div className="row g" style={{ flexWrap:"wrap", gap: 8 }}>
        {all.map((t, i) => (
          <button key={i} className="tag-pill" style={{ background:"transparent", cursor:"pointer" }}>
            <I.Plus size={11}/> <TagPill name={t} color={colors[t]}/>
          </button>
        ))}
      </div>
    </>
  );
}

function ProductBarcodes({ p }) {
  return (
    <>
      <div className="hover-card" style={{ marginBottom: 18, display:"flex", alignItems:"center", gap: 12 }}>
        <I.Barcode size={20} style={{ color:"var(--accent-1)" }}/>
        <div style={{ flex: 1 }}>
          <div className="mono">{p.sku}</div>
          <div className="tiny muted">EAN13 · Default</div>
        </div>
        <button className="btn btn-danger btn-sm">Remove</button>
      </div>

      <div className="section-title" style={{ marginBottom: 12 }}>Add Barcode</div>
      <div className="grid g-2">
        <Field label="Barcode value" req col={2}><input className="input"/></Field>
        <Field label="Type"><select className="select"><option>EAN13</option><option>UPC</option><option>Code128</option></select></Field>
        <Field label="Label (optional)"><input className="input"/></Field>
        <div style={{ gridColumn:"span 2" }}>
          <label className="checkbox">
            <input type="checkbox"/><span className="box"><I.Check/></span> Set as Default
          </label>
        </div>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 14 }}><I.Plus size={13}/> Add Barcode</button>
    </>
  );
}

function ProductLocations() {
  return (
    <>
      <div className="hover-card" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Assign stock to a location</div>
        <div className="sm muted" style={{ marginBottom: 14 }}>Create an inventory record for this product on a floor, shelf, or box.</div>
        <div className="grid g-2">
          <Field label="Quantity" req><input className="input" type="number" defaultValue="1"/></Field>
          <Field label="State"><select className="select"><option>Uninspected</option></select></Field>
          <Field label="Floor" req><select className="select"><option>— Select Floor —</option></select></Field>
          <Field label="Batch"><select className="select"><option>— No Batch —</option></select></Field>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 14 }}>Assign Stock</button>
      </div>

      <div className="sm muted" style={{ marginBottom: 12 }}>Current inventory by location for this product. Click Transition to change state.</div>

      <div className="hover-card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="row g">
            <I.Pin size={14} style={{ color:"var(--accent-1)" }}/>
            <span style={{ fontWeight: 500 }}>Dubai HQ Warehouse › Ground Floor › Shelf A1-1 (SH-A1-1)</span>
          </div>
          <span className="chip chip-accent">11 units</span>
        </div>
        <div className="divider"/>
        {[
          { state:"Uninspected", batch:"4791066002249-B002", qty:1 },
          { state:"Inspected",   batch:"—",                  qty:10 },
        ].map((r, i) => (
          <div key={i} className="row between" style={{ padding:"8px 0" }}>
            <div className="row g">
              <StatusChip value={r.state}/>
              <span className="sm muted">Batch: {r.batch}</span>
            </div>
            <div className="row g">
              <span style={{ fontVariantNumeric:"tabular-nums" }}>{r.qty} NOS</span>
              <button className="btn btn-outline btn-sm">Transition</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ProductVariants() {
  const attrs = [
    { name: "Color", values:[
      { v:"Carbon Black", c:"#171717" }, { v:"Arctic White", c:"#f5f5f5" }, { v:"Midnight Blue", c:"#1d4ed8" },
      { v:"Crimson Red", c:"#dc2626" }, { v:"Forest Green", c:"#15803d" }, { v:"Silver", c:"#94a3b8" },
      { v:"Gold", c:"#ca8a04" }, { v:"Natural", c:"#d4a373" }, { v:"Purple", c:"#7c3aed" }
    ]},
    { name: "Size",     values: ["Compact","Standard","Extended","XS","S","M","L","XL","One Size"].map(v => ({ v })) },
    { name: "Material", values: ["Plastic","Metal","Glass","Wood","Ceramic","Rubber","Cotton","Polyester","Leather"].map(v => ({ v })) },
    { name: "Pack Size", values: ["Single","Pair","Pack of 3","Pack of 6","Pack of 12","Bulk Pack"].map(v => ({ v })) },
    { name: "Voltage",  values: ["110V","220V","240V","Dual Voltage"].map(v => ({ v })) },
    { name: "Finish",   values: ["Matte","Glossy","Brushed","Polished"].map(v => ({ v })) },
  ];
  return (
    <div className="hover-card">
      <div className="section-title" style={{ marginBottom: 14 }}>Generate Variants from Attributes</div>
      {attrs.map((a, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div className="label" style={{ marginBottom: 8 }}>{a.name}</div>
          <div className="row g" style={{ flexWrap:"wrap" }}>
            {a.values.map((vobj, j) => (
              <label key={j} className="checkbox" style={{
                padding:"6px 10px", borderRadius: 8, background:"var(--bg-2)", border:"1px solid var(--line)"
              }}>
                <input type="checkbox"/><span className="box"><I.Check/></span>
                {vobj.c && <span style={{ width: 10, height: 10, borderRadius:"50%", background: vobj.c, border:"1px solid var(--line-2)" }}/>}
                <span style={{ fontSize: 12 }}>{vobj.v}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <button className="btn btn-primary" style={{ marginTop: 8 }}>
        <I.Bolt size={13}/> Generate Variants
      </button>
      <div className="empty" style={{ padding: "30px 0", margin: 0 }}>
        <div className="tiny muted">No variants yet. Select attributes above and click Generate.</div>
      </div>
    </div>
  );
}

function ProductDuplicates() {
  return (
    <>
      <div className="hover-card" style={{ marginBottom: 18, background:"rgba(59,130,246,0.08)", borderColor:"rgba(59,130,246,0.22)" }}>
        <div className="row g">
          <I.Info size={14} style={{ color:"#60a5fa" }}/>
          <div className="sm">Products imported as standalone SKUs can be merged into this product or converted into variants while preserving inventory, batches, barcodes, images, vendors, tags, GRN/PRN lines, and stock transfer lines.</div>
        </div>
      </div>
      <div className="empty">
        <div className="empty-icon"><I.Search size={22}/></div>
        <h4>No likely duplicates found</h4>
        <p>If we spot a similar SKU later, it'll surface here.</p>
      </div>
    </>
  );
}

function ProductImages() {
  return (
    <>
      <div className="hover-card" style={{ marginBottom: 18 }}>
        <Field label="Media Scope">
          <select className="select"><option>Product media</option><option>Variant-specific</option></select>
        </Field>
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Product media is used by default. Select a variant to manage images only for that variant.
        </div>
      </div>

      <div className="section-title" style={{ marginBottom: 10 }}>Upload Product Images / Video</div>
      <div style={{
        border: "1.5px dashed var(--line-strong)", borderRadius: 14,
        padding: "36px 16px", textAlign: "center", background: "var(--glass-pop)", cursor: "pointer"
      }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, margin:"0 auto 12px auto",
                      background:"var(--chip)", display:"grid", placeItems:"center", color:"var(--accent-1)" }}>
          <I.Upload size={18}/>
        </div>
        <div className="sm" style={{ fontWeight: 500 }}>Drag &amp; drop files here</div>
        <div className="tiny muted" style={{ marginTop: 4 }}>or click to browse for product media</div>
        <div className="tiny muted" style={{ marginTop: 8 }}>Supports Images (JPG, PNG, GIF, WebP) and Videos (MP4, WebM, MOV, AVI) · Max 50MB</div>
      </div>

      <div className="section-title" style={{ margin:"20px 0 10px 0" }}>Product Gallery</div>
      <div className="grid g-4">
        <div style={{ position:"relative", aspectRatio: "1/1", borderRadius: 12,
                       background:"linear-gradient(135deg, rgba(124,92,255,0.2), rgba(217,70,239,0.2))",
                       border:"1px solid var(--line-2)" }}>
          <span style={{ position:"absolute", top: 8, left: 8 }} className="chip chip-accent">Primary</span>
        </div>
      </div>
    </>
  );
}

function ProductPricing() {
  return (
    <>
      <div className="section-title" style={{ marginBottom: 14 }}>Batch Pricing</div>
      <div className="card" style={{ padding: 0, marginBottom: 22 }}>
        <table className="tbl">
          <thead><tr><th>Batch #</th><th>Variant</th><th className="num">Cost</th><th className="num">Selling</th><th className="num">Wholesale</th><th className="num">Bulk</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td className="mono">4791066002249-B002</td>
              <td className="muted">—</td>
              <td className="num">60</td><td className="num"><strong>120</strong></td>
              <td className="num muted">—</td><td className="num muted">—</td>
              <td><button className="btn btn-outline btn-sm">Edit</button></td>
            </tr>
            <tr>
              <td className="mono">4791066002249-B001</td>
              <td className="muted">—</td>
              <td className="num">40</td><td className="num"><strong>100</strong></td>
              <td className="num muted">—</td><td className="num muted">—</td>
              <td><button className="btn btn-outline btn-sm">Edit</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="section-title" style={{ marginBottom: 6 }}>Quantity Tier Pricing</div>
      <div className="sm muted" style={{ marginBottom: 14 }}>No quantity tiers set.</div>
      <div className="grid" style={{ gridTemplateColumns:"1fr 1fr 1fr auto auto", gap: 10, alignItems:"flex-end" }}>
        <Field label="Min Qty" req><input className="input" defaultValue="0"/></Field>
        <Field label="Max Qty"><input className="input" placeholder="Leave blank for unlimited"/></Field>
        <Field label="Price" req><input className="input" placeholder="0.00"/></Field>
        <Field label="Currency"><input className="input" defaultValue="USD" style={{ width: 100 }}/></Field>
        <button className="btn btn-primary"><I.Plus size={13}/> Add</button>
      </div>
    </>
  );
}

/* ===========================================================
   CREATE NEW PRODUCT (2-step wizard)
   =========================================================== */
function CreateProductDialog({ open, onClose }) {
  const [step, setStep] = useDS(1);
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} icon={I.Plus} title="Create New Product" size="lg"
           footer={
             <>
               {step === 2 && <button className="btn btn-ghost" onClick={() => setStep(1)}><I.ChevronLeft size={13}/> Back</button>}
               <div style={{ flex: 1 }}/>
               <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary"
                       onClick={() => step === 1 ? setStep(2) : onClose()}>
                 {step === 1 ? "Continue" : "Create Product & Continue"}
               </button>
             </>
           }>
      <div className="row g" style={{ marginBottom: 22 }}>
        <Step n={1} label="Basics &amp; Pricing" active={step === 1} done={step > 1}/>
        <div style={{ flex: 1, height: 1, background:"var(--line)", marginTop: 18 }}/>
        <Step n={2} label="Attributes &amp; Tags" active={step === 2}/>
      </div>

      {step === 1 ? (
        <>
          <div className="grid g-2">
            <Field label="SKU Code" req><input className="input" placeholder="e.g. WDG-001" style={{ fontFamily:"var(--font-mono)" }}/></Field>
            <Field label="Product Name" req><input className="input"/></Field>
            <Field label="Category"><select className="select"><option>— No Category —</option></select></Field>
            <Field label="Vendors" req><select className="select"><option>Select vendors</option></select></Field>
            <Field label="Unit of Measure" req><select className="select"><option>— Select Unit —</option></select></Field>
            <Field label="Low Stock Alert"><input className="input" placeholder="Alert when qty ≤ value"/></Field>
            <Field label="Max Stack Height (cm)" col={2}><input className="input"/></Field>
            <Field label="Description" col={2}><textarea className="textarea"/></Field>
          </div>

          <div className="section-head" style={{ margin:"22px 0 12px 0" }}>
            <div>
              <div className="section-title">Default Pricing</div>
              <div className="section-sub">Used as defaults when creating GRNs and when no batch-specific pricing exists.</div>
            </div>
          </div>
          <div className="grid g-2">
            <Field label="Cost Price"><input className="input" placeholder="0.00"/></Field>
            <Field label="Selling Price"><input className="input" placeholder="0.00"/></Field>
            <Field label="Wholesale Price"><input className="input" placeholder="0.00"/></Field>
            <Field label="Bulk Price"><input className="input" placeholder="0.00"/></Field>
            <Field label="Margin Type"><select className="select"><option>— No Margin —</option></select></Field>
            <Field label="Margin Value"><input className="input" placeholder="0.00"/></Field>
            <Field label="Currency"><input className="input" defaultValue="LKR"/></Field>
          </div>
        </>
      ) : (
        <>
          <div className="section-title" style={{ marginBottom: 6 }}>📅 Manufacture &amp; Expiry Dates</div>
          <div className="sm muted" style={{ marginBottom: 16 }}>Set default dates for product batches. Expiry date will auto-calculate if shelf life is provided.</div>
          <div className="grid g-2">
            <Field label="Default Manufacturing Date"><input className="input" type="date"/></Field>
            <Field label="Default Expiry Date"><input className="input" type="date"/></Field>
            <Field label="Shelf Life (days)" hint="Auto-calculates expiry when manufacture date is set" col={2}>
              <input className="input" placeholder="e.g. 365"/>
            </Field>
          </div>

          <div className="section-head" style={{ margin:"22px 0 12px 0" }}>
            <div className="section-title">Tags</div>
          </div>
          <div className="row g" style={{ alignItems:"stretch" }}>
            <input className="input" placeholder="Add or create tag…" style={{ flex: 1 }}/>
            <button className="btn btn-primary btn-sm">Add Tag</button>
          </div>

          <div className="section-head" style={{ margin:"22px 0 12px 0" }}>
            <div>
              <div className="section-title">Product Attributes &amp; Variants</div>
              <div className="section-sub">Select attributes and values to generate variants automatically</div>
            </div>
          </div>
          {["Color (9 values)","Size (9 values)","Material (9 values)","Pack Size (6 values)","Voltage (4 values)","Finish (4 values)"].map((a, i) => (
            <div key={i} className="hover-card" style={{ marginBottom: 8, padding:"12px 14px" }}>
              <label className="checkbox">
                <input type="checkbox"/><span className="box"><I.Check/></span>
                <span style={{ fontWeight: 500 }}>{a.split(" (")[0]}</span>
                <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>({a.split("(")[1]}</span>
              </label>
            </div>
          ))}
          <div className="row g" style={{ marginTop: 14 }}>
            <label className="checkbox"><input type="checkbox"/><span className="box"><I.Check/></span>
              <span><I.Warning size={12} style={{ color:"var(--warning)" }}/> Fragile</span>
            </label>
            <label className="checkbox"><input type="checkbox" defaultChecked/><span className="box"><I.Check/></span>
              <span>Active</span>
            </label>
          </div>
        </>
      )}
    </Modal>
  );
}

function Step({ n, label, active, done }) {
  return (
    <div className="row g" style={{ alignItems:"center" }}>
      <div style={{
        width: 28, height: 28, borderRadius: 999, display:"grid", placeItems:"center", fontSize: 12,
        background: done ? "var(--success)" : active ? "linear-gradient(180deg, var(--accent-2), var(--accent-3))" : "var(--chip)",
        color: done || active ? "white" : "var(--ink-3)",
        boxShadow: active ? "0 6px 16px -6px rgba(124,92,255,0.7)" : "none"
      }}>
        {done ? <I.Check size={13}/> : n}
      </div>
      <div className="sm" style={{ fontWeight: active ? 600 : 400, color: active || done ? "var(--ink)" : "var(--ink-3)" }}>{label}</div>
    </div>
  );
}

Object.assign(window, {
  Modal,
  CreateUserDialog, CreateSupplierDialog, CreateBranchDialog,
  CreateTagDialog, CreateCategoryDialog, CreatePricingOverlayDialog,
  CreateTransferDialog, CreateGRNDialog, CreatePRNDialog,
  NewInventoryDialog, ProductEditorDialog, CreateProductDialog
});
