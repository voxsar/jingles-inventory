import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { barcodeApi, branchesApi, posTerminalApi, settingsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { branding } from '../config/branding';
import { getStoredUITheme, persistUITheme, toggleUITheme, type UITheme } from '../utils/uiTheme';
import PosCartTable from './pos/PosCartTable';
import ItemSearchPopup from './pos/ItemSearchPopup';
import QtyUnitPopup from './pos/QtyUnitPopup';
import TenderPopup from './pos/TenderPopup';
import HoldRecallPopup, { type HeldSale } from './pos/HoldRecallPopup';
import RefundPopup from './pos/RefundPopup';
import DiscountPopup, { type DiscountMode, type DiscountScope } from './pos/DiscountPopup';
import PaidInOutPopup from './pos/PaidInOutPopup';
import ShiftPopup from './pos/ShiftPopup';
import TerminalSettingsPopup from './pos/TerminalSettingsPopup';
import ReportPopup from './pos/ReportPopup';
import CustomerSalesmanPopup from './pos/CustomerSalesmanPopup';
import NewPricePopup from './pos/NewPricePopup';
import { HOTKEY_REFERENCE } from './pos/hotkeys';
import { printReceipt, printShiftReport } from './pos/receipt';
import type { CartLine, Payment, PosPopupId, PosSkuHit, PosUnit, TenderType } from './pos/types';

const TERMINAL_ID_KEY = 'jingles-pos-terminal-id';
const BRANCH_ID_KEY = 'jingles-pos-branch-id';
const PRINTER_LABEL_KEY = 'jingles-pos-printer-label';

function getOrCreateTerminalId() {
  let id = localStorage.getItem(TERMINAL_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(TERMINAL_ID_KEY, id);
  }
  return id;
}

function toSkuHit(sku: any, variant?: any): PosSkuHit {
  return {
    id: sku.id,
    skuCode: sku.skuCode,
    name: sku.name,
    unitOfMeasure: sku.unitOfMeasure,
    unitModel: sku.unitModel ?? null,
    sellingPrice: sku.sellingPrice ?? 0,
    wholesalePrice: sku.wholesalePrice ?? null,
    bulkPrice: sku.bulkPrice ?? null,
    currency: sku.currency ?? 'LKR',
    inventoryRecords: sku.inventoryRecords ?? [],
    variant: variant ? { id: variant.id, variantCode: variant.variantCode, name: variant.name } : null,
  };
}

interface Toast {
  text: string;
  tone: 'info' | 'success' | 'error';
}

export default function PosTerminalPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [theme, setTheme] = useState<UITheme>(() => getStoredUITheme());

  const [terminalId] = useState(getOrCreateTerminalId);
  const [branchId, setBranchId] = useState<string | null>(() => localStorage.getItem(BRANCH_ID_KEY));
  const [printerLabel, setPrinterLabel] = useState(() => localStorage.getItem(PRINTER_LABEL_KEY) ?? '');

  const [units, setUnits] = useState<PosUnit[]>([]);
  const [shift, setShift] = useState<any | null>(null);
  const [branch, setBranch] = useState<{ name: string; address: string | null; phone: string | null } | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [salesman, setSalesman] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [isWholesale, setIsWholesale] = useState(false);
  const [pendingMultiplier, setPendingMultiplier] = useState<number | null>(null);
  const [scanValue, setScanValue] = useState('');
  const [scanBusy, setScanBusy] = useState(false);

  const [activePopup, setActivePopup] = useState<PosPopupId | null>(null);
  const [pendingSku, setPendingSku] = useState<PosSkuHit | null>(null);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [discountMode, setDiscountMode] = useState<DiscountMode>('percent');
  const [customerField, setCustomerField] = useState<'customer' | 'salesman'>('customer');

  const [lastSale, setLastSale] = useState<{
    receiptNumber: string;
    createdAt: string;
    lines: CartLine[];
    subtotal: number;
    discountTotal: number;
    total: number;
    payments: Payment[];
    customerName?: string | null;
    salesman?: string;
  } | null>(null);

  const [toast, setToast] = useState<Toast | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const currency = 'LKR';
  // No numbered-register concept in this system yet, so the printed
  // "Terminal" falls back to a short, human-readable slice of the terminal's
  // persisted UUID when no printer label has been set.
  const terminalLabel = printerLabel || `#${terminalId.slice(0, 8).toUpperCase()}`;

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    setToast({ text, tone });
    window.clearTimeout((notify as any)._t);
    (notify as any)._t = window.setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    persistUITheme(theme);
  }, [theme]);

  useEffect(() => {
    settingsApi.listUnits().then((res) => setUnits(res.data?.data ?? [])).catch(() => setUnits([]));
  }, []);

  useEffect(() => {
    posTerminalApi
      .getActiveShift(terminalId)
      .then((res) => setShift(res.data?.data ?? null))
      .catch(() => setShift(null));
  }, [terminalId]);

  useEffect(() => {
    if (!branchId) {
      setBranch(null);
      return;
    }
    branchesApi
      .get(branchId)
      .then((res) => {
        const b = res.data?.data;
        setBranch(b ? { name: b.name, address: b.address ?? null, phone: b.phone ?? null } : null);
      })
      .catch(() => setBranch(null));
  }, [branchId]);

  useEffect(() => {
    if (!activePopup) scanInputRef.current?.focus();
  }, [activePopup]);

  const focusedLine = focusedIndex >= 0 ? cart[focusedIndex] ?? null : null;

  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + l.qty * l.unitPrice - l.lineDiscount, 0), [cart]);
  const total = Math.max(0, subtotal - discountTotal);

  const requireShift = useCallback(() => {
    if (!shift) {
      notify('Open a shift first (PgUp — Float Cash)', 'error');
      return false;
    }
    return true;
  }, [shift, notify]);

  const resetCartForNextSale = useCallback(() => {
    setCart([]);
    setFocusedIndex(0);
    setDiscountTotal(0);
    setCustomerName('');
    setSalesman('');
    setIsCredit(false);
    setIsWholesale(false);
    setPendingMultiplier(null);
    setScanValue('');
  }, []);

  const addOrUpdateLine = useCallback(
    (line: CartLine) => {
      setCart((prev) => {
        const idx = prev.findIndex((l) => l.key === line.key);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = line;
          return next;
        }
        return [...prev, line];
      });
      setActivePopup(null);
      setPendingSku(null);
      setEditingLineIndex(null);
      setPendingMultiplier(null);
      setScanValue('');
    },
    []
  );

  const openQtyPopupForSku = useCallback(
    (sku: PosSkuHit) => {
      setPendingSku(sku);
      setActivePopup('qty');
    },
    []
  );

  const handleScanSubmit = useCallback(async () => {
    const code = scanValue.trim();
    if (!code || scanBusy) return;
    setScanBusy(true);
    try {
      const res = await barcodeApi.scan(code, terminalId);
      const result = res.data?.data;
      if (result?.found && result.sku) {
        openQtyPopupForSku(toSkuHit(result.sku, result.variant));
      } else {
        notify(`No item found for "${code}" — try Search (F3)`, 'error');
        setScanValue('');
      }
    } catch {
      notify('Scan failed — try Search (F3)', 'error');
    } finally {
      setScanBusy(false);
    }
  }, [scanValue, scanBusy, terminalId, notify, openQtyPopupForSku]);

  const voidFocusedLine = useCallback(() => {
    if (!cart.length || focusedIndex < 0) return;
    setCart((prev) => prev.filter((_, i) => i !== focusedIndex));
    setFocusedIndex((i) => Math.max(0, Math.min(i, cart.length - 2)));
  }, [cart, focusedIndex]);

  const moveFocus = useCallback(
    (delta: number) => {
      setFocusedIndex((i) => Math.max(0, Math.min(cart.length - 1, i + delta)));
    },
    [cart.length]
  );

  const holdCurrentSale = useCallback(async () => {
    if (!cart.length) {
      notify('Nothing to hold', 'error');
      return;
    }
    try {
      await posTerminalApi.holdSale({
        terminalId,
        branchId,
        customerName: customerName || null,
        subtotal,
        discountTotal,
        total,
        lines: cart,
      });
      notify('Sale held — F6 to recall it', 'success');
      resetCartForNextSale();
    } catch {
      notify('Failed to hold sale', 'error');
    }
  }, [cart, terminalId, branchId, customerName, subtotal, discountTotal, total, notify, resetCartForNextSale]);

  const recallHeldSale = useCallback(
    async (held: HeldSale) => {
      setCart((held.lines as unknown as CartLine[]) ?? []);
      setCustomerName(held.customerName ?? '');
      setFocusedIndex(0);
      setActivePopup(null);
      try {
        await posTerminalApi.deleteHeldSale(held.id);
      } catch {
        /* best effort — the hold is already loaded into the cart */
      }
      notify(`Recalled ${held.holdNumber}`, 'success');
    },
    [notify]
  );

  const finalizeSale = useCallback(
    async (payments: Payment[], allowOversell = false) => {
      if (!requireShift()) return;
      try {
        const res = await posTerminalApi.createSale({
          terminalId,
          branchId,
          shiftId: shift.id,
          customerName: customerName || null,
          isCredit,
          lines: cart.map((l) => ({
            skuId: l.skuId,
            variantId: l.variantId ?? null,
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
            lineDiscount: l.lineDiscount,
          })),
          discountTotal,
          taxTotal: 0,
          payments,
          allowOversell,
        });
        const sale = res.data.data;
        const receipt = {
          receiptNumber: sale.receiptNumber,
          createdAt: sale.createdAt,
          lines: cart,
          subtotal,
          discountTotal,
          total,
          payments,
          customerName: customerName || null,
          salesman,
        };
        setLastSale(receipt);
        printReceipt({
          ...receipt,
          branchName: branch?.name ?? branding.appHeaderTitle,
          branchAddress: branch?.address,
          branchPhone: branch?.phone,
          terminalLabel,
          cashierEmail: user?.email,
          taxTotal: 0,
          currency,
        });
        setActivePopup(null);
        resetCartForNextSale();
        notify(`Sale ${sale.receiptNumber} complete`, 'success');
      } catch (err: any) {
        if (err.response?.status === 409 && err.response.data?.requiresOverride) {
          const ok = window.confirm(`${err.response.data.error}\n\nOK to sell anyway (manager override)?`);
          if (ok) {
            finalizeSale(payments, true);
            return;
          }
        }
        notify(err.response?.data?.error ?? 'Sale failed', 'error');
      }
    },
    [
      requireShift,
      terminalId,
      branchId,
      shift,
      customerName,
      salesman,
      isCredit,
      cart,
      discountTotal,
      subtotal,
      total,
      user,
      branch,
      terminalLabel,
      resetCartForNextSale,
      notify,
    ]
  );

  const fastCash = useCallback(() => {
    if (!cart.length) {
      notify('Cart is empty', 'error');
      return;
    }
    finalizeSale([{ type: 'Cash', amount: total }]);
  }, [cart.length, total, finalizeSale, notify]);

  const reprintLast = useCallback(() => {
    if (!lastSale) {
      notify('No receipt to reprint yet this session', 'error');
      return;
    }
    printReceipt({
      ...lastSale,
      branchName: branch?.name ?? branding.appHeaderTitle,
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      terminalLabel,
      cashierEmail: user?.email,
      taxTotal: 0,
      currency,
    });
  }, [lastSale, user, branch, terminalLabel, notify]);

  const drawerKick = useCallback(async () => {
    try {
      const res = await posTerminalApi.drawerKick({ terminalId, shiftId: shift?.id });
      notify(res.data?.message ?? 'Drawer opened', 'info');
    } catch {
      notify('Failed to open drawer', 'error');
    }
  }, [terminalId, shift, notify]);

  const applyDiscount = useCallback(
    (result: { scope: DiscountScope; mode: DiscountMode; value: number }) => {
      if (result.scope === 'line' && focusedLine) {
        const lineAmount =
          result.mode === 'remove' ? 0 : result.mode === 'percent' ? (focusedLine.qty * focusedLine.unitPrice * result.value) / 100 : result.value;
        setCart((prev) => prev.map((l, i) => (i === focusedIndex ? { ...l, lineDiscount: lineAmount } : l)));
      } else {
        const saleAmount = result.mode === 'remove' ? 0 : result.mode === 'percent' ? (subtotal * result.value) / 100 : result.value;
        setDiscountTotal(saleAmount);
      }
      setActivePopup(null);
    },
    [focusedLine, focusedIndex, subtotal]
  );

  const openDiscount = (mode: DiscountMode) => {
    setDiscountMode(mode);
    setActivePopup('discount');
  };

  const handleGlobalKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (activePopup) return; // popups own the keyboard entirely while open

      if (event.altKey) {
        const key = event.key.toUpperCase();
        if (key === 'C') { event.preventDefault(); setCustomerField('customer'); setActivePopup('customer-salesman'); return; }
        if (key === 'S') { event.preventDefault(); setCustomerField('salesman'); setActivePopup('customer-salesman'); return; }
        if (key === 'N') { event.preventDefault(); if (focusedLine) setActivePopup('new-price'); else notify('Select a cart line first', 'error'); return; }
        if (key === 'D') { event.preventDefault(); openDiscount('percent'); return; }
        if (key === 'A') { event.preventDefault(); openDiscount('amount'); return; }
        if (key === 'R') { event.preventDefault(); openDiscount('remove'); return; }
        return;
      }

      switch (event.key) {
        case 'F1':
          event.preventDefault();
          if (!user?.hasPin) { notify('Set a PIN in Settings to enable Sign On/Off', 'error'); return; }
          window.dispatchEvent(new CustomEvent('jingles:lock-now'));
          return;
        case 'F2':
          event.preventDefault();
          setIsCredit((v) => !v);
          notify(isCredit ? 'Credit sale off' : 'Sale marked on credit', 'info');
          return;
        case 'F3':
          event.preventDefault();
          setActivePopup('search');
          return;
        case 'F4':
          event.preventDefault();
          notify('Catalog is live — nothing to download', 'info');
          return;
        case 'F5':
          event.preventDefault();
          holdCurrentSale();
          return;
        case 'F6':
          event.preventDefault();
          setActivePopup('hold-recall');
          return;
        case 'F7':
          event.preventDefault();
          drawerKick();
          return;
        case 'F8':
          event.preventDefault();
          setActivePopup('settings');
          return;
        case 'F9':
          event.preventDefault();
          setActivePopup('refund');
          return;
        case 'F10':
          event.preventDefault();
          if (requireShift()) setActivePopup('shift-close');
          return;
        case 'F11':
          event.preventDefault();
          if (cart.length && window.confirm('Clear the current sale?')) resetCartForNextSale();
          return;
        case 'F12':
          event.preventDefault();
          if (requireShift()) setActivePopup('paid-in-out');
          return;
        case 'Home':
          event.preventDefault();
          reprintLast();
          return;
        case 'End':
          event.preventDefault();
          if (requireShift()) setActivePopup('report');
          return;
        case 'PageUp':
          event.preventDefault();
          if (shift) notify('A shift is already open', 'info');
          else setActivePopup('shift-open');
          return;
        case 'PageDown':
          event.preventDefault();
          setIsWholesale((v) => !v);
          return;
        case 'Delete':
          event.preventDefault();
          voidFocusedLine();
          return;
        case 'ArrowUp':
          event.preventDefault();
          moveFocus(-1);
          return;
        case 'ArrowDown':
          event.preventDefault();
          moveFocus(1);
          return;
        case 'Escape':
          setScanValue('');
          setPendingMultiplier(null);
          return;
        case '+':
          event.preventDefault();
          if (!cart.length) { notify('Cart is empty', 'error'); return; }
          setActivePopup('tender');
          return;
        case '-':
          event.preventDefault();
          fastCash();
          return;
        case '*':
          event.preventDefault();
          {
            const n = Number(scanValue);
            if (Number.isFinite(n) && n > 0) {
              setPendingMultiplier(n);
              setScanValue('');
              notify(`Qty ×${n} armed — scan or search the item`, 'info');
            }
          }
          return;
        default:
          return;
      }
    },
    [
      activePopup,
      user,
      isCredit,
      holdCurrentSale,
      drawerKick,
      requireShift,
      cart.length,
      resetCartForNextSale,
      reprintLast,
      shift,
      voidFocusedLine,
      moveFocus,
      fastCash,
      scanValue,
      notify,
      focusedLine,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  const wholesaleAdjustedSku = (sku: PosSkuHit): PosSkuHit => sku;

  return (
    <div className="inventory-app-theme" data-theme={theme}>
      <div className="flex h-screen flex-col bg-[var(--bg-1)] text-[var(--ink)]">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary btn-sm">← Back</button>
            <div>
              <div className="text-sm font-bold">{branding.appHeaderTitle} · POS</div>
              <div className="text-xs text-[var(--ink-3)]">
                {user?.email} · {shift ? `Shift open (float ${currency} ${shift.openingFloat?.toFixed?.(2) ?? shift.openingFloat})` : 'No shift open'}
                {isCredit && ' · ON CREDIT'}
                {isWholesale && ' · WHOLESALE'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {customerName && <span className="chip">👤 {customerName}</span>}
            {salesman && <span className="chip">🧑‍💼 {salesman}</span>}
            <button type="button" className="btn-icon" title="Toggle theme" onClick={() => setTheme((t) => toggleUITheme(t))}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={logout}>Log out</button>
          </div>
        </header>

        {toast && (
          <div
            className={`mx-5 mt-3 rounded-lg px-4 py-2 text-sm ${
              toast.tone === 'error' ? 'bg-red-500/15 text-red-400' : toast.tone === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--chip)] text-[var(--ink-2)]'
            }`}
          >
            {toast.text}
          </div>
        )}

        <div className="flex flex-1 gap-4 overflow-hidden p-5">
          <div className="flex flex-1 flex-col gap-3 overflow-hidden">
            <input
              ref={scanInputRef}
              autoFocus
              type="text"
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScanSubmit()}
              placeholder={pendingMultiplier ? `Qty ×${pendingMultiplier} — scan or type barcode / PLU...` : 'Scan or type barcode / PLU, then Enter...'}
              className="input-field text-lg"
              disabled={Boolean(activePopup)}
            />
            <PosCartTable
              lines={cart}
              focusedIndex={focusedIndex}
              currency={currency}
              onFocusLine={setFocusedIndex}
              onEditLine={(i) => {
                setFocusedIndex(i);
                setEditingLineIndex(i);
                setPendingSku({
                  id: cart[i].skuId,
                  skuCode: cart[i].skuCode,
                  name: cart[i].name,
                  unitOfMeasure: cart[i].unit,
                  sellingPrice: cart[i].unitPrice,
                  wholesalePrice: cart[i].unitPrice,
                  bulkPrice: null,
                  currency,
                  variant: null,
                });
                setActivePopup('qty');
              }}
            />
          </div>

          <div className="flex w-80 shrink-0 flex-col gap-3">
            <div className="card space-y-2 !p-4">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--ink-3)]">Subtotal</span>
                <span className="font-semibold">{currency} {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--ink-3)]">Discount</span>
                <span className="font-semibold">{currency} {discountTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--line)] pt-2 text-lg">
                <span className="font-bold">Total</span>
                <span className="font-bold">{currency} {total.toFixed(2)}</span>
              </div>
            </div>

            <div className="card !p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">Hotkeys</div>
              <div className="grid max-h-[calc(100vh-320px)] grid-cols-1 gap-y-1 overflow-y-auto text-xs">
                {HOTKEY_REFERENCE.map((h) => (
                  <div key={h.combo} className="flex justify-between gap-2">
                    <span className="rounded bg-[var(--chip)] px-1.5 py-0.5 font-mono text-[var(--ink-2)]">{h.combo}</span>
                    <span className="text-right text-[var(--ink-3)]">{h.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {activePopup === 'search' && (
        <ItemSearchPopup initialQuery={scanValue} onSelect={(sku) => { setActivePopup(null); openQtyPopupForSku(sku); }} onClose={() => setActivePopup(null)} />
      )}

      {activePopup === 'qty' && pendingSku && (
        <QtyUnitPopup
          sku={wholesaleAdjustedSku(pendingSku)}
          units={units}
          isWholesale={isWholesale}
          initialQty={pendingMultiplier ?? 1}
          existingLine={editingLineIndex !== null ? cart[editingLineIndex] : null}
          onConfirm={addOrUpdateLine}
          onCancel={() => { setActivePopup(null); setPendingSku(null); setEditingLineIndex(null); }}
        />
      )}

      {activePopup === 'hold-recall' && (
        <HoldRecallPopup terminalId={terminalId} onRecall={recallHeldSale} onClose={() => setActivePopup(null)} />
      )}

      {activePopup === 'refund' && (
        <RefundPopup
          terminalId={terminalId}
          currency={currency}
          onDone={() => { setActivePopup(null); notify('Refund processed', 'success'); }}
          onClose={() => setActivePopup(null)}
        />
      )}

      {activePopup === 'discount' && (
        <DiscountPopup mode={discountMode} hasFocusedLine={Boolean(focusedLine)} onApply={applyDiscount} onClose={() => setActivePopup(null)} />
      )}

      {activePopup === 'paid-in-out' && shift && (
        <PaidInOutPopup shiftId={shift.id} onDone={() => { setActivePopup(null); notify('Recorded', 'success'); }} onClose={() => setActivePopup(null)} />
      )}

      {activePopup === 'shift-open' && (
        <ShiftPopup
          mode="open"
          terminalId={terminalId}
          branchId={branchId}
          onDone={({ data }) => { setShift(data); setActivePopup(null); notify('Shift opened', 'success'); }}
          onClose={() => setActivePopup(null)}
        />
      )}

      {activePopup === 'shift-close' && shift && (
        <ShiftPopup
          mode="close"
          terminalId={terminalId}
          branchId={branchId}
          shiftId={shift.id}
          onDone={() => { setShift(null); setActivePopup(null); notify('Shift closed', 'success'); }}
          onClose={() => setActivePopup(null)}
        />
      )}

      {activePopup === 'settings' && (
        <TerminalSettingsPopup
          terminalId={terminalId}
          branchId={branchId}
          printerLabel={printerLabel}
          onSave={(settings) => {
            setBranchId(settings.branchId);
            setPrinterLabel(settings.printerLabel);
            localStorage.setItem(BRANCH_ID_KEY, settings.branchId ?? '');
            localStorage.setItem(PRINTER_LABEL_KEY, settings.printerLabel);
            setActivePopup(null);
          }}
          onClose={() => setActivePopup(null)}
        />
      )}

      {activePopup === 'report' && shift && (
        <ReportPopup
          shiftId={shift.id}
          currency={currency}
          onPrint={(summary) => printShiftReport({ shiftId: shift.id, currency, summary })}
          onClose={() => setActivePopup(null)}
        />
      )}

      {activePopup === 'customer-salesman' && (
        <CustomerSalesmanPopup
          field={customerField}
          initialValue={customerField === 'customer' ? customerName : salesman}
          onSave={(value) => {
            if (customerField === 'customer') setCustomerName(value);
            else setSalesman(value);
            setActivePopup(null);
          }}
          onClose={() => setActivePopup(null)}
        />
      )}

      {activePopup === 'new-price' && focusedLine && (
        <NewPricePopup
          line={focusedLine}
          currency={currency}
          onSave={(unitPrice) => {
            setCart((prev) => prev.map((l, i) => (i === focusedIndex ? { ...l, unitPrice } : l)));
            setActivePopup(null);
          }}
          onClose={() => setActivePopup(null)}
        />
      )}

      {activePopup === 'tender' && (
        <TenderPopup total={total} currency={currency} onConfirm={(payment) => finalizeSale([payment])} onClose={() => setActivePopup(null)} />
      )}
    </div>
  );
}
