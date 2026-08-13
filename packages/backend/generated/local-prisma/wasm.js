
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  pinHash: 'pinHash',
  role: 'role',
  vendorId: 'vendorId',
  createdAt: 'createdAt',
  isActive: 'isActive'
};

exports.Prisma.VendorScalarFieldEnum = {
  id: 'id',
  name: 'name',
  contactEmail: 'contactEmail',
  contactPhone: 'contactPhone',
  address: 'address',
  type: 'type',
  website: 'website',
  taxId: 'taxId',
  paymentTerms: 'paymentTerms',
  notes: 'notes',
  createdAt: 'createdAt',
  isActive: 'isActive'
};

exports.Prisma.CategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  slug: 'slug',
  description: 'description',
  parentId: 'parentId',
  sortOrder: 'sortOrder',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.TagScalarFieldEnum = {
  id: 'id',
  name: 'name',
  color: 'color',
  createdAt: 'createdAt'
};

exports.Prisma.UnitOfMeasureScalarFieldEnum = {
  id: 'id',
  name: 'name',
  abbreviation: 'abbreviation',
  baseUnit: 'baseUnit',
  conversionFactor: 'conversionFactor',
  type: 'type',
  isActive: 'isActive',
  isSystem: 'isSystem',
  createdAt: 'createdAt'
};

exports.Prisma.BranchScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  address: 'address',
  phone: 'phone',
  email: 'email',
  isActive: 'isActive',
  isDefault: 'isDefault',
  createdAt: 'createdAt'
};

exports.Prisma.SKUScalarFieldEnum = {
  id: 'id',
  skuCode: 'skuCode',
  name: 'name',
  description: 'description',
  categoryId: 'categoryId',
  vendorId: 'vendorId',
  unitOfMeasureId: 'unitOfMeasureId',
  unitOfMeasure: 'unitOfMeasure',
  conversionRules: 'conversionRules',
  dimensions: 'dimensions',
  videoUrl: 'videoUrl',
  isFragile: 'isFragile',
  maxStackHeight: 'maxStackHeight',
  costPrice: 'costPrice',
  sellingPrice: 'sellingPrice',
  wholesalePrice: 'wholesalePrice',
  bulkPrice: 'bulkPrice',
  marginType: 'marginType',
  marginValue: 'marginValue',
  currency: 'currency',
  defaultManufacturingDate: 'defaultManufacturingDate',
  defaultExpiryDate: 'defaultExpiryDate',
  shelfLifeDays: 'shelfLifeDays',
  batchPricing: 'batchPricing',
  batchReferencePricing: 'batchReferencePricing',
  lowStockThreshold: 'lowStockThreshold',
  isVoucher: 'isVoucher',
  voucherValueType: 'voucherValueType',
  voucherMinValue: 'voucherMinValue',
  voucherMaxValue: 'voucherMaxValue',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SKUVendorScalarFieldEnum = {
  skuId: 'skuId',
  vendorId: 'vendorId'
};

exports.Prisma.SKUTagScalarFieldEnum = {
  skuId: 'skuId',
  tagId: 'tagId'
};

exports.Prisma.AttributeScalarFieldEnum = {
  id: 'id',
  name: 'name',
  type: 'type',
  isActive: 'isActive',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt'
};

exports.Prisma.AttributeValueScalarFieldEnum = {
  id: 'id',
  attributeId: 'attributeId',
  displayName: 'displayName',
  representedValue: 'representedValue',
  sortOrder: 'sortOrder',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.SKUAttributeScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  attributeId: 'attributeId'
};

exports.Prisma.SKUAttributeValueScalarFieldEnum = {
  skuAttributeId: 'skuAttributeId',
  attributeValueId: 'attributeValueId'
};

exports.Prisma.SKUVariantScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  variantCode: 'variantCode',
  name: 'name',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SKUVariantValueScalarFieldEnum = {
  variantId: 'variantId',
  attributeId: 'attributeId',
  attributeValueId: 'attributeValueId'
};

exports.Prisma.ProductImageScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  variantId: 'variantId',
  url: 'url',
  altText: 'altText',
  isPrimary: 'isPrimary',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt'
};

exports.Prisma.ProductBarcodeScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  variantId: 'variantId',
  barcode: 'barcode',
  barcodeType: 'barcodeType',
  isDefault: 'isDefault',
  label: 'label',
  createdAt: 'createdAt'
};

