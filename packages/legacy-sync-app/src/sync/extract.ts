import type {
	LegacySyncCategorySegment,
	LegacySyncLocationDetail,
	LegacySyncLocationRow,
	LegacySyncPosRecord,
	LegacySyncProductRow,
	LegacySyncSupplierRow,
	LegacySyncUnitRow,
	LegacySyncVariantRow,
} from '@jingles/shared';
import crypto from 'crypto';
import type { LegacyDb, LegacyRow } from './legacyDb';

export interface LegacySnapshot {
	units: LegacySyncUnitRow[];
	suppliers: LegacySyncSupplierRow[];
	locations: LegacySyncLocationRow[];
	products: LegacySyncProductRow[];
	variants: LegacySyncVariantRow[];
	warnings: string[];
}

const STOCK_QUANTITY_ANOMALY_LIMIT = 1_000_000_000;
const STOCK_QUANTITY_COLUMNS = [
	'Qty', 'Quantity', 'ProductQty', 'StockQty', 'StockQuantity', 'StockBalanceQty',
	'BalanceQty', 'BalanceQuantity', 'QtyBalance', 'Balance', 'CurrentBalance',
	'StockBalance', 'CurrentStock', 'CurrentQty', 'ClosingStock', 'ClosingQty',
	'OnHand', 'OnHandQty', 'StockOnHand', 'AvailableQty', 'AvailableQuantity',
	'ActualQty', 'NetQty', 'TotalQty', 'Stock',
];

function normalizedColumnName(value: string) {
	return value.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function field(row: LegacyRow, candidates: string[]): unknown {
	const byNormalizedName = new Map(
		Object.entries(row).map(([key, value]) => [normalizedColumnName(key), value]),
	);
	for (const candidate of candidates) {
		const key = normalizedColumnName(candidate);
		if (byNormalizedName.has(key)) return byNormalizedName.get(key);
	}
	return undefined;
}

function str(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	const text = String(value).trim();
	return text.length > 0 ? text : undefined;
}

function id(value: unknown): string | undefined {
	const text = str(value);
	if (!text || text === '0') return undefined;
	return text;
}

function num(value: unknown): number | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: unknown): boolean {
	return value === true || value === 1 || value === '1';
}

function isLive(row: LegacyRow): boolean {
	const deleted = bool(row.IsDelete);
	const active = row.IsActive === undefined ? true : bool(row.IsActive);
	return active && !deleted;
}

function joinParts(parts: Array<unknown>, separator = ', ') {
	return parts.map(str).filter(Boolean).join(separator) || undefined;
}

function jsonValue(value: unknown): unknown {
	if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value ?? null;
	if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
	if (typeof value === 'bigint') return value.toString();
	if (value instanceof Date) return value.toISOString();
	if (Buffer.isBuffer(value)) return value.toString('base64');
	if (Array.isArray(value)) return value.map(jsonValue);
	if (typeof value === 'object') {
		return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonValue(item)]));
	}
	return String(value);
}

const SENSITIVE_COLUMN_NAME = /(password|passwd|passwordhash|credential|secret|token|salt|(^|_)pin(code)?$)/i;

function jsonRecord(row: LegacyRow): Record<string, unknown> {
	return Object.fromEntries(Object.entries(row).map(([key, value]) => [
		key,
		SENSITIVE_COLUMN_NAME.test(key) ? '[REDACTED]' : jsonValue(value),
	]));
}

function sourceIdFor(table: string, row: LegacyRow, index: number) {
	const entries = Object.entries(row);
	const preferred = entries.find(([key, value]) =>
		value !== null && value !== undefined && new RegExp(`^${table.replace(/[^A-Za-z0-9]/g, '')}id$`, 'i').test(key.replace(/_/g, '')),
	);
	if (preferred) return String(preferred[1]);
	const idParts = entries
		.filter(([key, value]) => value !== null && value !== undefined && /(?:^|_)id$/i.test(key))
		.map(([key, value]) => `${key}=${String(value)}`);
	if (idParts.length > 0) return idParts.join('|');
	// Tables without any identifier are still mirrored losslessly. Their
	// content hash is a deterministic identity; the row number is only a final
	// collision guard for exact duplicate rows.
	const hash = crypto.createHash('sha1').update(JSON.stringify(jsonRecord(row))).digest('hex');
	return `${hash}:${index + 1}`;
}

