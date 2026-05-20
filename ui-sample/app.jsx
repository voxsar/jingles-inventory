/* global React, ReactDOM, I, Shell, Shared,
   Dashboard, Inventory, Products, GRNs, PRNs,
   Suppliers, Users, Branches, Tags, Categories, PricingOverlays, BatchPricing, StockTransfers,
   AIImports, Spreadsheet, SpreadsheetDrill, Reports, Warehouse3D, Settings,
   CreateUserDialog, CreateSupplierDialog, CreateBranchDialog,
   CreateTagDialog, CreateCategoryDialog, CreatePricingOverlayDialog,
   CreateTransferDialog, CreateGRNDialog, CreatePRNDialog,
   NewInventoryDialog, ProductEditorDialog, CreateProductDialog,
   useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakRadio, TweakToggle, TweakSelect */

const { useState, useEffect } = React;
const { Sidebar, Topbar, CommandPalette, AppCtx } = Shell;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "glassBlur": 24,
  "spot1X": 12,
  "spot1Y": 8,
  "spot2X": 88,
  "spot2Y": 92,
  "spot3X": 70,
  "spot3Y": 5,
  "sidebarStyle": "attached"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState("dashboard");
  const [dialog, setDialog] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);

  // apply theme + tweakable CSS vars
  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.style.setProperty("--glass-blur", t.glassBlur + "px");
    r.style.setProperty("--spot-1-x", t.spot1X + "%");
    r.style.setProperty("--spot-1-y", t.spot1Y + "%");
    r.style.setProperty("--spot-2-x", t.spot2X + "%");
    r.style.setProperty("--spot-2-y", t.spot2Y + "%");
    r.style.setProperty("--spot-3-x", t.spot3X + "%");
    r.style.setProperty("--spot-3-y", t.spot3Y + "%");
  }, [t]);

  // Cmd+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      if (e.key === "Escape") setCommandOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const ctx = {
    route, setRoute,
    theme: t.theme,
    setTheme: (v) => setTweak("theme", v),
    tweaks: t,
    openCommand: () => setCommandOpen(true),
    openDialog: (d) => setDialog(d),
  };

  const closeDialog = () => setDialog(null);

  // Spreadsheet drill state (sub-route)
  const [spreadsheetDrill, setSpreadsheetDrill] = useState(null);

  let screen;
  switch (route) {
    case "dashboard":   screen = <Dashboard/>; break;
    case "inventory":   screen = <Inventory onNewRecord={() => setDialog({ kind: "new-inv" })}/>; break;
    case "products":    screen = <Products
                          onNewProduct={() => setDialog({ kind: "new-product" })}
                          onEditProduct={(p) => setDialog({ kind: "product-editor", data: p })}/>; break;
    case "grns":        screen = <GRNs onNewGRN={() => setDialog({ kind: "new-grn" })}/>; break;
    case "prns":        screen = <PRNs onNewPRN={() => setDialog({ kind: "new-prn" })}/>; break;
    case "suppliers":   screen = <Suppliers onNewSupplier={() => setDialog({ kind: "new-supplier" })}/>; break;
    case "users":       screen = <Users onNewUser={() => setDialog({ kind: "new-user" })}/>; break;
    case "branches":    screen = <Branches onNewBranch={() => setDialog({ kind: "new-branch" })}/>; break;
    case "tags":        screen = <Tags onNewTag={() => setDialog({ kind: "new-tag" })}/>; break;
    case "categories":  screen = <Categories onNewCategory={() => setDialog({ kind: "new-category" })}/>; break;
    case "pricing":     screen = <PricingOverlays onNewOverlay={() => setDialog({ kind: "new-overlay" })}/>; break;
    case "batches":     screen = <BatchPricing/>; break;
    case "transfers":   screen = <StockTransfers onNewTransfer={() => setDialog({ kind: "new-transfer" })}/>; break;
    case "ai-imports":  screen = <AIImports/>; break;
    case "spreadsheet": screen = spreadsheetDrill
                          ? <SpreadsheetDrill onBack={() => setSpreadsheetDrill(null)}/>
                          : <Spreadsheet onOpenEntity={(e) => setSpreadsheetDrill(e)}/>; break;
    case "reports":     screen = <Reports/>; break;
    case "warehouse3d": screen = <Warehouse3D/>; break;
    case "settings":    screen = <Settings/>; break;
    default:            screen = <Dashboard/>;
  }

  return (
    <AppCtx.Provider value={ctx}>
      {/* Background spot gradients */}
      <div className="app-bg">
        <div className="spot-c"/>
        <div className="grain"/>
      </div>

      {/* App shell */}
      <div className="app">
        <Sidebar/>
        <main className="main">
          <Topbar/>
          {screen}
        </main>
      </div>

      {/* Command palette */}
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)}/>}

      {/* Dialogs */}
      <CreateUserDialog       open={dialog?.kind === "new-user"}       onClose={closeDialog}/>
      <CreateSupplierDialog   open={dialog?.kind === "new-supplier"}   onClose={closeDialog}/>
      <CreateBranchDialog     open={dialog?.kind === "new-branch"}     onClose={closeDialog}/>
      <CreateTagDialog        open={dialog?.kind === "new-tag"}        onClose={closeDialog}/>
      <CreateCategoryDialog   open={dialog?.kind === "new-category"}   onClose={closeDialog}/>
      <CreatePricingOverlayDialog open={dialog?.kind === "new-overlay"} onClose={closeDialog}/>
      <CreateTransferDialog   open={dialog?.kind === "new-transfer"}   onClose={closeDialog}/>
      <CreateGRNDialog        open={dialog?.kind === "new-grn"}        onClose={closeDialog}/>
      <CreatePRNDialog        open={dialog?.kind === "new-prn"}        onClose={closeDialog}/>
      <NewInventoryDialog     open={dialog?.kind === "new-inv"}        onClose={closeDialog}/>
      <CreateProductDialog    open={dialog?.kind === "new-product"}    onClose={closeDialog}/>
      <ProductEditorDialog
        open={dialog?.kind === "product-editor"} onClose={closeDialog}
        product={dialog?.data}/>

      {/* Tweaks panel */}
      <TweaksPanel>
        <TweakSection label="Appearance"/>
        <TweakRadio
          label="Theme" value={t.theme}
          options={["dark", "light"]}
          onChange={(v) => setTweak("theme", v)}
        />
        <TweakSelect
          label="Sidebar style" value={t.sidebarStyle}
          options={[
            { value: "attached", label: "Attached (full height)" },
            { value: "floating", label: "Floating (inset card)" },
          ]}
          onChange={(v) => setTweak("sidebarStyle", v)}
        />
        <TweakSlider label="Glass blur" value={t.glassBlur} min={0} max={48} unit="px"
                     onChange={(v) => setTweak("glassBlur", v)}/>

        <TweakSection label="Background Spots"/>
        <TweakSlider label="Spot 1 — X" value={t.spot1X} min={0} max={100} unit="%"
                     onChange={(v) => setTweak("spot1X", v)}/>
        <TweakSlider label="Spot 1 — Y" value={t.spot1Y} min={0} max={100} unit="%"
                     onChange={(v) => setTweak("spot1Y", v)}/>
        <TweakSlider label="Spot 2 — X" value={t.spot2X} min={0} max={100} unit="%"
                     onChange={(v) => setTweak("spot2X", v)}/>
        <TweakSlider label="Spot 2 — Y" value={t.spot2Y} min={0} max={100} unit="%"
                     onChange={(v) => setTweak("spot2Y", v)}/>
        <TweakSlider label="Spot 3 — X" value={t.spot3X} min={0} max={100} unit="%"
                     onChange={(v) => setTweak("spot3X", v)}/>
        <TweakSlider label="Spot 3 — Y" value={t.spot3Y} min={0} max={100} unit="%"
                     onChange={(v) => setTweak("spot3Y", v)}/>
      </TweaksPanel>
    </AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
