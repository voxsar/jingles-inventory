export interface PosUnit {
  id: string;
  name: string;
  abbreviation: string;
  baseUnit: string | null;
  conversionFactor: number | null;
  type: string;
  isActive: boolean;
}

export interface PosSkuHit {
  id: string;
  skuCode: string;
  name: string;
  unitOfMeasure: string;
  unitModel?: PosUnit | null;
  sellingPrice: number | null;
  wholesalePrice: number | null;
  bulkPrice: number | null;
  currency: string;
  barcodes?: Array<{ barcode: string }>;
  inventoryRecords?: Array<{ id: string; quantity: number; state: string }>;
  variant?: { id: string; variantCode: string; name: string } | null;
}

export interface CartLine {
  key: string;
  skuId: string;
  variantId?: string | null;
  skuCode: string;
  name: string;
  /** Quantity in the SKU's canonical unit (what stock is deducted in). */
  qty: number;
  unit: string;
  /** What the cashier actually typed, for the receipt line ("3 Yard" of a Metre-tracked SKU). */
  enteredQty: number;
  enteredUnit: string;
  unitPrice: number;
  lineDiscount: number;
  isWholesale: boolean;
  onHand?: number;
}

export type TenderType = 'Cash' | 'Credit' | 'Debit Card' | 'Master Card' | 'Visa Card' | 'Amex Card';

export interface Payment {
  type: TenderType;
  amount: number;
}

export type PosPopupId =
  | 'search'
  | 'qty'
  | 'hold-recall'
  | 'refund'
  | 'discount'
  | 'tender'
  | 'paid-in-out'
  | 'shift-open'
  | 'shift-close'
  | 'settings'
  | 'report'
  | 'customer-salesman'
  | 'new-price'
  | 'cancel-confirm';