// Every base table is mirrored. Domain-specific extractors still populate the
// native Inventory models, while this archive guarantees that tables without
// a first-class target are retained without dropping columns.
export async function listLegacyTables(db: LegacyDb): Promise<string[]> {
	return (await db.listTables())
		.sort((left, right) => left.localeCompare(right));
}

// Backward-compatible name for callers compiled against older releases.
export const listPosTables = listLegacyTables;

export function toPosRecords(table: string, rows: LegacyRow[], startIndex: number): LegacySyncPosRecord[] {
	return rows.map((row, index) => ({
			sourceTable: table.toLowerCase(),
			sourceId: sourceIdFor(table, row, startIndex + index),
			data: jsonRecord(row),
		}));
}

// Pulls the full relevant slice of the legacy database with read-only SELECTs.
// Change detection happens afterwards against local hashes; this full scan is
// what lets schema variants and edits to older report rows sync reliably.
export async function extractSnapshot(db: LegacyDb, onProgress?: (message: string) => void): Promise<LegacySnapshot> {
	onProgress?.('Reading legacy catalog and stock tables...');
	const [
		unitRows,
		supplierRows,
		locationRows,
		departmentRows,
		categoryRows,
		subCategory1Rows,
		subCategory2Rows,
		subCategory3Rows,
		colourRows,
		sizeRows,
		productRows,
		productDetailRows,
		stockReportRows,
		colorSizeRows,
		colorSizeDetailRows,
	] = await Promise.all([
		db.query('SELECT UnitOfMeasureID, UnitOfMeasureCode, UnitOfMeasureName, IsDelete FROM unitofmeasure'),
		db.query('SELECT SupplierID, SupplierCode, SupplierName, ContactName, ContactNo, Phone1, Phone2, Phone3, Email, WebSite, Address1, Address2, Address3, Country, VatNo, NICNo, CreditPeriod, IsActive, IsDelete FROM supplier'),
		db.query('SELECT LocationID, LocationCode, LocationName, ContactNo, Phone1, Phone2, Phone3, Email, Address1, Address2, Address3, IsActive, IsDelete FROM location'),
		db.query('SELECT DepartmentID, DepartmentCode, DepartmentName FROM department'),
		db.query('SELECT CategoryID, CategoryCode, CategoryName FROM category'),
		db.query('SELECT SubCategory1ID, SubCategory1Code, SubCategory1Name FROM subcategory1'),
		db.query('SELECT SubCategory2ID, SubCategory2Code, SubCategory2Name FROM subcategory2'),
		db.query('SELECT SubCategory3ID, SubCategory3Code, SubCategory3Name FROM subcategory3'),
		db.query('SELECT ColourID, ColourCode, ColourName FROM colour'),
		db.query('SELECT SizeID, SizeCode, SizeName FROM size'),
		db.query('SELECT ProductID, ProductCode, BarCode, ProductName, PrintOnInvoice, DepartmentID, CategoryID, SubCategory1ID, SubCategory2ID, SubCategory3ID, SupplierID, PackSize, PUnit, EUnit, IsActive, IsDelete FROM product'),
		db.query('SELECT ProductID, LocationID, CostPrice, SellingPrice, WholeSalePrice, SpecialPrice, ReOrderLevel FROM productdetail'),
		db.query('SELECT * FROM vwStockReport'),
		db.query('SELECT ProductColorSizeID, ProductID, ColorSizeCode, ColorSizeName, ColorID, SizeID, IsActive, IsDelete FROM productcolorsize'),
		db.query('SELECT ProductColorSizeID, ProductID, LocationID, CostPrice, SellingPrice, WholeSalePrice, IsActive, IsDelete FROM productcolorsizedetail'),
	]);
	const warnings: string[] = [];

	const unitNameByCode = new Map<string, string>();
	const units: LegacySyncUnitRow[] = [];
	for (const row of unitRows) {
		const unitId = id(row.UnitOfMeasureID);
		const name = str(row.UnitOfMeasureName);
		if (!unitId || !name || bool(row.IsDelete)) continue;
		const code = str(row.UnitOfMeasureCode);
		if (code) unitNameByCode.set(code.toUpperCase(), name);
		units.push({ unitId, code, name });
	}

	const suppliers: LegacySyncSupplierRow[] = [];
	for (const row of supplierRows) {
		const supplierId = id(row.SupplierID);
		const name = str(row.SupplierName);
		if (!supplierId || !name) continue;
		suppliers.push({
			supplierId,
			supplierCode: str(row.SupplierCode),
			name,
			contactName: str(row.ContactName),
			email: str(row.Email),
			phone: joinParts([row.ContactNo, row.Phone1, row.Phone2, row.Phone3], ' / '),
			address: joinParts([row.Address1, row.Address2, row.Address3, row.Country]),
			website: str(row.WebSite),
			taxId: str(row.VatNo) ?? str(row.NICNo),
			creditPeriodDays: num(row.CreditPeriod),
			isActive: isLive(row),
		});
	}

	const locations: LegacySyncLocationRow[] = [];
	for (const row of locationRows) {
		const locationId = id(row.LocationID);
		const code = str(row.LocationCode);
		if (!locationId || !code) continue;
		locations.push({
			locationId,
			code,
			name: str(row.LocationName) ?? code,
			address: joinParts([row.Address1, row.Address2, row.Address3]),
			phone: joinParts([row.ContactNo, row.Phone1, row.Phone2, row.Phone3], ' / '),
			email: str(row.Email),
			isActive: isLive(row),
		});
	}

	const departmentById = new Map(departmentRows.map((row) => [id(row.DepartmentID) ?? '', row]));
	const categoryById = new Map(categoryRows.map((row) => [id(row.CategoryID) ?? '', row]));
	const subCategory1ById = new Map(subCategory1Rows.map((row) => [id(row.SubCategory1ID) ?? '', row]));
	const subCategory2ById = new Map(subCategory2Rows.map((row) => [id(row.SubCategory2ID) ?? '', row]));
	const subCategory3ById = new Map(subCategory3Rows.map((row) => [id(row.SubCategory3ID) ?? '', row]));
	const colourById = new Map(colourRows.map((row) => [id(row.ColourID) ?? '', row]));
	const sizeById = new Map(sizeRows.map((row) => [id(row.SizeID) ?? '', row]));

	const detailsByProduct = new Map<string, LegacySyncLocationDetail[]>();
	for (const row of productDetailRows) {
		const productId = id(row.ProductID);
		const locationId = id(row.LocationID);
		if (!productId || !locationId) continue;
		const detail: LegacySyncLocationDetail = {
			locationId,
			costPrice: num(row.CostPrice),
			sellingPrice: num(row.SellingPrice),
			wholesalePrice: num(row.WholeSalePrice),
			bulkPrice: num(row.SpecialPrice),
			reorderLevel: num(row.ReOrderLevel),
		};
		const list = detailsByProduct.get(productId) ?? [];
		list.push(detail);
		detailsByProduct.set(productId, list);
	}

	// ProductDetail.Qty is not the MaxSoft on-hand balance in every deployed
	// database. vwStockReport is calculated from the stock ledger and is the
	// authoritative quantity source; ProductDetail still supplies prices and
	// reorder levels.
	const productIdByCode = new Map<string, string>();
	for (const row of productRows) {
		const productId = id(row.ProductID);
		const productCode = str(row.ProductCode);
		if (productId && productCode) productIdByCode.set(productCode.toUpperCase(), productId);
	}
	const locationIdByCode = new Map<string, string>();
	for (const row of locationRows) {
		const locationId = id(row.LocationID);
		const locationCode = str(row.LocationCode);
		if (locationId && locationCode) locationIdByCode.set(locationCode.toUpperCase(), locationId);
	}
	const knownLocationIds = locationRows.map((row) => id(row.LocationID)).filter((value): value is string => Boolean(value));
	const stockByProductLocation = new Map<string, number>();
	const anomalousStockKeys = new Set<string>();
	const invalidStockKeys = new Set<string>();
	let unrecognizedProductRows = 0;
	let unresolvedLocationRows = 0;
	let invalidQuantityRows = 0;
	const anomalyExamples: string[] = [];

	if (stockReportRows.length > 0) {
		const columns = Object.keys(stockReportRows[0]);
		const normalizedQuantityColumns = STOCK_QUANTITY_COLUMNS.map(normalizedColumnName);
		if (!columns.some((column) => normalizedQuantityColumns.includes(normalizedColumnName(column)))) {
			throw new Error(`vwStockReport has no recognized quantity column. Available columns: ${columns.join(', ')}`);
		}
	}

	for (const row of stockReportRows) {
		const productCode = str(field(row, ['ProductCode', 'SKUCode', 'ItemCode']));
		const productId = id(field(row, ['ProductID', 'ProductId', 'ItemID', 'SKUId']))
			?? (productCode ? productIdByCode.get(productCode.toUpperCase()) : undefined);
		if (!productId) {
			unrecognizedProductRows += 1;
			continue;
		}

		let locationId = id(field(row, ['LocationID', 'LocationId', 'BranchID', 'WarehouseID', 'StoreID']));
		if (!locationId) {
			const locationCode = str(field(row, ['LocationCode', 'BranchCode', 'WarehouseCode', 'StoreCode']));
			if (locationCode) locationId = locationIdByCode.get(locationCode.toUpperCase());
		}
		if (!locationId) {
			const productLocations = [...new Set((detailsByProduct.get(productId) ?? []).map((detail) => detail.locationId))];
			if (productLocations.length === 1) locationId = productLocations[0];
			else if (knownLocationIds.length === 1) locationId = knownLocationIds[0];
		}
		if (!locationId) {
			unresolvedLocationRows += 1;
			continue;
		}

		const key = `${productId}:${locationId}`;
		const quantity = num(field(row, STOCK_QUANTITY_COLUMNS));
		if (quantity === undefined) {
			invalidQuantityRows += 1;
			invalidStockKeys.add(key);
			stockByProductLocation.delete(key);
			continue;
		}
		if (Math.abs(quantity) >= STOCK_QUANTITY_ANOMALY_LIMIT) {
			anomalousStockKeys.add(key);
			stockByProductLocation.delete(key);
			if (anomalyExamples.length < 5) anomalyExamples.push(`${productId} @ ${locationId} = ${quantity}`);
			continue;
		}
		if (!anomalousStockKeys.has(key) && !invalidStockKeys.has(key)) {
			stockByProductLocation.set(key, (stockByProductLocation.get(key) ?? 0) + quantity);
		}
	}

	if (unresolvedLocationRows > 0) {
		throw new Error(
			`Could not resolve a location for ${unresolvedLocationRows} vwStockReport rows. `
			+ 'Add LocationID/LocationCode to the view or ensure each product belongs to only one location.',
		);
	}
	if (stockReportRows.length > 0 && unrecognizedProductRows === stockReportRows.length) {
		throw new Error('None of the vwStockReport rows could be matched to a product; stock sync was stopped to avoid replacing valid balances with zero.');
	}
	if (unrecognizedProductRows > 0) warnings.push(`Ignored ${unrecognizedProductRows} vwStockReport rows whose product could not be matched.`);
	if (invalidQuantityRows > 0) warnings.push(`Ignored ${invalidQuantityRows} vwStockReport rows with a missing or invalid quantity.`);
	if (anomalousStockKeys.size > 0) {
		warnings.push(
			`Withheld ${anomalousStockKeys.size} stock quantities at or above ${STOCK_QUANTITY_ANOMALY_LIMIT.toLocaleString()} in absolute value for review`
			+ `${anomalyExamples.length > 0 ? ` (${anomalyExamples.join('; ')})` : ''}.`,
		);
	}

	for (const [productId, details] of detailsByProduct) {
		for (const detail of details) {
			const key = `${productId}:${detail.locationId}`;
			if (!anomalousStockKeys.has(key) && !invalidStockKeys.has(key)) detail.quantity = stockByProductLocation.get(key) ?? 0;
		}
	}
	for (const [key, quantity] of stockByProductLocation) {
		const separator = key.lastIndexOf(':');
		const productId = key.slice(0, separator);
		const locationId = key.slice(separator + 1);
		const details = detailsByProduct.get(productId) ?? [];
		if (!details.some((detail) => detail.locationId === locationId)) {
			details.push({ locationId, quantity });
			detailsByProduct.set(productId, details);
		}
	}
	onProgress?.(`Loaded stock quantities from vwStockReport (${stockByProductLocation.size} product/location balances).`);

	const detailsByColorSize = new Map<string, LegacySyncLocationDetail[]>();
	for (const row of colorSizeDetailRows) {
		const colorSizeId = id(row.ProductColorSizeID);
		const locationId = id(row.LocationID);
		if (!colorSizeId || !locationId) continue;
		if (row.IsDelete !== undefined && bool(row.IsDelete)) continue;
		const detail: LegacySyncLocationDetail = {
			locationId,
			costPrice: num(row.CostPrice),
			sellingPrice: num(row.SellingPrice),
			wholesalePrice: num(row.WholeSalePrice),
		};
		const list = detailsByColorSize.get(colorSizeId) ?? [];
		list.push(detail);
		detailsByColorSize.set(colorSizeId, list);
	}

	const products: LegacySyncProductRow[] = [];
	for (const row of productRows) {
		const productId = id(row.ProductID);
		const productCode = str(row.ProductCode);
		if (!productId || !productCode) continue;

		const categoryPath: LegacySyncCategorySegment[] = [];
		const department = departmentById.get(id(row.DepartmentID) ?? '');
		if (department) {
			categoryPath.push({
				kind: 'department',
				code: str(department.DepartmentCode) ?? `dept-${id(department.DepartmentID)}`,
				name: str(department.DepartmentName) ?? str(department.DepartmentCode) ?? 'Department',
			});
		}
		const category = categoryById.get(id(row.CategoryID) ?? '');
		if (category) {
			categoryPath.push({
				kind: 'category',
				code: str(category.CategoryCode) ?? `category-${id(category.CategoryID)}`,
				name: str(category.CategoryName) ?? str(category.CategoryCode) ?? 'Category',
			});
		}
		const subCategoryEntries: Array<[LegacyRow | undefined, 'subcategory1' | 'subcategory2' | 'subcategory3', string, string]> = [
			[subCategory1ById.get(id(row.SubCategory1ID) ?? ''), 'subcategory1', 'SubCategory1Code', 'SubCategory1Name'],
			[subCategory2ById.get(id(row.SubCategory2ID) ?? ''), 'subcategory2', 'SubCategory2Code', 'SubCategory2Name'],
			[subCategory3ById.get(id(row.SubCategory3ID) ?? ''), 'subcategory3', 'SubCategory3Code', 'SubCategory3Name'],
		];
		for (const [subRow, kind, codeField, nameField] of subCategoryEntries) {
			if (!subRow) continue;
			const code = str(subRow[codeField]);
			if (!code) continue;
			categoryPath.push({ kind, code, name: str(subRow[nameField]) ?? code });
		}

		const unitCode = str(row.EUnit) ?? str(row.PUnit);
		products.push({
			productId,
			productCode,
			name: str(row.ProductName) ?? str(row.PrintOnInvoice) ?? productCode,
			printName: str(row.PrintOnInvoice),
			barcode: str(row.BarCode),
			supplierId: id(row.SupplierID),
			unitCode,
			unitName: unitCode ? unitNameByCode.get(unitCode.toUpperCase()) ?? unitCode : undefined,
			packSize: num(row.PackSize),
			categoryPath: categoryPath.length > 0 ? categoryPath : undefined,
			isActive: isLive(row),
			details: detailsByProduct.get(productId) ?? [],
		});
	}

	const variants: LegacySyncVariantRow[] = [];
	for (const row of colorSizeRows) {
		const colorSizeId = id(row.ProductColorSizeID);
		const productId = id(row.ProductID);
		if (!colorSizeId || !productId) continue;
		const colour = colourById.get(id(row.ColorID) ?? '');
		const size = sizeById.get(id(row.SizeID) ?? '');
		variants.push({
			productColorSizeId: colorSizeId,
			productId,
			colorSizeCode: str(row.ColorSizeCode),
			colorSizeName: str(row.ColorSizeName),
			colorCode: str(colour?.ColourCode),
			colorName: str(colour?.ColourName),
			sizeCode: str(size?.SizeCode),
			sizeName: str(size?.SizeName),
			isActive: isLive(row),
			details: detailsByColorSize.get(colorSizeId) ?? [],
		});
	}

	return { units, suppliers, locations, products, variants, warnings };
}
