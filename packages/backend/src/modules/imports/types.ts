export const IMPORT_ENTITY_TYPES = ['grn', 'prn', 'product', 'inventory', 'supplier'] as const;

export type ImportEntityType = typeof IMPORT_ENTITY_TYPES[number];

export const IMPORT_JOB_STATUS = {
	Processing: 'Processing',
	Ready: 'Ready',
	PartiallyApproved: 'PartiallyApproved',
	Approved: 'Approved',
	Rejected: 'Rejected',
	Failed: 'Failed',
} as const;

export type ImportJobStatus = typeof IMPORT_JOB_STATUS[keyof typeof IMPORT_JOB_STATUS];

export const IMPORT_RECORD_STATUS = {
	Pending: 'Pending',
	Approved: 'Approved',
	Rejected: 'Rejected',
	Failed: 'Failed',
} as const;

export type ImportRecordStatus = typeof IMPORT_RECORD_STATUS[keyof typeof IMPORT_RECORD_STATUS];

export interface SupplierImportInput {
	name?: string;
	contactEmail?: string;
	contactPhone?: string;
	address?: string;
	type?: string;
	website?: string;
	taxId?: string;
	paymentTerms?: string;
	notes?: string;
	confidence?: number;
}

export interface ProductImportInput {
	skuCode?: string;
	name?: string;
	description?: string;
	vendorName?: string;
	vendorEmail?: string;
	categoryName?: string;
	unitOfMeasure?: string;
	costPrice?: number;
	sellingPrice?: number;
	wholesalePrice?: number;
	bulkPrice?: number;
	marginType?: 'fixed' | 'percentage';
	marginValue?: number;
	currency?: string;
	defaultManufacturingDate?: string;
	defaultExpiryDate?: string;
	shelfLifeDays?: number;
	lowStockThreshold?: number;
	notes?: string;
	confidence?: number;
}

export interface InventoryImportInput {
	skuCode?: string;
	skuName?: string;
	variantCode?: string;
	variantName?: string;
	batchNumber?: string;
	quantity?: number;
	state?: string;
	branchCode?: string;
	branchName?: string;
	floorCode?: string;
	floorName?: string;
	shelfCode?: string;
	shelfName?: string;
	boxCode?: string;
	boxName?: string;
	vendorName?: string;
	costPrice?: number;
	sellingPrice?: number;
	wholesalePrice?: number;
	bulkPrice?: number;
	currency?: string;
	manufacturingDate?: string;
	expiryDate?: string;
	notes?: string;
	terminalId?: string;
	confidence?: number;
}

export interface GRNLineImportInput {
	skuCode?: string;
	skuName?: string;
	variantCode?: string;
	variantName?: string;
	batchNumber?: string;
	expectedQuantity?: number;
	costPrice?: number;
	sellingPrice?: number;
	wholesalePrice?: number;
	bulkPrice?: number;
	marginType?: 'fixed' | 'percentage';
	marginValue?: number;
	notes?: string;
}

export interface GRNImportInput {
	supplierName?: string;
	supplierEmail?: string;
	invoiceReference?: string;
	supplierInvoiceDate?: string;
	expectedDeliveryDate?: string;
	deliveryDate?: string;
	branchCode?: string;
	branchName?: string;
	floorCode?: string;
	floorName?: string;
	shelfCode?: string;
	shelfName?: string;
	notes?: string;
	lines: GRNLineImportInput[];
	confidence?: number;
}

export interface PRNLineImportInput {
	skuCode?: string;
	skuName?: string;
	variantCode?: string;
	variantName?: string;
	batchNumber?: string;
	returnQuantity?: number;
	notes?: string;
}

export interface PRNImportInput {
	supplierName?: string;
	supplierEmail?: string;
	returnReason?: string;
	expectedPickupDate?: string;
	branchCode?: string;
	branchName?: string;
	floorCode?: string;
	floorName?: string;
	shelfCode?: string;
	shelfName?: string;
	notes?: string;
	lines: PRNLineImportInput[];
	confidence?: number;
}

export type ExtractedImportRecord =
	| SupplierImportInput
	| ProductImportInput
	| InventoryImportInput
	| GRNImportInput
	| PRNImportInput;

export interface ClaudeImportRecord<T extends ExtractedImportRecord = ExtractedImportRecord> {
	summary?: string;
	confidence?: number;
	data: T;
	warnings?: string[];
}

export interface ClaudeImportResult<T extends ExtractedImportRecord = ExtractedImportRecord> {
	documentSummary?: string;
	warnings?: string[];
	records: Array<ClaudeImportRecord<T>>;
}

export interface RelatedRecordPreview {
	table: string;
	action: 'create' | 'update' | 'match' | 'link' | 'derive';
	status: 'ready' | 'warning' | 'error';
	label: string;
	detail?: string;
}

export interface PreparedImportRecord {
	recordType: ImportEntityType;
	summary: string;
	confidence?: number | null;
	isSelected: boolean;
	payload: Record<string, any>;
	relatedRecords: RelatedRecordPreview[];
	warnings: string[];
	errors: string[];
}

export interface PreparedPromptContent {
	contentBlocks: Array<Record<string, any>>;
	metadata: Record<string, any>;
	warnings: string[];
}
