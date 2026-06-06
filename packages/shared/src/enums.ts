export enum InventoryState {
	UnopenedBox = 'UnopenedBox',
	Uninspected = 'Uninspected',
	Inspected = 'Inspected',
	ShelfReady = 'ShelfReady',
	Damaged = 'Damaged',
	Returned = 'Returned',
	Reserved = 'Reserved',
	Sold = 'Sold',
}

export enum InventoryEventType {
	GRN_CREATED = 'GRN_CREATED',
	PRN_CREATED = 'PRN_CREATED',
	BOX_OPENED = 'BOX_OPENED',
	INSPECTION_APPROVED = 'INSPECTION_APPROVED',
	LOCATION_TRANSFER = 'LOCATION_TRANSFER',
	STATE_CHANGE = 'STATE_CHANGE',
	SALE_DEDUCTED = 'SALE_DEDUCTED',
	RETURN_RECEIVED = 'RETURN_RECEIVED',
	MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
	DAMAGE_RECORDED = 'DAMAGE_RECORDED',
}

export enum GRNStatus {
	Draft = 'Draft',
	Submitted = 'Submitted',
	PartiallyInspected = 'PartiallyInspected',
	FullyInspected = 'FullyInspected',
	Closed = 'Closed',
}

export enum PRNStatus {
	Draft = 'Draft',
	Submitted = 'Submitted',
	PickedUp = 'PickedUp',
	Closed = 'Closed',
}

export enum UserRole {
	Admin = 'Admin',
	Manager = 'Manager',
	Staff = 'Staff',
	Inspector = 'Inspector',
	Vendor = 'Vendor',
}

export enum SyncStatus {
	Pending = 'Pending',
	Processed = 'Processed',
	Failed = 'Failed',
	Conflict = 'Conflict',
}

export enum DamageClassification {
	Minor = 'Minor',
	Major = 'Major',
	Totaled = 'Totaled',
}

export enum UnitOfMeasure {
	Piece = 'Piece',
	Box = 'Box',
	Pack = 'Pack',
	Liter = 'Liter',
	Milliliter = 'Milliliter',
	Kilogram = 'Kilogram',
	Gram = 'Gram',
	Meter = 'Meter',
	Centimeter = 'Centimeter',
}

export enum StockTransferStatus {
	Draft = 'Draft',
	Pending = 'Pending',
	Approved = 'Approved',
	InTransit = 'InTransit',
	Completed = 'Completed',
	Cancelled = 'Cancelled',
}

export enum VendorType {
	Vendor = 'Vendor',
	Supplier = 'Supplier',
	Both = 'Both',
}

export enum BarcodeType {
	EAN13 = 'EAN13',
	UPC = 'UPC',
	QRCode = 'QRCode',
	Code128 = 'Code128',
	Code39 = 'Code39',
	Custom = 'Custom',
}

export enum UnitType {
	Weight = 'Weight',
	Volume = 'Volume',
	Length = 'Length',
	Count = 'Count',
	Area = 'Area',
	Other = 'Other',
}

export enum PricingOverlayType {
	PercentageDiscount = 'percentage_discount',
	FixedDiscount = 'fixed_discount',
	PercentageMarkup = 'percentage_markup',
	FixedMarkup = 'fixed_markup',
}

export enum PricingOverlayStatus {
	Active = 'active',
	Inactive = 'inactive',
	Scheduled = 'scheduled',
	Expired = 'expired',
}

export enum VoucherStatus {
	Active = 'active',
	Redeemed = 'redeemed',
	Expired = 'expired',
	Cancelled = 'cancelled',
	Suspended = 'suspended',
}

export enum VoucherValueType {
	Fixed = 'fixed',
	Range = 'range',
}

export enum VoucherRestrictionType {
	CategoryExclude = 'category_exclude',
	CategoryInclude = 'category_include',
	SkuExclude = 'sku_exclude',
	SkuInclude = 'sku_include',
	VariantExclude = 'variant_exclude',
	VariantInclude = 'variant_include',
}

export enum VoucherBatchStatus {
	Pending = 'pending',
	Generating = 'generating',
	Completed = 'completed',
	Failed = 'failed',
}
