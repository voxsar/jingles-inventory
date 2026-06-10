// Payload contract between the legacy desktop sync agent (packages/sync-agent)
// and the backend /api/legacy-sync endpoints. All legacy primary keys travel
// as strings so MSSQL bigint values survive JSON round-trips.

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

// Per-location figures from legacy `productdetail` (product level) or
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

export interface LegacySyncChunk {
	units?: LegacySyncUnitRow[];
	suppliers?: LegacySyncSupplierRow[];
	locations?: LegacySyncLocationRow[];
	products?: LegacySyncProductRow[];
	variants?: LegacySyncVariantRow[];
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
