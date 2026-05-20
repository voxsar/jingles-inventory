/* global React, I */
// AviInv App Shell — sidebar, topbar, AI command bar, theme toggle

const { useState, useEffect, useRef, useMemo, createContext, useContext } = React;

// ---------- App Context ----------
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

const NAV = [
  { section: "Workspace" },
  { id: "dashboard",   label: "Dashboard",     icon: I.Dashboard },
  { id: "inventory",   label: "Inventory",     icon: I.Box, badge: "4" },
  { id: "products",    label: "Products",      icon: I.Sku, badge: "20,863" },

  { section: "Operations" },
  { id: "grns",        label: "GRNs",          icon: I.Receipt },
  { id: "prns",        label: "PRNs",          icon: I.ReturnArrow },
  { id: "transfers",   label: "Stock Transfers", icon: I.Transfer },
  { id: "pricing",     label: "Pricing Overlays", icon: I.Target },
  { id: "batches",     label: "Batch Pricing", icon: I.Coins },

  { section: "Catalog" },
  { id: "categories",  label: "Categories",    icon: I.Folder },
  { id: "tags",        label: "Tags",          icon: I.Tag },
  { id: "suppliers",   label: "Suppliers",     icon: I.Briefcase },

  { section: "Locations" },
  { id: "branches",    label: "Branches & Storage", icon: I.Building },
  { id: "warehouse3d", label: "Warehouse 3D",  icon: I.Cube3d },

  { section: "Tools" },
  { id: "ai-imports",  label: "AI Imports",    icon: I.Sparkles, accent: true },
  { id: "spreadsheet", label: "Spreadsheet",   icon: I.Spreadsheet },
  { id: "reports",     label: "Reports",       icon: I.Chart },
  { id: "users",       label: "Users",         icon: I.Users },
  { id: "settings",    label: "Settings",      icon: I.Settings },
];

// ---------- Brand Mark ----------
function BrandMark() {
  return (
    <div className="brand-mark" aria-label="AviInv">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3 9 5v8l-9 5-9-5V8Z"/>
        <path d="m3 8 9 5 9-5"/>
        <path d="M12 13v8"/>
      </svg>
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar() {
  const { route, setRoute, tweaks } = useApp();
  return (
    <aside className="sidebar" data-style={tweaks.sidebarStyle}>
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">AviInv</div>
          <div className="brand-sub">Inventory · v3</div>
        </div>
      </div>

      <nav style={{ display:"flex", flexDirection:"column", gap:2, overflowY:"auto", marginRight:-6, paddingRight:6 }}>
        {NAV.map((n, i) => n.section ? (
          <div key={"s"+i} className="nav-section">{n.section}</div>
        ) : (
          <div
            key={n.id}
            className={"nav-item" + (route === n.id ? " is-active" : "")}
            onClick={() => setRoute(n.id)}
          >
            <n.icon className="nav-icon" size={17} />
            <span className="nav-label">{n.label}</span>
            {n.badge && <span className="nav-badge">{n.badge}</span>}
            {n.accent && !n.badge && (
              <span className="nav-badge" style={{ background:"rgba(124,92,255,0.15)", color:"var(--accent-1)" }}>AI</span>
            )}
          </div>
        ))}
      </nav>

      <div className="user-card">
        <div className="user-avatar">AD</div>
        <div className="user-meta">
          <div className="user-email">admin@theredsun.org</div>
          <div className="user-role">Admin</div>
        </div>
        <div className="logout" title="Log out">
          <I.LogOut size={15} />
        </div>
      </div>
    </aside>
  );
}

// ---------- AI Command Bar ----------
function AiBar() {
  const { setRoute, openCommand } = useApp();
  const [val, setVal] = useState("");
  return (
    <div className="ai-bar" onClick={() => openCommand()}>
      <div className="ai-spark">
        <I.Sparkles size={13} />
      </div>
      <input
        placeholder="Ask AviInv anything, or search..."
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onFocus={() => openCommand()}
        readOnly
      />
      <kbd>⌘K</kbd>
    </div>
  );
}

// ---------- Topbar ----------
function Topbar() {
  const { route, theme, setTheme, openTweaks } = useApp();
  const current = NAV.find(n => n.id === route);
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Inventory Management</span>
        <I.ChevronRight size={14} />
        <strong>{current?.label || "Dashboard"}</strong>
      </div>
      <AiBar />
      <div className="top-actions">
        <button className="icon-btn" title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <I.Sun size={17}/> : <I.Moon size={17}/>}
        </button>
        <button className="icon-btn has-dot" title="Notifications"><I.Bell size={17}/></button>
        <button className="icon-btn" title="Help"><I.Help size={17}/></button>
      </div>
    </header>
  );
}

