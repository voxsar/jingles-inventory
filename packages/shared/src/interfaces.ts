import { InventoryState, InventoryEventType, GRNStatus, UserRole, SyncStatus, DamageClassification, UnitOfMeasure } from './enums';

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
  createdAt: Date;
  isActive: boolean;
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

export interface ISKU {
  id: string;
  skuCode: string;
  name: string;
  description?: string | null;
  category?: string | null;
  vendorId: string;
  unitOfMeasure: UnitOfMeasure;
  conversionRules?: IConversionRule[] | null;
  dimensions?: IDimensions | null;
  isFragile: boolean;
  maxStackHeight?: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILocation {
  id: string;
  floor: string;
  section: string;
  shelf: string;
  zone?: string | null;
  capacityCubicCm?: number | null;
  notes?: string | null;
  isActive: boolean;
}

export interface IInventoryRecord {
  id: string;
  skuId: string;
  batchId?: string | null;
  locationId?: string | null;
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
