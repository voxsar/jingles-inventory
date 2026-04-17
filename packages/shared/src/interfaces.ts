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

export interface IStatusOption {
	id: string;
	entityType: string;
	value: string;
	label: string;
	color?: string | null;
	sortOrder: number;
	isDefault: boolean;
	isSystem: boolean;
	isActive: boolean;
	specialKey?: string | null;
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
	length: number;  // in cm
	width: number;   // in cm
	height: number;  // in cm
	weight: number;  // in grams
	volume?: number; // calculated in cm³
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

export interface IBatchReferencePricing {
	batchReference: string;
	unitPrice: number;
	currency?: string;
	notes?: string | null;
}

export interface IBatch {
	id: string;
	batchNumber: string;
	skuId: string;
	variantId?: string | null;
	sequenceNumber: number;
	costPrice?: number | null;
	sellingPrice?: number | null;
	wholesalePrice?: number | null;
	bulkPrice?: number | null;
	currency: string;
	marginType?: 'fixed' | 'percentage' | null;
	marginValue?: number | null;
	vendorId?: string | null;
	expiryDate?: Date | null;
	manufacturingDate?: Date | null;
	notes?: string | null;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
	sku?: ISKU;
	variant?: ISKUVariant | null;
	vendor?: IVendor | null;
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
	videoUrl?: string | null;
	isFragile: boolean;
	maxStackHeight?: number | null;
	// Default pricing fields (used as fallback when no batch-specific price exists)
	costPrice?: number | null;
	sellingPrice?: number | null;
	wholesalePrice?: number | null;
	bulkPrice?: number | null;
	marginType?: 'fixed' | 'percentage' | null;
	marginValue?: number | null;
	currency?: string;
	// Default date fields (used as fallback for batches)
	defaultManufacturingDate?: Date | null;
	defaultExpiryDate?: Date | null;
	shelfLifeDays?: number | null;
	batchPricing?: IBatchPricingTier[] | null;
	batchReferencePricing?: IBatchReferencePricing[] | null;
	lowStockThreshold?: number | null;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
	category?: ICategory | null;
	images?: IProductImage[];
	barcodes?: IProductBarcode[];
	tags?: ITag[];
	skuAttributes?: ISKUAttribute[];
	variants?: ISKUVariant[];
}

// ── Global Attribute System ────────────────────────────────

export interface IAttribute {
	id: string;
	name: string;
	type: 'dropdown' | 'text' | 'numeric' | 'boolean' | 'color';
	isActive: boolean;
	sortOrder: number;
	createdAt: Date;
	values?: IAttributeValue[];
}

export interface IAttributeValue {
	id: string;
	attributeId: string;
	displayName: string;
	representedValue: string;
	sortOrder: number;
	isActive: boolean;
	createdAt: Date;
	attribute?: IAttribute;
}

export interface ISKUAttribute {
	id: string;
	skuId: string;
	attributeId: string;
	attribute?: IAttribute;
	selectedValues?: IAttributeValue[];
}

export interface ISKUAttributeValue {
	skuAttributeId: string;
	attributeValueId: string;
	skuAttribute?: ISKUAttribute;
	attributeValue?: IAttributeValue;
}

export interface ISKUVariant {
	id: string;
	skuId: string;
	variantCode: string;
	name?: string | null;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
	sku?: ISKU;
	attributeValues?: ISKUVariantValue[];
}

export interface ISKUVariantValue {
	variantId: string;
	attributeId: string;
	attributeValueId: string;
	attribute?: IAttribute;
	attributeValue?: IAttributeValue;
}

export interface IFloor {
	id: string;
	branchId: string;
	name: string;
	code: string;
	floorNumber: number;
	length?: number | null;  // in meters
	width?: number | null;   // in meters
	notes?: string | null;
	isActive: boolean;
	createdAt: Date;
	branch?: IBranch | null;
	racks?: IRack[];
	shelves?: IShelf[];
	boxes?: IStorageBox[];
}

export interface IRack {
	id: string;
	floorId: string;
	name: string;
	code: string;
	notes?: string | null;
	isActive: boolean;
	createdAt: Date;
	// 3D position (metres) and rotation (degrees around Y axis)
	posX?: number | null;
	posZ?: number | null;
	rotY?: number | null;
	// Physical dimensions in cm
	widthCm?: number | null;
	heightCm?: number | null;
	depthCm?: number | null;
	floor?: IFloor | null;
	shelves?: IShelf[];
}

export interface IShelf {
	id: string;
	floorId: string;
	rackId?: string | null;
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
	rack?: IRack | null;
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
	shelfId?: string | null;
	floorId?: string | null;
	name: string;
	code: string;
	height: number;
	width: number;
	length: number;
	isActive: boolean;
	createdAt: Date;
	// 3D position/orientation
	posX?: number | null;
	posY?: number | null;
	posZ?: number | null;
	rotationAngle?: number | null;
	// Stacking
	stackOrder?: number | null;
	parentBoxId?: string | null;
	shelf?: IShelf | null;
	floor?: IFloor | null;
	stackedBoxes?: IStorageBox[];
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
	variantId?: string | null;
	batchId?: string | null;
	floorId?: string | null;
	shelfId?: string | null;
	boxId?: string | null;
	quantity: number;
	state: string; // Status value from StatusOption table
	sourceEventId?: string | null;
	terminalId?: string | null;
	userId?: string | null;
	version: number;
	createdAt: Date;
	updatedAt: Date;
	batch?: IBatch | null;
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
	floorId?: string | null;
	shelfId?: string | null;
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
	variantId?: string | null;
	batchId?: string | null;
	expectedQuantity: number;
	receivedQuantity: number;
	costPrice?: number | null;
	sellingPrice?: number | null;
	wholesalePrice?: number | null;
	bulkPrice?: number | null;
	notes?: string | null;
	batch?: IBatch | null;
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

// ── Pricing Overlay System ────────────────────────────────

export interface IPricingOverlayAppliesTo {
	skuIds?: string[];
	variantIds?: string[];
	batchIds?: string[];
	categoryIds?: string[];
}

export interface IPricingOverlayConditions {
	minQty?: number;
	maxQty?: number;
	customerGroups?: string[];
	dateRange?: {
		start: string;
		end: string;
	};
	branches?: string[];
	customerType?: string;  // 'retail', 'wholesale', 'bulk'
}

export interface IPricingOverlay {
	id: string;
	name: string;
	description?: string | null;
	type: string;  // PricingOverlayType enum values
	value: number;
	appliesTo: IPricingOverlayAppliesTo;
	conditions?: IPricingOverlayConditions | null;
	priority: number;
	stackable: boolean;
	status: string;  // PricingOverlayStatus enum values
	validFrom?: Date | null;
	validTo?: Date | null;
	createdBy?: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface IPricingContext {
	skuId: string;
	variantId?: string | null;
	batchId?: string | null;
	quantity?: number;
	customerGroup?: string;
	customerType?: string;
	branchId?: string;
	date?: Date;
	priceType?: 'selling' | 'wholesale' | 'bulk' | 'cost';
}

export interface IAppliedOverlay {
	overlayId: string;
	overlayName: string;
	type: string;
	value: number;
	adjustment: number;  // The actual amount adjusted
}

export interface IResolvedPrice {
	basePrice: number;
	finalPrice: number;
	currency: string;
	priceType: string;
	batchNumber?: string;
	source: 'batch' | 'sku_default' | 'calculated';
	appliedOverlays: IAppliedOverlay[];
	warnings?: string[];
}
