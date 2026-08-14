/**
 * Reference table for the POS terminal's keyboard bindings, redesigned from
 * the legacy MaxSoft key sheet. F1-F12 keep their legacy meaning; the old
 * bare-symbol keys (~ = [ ] \ ; ' < > ?) move to Alt+letter so they never
 * collide with typing into a focused field. Actual dispatch lives in
 * PosTerminalPage's keydown handler — this table is the single source for
 * the on-screen cheat strip and doubles as documentation.
 */
export interface HotkeyEntry {
  combo: string;
  legacy: string;
  label: string;
}

export const HOTKEY_REFERENCE: HotkeyEntry[] = [
  { combo: 'F1', legacy: 'Sign On/Off', label: 'Lock terminal' },
  { combo: 'F2', legacy: 'Credit', label: 'Toggle on-account' },
  { combo: 'F3', legacy: 'Search', label: 'Find item' },
  { combo: 'F4', legacy: 'Data Download', label: 'Refresh catalog' },
  { combo: 'F5', legacy: 'Bill Hold', label: 'Hold sale' },
  { combo: 'F6', legacy: 'Hold Bill Recall', label: 'Recall held sale' },
  { combo: 'F7', legacy: 'Drawer Open', label: 'Open drawer' },
  { combo: 'F8', legacy: 'Select Printer', label: 'Terminal settings' },
  { combo: 'F9', legacy: 'Refund', label: 'Refund a sale' },
  { combo: 'F10', legacy: 'Money Declare', label: 'Declare / close shift' },
  { combo: 'F11', legacy: 'Cancel', label: 'Clear sale' },
  { combo: 'F12', legacy: 'Paid In/Out', label: 'Paid in / out' },
  { combo: 'Alt+C', legacy: 'Customer', label: 'Customer' },
  { combo: 'Alt+S', legacy: 'Salesman', label: 'Salesman' },
  { combo: 'Alt+N', legacy: 'New Price', label: 'Price override' },
  { combo: 'Alt+D', legacy: 'Discount %', label: 'Discount %' },
  { combo: 'Alt+A', legacy: 'Discount Amt', label: 'Discount amount' },
  { combo: 'Alt+R', legacy: 'Discount Remove', label: 'Remove discount' },
  { combo: '+', legacy: 'Sub Total', label: 'Subtotal / tender' },
  { combo: '-', legacy: 'Cash', label: 'Fast cash tender' },
  { combo: '*', legacy: 'Qty ×', label: 'qty*code to add' },
  { combo: 'Enter', legacy: 'PLU', label: 'Add typed code' },
  { combo: 'Home', legacy: 'Bill Copy', label: 'Reprint receipt' },
  { combo: 'Delete', legacy: 'Void', label: 'Remove line' },
  { combo: 'End', legacy: 'Report', label: 'Shift report' },
  { combo: 'PgUp', legacy: 'Float Cash', label: 'Open shift' },
  { combo: 'PgDn', legacy: 'Whole Sale', label: 'Toggle wholesale' },
  { combo: '↑ / ↓', legacy: '—', label: 'Move cart line' },
  { combo: 'Esc', legacy: 'Clear', label: 'Clear / close popup' },
];
