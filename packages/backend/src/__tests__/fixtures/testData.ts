import { IUser, IVendor, ISKU, IFloor, IGRN, IGRNLine, IInventoryRecord, IInventoryEvent } from '@jingles/shared';
import { InventoryState, InventoryEventType, GRNStatus, UserRole, UnitOfMeasure } from '@jingles/shared';

// ─── Vendors ────────────────────────────────────────────────────────────────

export const VENDORS = {
  acme: {
    id: 'vendor-acme-001',
    name: 'Acme Supplies Ltd',
    contactEmail: 'contact@acme.com',
    contactPhone: '+1-555-0100',
    address: '123 Warehouse Rd, Springfield',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    isActive: true,
  } as IVendor,

  globalTech: {
    id: 'vendor-globaltech-002',
    name: 'GlobalTech Electronics',
    contactEmail: 'orders@globaltech.com',
    contactPhone: '+1-555-0200',
    address: '456 Tech Park, Innovation City',
    createdAt: new Date('2024-01-15T00:00:00Z'),
    isActive: true,
  } as IVendor,

  inactiveVendor: {
    id: 'vendor-inactive-003',
    name: 'Defunct Suppliers Inc',
    contactEmail: 'old@defunct.com',
    createdAt: new Date('2023-01-01T00:00:00Z'),
    isActive: false,
  } as IVendor,
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const USERS = {
  admin: {
    id: 'user-admin-001',
    email: 'admin@jingles.com',
    passwordHash: '$2b$10$mockHashForAdmin',
    role: UserRole.Admin,
    vendorId: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    isActive: true,
  } as IUser,

  manager: {
    id: 'user-manager-001',
    email: 'manager@jingles.com',
    passwordHash: '$2b$10$mockHashForManager',
    role: UserRole.Manager,
    vendorId: null,
    createdAt: new Date('2024-01-02T00:00:00Z'),
    isActive: true,
  } as IUser,

  staff: {
    id: 'user-staff-001',
    email: 'staff@jingles.com',
    passwordHash: '$2b$10$mockHashForStaff',
    role: UserRole.Staff,
    vendorId: null,
    createdAt: new Date('2024-01-03T00:00:00Z'),
    isActive: true,
  } as IUser,

  inspector: {
    id: 'user-inspector-001',
    email: 'inspector@jingles.com',
    passwordHash: '$2b$10$mockHashForInspector',
    role: UserRole.Inspector,
    vendorId: null,
    createdAt: new Date('2024-01-04T00:00:00Z'),
    isActive: true,
  } as IUser,

  vendorUser: {
    id: 'user-vendor-001',
    email: 'vendoruser@acme.com',
    passwordHash: '$2b$10$mockHashForVendor',
    role: UserRole.Vendor,
    vendorId: 'vendor-acme-001',
    createdAt: new Date('2024-01-05T00:00:00Z'),
    isActive: true,
  } as IUser,

  otherVendorUser: {
    id: 'user-vendor-002',
    email: 'vendoruser@globaltech.com',
    passwordHash: '$2b$10$mockHashForVendor2',
    role: UserRole.Vendor,
    vendorId: 'vendor-globaltech-002',
    createdAt: new Date('2024-01-06T00:00:00Z'),
    isActive: true,
  } as IUser,
};

// ─── SKUs ────────────────────────────────────────────────────────────────────

export const SKUS = {
  widgetBox: {
    id: 'sku-widget-box-001',
    skuCode: 'WGT-BOX-001',
    name: 'Widget A - Box of 12',
    description: 'Standard Widget A packaged in box of 12 pieces',
    category: 'Electronics',
    vendorId: 'vendor-acme-001',
    unitOfMeasure: UnitOfMeasure.Box,
    conversionRules: [{ fromUnit: 'Box', toUnit: 'Piece', ratio: 12 }],
    dimensions: { height: 30, width: 20, depth: 15, weight: 2.5, volume: 9000 },
    isFragile: false,
    maxStackHeight: 120,
    isActive: true,
    createdAt: new Date('2024-01-10T00:00:00Z'),
    updatedAt: new Date('2024-01-10T00:00:00Z'),
  } as ISKU,

  widgetPiece: {
    id: 'sku-widget-piece-002',
    skuCode: 'WGT-PIECE-002',
    name: 'Widget A - Single Piece',
    description: 'Single Widget A unit',
    category: 'Electronics',
    vendorId: 'vendor-acme-001',
    unitOfMeasure: UnitOfMeasure.Piece,
    conversionRules: null,
    dimensions: { height: 5, width: 5, depth: 3, weight: 0.2, volume: 75 },
    isFragile: true,
    maxStackHeight: 15,
    isActive: true,
    createdAt: new Date('2024-01-10T00:00:00Z'),
    updatedAt: new Date('2024-01-10T00:00:00Z'),
  } as ISKU,

  glassware: {
    id: 'sku-glassware-003',
    skuCode: 'GLS-001',
    name: 'Premium Glassware Set',
    description: 'Fragile premium glassware',
    category: 'Housewares',
    vendorId: 'vendor-globaltech-002',
    unitOfMeasure: UnitOfMeasure.Pack,
    conversionRules: [{ fromUnit: 'Pack', toUnit: 'Piece', ratio: 6 }],
    dimensions: { height: 40, width: 30, depth: 25, weight: 3.0, volume: 30000 },
    isFragile: true,
    maxStackHeight: 40,
    isActive: true,
    createdAt: new Date('2024-01-11T00:00:00Z'),
    updatedAt: new Date('2024-01-11T00:00:00Z'),
  } as ISKU,

  heavyEquipment: {
    id: 'sku-heavy-004',
    skuCode: 'HVY-001',
    name: 'Heavy Machinery Part',
    description: 'Industrial heavy machinery component',
    category: 'Industrial',
    vendorId: 'vendor-acme-001',
    unitOfMeasure: UnitOfMeasure.Piece,
    conversionRules: null,
    dimensions: { height: 60, width: 50, depth: 40, weight: 25.0, volume: 120000 },
    isFragile: false,
    maxStackHeight: 60,
    isActive: true,
    createdAt: new Date('2024-01-12T00:00:00Z'),
    updatedAt: new Date('2024-01-12T00:00:00Z'),
  } as ISKU,
};

// ─── Floors ──────────────────────────────────────────────────────────────────

export const LOCATIONS = {
  floorASection1Shelf1: {
    id: 'loc-A1-001',
    branchId: 'branch-001',
    name: 'Floor A',
    code: 'FLOORA',
    notes: 'Standard floor for electronics',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  } as IFloor,

  floorASection1Shelf2: {
    id: 'loc-A1-002',
    branchId: 'branch-001',
    name: 'Floor A - Level 2',
    code: 'FLOORA2',
    notes: null,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  } as IFloor,

  floorBSection2Shelf1: {
    id: 'loc-B2-001',
    branchId: 'branch-001',
    name: 'Floor B',
    code: 'FLOORB',
    notes: 'Heavy goods storage',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  } as IFloor,

  coldStorage: {
    id: 'loc-COLD-001',
    branchId: 'branch-001',
    name: 'Cold Storage Floor',
    code: 'COLD',
    notes: 'Temperature controlled',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  } as IFloor,
};

// ─── GRNs ────────────────────────────────────────────────────────────────────

export const GRNS = {
  draftGRN: {
    id: 'grn-draft-001',
    supplierId: 'vendor-acme-001',
    invoiceReference: 'ACME-INV-2024-001',
    supplierInvoiceDate: new Date('2024-01-15T00:00:00Z'),
    expectedDeliveryDate: new Date('2024-01-20T00:00:00Z'),
    deliveryDate: null,
    status: GRNStatus.Draft,
    notes: 'First GRN for 2024',
    createdBy: 'user-admin-001',
    createdAt: new Date('2024-01-15T09:00:00Z'),
    updatedAt: new Date('2024-01-15T09:00:00Z'),
  } as IGRN,

  submittedGRN: {
    id: 'grn-submitted-002',
    supplierId: 'vendor-acme-001',
    invoiceReference: 'ACME-INV-2024-002',
    supplierInvoiceDate: new Date('2024-01-20T00:00:00Z'),
    expectedDeliveryDate: new Date('2024-01-25T00:00:00Z'),
    deliveryDate: new Date('2024-01-25T10:00:00Z'),
    status: GRNStatus.Submitted,
    notes: null,
    createdBy: 'user-manager-001',
    createdAt: new Date('2024-01-20T09:00:00Z'),
    updatedAt: new Date('2024-01-25T10:00:00Z'),
  } as IGRN,

  fullyInspectedGRN: {
    id: 'grn-inspected-003',
    supplierId: 'vendor-globaltech-002',
    invoiceReference: 'GT-INV-2024-001',
    supplierInvoiceDate: new Date('2024-01-18T00:00:00Z'),
    expectedDeliveryDate: new Date('2024-01-22T00:00:00Z'),
    deliveryDate: new Date('2024-01-22T14:00:00Z'),
    status: GRNStatus.FullyInspected,
    notes: 'All items inspected and cleared',
    createdBy: 'user-admin-001',
    createdAt: new Date('2024-01-18T08:00:00Z'),
    updatedAt: new Date('2024-01-23T11:00:00Z'),
  } as IGRN,
};

export const GRN_LINES = {
  draftLine1: {
    id: 'grnline-draft-001-1',
    grnId: 'grn-draft-001',
    skuId: 'sku-widget-box-001',
    expectedQuantity: 50,
    receivedQuantity: 0,
    batchReference: 'BATCH-2024-001',
    notes: null,
  } as IGRNLine,

  draftLine2: {
    id: 'grnline-draft-001-2',
    grnId: 'grn-draft-001',
    skuId: 'sku-widget-piece-002',
    expectedQuantity: 100,
    receivedQuantity: 0,
    batchReference: 'BATCH-2024-002',
    notes: 'Handle with care',
  } as IGRNLine,

  submittedLine1: {
    id: 'grnline-submitted-002-1',
    grnId: 'grn-submitted-002',
    skuId: 'sku-widget-box-001',
    expectedQuantity: 30,
    receivedQuantity: 30,
    batchReference: 'BATCH-2024-003',
    notes: null,
  } as IGRNLine,
};

// ─── Inventory Records ───────────────────────────────────────────────────────

export const INVENTORY_RECORDS = {
  unopenedBox: {
    id: 'inv-unopened-001',
    skuId: 'sku-widget-box-001',
    batchId: 'BATCH-2024-001',
    floorId: 'loc-A1-001',
    quantity: 50,
    state: InventoryState.UnopenedBox,
    sourceEventId: null,
    terminalId: 'TERMINAL-001',
    userId: 'user-staff-001',
    version: 1,
    createdAt: new Date('2024-01-20T10:00:00Z'),
    updatedAt: new Date('2024-01-20T10:00:00Z'),
  } as IInventoryRecord,

  uninspected: {
    id: 'inv-uninspected-001',
    skuId: 'sku-widget-box-001',
    batchId: 'BATCH-2024-003',
    floorId: 'loc-A1-002',
    quantity: 30,
    state: InventoryState.Uninspected,
    sourceEventId: null,
    terminalId: 'TERMINAL-001',
    userId: 'user-manager-001',
    version: 1,
    createdAt: new Date('2024-01-25T11:00:00Z'),
    updatedAt: new Date('2024-01-25T11:00:00Z'),
  } as IInventoryRecord,

  inspected: {
    id: 'inv-inspected-001',
    skuId: 'sku-widget-piece-002',
    batchId: 'BATCH-2024-004',
    floorId: 'loc-A1-001',
    quantity: 45,
    state: InventoryState.Inspected,
    sourceEventId: null,
    terminalId: 'TERMINAL-002',
    userId: 'user-inspector-001',
    version: 2,
    createdAt: new Date('2024-01-22T14:00:00Z'),
    updatedAt: new Date('2024-01-23T09:00:00Z'),
  } as IInventoryRecord,

  shelfReady: {
    id: 'inv-shelfready-001',
    skuId: 'sku-widget-piece-002',
    batchId: 'BATCH-2024-004',
    floorId: 'loc-A1-001',
    quantity: 40,
    state: InventoryState.ShelfReady,
    sourceEventId: null,
    terminalId: 'TERMINAL-002',
    userId: 'user-manager-001',
    version: 3,
    createdAt: new Date('2024-01-23T10:00:00Z'),
    updatedAt: new Date('2024-01-24T08:00:00Z'),
  } as IInventoryRecord,

  damaged: {
    id: 'inv-damaged-001',
    skuId: 'sku-glassware-003',
    batchId: 'BATCH-2024-005',
    floorId: 'loc-B2-001',
    quantity: 5,
    state: InventoryState.Damaged,
    sourceEventId: null,
    terminalId: 'TERMINAL-001',
    userId: 'user-inspector-001',
    version: 1,
    createdAt: new Date('2024-01-23T15:00:00Z'),
    updatedAt: new Date('2024-01-23T15:00:00Z'),
  } as IInventoryRecord,

  sold: {
    id: 'inv-sold-001',
    skuId: 'sku-widget-piece-002',
    batchId: 'BATCH-2024-004',
    floorId: null,
    quantity: 10,
    state: InventoryState.Sold,
    sourceEventId: null,
    terminalId: 'TERMINAL-003',
    userId: 'user-staff-001',
    version: 4,
    createdAt: new Date('2024-01-24T09:00:00Z'),
    updatedAt: new Date('2024-01-28T11:00:00Z'),
  } as IInventoryRecord,
};

// ─── Inventory Events ────────────────────────────────────────────────────────

export const INVENTORY_EVENTS = {
  grnCreated: {
    id: 'event-grn-001',
    eventType: InventoryEventType.GRN_CREATED,
    parentEntityId: 'grn-draft-001',
    quantityDelta: 50,
    beforeQuantity: 0,
    afterQuantity: 50,
    reasonCode: null,
    userId: 'user-admin-001',
    terminalId: 'TERMINAL-001',
    timestamp: new Date('2024-01-20T10:00:00Z'),
    overrideFlag: false,
    metadata: { grnId: 'grn-draft-001', supplierId: 'vendor-acme-001' },
  } as IInventoryEvent,

  boxOpened: {
    id: 'event-box-001',
    eventType: InventoryEventType.BOX_OPENED,
    parentEntityId: 'inv-unopened-001',
    quantityDelta: -10,
    beforeQuantity: 50,
    afterQuantity: 40,
    reasonCode: 'BOX_OPEN_FOR_INSPECTION',
    userId: 'user-staff-001',
    terminalId: 'TERMINAL-001',
    timestamp: new Date('2024-01-21T09:00:00Z'),
    overrideFlag: false,
    metadata: { boxesOpened: 10, piecesCreated: 120 },
  } as IInventoryEvent,

  inspectionApproved: {
    id: 'event-inspect-001',
    eventType: InventoryEventType.INSPECTION_APPROVED,
    parentEntityId: 'inv-inspected-001',
    quantityDelta: 45,
    beforeQuantity: 0,
    afterQuantity: 45,
    reasonCode: 'INSPECTION_PASS',
    userId: 'user-inspector-001',
    terminalId: 'TERMINAL-002',
    timestamp: new Date('2024-01-23T09:00:00Z'),
    overrideFlag: false,
    metadata: { grnLineId: 'grnline-submitted-002-1', inspectionId: 'inspect-001' },
  } as IInventoryEvent,

  damageRecorded: {
    id: 'event-damage-001',
    eventType: InventoryEventType.DAMAGE_RECORDED,
    parentEntityId: 'inv-damaged-001',
    quantityDelta: 5,
    beforeQuantity: 0,
    afterQuantity: 5,
    reasonCode: 'PHYSICAL_DAMAGE',
    userId: 'user-inspector-001',
    terminalId: 'TERMINAL-002',
    timestamp: new Date('2024-01-23T15:00:00Z'),
    overrideFlag: false,
    metadata: { damageClassification: 'Major', remarks: 'Items broken during transit' },
  } as IInventoryEvent,

  overrideTransition: {
    id: 'event-override-001',
    eventType: InventoryEventType.STATE_CHANGE,
    parentEntityId: 'inv-damaged-001',
    quantityDelta: 0,
    beforeQuantity: 5,
    afterQuantity: 5,
    reasonCode: 'MANAGER_OVERRIDE',
    userId: 'user-manager-001',
    terminalId: 'TERMINAL-001',
    timestamp: new Date('2024-01-24T10:00:00Z'),
    overrideFlag: true,
    metadata: { fromState: 'Damaged', toState: 'Inspected', overrideReason: 'Items re-evaluated by manager' },
  } as IInventoryEvent,
};

// ─── Sync Conflicts ──────────────────────────────────────────────────────────

export const SYNC_CONFLICTS = {
  quantityConflict: {
    id: 'sync-conflict-001',
    clientId: 'client-terminal-001',
    operation: 'UPSERT_INVENTORY',
    payload: {
      id: 'inv-uninspected-001',
      quantity: 28,
      state: 'Uninspected',
      version: 1,
      updatedAt: '2024-01-25T12:00:00Z',
    },
    status: 'Conflict',
    createdAt: new Date('2024-01-25T12:00:00Z'),
    processedAt: new Date('2024-01-25T12:01:00Z'),
    conflictFlag: true,
    conflictNotes: 'Server version is 2, client version is 1. Quantity mismatch: server=30, client=28.',
  },

  stateConflict: {
    id: 'sync-conflict-002',
    clientId: 'client-terminal-002',
    operation: 'UPSERT_INVENTORY',
    payload: {
      id: 'inv-inspected-001',
      quantity: 45,
      state: 'ShelfReady',
      version: 2,
      updatedAt: '2024-01-23T10:00:00Z',
    },
    status: 'Conflict',
    createdAt: new Date('2024-01-23T11:00:00Z'),
    processedAt: new Date('2024-01-23T11:01:00Z'),
    conflictFlag: true,
    conflictNotes: 'State transition conflict: server has Damaged, client has ShelfReady.',
  },

  conversionConflict: {
    id: 'sync-conflict-003',
    clientId: 'client-terminal-001',
    operation: 'BOX_OPEN',
    payload: {
      skuId: 'sku-widget-box-001',
      boxesOpened: 5,
      conversionRatio: 12,
      offlineTimestamp: '2024-01-26T08:00:00Z',
    },
    status: 'Conflict',
    createdAt: new Date('2024-01-26T08:00:00Z'),
    processedAt: new Date('2024-01-26T14:00:00Z'),
    conflictFlag: true,
    conflictNotes: 'SKU conversion ratio changed from 12 to 10 before sync. Offline conversion may be invalid.',
  },
};

// ─── Storage Geometry Fixtures ────────────────────────────────────────────────

export const STORAGE_GEOMETRIES = {
  smallItem: { height: 10, width: 8, depth: 5, weight: 0.5, volume: 400 },
  mediumBox: { height: 30, width: 20, depth: 15, weight: 2.5, volume: 9000 },
  largeFragile: { height: 50, width: 40, depth: 30, weight: 8.0, volume: 60000 },
  heavyEquipment: { height: 60, width: 50, depth: 40, weight: 25.0, volume: 120000 },
};
