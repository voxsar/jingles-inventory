import { InventoryState, InventoryEventType, GRNStatus, UserRole, SyncStatus, DamageClassification, UnitOfMeasure, StockTransferStatus, VendorType, BarcodeType, UnitType } from './enums';

export interface IUser {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  vendorId?: string | null;
  createdAt: Date;
  isActive: boolean;
}

export interface IVendor {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone?: string | null;
  address?: string | null;
  type: VendorType;
  website?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  createdAt: Date;
  isActive: boolean;
}

export interface ICategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  children?: ICategory[];
  parent?: ICategory | null;
}

export interface ITag {
  id: string;
  name: string;
  color?: string | null;
  createdAt: Date;
}

export interface IUnitOfMeasure {
  id: string;
  name: string;
  abbreviation: string;
  baseUnit?: string | null;
  conversionFactor?: number | null;
  type: UnitType;
  isActive: boolean;
  isSystem: boolean;
  createdAt: Date;
}

export interface IBranch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
}

export interface IProductImage {
  id: string;
  skuId: string;
  url: string;
  altText?: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface IProductBarcode {
  id: string;
  skuId: string;
  barcode: string;
  barcodeType: BarcodeType;
  isDefault: boolean;
  label?: string | null;
  createdAt: Date;
}

export interface IDimensions {
  height: number;
  width: number;
  depth: number;
  weight: number;
  volume?: number;
}

export interface IConversionRule {
  fromUnit: string;
  toUnit: string;
  ratio: number;
}

export interface IBatchPricingTier {
  minQty: number;
  maxQty?: number | null;
  price: number;
  currency?: string;
}

export interface ISKU {
  id: string;
  skuCode: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  vendorId: string;
  unitOfMeasureId?: string | null;
  unitOfMeasure: string;
  conversionRules?: IConversionRule[] | null;
  dimensions?: IDimensions | null;
  isFragile: boolean;
  maxStackHeight?: number | null;
  batchPricing?: IBatchPricingTier[] | null;
  lowStockThreshold?: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: ICategory | null;
  images?: IProductImage[];
  barcodes?: IProductBarcode[];
  tags?: ITag[];
}

export interface IFloor {
  id: string;
  branchId: string;
  name: string;
  code: string;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date;
  branch?: IBranch | null;
  shelves?: IShelf[];
}

export interface IShelf {
  id: string;
  floorId: string;
  name: string;
  code: string;
  height: number;
  width: number;
  length: number;
  hasFreezer: boolean;
  hasLock: boolean;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date;
  floor?: IFloor;
  boxes?: IStorageBox[];
}

export interface IBoxBarcode {
  id: string;
  boxId: string;
  barcode: string;
  barcodeType: BarcodeType;
  isDefault: boolean;
  label?: string | null;
  createdAt: Date;
}

export interface IStorageBox {
  id: string;
  shelfId: string;
  name: string;
  code: string;
  height: number;
  width: number;
  length: number;
  isActive: boolean;
  createdAt: Date;
  shelf?: IShelf | null;
  barcodes?: IBoxBarcode[];
}

export interface IStockTransferLine {
  id: string;
  transferId: string;
  skuId: string;
  requestedQty: number;
  transferredQty: number;
  notes?: string | null;
}

export interface IStockTransfer {
  id: string;
  referenceNumber: string;
  fromBranchId?: string | null;
  toBranchId?: string | null;
  fromFloorId?: string | null;
  toFloorId?: string | null;
  status: StockTransferStatus;
  notes?: string | null;
  requestedBy: string;
  approvedBy?: string | null;
  requestedAt: Date;
  approvedAt?: Date | null;
  completedAt?: Date | null;
  lines?: IStockTransferLine[];
}

export interface IInventoryRecord {
  id: string;
  skuId: string;
  batchId?: string | null;
  floorId?: string | null;
  shelfId?: string | null;
  boxId?: string | null;
  quantity: number;
  state: InventoryState;
  sourceEventId?: string | null;
  terminalId?: string | null;
  userId?: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInventoryEvent {
  id: string;
  eventType: InventoryEventType;
  parentEntityId?: string | null;
  quantityDelta?: number | null;
  beforeQuantity?: number | null;
  afterQuantity?: number | null;
  reasonCode?: string | null;
  userId?: string | null;
  terminalId?: string | null;
  timestamp: Date;
  overrideFlag: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface IGRN {
  id: string;
  supplierId: string;
  invoiceReference?: string | null;
  supplierInvoiceDate?: Date | null;
  expectedDeliveryDate?: Date | null;
  deliveryDate?: Date | null;
  status: GRNStatus;
  notes?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGRNLine {
  id: string;
  grnId: string;
  skuId: string;
  expectedQuantity: number;
  receivedQuantity: number;
  batchReference?: string | null;
  notes?: string | null;
}

export interface IInspectionRecord {
  id: string;
  grnLineId: string;
  approvedQuantity: number;
  rejectedQuantity: number;
  damageClassification?: DamageClassification | null;
  inspectorUserId: string;
  timestamp: Date;
  remarks?: string | null;
}

export interface IAuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  timestamp: Date;
}

export interface ISyncQueue {
  id: string;
  clientId: string;
  operation: string;
  payload: Record<string, unknown>;
  status: SyncStatus;
  createdAt: Date;
  processedAt?: Date | null;
  conflictFlag: boolean;
  conflictNotes?: string | null;
}

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface ILoginResponse {
  token: string;
  user: Omit<IUser, 'passwordHash'>;
}

export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface IPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