exports.Prisma.FloorScalarFieldEnum = {
  id: 'id',
  branchId: 'branchId',
  name: 'name',
  code: 'code',
  floorNumber: 'floorNumber',
  length: 'length',
  width: 'width',
  notes: 'notes',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.RackScalarFieldEnum = {
  id: 'id',
  floorId: 'floorId',
  name: 'name',
  code: 'code',
  notes: 'notes',
  isActive: 'isActive',
  createdAt: 'createdAt',
  posX: 'posX',
  posZ: 'posZ',
  rotY: 'rotY',
  widthCm: 'widthCm',
  heightCm: 'heightCm',
  depthCm: 'depthCm'
};

exports.Prisma.ShelfScalarFieldEnum = {
  id: 'id',
  floorId: 'floorId',
  rackId: 'rackId',
  name: 'name',
  code: 'code',
  height: 'height',
  width: 'width',
  length: 'length',
  levelIndex: 'levelIndex',
  elevationCm: 'elevationCm',
  hasFreezer: 'hasFreezer',
  hasLock: 'hasLock',
  notes: 'notes',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.StorageBoxScalarFieldEnum = {
  id: 'id',
  shelfId: 'shelfId',
  floorId: 'floorId',
  name: 'name',
  code: 'code',
  height: 'height',
  width: 'width',
  length: 'length',
  isActive: 'isActive',
  createdAt: 'createdAt',
  posX: 'posX',
  posY: 'posY',
  posZ: 'posZ',
  rotationAngle: 'rotationAngle',
  stackOrder: 'stackOrder',
  parentBoxId: 'parentBoxId'
};

exports.Prisma.BoxBarcodeScalarFieldEnum = {
  id: 'id',
  boxId: 'boxId',
  barcode: 'barcode',
  barcodeType: 'barcodeType',
  isDefault: 'isDefault',
  label: 'label',
  createdAt: 'createdAt'
};

exports.Prisma.StockTransferScalarFieldEnum = {
  id: 'id',
  referenceNumber: 'referenceNumber',
  fromBranchId: 'fromBranchId',
  toBranchId: 'toBranchId',
  fromFloorId: 'fromFloorId',
  toFloorId: 'toFloorId',
  status: 'status',
  notes: 'notes',
  requestedBy: 'requestedBy',
  approvedBy: 'approvedBy',
  requestedAt: 'requestedAt',
  approvedAt: 'approvedAt',
  completedAt: 'completedAt'
};

exports.Prisma.StockTransferLineScalarFieldEnum = {
  id: 'id',
  transferId: 'transferId',
  skuId: 'skuId',
  variantId: 'variantId',
  batchId: 'batchId',
  requestedQty: 'requestedQty',
  transferredQty: 'transferredQty',
  notes: 'notes'
};

exports.Prisma.InventoryRecordScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  variantId: 'variantId',
  batchId: 'batchId',
  floorId: 'floorId',
  shelfId: 'shelfId',
  boxId: 'boxId',
  quantity: 'quantity',
  state: 'state',
  posX: 'posX',
  posY: 'posY',
  posZ: 'posZ',
  rotY: 'rotY',
  sourceEventId: 'sourceEventId',
  terminalId: 'terminalId',
  userId: 'userId',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InventoryEventScalarFieldEnum = {
  id: 'id',
  eventType: 'eventType',
  parentEntityId: 'parentEntityId',
  quantityDelta: 'quantityDelta',
  beforeQuantity: 'beforeQuantity',
  afterQuantity: 'afterQuantity',
  reasonCode: 'reasonCode',
  userId: 'userId',
  terminalId: 'terminalId',
  timestamp: 'timestamp',
  overrideFlag: 'overrideFlag',
  metadata: 'metadata'
};

exports.Prisma.StockCountRunScalarFieldEnum = {
  id: 'id',
  branchId: 'branchId',
  status: 'status',
  requestId: 'requestId',
  openBranchKey: 'openBranchKey',
  startedById: 'startedById',
  completedById: 'completedById',
  startedAt: 'startedAt',
  completedAt: 'completedAt'
};

exports.Prisma.StockCountDeviceSessionScalarFieldEnum = {
  id: 'id',
  runId: 'runId',
  deviceId: 'deviceId',
  deviceName: 'deviceName',
  floorId: 'floorId',
  shelfId: 'shelfId',
  status: 'status',
  startedById: 'startedById',
  startedAt: 'startedAt',
  completedAt: 'completedAt'
};

exports.Prisma.StockCountItemScalarFieldEnum = {
  id: 'id',
  runId: 'runId',
  skuId: 'skuId',
  variantId: 'variantId',
  variantKey: 'variantKey',
  floorId: 'floorId',
  shelfId: 'shelfId',
  locationKey: 'locationKey',
  inventoryRecordId: 'inventoryRecordId',
  quantity: 'quantity',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockCountLineScalarFieldEnum = {
  id: 'id',
  deviceSessionId: 'deviceSessionId',
  itemId: 'itemId',
  quantity: 'quantity',
  lastBarcode: 'lastBarcode',
  updatedById: 'updatedById',
  countedAt: 'countedAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockCountSubmissionScalarFieldEnum = {
  id: 'id',
  requestId: 'requestId',
  deviceSessionId: 'deviceSessionId',
  itemId: 'itemId',
  lineId: 'lineId',
  skuId: 'skuId',
  variantId: 'variantId',
  barcode: 'barcode',
  submittedQuantity: 'submittedQuantity',
  deviceBefore: 'deviceBefore',
  deviceAfter: 'deviceAfter',
  totalAfter: 'totalAfter',
  submittedById: 'submittedById',
  createdAt: 'createdAt'
};

exports.Prisma.GRNScalarFieldEnum = {
  id: 'id',
  supplierId: 'supplierId',
  floorId: 'floorId',
  shelfId: 'shelfId',
  invoiceReference: 'invoiceReference',
  supplierInvoiceDate: 'supplierInvoiceDate',
  expectedDeliveryDate: 'expectedDeliveryDate',
  deliveryDate: 'deliveryDate',
  status: 'status',
  notes: 'notes',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BatchScalarFieldEnum = {
  id: 'id',
  batchNumber: 'batchNumber',
  skuId: 'skuId',
  variantId: 'variantId',
  sequenceNumber: 'sequenceNumber',
  costPrice: 'costPrice',
  sellingPrice: 'sellingPrice',
  wholesalePrice: 'wholesalePrice',
  bulkPrice: 'bulkPrice',
  currency: 'currency',
  marginType: 'marginType',
  marginValue: 'marginValue',
  vendorId: 'vendorId',
  expiryDate: 'expiryDate',
  manufacturingDate: 'manufacturingDate',
  notes: 'notes',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PricingOverlayScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  type: 'type',
  value: 'value',
  appliesTo: 'appliesTo',
  conditions: 'conditions',
  priority: 'priority',
  stackable: 'stackable',
  status: 'status',
  validFrom: 'validFrom',
  validTo: 'validTo',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.GRNLineScalarFieldEnum = {
  id: 'id',
  grnId: 'grnId',
  skuId: 'skuId',
  variantId: 'variantId',
  batchId: 'batchId',
  expectedQuantity: 'expectedQuantity',
  receivedQuantity: 'receivedQuantity',
  costPrice: 'costPrice',
  sellingPrice: 'sellingPrice',
  wholesalePrice: 'wholesalePrice',
  bulkPrice: 'bulkPrice',
  notes: 'notes'
};

exports.Prisma.InspectionRecordScalarFieldEnum = {
  id: 'id',
  grnLineId: 'grnLineId',
  approvedQuantity: 'approvedQuantity',
  rejectedQuantity: 'rejectedQuantity',
  damageClassification: 'damageClassification',
  inspectorUserId: 'inspectorUserId',
  timestamp: 'timestamp',
  remarks: 'remarks'
};

exports.Prisma.PRNScalarFieldEnum = {
  id: 'id',
  supplierId: 'supplierId',
  inspectionRecordId: 'inspectionRecordId',
  floorId: 'floorId',
  shelfId: 'shelfId',
  returnReason: 'returnReason',
  expectedPickupDate: 'expectedPickupDate',
  pickupDate: 'pickupDate',
  status: 'status',
  notes: 'notes',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PRNLineScalarFieldEnum = {
  id: 'id',
  prnId: 'prnId',
  skuId: 'skuId',
  variantId: 'variantId',
  batchId: 'batchId',
  returnQuantity: 'returnQuantity',
  pickedUpQuantity: 'pickedUpQuantity',
  notes: 'notes'
};

exports.Prisma.ImportJobScalarFieldEnum = {
  id: 'id',
  entityType: 'entityType',
  status: 'status',
  filename: 'filename',
  mimeType: 'mimeType',
  filePath: 'filePath',
  metadata: 'metadata',
  warnings: 'warnings',
  errorMessage: 'errorMessage',
  totalRecords: 'totalRecords',
  selectedRecords: 'selectedRecords',
  approvedRecords: 'approvedRecords',
  rejectedRecords: 'rejectedRecords',
  processedAt: 'processedAt',
  approvedAt: 'approvedAt',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportRecordScalarFieldEnum = {
  id: 'id',
  jobId: 'jobId',
  sourceIndex: 'sourceIndex',
  recordType: 'recordType',
  recordStatus: 'recordStatus',
  isSelected: 'isSelected',
  confidence: 'confidence',
  summary: 'summary',
  payload: 'payload',
  relatedRecords: 'relatedRecords',
  warnings: 'warnings',
  errors: 'errors',
  resultEntityType: 'resultEntityType',
  resultEntityId: 'resultEntityId',
  appliedAt: 'appliedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  changes: 'changes',
  ipAddress: 'ipAddress',
  timestamp: 'timestamp'
};

exports.Prisma.SyncOperationLogScalarFieldEnum = {
  id: 'id',
  clientId: 'clientId',
  opType: 'opType',
  aggregateType: 'aggregateType',
  aggregateId: 'aggregateId',
  idempotencyKey: 'idempotencyKey',
  payload: 'payload',
  baseVersion: 'baseVersion',
  status: 'status',
  conflictData: 'conflictData',
  lastError: 'lastError',
  attemptCount: 'attemptCount',
  createdAt: 'createdAt',
  processedAt: 'processedAt',
  appliedServerSeq: 'appliedServerSeq'
};

exports.Prisma.SyncConflictScalarFieldEnum = {
  id: 'id',
  operationId: 'operationId',
  clientId: 'clientId',
  aggregateType: 'aggregateType',
  aggregateId: 'aggregateId',
  status: 'status',
  localPayload: 'localPayload',
  serverPayload: 'serverPayload',
  resolutionPayload: 'resolutionPayload',
  createdAt: 'createdAt',
  resolvedAt: 'resolvedAt'
};

exports.Prisma.SyncServerSequenceScalarFieldEnum = {
  seq: 'seq',
  operationId: 'operationId',
  aggregateType: 'aggregateType',
  aggregateId: 'aggregateId',
  createdAt: 'createdAt'
};

exports.Prisma.SyncServerChangeScalarFieldEnum = {
  id: 'id',
  seq: 'seq',
  tableName: 'tableName',
  rowId: 'rowId',
  action: 'action',
  createdAt: 'createdAt'
};

exports.Prisma.StatusOptionScalarFieldEnum = {
  id: 'id',
  entityType: 'entityType',
  value: 'value',
  label: 'label',
  color: 'color',
  sortOrder: 'sortOrder',
  isDefault: 'isDefault',
  isSystem: 'isSystem',
  isActive: 'isActive',
  specialKey: 'specialKey',
  serverSeq: 'serverSeq',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt'
};

exports.Prisma.DashboardStatsScalarFieldEnum = {
  id: 'id',
  totalItems: 'totalItems',
  shelfReadyItems: 'shelfReadyItems',
  damagedItems: 'damagedItems',
  openGRNs: 'openGRNs',
  inventoryByState: 'inventoryByState',
  lastUpdated: 'lastUpdated'
};

exports.Prisma.VoucherBatchScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  variantId: 'variantId',
  batchName: 'batchName',
  prefix: 'prefix',
  quantity: 'quantity',
  generatedCount: 'generatedCount',
  defaultValue: 'defaultValue',
  expiryDays: 'expiryDays',
  defaultExpiresAt: 'defaultExpiresAt',
  status: 'status',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  completedAt: 'completedAt'
};

exports.Prisma.VoucherCodeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  skuId: 'skuId',
  variantId: 'variantId',
  batchId: 'batchId',
  voucherBatchId: 'voucherBatchId',
  initialValue: 'initialValue',
  currentBalance: 'currentBalance',
  currency: 'currency',
  status: 'status',
  issuedAt: 'issuedAt',
  expiresAt: 'expiresAt',
  activatedAt: 'activatedAt',
  fullyRedeemedAt: 'fullyRedeemedAt',
  customerId: 'customerId',
  orderId: 'orderId',
  purchaseReference: 'purchaseReference',
  notes: 'notes',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VoucherRedemptionScalarFieldEnum = {
  id: 'id',
  voucherCodeId: 'voucherCodeId',
  code: 'code',
  redeemedAmount: 'redeemedAmount',
  balanceBefore: 'balanceBefore',
  balanceAfter: 'balanceAfter',
  orderId: 'orderId',
  invoiceNumber: 'invoiceNumber',
  branchId: 'branchId',
  appliedToItems: 'appliedToItems',
  redeemedBy: 'redeemedBy',
  redeemedAt: 'redeemedAt',
  notes: 'notes'
};

exports.Prisma.LegacyEntityLinkScalarFieldEnum = {
  id: 'id',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  sourceCode: 'sourceCode',
  targetType: 'targetType',
  targetId: 'targetId',
  resolution: 'resolution',
  isLocked: 'isLocked',
  lastApplied: 'lastApplied',
  lastSeenAt: 'lastSeenAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LegacySyncRunScalarFieldEnum = {
  id: 'id',
  agentId: 'agentId',
  status: 'status',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  stats: 'stats',
  errorMessage: 'errorMessage'
};

exports.Prisma.LegacyPosRecordScalarFieldEnum = {
  sourceTable: 'sourceTable',
  sourceId: 'sourceId',
  payload: 'payload',
  firstSyncedAt: 'firstSyncedAt',
  lastSyncedAt: 'lastSyncedAt'
};

exports.Prisma.LegacyPosRecordVersionScalarFieldEnum = {
  id: 'id',
  sourceTable: 'sourceTable',
  sourceId: 'sourceId',
  payload: 'payload',
  contentHash: 'contentHash',
  syncRunId: 'syncRunId',
  createdAt: 'createdAt'
};

exports.Prisma.PosShiftScalarFieldEnum = {
  id: 'id',
  terminalId: 'terminalId',
  branchId: 'branchId',
  userId: 'userId',
  status: 'status',
  openingFloat: 'openingFloat',
  closingFloat: 'closingFloat',
  notes: 'notes',
  openingDeclaration: 'openingDeclaration',
  closingDeclaration: 'closingDeclaration',
  synced: 'synced',
  lastVectorClock: 'lastVectorClock',
  openedAt: 'openedAt',
  closedAt: 'closedAt'
};

exports.Prisma.PosHeldSaleScalarFieldEnum = {
  id: 'id',
  holdNumber: 'holdNumber',
  terminalId: 'terminalId',
  branchId: 'branchId',
  cashierId: 'cashierId',
  customerId: 'customerId',
  customerName: 'customerName',
  status: 'status',
  subtotal: 'subtotal',
  discountTotal: 'discountTotal',
  total: 'total',
  notes: 'notes',
  lines: 'lines',
  lastVectorClock: 'lastVectorClock',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PosSaleScalarFieldEnum = {
  id: 'id',
  receiptNumber: 'receiptNumber',
  terminalId: 'terminalId',
  branchId: 'branchId',
  userId: 'userId',
  customerId: 'customerId',
  shiftId: 'shiftId',
  heldSaleId: 'heldSaleId',
  status: 'status',
  subtotal: 'subtotal',
  discountTotal: 'discountTotal',
  taxTotal: 'taxTotal',
  total: 'total',
  marginTotal: 'marginTotal',
  lines: 'lines',
  payments: 'payments',
  sourceDeviceId: 'sourceDeviceId',
  sourceSequenceNum: 'sourceSequenceNum',
  synced: 'synced',
  lastVectorClock: 'lastVectorClock',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PosReturnScalarFieldEnum = {
  id: 'id',
  saleId: 'saleId',
  userId: 'userId',
  terminalId: 'terminalId',
  reason: 'reason',
  totalRefund: 'totalRefund',
  lines: 'lines',
  sourceDeviceId: 'sourceDeviceId',
  sourceSequenceNum: 'sourceSequenceNum',
  lastVectorClock: 'lastVectorClock',
  createdAt: 'createdAt'
};

exports.Prisma.PosSyncEventScalarFieldEnum = {
  id: 'id',
  aggregateType: 'aggregateType',
  aggregateId: 'aggregateId',
  eventType: 'eventType',
  payload: 'payload',
  vectorClock: 'vectorClock',
  deviceId: 'deviceId',
  terminalId: 'terminalId',
  sequenceNum: 'sequenceNum',
  lamport: 'lamport',
  conflictPolicy: 'conflictPolicy',
  state: 'state',
  createdAt: 'createdAt',
  appliedAt: 'appliedAt'
};

exports.Prisma.PosSyncDeviceStateScalarFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  terminalId: 'terminalId',
  lastSequenceNum: 'lastSequenceNum',
  vectorClock: 'vectorClock',
  confirmedVectorClock: 'confirmedVectorClock',
  online: 'online',
  lastError: 'lastError',
  lastSeenAt: 'lastSeenAt',
  lastSyncAt: 'lastSyncAt'
};

exports.Prisma.PosSyncConflictScalarFieldEnum = {
  id: 'id',
  aggregateType: 'aggregateType',
  aggregateId: 'aggregateId',
  localEventId: 'localEventId',
  remoteEventId: 'remoteEventId',
  policy: 'policy',
  status: 'status',
  detail: 'detail',
  createdAt: 'createdAt',
  resolvedAt: 'resolvedAt'
};

exports.Prisma.ManagedDeviceScalarFieldEnum = {
  id: 'id',
  displayName: 'displayName',
  reportedName: 'reportedName',
  nameVersion: 'nameVersion',
  application: 'application',
  applicationVersion: 'applicationVersion',
  platform: 'platform',
  hostname: 'hostname',
  branchId: 'branchId',
  terminalId: 'terminalId',
  lastIp: 'lastIp',
  lastConnection: 'lastConnection',
  lastSeenAt: 'lastSeenAt',
  lastSyncAt: 'lastSyncAt',
  pendingCount: 'pendingCount',
  conflictCount: 'conflictCount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VoucherRestrictionScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  restrictionType: 'restrictionType',
  targetCategoryIds: 'targetCategoryIds',
  targetSkuIds: 'targetSkuIds',
  targetVariantIds: 'targetVariantIds',
  cannotCombineWithDiscounts: 'cannotCombineWithDiscounts',
  cannotCombineWithOtherVouchers: 'cannotCombineWithOtherVouchers',
  minPurchaseAmount: 'minPurchaseAmount',
  maxDiscountAmount: 'maxDiscountAmount',
  priority: 'priority',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  User: 'User',
  Vendor: 'Vendor',
  Category: 'Category',
  Tag: 'Tag',
  UnitOfMeasure: 'UnitOfMeasure',
  Branch: 'Branch',
  SKU: 'SKU',
  SKUVendor: 'SKUVendor',
  SKUTag: 'SKUTag',
  Attribute: 'Attribute',
  AttributeValue: 'AttributeValue',
  SKUAttribute: 'SKUAttribute',
  SKUAttributeValue: 'SKUAttributeValue',
  SKUVariant: 'SKUVariant',
  SKUVariantValue: 'SKUVariantValue',
  ProductImage: 'ProductImage',
  ProductBarcode: 'ProductBarcode',
  Floor: 'Floor',
  Rack: 'Rack',
  Shelf: 'Shelf',
  StorageBox: 'StorageBox',
  BoxBarcode: 'BoxBarcode',
  StockTransfer: 'StockTransfer',
  StockTransferLine: 'StockTransferLine',
  InventoryRecord: 'InventoryRecord',
  InventoryEvent: 'InventoryEvent',
  StockCountRun: 'StockCountRun',
  StockCountDeviceSession: 'StockCountDeviceSession',
  StockCountItem: 'StockCountItem',
  StockCountLine: 'StockCountLine',
  StockCountSubmission: 'StockCountSubmission',
  GRN: 'GRN',
  Batch: 'Batch',
  PricingOverlay: 'PricingOverlay',
  GRNLine: 'GRNLine',
  InspectionRecord: 'InspectionRecord',
  PRN: 'PRN',
  PRNLine: 'PRNLine',
  ImportJob: 'ImportJob',
  ImportRecord: 'ImportRecord',
  AuditLog: 'AuditLog',
  SyncOperationLog: 'SyncOperationLog',
  SyncConflict: 'SyncConflict',
  SyncServerSequence: 'SyncServerSequence',
  SyncServerChange: 'SyncServerChange',
  StatusOption: 'StatusOption',
  DashboardStats: 'DashboardStats',
  VoucherBatch: 'VoucherBatch',
  VoucherCode: 'VoucherCode',
  VoucherRedemption: 'VoucherRedemption',
  LegacyEntityLink: 'LegacyEntityLink',
  LegacySyncRun: 'LegacySyncRun',
  LegacyPosRecord: 'LegacyPosRecord',
  LegacyPosRecordVersion: 'LegacyPosRecordVersion',
  PosShift: 'PosShift',
  PosHeldSale: 'PosHeldSale',
  PosSale: 'PosSale',
  PosReturn: 'PosReturn',
  PosSyncEvent: 'PosSyncEvent',
  PosSyncDeviceState: 'PosSyncDeviceState',
  PosSyncConflict: 'PosSyncConflict',
  ManagedDevice: 'ManagedDevice',
  VoucherRestriction: 'VoucherRestriction'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
