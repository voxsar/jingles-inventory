// Row shapes used by the legacy desktop sync: the backend SELECTs these
// directly from the legacy POS database (MSSQL, or a MySQL copy) and applies
// them through the legacy-sync service. All legacy primary keys travel as
// strings so MSSQL bigint values survive serialization.

export interface LegacySyncSupplierRow {
	supplierId: string;
	supplierCode?: string;
	name: string;
	contactName?: string;
	email?: string;
	phone?: string;
	address?: string;
	website?: string;
	taxId?: string;
	creditPeriodDays?: number;
	isActive: boolean;
}

export interface LegacySyncLocationRow {
	locationId: string;
	code: string;
	name: string;
	address?: string;
	phone?: string;
	email?: string;
	isActive: boolean;
}

export interface LegacySyncUnitRow {
	unitId: string;
	code?: string;
	name: string;
}

export interface LegacySyncCategorySegment {
	kind: 'department' | 'category' | 'subcategory1' | 'subcategory2' | 'subcategory3';
	code: string;
	name: string;
}

// Per-location figures combine `productdetail` prices with product-level `vwStockReport` quantities, or
// `productcolorsizedetail` (variant level — has prices but no quantity).
export interface LegacySyncLocationDetail {
	locationId: string;
	costPrice?: number;
	sellingPrice?: number;
	wholesalePrice?: number;
	bulkPrice?: number;
	quantity?: number;
	reorderLevel?: number;
}

export interface LegacySyncProductRow {
	productId: string;
	productCode: string;
	name: string;
	printName?: string;
	barcode?: string;
	supplierId?: string;
	unitName?: string;
	unitCode?: string;
	packSize?: number;
	categoryPath?: LegacySyncCategorySegment[];
	isActive: boolean;
	details: LegacySyncLocationDetail[];
}

export interface LegacySyncVariantRow {
	productColorSizeId: string;
	productId: string;
	colorSizeCode?: string;
	colorSizeName?: string;
	colorCode?: string;
	colorName?: string;
	sizeCode?: string;
	sizeName?: string;
	isActive: boolean;
	details: LegacySyncLocationDetail[];
}

// Lossless copy of a row from a legacy POS operational table. Keeping the
// original column names and values is intentional: legacy installations have
// several schema revisions, and report/cash fields are not consistent enough
// to safely force into one shape at the desktop boundary.
export interface LegacySyncPosRecord {
	sourceTable: string;
	sourceId: string;
	data: Record<string, unknown>;
}

export interface LegacySyncChunk {
	units?: LegacySyncUnitRow[];
	suppliers?: LegacySyncSupplierRow[];
	locations?: LegacySyncLocationRow[];
	products?: LegacySyncProductRow[];
	variants?: LegacySyncVariantRow[];
	posRecords?: LegacySyncPosRecord[];
}

export interface LegacySyncEntityCounts {
	received: number;
	created: number;
	updated: number;
	unchanged: number;
	skipped: number;
}

export interface LegacySyncChunkResult {
	runId: string;
	counts: Record<string, LegacySyncEntityCounts>;
	inventoryAdjustments: number;
	warnings: string[];
}

export interface LegacySyncRunSummary {
	id: string;
	agentId?: string | null;
	status: string;
	startedAt: string;
	finishedAt?: string | null;
	stats?: unknown;
	errorMessage?: string | null;
}