// ---------- Command Palette (AI overlay) ----------
function CommandPalette({ onClose }) {
  const { setRoute } = useApp();
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | thinking | answered
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const suggestions = [
    { icon: I.Sparkles, label: "Why are 3 GRNs still open this week?", kind: "AI" },
    { icon: I.Sparkles, label: "Generate a stock transfer from JINGLES to BIZONE for top 5 SKUs", kind: "AI" },
    { icon: I.Sparkles, label: "Summarize last 30 days of damage events", kind: "AI" },
    { icon: I.ArrowRight, label: "Jump to Inventory",       route: "inventory" },
    { icon: I.ArrowRight, label: "Jump to Products",        route: "products" },
    { icon: I.ArrowRight, label: "Jump to AI Imports",      route: "ai-imports" },
    { icon: I.Plus, label: "Create new GRN",                action: "new-grn" },
    { icon: I.Plus, label: "Create new Supplier",           action: "new-supplier" },
  ];

  const filtered = suggestions.filter(s => !q || s.label.toLowerCase().includes(q.toLowerCase()));

  const handleAsk = () => {
    if (!q.trim()) return;
    setPhase("thinking");
    setTimeout(() => setPhase("answered"), 1100);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal is-lg" style={{ maxWidth: 680, padding: 0 }} onClick={(e)=>e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"18px 22px", borderBottom:"1px solid var(--line)" }}>
          <div style={{ width:32, height:32, borderRadius:10, display:"grid", placeItems:"center",
                        background: "conic-gradient(from 0deg, var(--accent-1), var(--accent-2), var(--accent-3), var(--accent-1))",
                        color:"white", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.6)" }}>
            <I.Sparkles size={16}/>
          </div>
          <input
            ref={inputRef}
            placeholder="Ask anything about your inventory…"
            value={q}
            onChange={(e)=>{ setQ(e.target.value); setPhase("idle"); }}
            onKeyDown={(e)=>{ if (e.key === "Enter") handleAsk(); if (e.key === "Escape") onClose(); }}
            style={{
              flex:1, background:"transparent", border:0, outline:0,
              fontSize: 17, color: "var(--ink)", letterSpacing:"-0.01em"
            }}
          />
          <kbd style={{ fontFamily:"var(--font-mono)", fontSize:11, padding:"4px 8px", borderRadius:6,
                       background:"var(--chip)", color:"var(--ink-3)", border:"1px solid var(--line)" }}>ESC</kbd>
        </div>

        {phase === "idle" && (
          <div style={{ padding: "10px 10px 16px 10px", maxHeight: 420, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px 14px", fontSize: 10.5, letterSpacing: "0.12em",
                          textTransform: "uppercase", color: "var(--ink-4)" }}>Suggestions</div>
            {filtered.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  if (s.route) { setRoute(s.route); onClose(); }
                  else if (s.kind === "AI") { setQ(s.label); handleAsk(); }
                  else onClose();
                }}
                style={{
                  display:"flex", alignItems:"center", gap:12, width:"100%", textAlign:"left",
                  padding:"11px 14px", borderRadius:10, background:"transparent", border:0,
                  color:"var(--ink)", cursor:"pointer", fontSize: 13.5
                }}
                onMouseEnter={(e)=> e.currentTarget.style.background = "var(--row-hover)"}
                onMouseLeave={(e)=> e.currentTarget.style.background = "transparent"}
              >
                <s.icon size={16} style={{ color: s.kind === "AI" ? "var(--accent-1)" : "var(--ink-3)" }}/>
                <span style={{ flex:1 }}>{s.label}</span>
                {s.kind === "AI" && (
                  <span className="chip chip-accent" style={{ fontSize: 10 }}>
                    <I.Sparkles size={10}/> AI
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 30, textAlign:"center", color:"var(--ink-3)", fontSize: 13 }}>
                No results. Press Enter to ask AviInv AI.
              </div>
            )}
          </div>
        )}

        {phase === "thinking" && (
          <div style={{ padding: 36, display:"flex", alignItems:"center", gap:14, color:"var(--ink-2)" }}>
            <div className="ai-pulse" style={{ width: 32, height: 32, borderRadius: 999,
                background: "conic-gradient(from 0deg, var(--accent-1), var(--accent-2), var(--accent-3), var(--accent-1))",
                animation: "spin 1.2s linear infinite" }}/>
            <div style={{ fontSize: 14 }}>Thinking through your inventory…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {phase === "answered" && (
          <div style={{ padding: "8px 22px 22px 22px", maxHeight: 480, overflowY: "auto" }}>
            <div style={{ display:"flex", gap:12, padding:"14px 0" }}>
              <div className="ai-spark" style={{ width: 28, height: 28, borderRadius:8, flexShrink:0,
                  background:"conic-gradient(from 0deg, var(--accent-1), var(--accent-2), var(--accent-3), var(--accent-1))",
                  display:"grid", placeItems:"center", color:"white" }}>
                <I.Sparkles size={14}/>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color:"var(--ink)" }}>
                Here's what I found. Three GRNs are currently open — two stalled in <strong>Submitted</strong> state for 4+ days
                (UNILEVER SRI LANKA LTD, invoice <span style={{fontFamily:"var(--font-mono)", fontSize:12.5}}>8b5f2b7d…</span>),
                and one Draft (<span style={{fontFamily:"var(--font-mono)", fontSize:12.5}}>001</span>) without any received quantity yet.
                <div style={{ marginTop: 12, padding: 14, borderRadius: 12,
                              background: "var(--glass-pop)", border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 11.5, color:"var(--ink-3)", letterSpacing:"0.08em",
                                textTransform:"uppercase", marginBottom: 8 }}>Suggested actions</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <div className="row g" style={{ fontSize: 13 }}>
                      <I.ArrowRight size={14} style={{ color:"var(--accent-1)" }}/>
                      <span>Re-inspect the Submitted GRNs — both are past expected delivery</span>
                    </div>
                    <div className="row g" style={{ fontSize: 13 }}>
                      <I.ArrowRight size={14} style={{ color:"var(--accent-1)" }}/>
                      <span>Close Draft <code style={{ fontSize:12 }}>001</code> if cancelled, or capture inspection</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setRoute("grns"); onClose(); }}>
                Take me to GRNs <I.ArrowRight size={13}/>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setPhase("idle"); setQ(""); }}>
                Ask another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.Shell = { Sidebar, Topbar, CommandPalette, AppCtx, useApp, NAV };
