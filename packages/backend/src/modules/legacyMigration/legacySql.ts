import fs from 'fs';
import type { PrismaClient } from '@prisma/client';

export type LegacyScalar = string | number | boolean | null;
export type LegacyRow = Record<string, LegacyScalar>;

export interface LegacyColumnDefinition {
	name: string;
	type: string;
	rawDefinition: string;
}

export interface LegacyTableDefinition {
	name: string;
	columns: LegacyColumnDefinition[];
}

export interface LegacySqlDump {
	tables: Record<string, LegacyTableDefinition>;
	rowsByTable: Record<string, LegacyRow[]>;
	tablesWithData?: string[];
}

export interface LegacySqlFileParseOptions {
	retainRowsForTables?: Iterable<string>;
	projectColumnsByTable?: Record<string, string[]>;
	knownTables?: Record<string, LegacyTableDefinition>;
	highWaterMark?: number;
}

export type LegacySupportLevel = 'full' | 'partial' | 'missing';

export interface LegacyImportDomain {
	key: string;
	label: string;
	sourceTables: string[];
	targetTables: string[];
	support: LegacySupportLevel;
	notes: string[];
}

export interface LegacyFeatureGap {
	key: string;
	label: string;
	sourceTables: string[];
	severity: 'high' | 'medium' | 'low';
	reason: string;
}

export interface LegacySchemaAnalysis {
	tableCount: number;
	dataTableCount: number;
	tablesWithData: string[];
	hasData: boolean;
	supportedSourceTables: string[];
	partiallySupportedSourceTables: string[];
	unsupportedSourceTables: string[];
	importableDomains: LegacyImportDomain[];
	missingDomains: LegacyFeatureGap[];
	notes: string[];
}

export interface LegacyInventorySnapshotOptions {
	fractionalQuantityMode?: 'preserve' | 'skip' | 'round';
}

export interface LegacyInventorySnapshot {
	source: 'stock' | 'productdetail' | 'purchasedetail';
	locationSourceId: string;
	productSourceId: string;
	productColorSizeSourceId?: string | null;
	supplierSourceId?: string;
	quantity: number;
	costPrice?: number;
	sellingPrice?: number;
	wholesalePrice?: number;
	bulkPrice?: number;
	expiryDate?: string;
	binLocation?: string;
	reference?: string;
}

export interface LegacyInventorySnapshotResult {
	items: LegacyInventorySnapshot[];
	skippedCount: number;
	warnings: string[];
}

export interface LegacySqlImportOptions extends LegacyInventorySnapshotOptions {
	defaultFloorCode?: string;
	defaultFloorName?: string;
	inventoryState?: string;
	importInventorySnapshot?: boolean;
}

export interface LegacySqlImportCounts {
	usersCreated: number;
	unitsCreated: number;
	vendorsCreated: number;
	branchesCreated: number;
	floorsCreated: number;
	categoriesCreated: number;
	attributesCreated: number;
	attributeValuesCreated: number;
	skuAttributesCreated: number;
	skusCreated: number;
	skuVendorLinksCreated: number;
	barcodesCreated: number;
	variantsCreated: number;
	variantValuesCreated: number;
	batchesCreated: number;
	grnsCreated: number;
	grnLinesCreated: number;
	stockTransfersCreated: number;
	stockTransferLinesCreated: number;
	inventoryEventsCreated: number;
	inventoryRecordsCreated: number;
	inventoryRecordsUpdated: number;
	inventoryRowsSkipped: number;
}

export interface LegacySqlImportResult {
	analysis: LegacySchemaAnalysis;
	counts: LegacySqlImportCounts;
	warnings: string[];
}

type SourceRowMaps = {
	departments: Map<string, LegacyRow>;
	categories: Map<string, LegacyRow>;
	subCategory1: Map<string, LegacyRow>;
	subCategory2: Map<string, LegacyRow>;
	subCategory3: Map<string, LegacyRow>;
	suppliers: Map<string, LegacyRow>;
	locations: Map<string, LegacyRow>;
	units: Map<string, LegacyRow>;
	products: Map<string, LegacyRow>;
	colours: Map<string, LegacyRow>;
	sizes: Map<string, LegacyRow>;
	productColorSizes: Map<string, LegacyRow>;
	productDetailByProduct: Map<string, LegacyRow[]>;
	productDetailByProductLocation: Map<string, LegacyRow>;
	productColorSizeDetailByVariantLocation: Map<string, LegacyRow>;
};

type CreatedCaches = {
	userByEmail: Map<string, string>;
	legacyUserByName: Map<string, string>;
	unitByKey: Map<string, { id: string; name: string; abbreviation: string }>;
	vendorBySourceId: Map<string, string>;
	branchBySourceId: Map<string, string>;
	floorByBranchId: Map<string, string>;
	categoryBySlug: Map<string, string>;
	skuBySourceId: Map<string, { id: string; skuCode: string }>;
	variantBySourceId: Map<string, { id: string; variantCode: string }>;
	attributeByName: Map<string, string>;
	attributeValueByKey: Map<string, string>;
	skuAttributeByKey: Map<string, string>;
	barcodeSet: Set<string>;
	batchByNumber: Map<string, string>;
	grnBySupplierInvoice: Set<string>;
	stockTransferByReference: Set<string>;
	inventoryEventParentIds: Set<string>;
};

const DIRECT_SUPPORT_LEVELS: Record<string, LegacySupportLevel> = {
	supplier: 'full',
	unitofmeasure: 'full',
	location: 'partial',
	department: 'partial',
	category: 'partial',
	subcategory1: 'partial',
	subcategory2: 'partial',
	subcategory3: 'partial',
	product: 'partial',
	productdetail: 'partial',
	colour: 'partial',
	size: 'partial',
	productcolorsize: 'partial',
	productcolorsizedetail: 'partial',
	stock: 'partial',
	purchaseheader: 'partial',
	purchasedetail: 'partial',
	transfernoteheader: 'partial',
	transfernotedetail: 'partial',
	adjustmentheader: 'partial',
	adjustmentdetail: 'partial',
	pricelink: 'partial',
	pricechangedetail: 'partial',
	pricechangegrnwise: 'partial',
	productserial: 'partial',
	company: 'missing',
	configurations: 'missing',
	customer: 'missing',
	customergroup: 'missing',
	customertransaction: 'missing',
	customerintake: 'missing',
	invoiceheader: 'missing',
	invoicedetail: 'missing',
	postransaction: 'missing',
	pospayment: 'missing',
	pospaymenttype: 'missing',
	pospaymentxsale: 'missing',
	promotion: 'missing',
	promotionbankbin: 'missing',
	promotionbuyx: 'missing',
	promotiongety: 'missing',
	promotionlocation: 'missing',
	promotionproduct: 'missing',
	loyaltycardmaster: 'missing',
	loyaltycustomer: 'missing',
	loyaltytransaction: 'missing',
	giftvoucher: 'missing',
	giftvoucherbook: 'missing',
	cashier: 'missing',
	cashiergroup: 'missing',
	cashierpermission: 'missing',
	usergroup: 'missing',
	usergroupprivilege: 'missing',
	userprivilege: 'missing',
	users: 'missing',
	warranty: 'missing',
	jobcard: 'missing',
	jobcardreport: 'missing',
	installmentheader: 'missing',
	installmentdetail: 'missing',
	payment: 'missing',
	paymentmode: 'missing',
	advancepayment: 'missing',
	advancetransaction: 'missing',
	creditnote: 'missing',
	creditnotesettlement: 'missing',
	chequedetail: 'missing',
	chequebookentry: 'missing',
	returnchequedetail: 'missing',
};

const IMPORTABLE_DOMAINS: LegacyImportDomain[] = [
	{
		key: 'vendors',
		label: 'Suppliers to Vendors',
		sourceTables: ['supplier'],
		targetTables: ['vendors'],
		support: 'full',
		notes: ['Supplier core data maps directly into the current vendor model.'],
	},
	{
		key: 'units',
		label: 'Units of Measure',
		sourceTables: ['unitofmeasure'],
		targetTables: ['units_of_measure'],
		support: 'full',
		notes: ['Legacy unit codes and names can be imported directly.'],
	},
	{
		key: 'branches',
		label: 'Locations to Branches',
		sourceTables: ['location'],
		targetTables: ['branches', 'floors'],
		support: 'partial',
		notes: [
			'Legacy locations become branches.',
			'The importer auto-creates one default floor per branch because the old schema has no floor/rack/box hierarchy.',
		],
	},
	{
		key: 'catalog',
		label: 'Departments, Categories, and Products',
		sourceTables: ['department', 'category', 'subcategory1', 'subcategory2', 'subcategory3', 'product', 'productdetail'],
		targetTables: ['categories', 'skus', 'product_barcodes', 'sku_vendors'],
		support: 'partial',
		notes: [
			'Department and category trees map into the recursive category table.',
			'Legacy product flags, Sinhala names, warranty references, and invoice-only labels are preserved only as free-text notes.',
		],
	},
	{
		key: 'variants',
		label: 'Color and Size Variants',
		sourceTables: ['colour', 'size', 'productcolorsize', 'productcolorsizedetail'],
		targetTables: ['attributes', 'attribute_values', 'sku_attributes', 'sku_variants', 'sku_variant_values'],
		support: 'partial',
		notes: [
			'Color and size rows map into the current global attribute system.',
			'Variant-specific price lists exist in the old schema but the current variant model has no dedicated price fields.',
		],
	},
	{
		key: 'inventory',
		label: 'Current Stock Snapshot',
		sourceTables: ['stock', 'productdetail', 'purchasedetail'],
		targetTables: ['batches', 'inventory_records'],
		support: 'partial',
		notes: [
			'The importer creates synthetic legacy batches so re-runs remain idempotent.',
			'When direct stock snapshot tables are empty, the importer can recover on-hand balances from legacy purchase-detail balances.',
			'Physical bin text from the old schema is not converted into shelves or boxes automatically.',
		],
	},
	{
		key: 'purchases',
		label: 'Purchasing History',
		sourceTables: ['purchaseheader', 'purchasedetail'],
		targetTables: ['grns', 'grn_lines', 'batches'],
		support: 'partial',
		notes: [
			'Purchase headers and details are imported as historical GRNs when products, suppliers, and delivery locations can be resolved.',
			'If purchase detail rows exist without matching purchase headers, the importer reconstructs best-effort GRNs from the detail rows.',
			'Legacy fractional line quantities are rounded with warnings because the current GRN line model still requires whole units.',
		],
	},
	{
		key: 'transfers',
		label: 'Transfer Notes',
		sourceTables: ['transfernoteheader', 'transfernotedetail'],
		targetTables: ['stock_transfers', 'stock_transfer_lines'],
		support: 'partial',
		notes: [
			'Transfer-note history is imported as stock transfer documents when source and destination locations resolve to current branches/floors.',
			'Legacy fractional line quantities are rounded with warnings because the current transfer line model still requires whole units.',
		],
	},
	{
		key: 'adjustments',
		label: 'Adjustment History',
		sourceTables: ['adjustmentheader', 'adjustmentdetail'],
		targetTables: ['inventory_events'],
		support: 'partial',
		notes: [
			'Legacy stock adjustments are preserved as inventory events with the raw legacy quantities and remarks in metadata.',
			'Adjustment rows are kept as historical audit entries and do not overwrite the imported stock snapshot.',
		],
	},
	{
		key: 'pricing',
		label: 'Pricing Data',
		sourceTables: ['productdetail', 'productcolorsizedetail', 'pricelink', 'pricechangedetail', 'pricechangegrnwise'],
		targetTables: ['skus', 'batches', 'pricing_overlays'],
		support: 'partial',
		notes: [
			'Base prices map into SKU defaults and synthetic batches.',
			'Legacy price-link and promotion logic does not have a one-to-one equivalent in the current pricing overlay system.',
		],
	},
];

const FEATURE_GAPS: LegacyFeatureGap[] = [
	{
		key: 'fractional-qty',
		label: 'Fractional Receiving, Returns, and Transfer Quantities',
		sourceTables: ['stock', 'productdetail', 'purchasedetail', 'invoicedetail', 'postransaction'],
		severity: 'high',
		reason: 'The current inventory model now supports decimals, but GRN, PRN, inspection, and stock transfer line quantities are still whole-unit only.',
	},
	{
		key: 'pos-sales',
		label: 'POS Sales, Receipts, and Payments',
		sourceTables: ['postransaction', 'pospayment', 'pospaymenttype', 'pospaymentxsale', 'invoiceheader', 'invoicedetail'],
		severity: 'high',
		reason: 'The current system has no sales transaction, receipt, or payment ledger domain yet.',
	},
	{
		key: 'customers',
		label: 'Customers and Customer Ledger',
		sourceTables: ['customer', 'customergroup', 'customertransaction', 'customerintake'],
		severity: 'high',
		reason: 'There is no customer, account balance, or receivables model in the current schema.',
	},
	{
		key: 'loyalty-promotions',
		label: 'Loyalty, Gift Vouchers, and Promotion Rules',
		sourceTables: ['promotion', 'promotionbankbin', 'promotionbuyx', 'promotiongety', 'promotionlocation', 'promotionproduct', 'loyaltycardmaster', 'loyaltycustomer', 'loyaltytransaction', 'giftvoucher', 'giftvoucherbook'],
		severity: 'high',
		reason: 'The current pricing overlay model does not cover loyalty ledgers, voucher books, bank-bin promotions, or buy-X-get-Y rules.',
	},
	{
		key: 'permissions',
		label: 'Cashier Profiles and Fine-Grained Privileges',
		sourceTables: ['cashier', 'cashiergroup', 'cashierpermission', 'usergroup', 'usergroupprivilege', 'userprivilege', 'users'],
		severity: 'medium',
		reason: 'The current app supports simple roles only, not user-right matrices or location-scoped cashier permissions.',
	},
	{
		key: 'company-settings',
		label: 'Company Profile and Legacy Configuration Flags',
		sourceTables: ['company', 'configurations'],
		severity: 'medium',
		reason: 'The current schema does not have a structured company profile or the old configuration flag surface.',
	},
	{
		key: 'serial-warranty-service',
		label: 'Serial Numbers, Warranty, and Service Job Cards',
		sourceTables: ['productserial', 'warranty', 'jobcard', 'jobcardreport'],
		severity: 'medium',
		reason: 'The current product and inventory models do not track serialised units, warranty masters, or repair jobs.',
	},
	{
		key: 'finance',
		label: 'Accounting and Cheque Workflows',
		sourceTables: ['payment', 'paymentmode', 'advancepayment', 'advancetransaction', 'creditnote', 'creditnotesettlement', 'chequedetail', 'chequebookentry', 'returnchequedetail'],
		severity: 'medium',
		reason: 'The current system has no accounting, cheque, or settlement subledger.',
	},
];

const STREAMED_IMPORT_ROW_COLUMNS: Record<string, string[]> = {
	unitofmeasure: [
		'UnitOfMeasureID',
		'UnitOfMeasureName',
		'UnitOfMeasureCode',
	],
	supplier: [
		'SupplierID',
		'SupplierName',
		'SupplierCode',
		'Email',
		'CreditPeriod',
		'ContactNo',
		'Phone1',
		'Phone2',
		'Phone3',
		'Address1',
		'Address2',
		'Address3',
		'Country',
		'WebSite',
		'VatNo',
		'NICNo',
		'AccountNo',
		'Branch',
		'PayeeName',
		'Reference',
	],
	location: [
		'LocationID',
		'LocationCode',
		'LocationName',
		'Address1',
		'Address2',
		'Address3',
		'ContactNo',
		'Phone1',
		'Phone2',
		'Phone3',
		'Email',
		'IsActive',
		'IsDelete',
	],
	department: [
		'DepartmentID',
		'DepartmentCode',
		'DepartmentName',
		'Remark',
	],
	category: [
		'CategoryID',
		'DepartmentID',
		'CategoryCode',
		'CategoryName',
		'Remark',
	],
	subcategory1: [
		'SubCategory1ID',
		'SubCategory1Code',
		'SubCategory1Name',
		'Remark',
	],
	subcategory2: [
		'SubCategory2ID',
		'SubCategory2Code',
		'SubCategory2Name',
		'Remark',
	],
	subcategory3: [
		'SubCategory3ID',
		'SubCategory3Code',
		'SubCategory3Name',
		'Remark',
	],
	product: [
		'ProductID',
		'SupplierID',
		'DepartmentID',
		'CategoryID',
		'SubCategory1ID',
		'SubCategory2ID',
		'SubCategory3ID',
		'ProductCode',
		'ProductName',
		'PrintOnInvoice',
		'ReferenceCode',
		'NameInSinhala',
		'IsBulkProduct',
		'IsBundleProduct',
		'IsCombinedProduct',
		'IsRowMaterialProduct',
		'IsUseReturnProduct',
		'IsNoLoyaltyPoint',
		'PUnit',
		'EUnit',
		'PackSize',
		'BarCode',
		'IsActive',
		'IsDelete',
	],
	productdetail: [
		'ProductDetailID',
		'ProductID',
		'LocationID',
		'Qty',
		'CostPrice',
		'SellingPrice',
		'WholeSalePrice',
		'SpecialPrice',
		'BinLocation',
		'CostCode',
		'ReOrderLevel',
		'DocumentDate',
		'CreatedDate',
		'ModifiedDate',
	],
	colour: [
		'ColourID',
		'ColourName',
		'ColourCode',
	],
	size: [
		'SizeID',
		'SizeName',
		'SizeCode',
	],
	productcolorsize: [
		'ProductColorSizeID',
		'ProductID',
		'ColorID',
		'SizeID',
		'ColorSizeCode',
		'ColorSizeName',
		'IsActive',
		'IsDelete',
	],
	productcolorsizedetail: [
		'ProductColorSizeID',
		'LocationID',
		'CostPrice',
		'SellingPrice',
		'WholeSalePrice',
		'SpecialPrice',
	],
	purchaseheader: [
		'PurchaseHeaderID',
		'LocationID',
		'DocumentID',
		'DocumentNo',
		'ReferenceNo',
		'PurchaseDate',
		'DeliveryDate',
		'SupplierID',
		'PurchaseTypeID',
		'PaymentModeID',
		'Qty',
		'GrossAmount',
		'DiscountPercentage',
		'DiscountAmount',
		'SubTotalDiscount',
		'Tax',
		'NetAmount',
		'RefAmount',
		'Advance',
		'Returns',
		'Balance',
		'Status',
		'CreatedDate',
		'CreatedUser',
		'BalanceTOG',
		'IsTaxUser',
		'TaxDocumentNo',
		'DeliveryLocationID',
		'OtherCharges',
		'SellingValue',
		'IsUpdateAccount',
	],
	purchasedetail: [
		'PurchaseDetailID',
		'PurchaseHeaderID',
		'RowNo',
		'LocationID',
		'DocumentID',
		'DocumentNo',
		'ReferenceNo',
		'PurchaseDate',
		'SupplierID',
		'ProductID',
		'CostPrice',
		'UnitPrice',
		'SellingPrice',
		'Qty',
		'Balance',
		'Status',
		'ExpiryDate',
		'CreatedDate',
		'FreeQty',
		'ProductColorSizeID',
		'FreeBalance',
	],
	transfernoteheader: [
		'TransferNoteHeaderID',
		'LocationID',
		'DocumentID',
		'DocumentNo',
		'DocumentDate',
		'ToLocationID',
		'ReferenceNo',
		'Qty',
		'TotalCostValue',
		'TotalSellingValue',
		'Status',
		'Accepted',
		'AcceptedDate',
		'AcceptedBy',
		'CreatedDate',
		'CreatedUser',
		'TransferType',
		'GRNNo',
		'IsTaxUser',
	],
	transfernotedetail: [
		'TransferNoteDetailID',
		'RowNo',
		'LocationID',
		'DocumentID',
		'DocumentNo',
		'DocumentDate',
		'ToLocationID',
		'SupplierID',
		'ProductID',
		'CostPrice',
		'SellingPrice',
		'Qty',
		'Status',
		'ExpectedDate',
		'AcceptedQty',
		'CreatedDate',
		'CreatedUser',
		'FreeQty',
		'ProductColorSizeID',
		'ExpiryDate',
	],
	adjustmentheader: [
		'AdjustmentHeaderID',
		'LocationID',
		'DocumentNo',
		'DocumentID',
		'AdjustmentMode',
		'ReferenceNo',
		'DocumentDate',
		'TotalQty',
		'TotalCostValue',
		'TotalSellingValue',
		'Status',
		'AdjustmentRemark',
		'CreatedDate',
		'CreatedUser',
	],
	adjustmentdetail: [
		'AdjustmentDetailID',
		'RowNo',
		'LocationID',
		'DocumentNo',
		'DocumentID',
		'ReferenceNo',
		'DocumentDate',
		'SupplierID',
		'ProductID',
		'CostPrice',
		'SellingPrice',
		'Qty',
		'Status',
		'CreatedDate',
		'CreatedUser',
		'AdjustmentHeaderID',
		'ExpiryDate',
		'ProductColorSizeID',
	],
	stock: [
		'StockID',
		'LocationID',
		'ProductID',
		'ProductColorSizeID',
		'Balance',
		'Qty',
		'FreeQty',
		'CostPrice',
		'SellingPrice',
		'ExpiryDate',
		'ReferenceNo',
		'DocumentNo',
		'DocumentDate',
		'CreatedDate',
		'ModifiedDate',
	],
};

function normalizeSql(sql: string) {
	return sql.replace(/\r\n/g, '\n');
}

function normalizeLookup(value: LegacyScalar | undefined) {
	return String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function slugify(value: string) {
	return normalizeLookup(value).replace(/\s+/g, '-');
}

function compactString(value: LegacyScalar | undefined) {
	if (value === null || value === undefined) return undefined;
	const text = String(value).trim();
	return text.length > 0 ? text : undefined;
}

function asId(value: LegacyScalar | undefined) {
	const text = compactString(value);
	if (!text || text === '0') return undefined;
	return text;
}

function asNumber(value: LegacyScalar | undefined) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'boolean') return value ? 1 : 0;
	const text = compactString(value);
	if (!text) return undefined;
	const parsed = Number(text.replace(/,/g, ''));
	return Number.isFinite(parsed) ? parsed : undefined;
}

function asInteger(value: LegacyScalar | undefined) {
	const parsed = asNumber(value);
	if (parsed === undefined) return undefined;
	return Math.round(parsed);
}

function asBoolean(value: LegacyScalar | undefined) {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	const text = compactString(value);
	if (!text) return undefined;
	if (text === '1' || text.toLowerCase() === 'true') return true;
	if (text === '0' || text.toLowerCase() === 'false') return false;
	return undefined;
}

function asDateString(value: LegacyScalar | undefined) {
	const text = compactString(value);
	if (!text) return undefined;
	const normalized = text.includes('T') ? text : text.replace(' ', 'T');
	const date = new Date(normalized);
	if (Number.isNaN(date.getTime())) return undefined;
	return date.toISOString().slice(0, 10);
}

function asDate(value: LegacyScalar | undefined) {
	const text = compactString(value);
	if (!text) return undefined;
	const normalized = text.includes('T') ? text : text.replace(' ', 'T');
	const date = new Date(normalized);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildLegacyImportUserEmail(username?: string) {
	const slug = slugify(username ?? 'legacy-import') || 'legacy-import';
	return `${slug}@legacy-import.local`;
}

function normalizeDocumentQuantity(
	quantity: number | undefined,
	label: string,
	warnings: string[],
) {
	if (quantity === undefined || !Number.isFinite(quantity)) return undefined;
	if (Number.isInteger(quantity)) return quantity;
	const rounded = Math.round(quantity);
	warnings.push(`${label} had fractional quantity ${quantity}. It was rounded to ${rounded} because the current document models require whole units.`);
	return rounded;
}

function joinParts(parts: Array<LegacyScalar | undefined>, separator = ', ') {
	const values = parts.map(compactString).filter((value): value is string => Boolean(value));
	return values.length > 0 ? values.join(separator) : undefined;
}

function unique<T>(items: T[]) {
	return Array.from(new Set(items));
}

function parseColumnList(segment: string) {
	const matches = segment.match(/`([^`]+)`/g) ?? [];
	return matches.map((match) => match.slice(1, -1));
}

function parseCreateTableStatement(statement: string) {
	const normalized = statement.replace(/\r\n/g, '\n');
	const createMatch = normalized.match(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\)\s*ENGINE=/i);
	if (!createMatch) return undefined;

	const tableName = createMatch[1];
	const body = createMatch[2];
	const columns: LegacyColumnDefinition[] = [];

	for (const line of body.split('\n')) {
		const match = line.match(/^\s*`([^`]+)`\s+(.+?)(?:,)?$/);
		if (!match) continue;
		const rawDefinition = match[2].trim();
		columns.push({
			name: match[1],
			type: rawDefinition.split(/\s+/)[0].toLowerCase(),
			rawDefinition,
		});
	}

	return { name: tableName, columns } satisfies LegacyTableDefinition;
}

export function getLegacyImportFileParseOptions(): LegacySqlFileParseOptions {
	return {
		retainRowsForTables: Object.keys(STREAMED_IMPORT_ROW_COLUMNS),
		projectColumnsByTable: STREAMED_IMPORT_ROW_COLUMNS,
	};
}

async function collectLegacySqlFileTables(filePath: string, highWaterMark: number) {
	const tables: Record<string, LegacyTableDefinition> = {};
	type ScanMode = 'prefix' | 'lineComment' | 'blockComment' | 'generic' | 'create';

	let mode: ScanMode = 'prefix';
	let prefixBuffer = '';
	let statementBuffer = '';
	let statementInString = false;
	let statementEscaped = false;
	let blockCommentTail = '';

	function resetStatementState() {
		statementBuffer = '';
		statementInString = false;
		statementEscaped = false;
	}

	const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark });

	for await (const chunk of stream) {
		for (let index = 0; index < chunk.length; index += 1) {
			const char = chunk[index];

			if (mode === 'lineComment') {
				if (char === '\n') {
					mode = 'prefix';
					prefixBuffer = '';
				}
				continue;
			}

			if (mode === 'blockComment') {
				blockCommentTail = `${blockCommentTail}${char}`.slice(-2);
				if (blockCommentTail === '*/') {
					mode = 'prefix';
					prefixBuffer = '';
					blockCommentTail = '';
				}
				continue;
			}

			if (mode === 'generic' || mode === 'create') {
				statementBuffer += char;

				if (statementInString) {
					if (statementEscaped) {
						statementEscaped = false;
					} else if (char === '\\') {
						statementEscaped = true;
					} else if (char === '\'') {
						statementInString = false;
					}
					continue;
				}

				if (char === '\'') {
					statementInString = true;
					continue;
				}

				if (char === ';') {
					if (mode === 'create') {
						const table = parseCreateTableStatement(statementBuffer);
						if (table) {
							tables[table.name] = table;
						}
					}
					mode = 'prefix';
					prefixBuffer = '';
					resetStatementState();
				}
				continue;
			}

			prefixBuffer += char;
			const trimmed = prefixBuffer.trimStart();

			if (trimmed.length === 0) {
				continue;
			}

			if (trimmed.startsWith('--')) {
				mode = 'lineComment';
				prefixBuffer = '';
				continue;
			}

			if (trimmed.startsWith('/*') && !trimmed.startsWith('/*!')) {
				mode = 'blockComment';
				blockCommentTail = trimmed.slice(-2);
				prefixBuffer = '';
				continue;
			}

			if (/^\s*CREATE TABLE /i.test(prefixBuffer)) {
				mode = 'create';
				statementBuffer = prefixBuffer;
				prefixBuffer = '';
				statementInString = false;
				statementEscaped = false;
				continue;
			}

			if (/^\s*INSERT INTO /i.test(prefixBuffer)) {
				mode = 'generic';
				statementBuffer = prefixBuffer;
				prefixBuffer = '';
				statementInString = false;
				statementEscaped = false;
				continue;
			}

			if (char === ';') {
				prefixBuffer = '';
				continue;
			}

			if (prefixBuffer.length > 64) {
				mode = 'generic';
				statementBuffer = prefixBuffer;
				prefixBuffer = '';
				statementInString = false;
				statementEscaped = false;
			}
		}
	}

	if (mode === 'create' || mode === 'generic' || mode === 'blockComment') {
		throw new Error('The SQL file ended before the current statement was complete. Wait until the upload finishes before analyzing or importing it.');
	}

	return tables;
}

export async function parseLegacySqlDumpFile(
	filePath: string,
	options: LegacySqlFileParseOptions = {},
): Promise<LegacySqlDump> {
	const highWaterMark = options.highWaterMark ?? 1024 * 1024;
	const tables = options.knownTables
		? { ...options.knownTables }
		: await collectLegacySqlFileTables(filePath, highWaterMark);
	const rowsByTable: Record<string, LegacyRow[]> = {};
	const tablesWithData = new Set<string>();
	const retainRowsForTables = new Set(Array.from(options.retainRowsForTables ?? []));
	const projectedColumnSets = new Map(
		Object.entries(options.projectColumnsByTable ?? {}).map(([tableName, columns]) => [tableName, new Set(columns)]),
	);

	type StreamMode = 'prefix' | 'lineComment' | 'blockComment' | 'generic' | 'create' | 'insertHeader' | 'insertBody';
	type ActiveInsert = {
		tableName: string;
		columns: string[];
		projectedColumns?: Set<string>;
		retainRows: boolean;
		depth: number;
		inString: boolean;
		escaped: boolean;
		currentFieldIndex: number;
		currentToken: string;
		currentRow: LegacyRow;
	};

	let mode: StreamMode = 'prefix';
	let prefixBuffer = '';
	let statementBuffer = '';
	let statementInString = false;
	let statementEscaped = false;
	let headerBuffer = '';
	let blockCommentTail = '';
	let activeInsert: ActiveInsert | null = null;

	function resetStatementState() {
		statementBuffer = '';
		statementInString = false;
		statementEscaped = false;
	}

	function captureCurrentField(insert: ActiveInsert) {
		if (!insert.retainRows) return false;
		const columnName = insert.columns[insert.currentFieldIndex];
		if (!columnName) return false;
		return insert.projectedColumns ? insert.projectedColumns.has(columnName) : true;
	}

	function finalizeInsertField(insert: ActiveInsert) {
		if (!captureCurrentField(insert)) {
			insert.currentToken = '';
			return;
		}

		const columnName = insert.columns[insert.currentFieldIndex];
		if (!columnName) {
			insert.currentToken = '';
			return;
		}

		insert.currentRow[columnName] = parseSqlValue(insert.currentToken.trim() || 'NULL');
		insert.currentToken = '';
	}

	function finalizeInsertRow(insert: ActiveInsert) {
		if (!insert.retainRows) return;
		rowsByTable[insert.tableName] = rowsByTable[insert.tableName] ?? [];
		rowsByTable[insert.tableName].push(insert.currentRow);
	}

	function processInsertBodyChar(char: string) {
		const insert = activeInsert;
		if (!insert) return;

		if (insert.inString) {
			if (captureCurrentField(insert)) {
				insert.currentToken += char;
			}
			if (insert.escaped) {
				insert.escaped = false;
				return;
			}
			if (char === '\\') {
				insert.escaped = true;
				return;
			}
			if (char === '\'') {
				insert.inString = false;
			}
			return;
		}

		if (char === '\'') {
			insert.inString = true;
			if (captureCurrentField(insert)) {
				insert.currentToken += char;
			}
			return;
		}

		if (char === '(') {
			if (insert.depth === 0) {
				insert.depth = 1;
				insert.currentFieldIndex = 0;
				insert.currentToken = '';
				insert.currentRow = {};
				return;
			}
			insert.depth += 1;
			if (captureCurrentField(insert)) {
				insert.currentToken += char;
			}
			return;
		}

		if (char === ')') {
			if (insert.depth === 1) {
				finalizeInsertField(insert);
				finalizeInsertRow(insert);
				insert.depth = 0;
				insert.currentFieldIndex = 0;
				insert.currentToken = '';
				insert.currentRow = {};
				return;
			}

			if (insert.depth > 1) {
				insert.depth -= 1;
				if (captureCurrentField(insert)) {
					insert.currentToken += char;
				}
			}
			return;
		}

		if (char === ',' && insert.depth === 1) {
			finalizeInsertField(insert);
			insert.currentFieldIndex += 1;
			insert.currentToken = '';
			return;
		}

		if (char === ';' && insert.depth === 0) {
			activeInsert = null;
			mode = 'prefix';
			return;
		}

		if (insert.depth > 0 && captureCurrentField(insert)) {
			insert.currentToken += char;
		}
	}

	const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark });

	for await (const chunk of stream) {
		for (let index = 0; index < chunk.length; index += 1) {
			const char = chunk[index];

			if (mode === 'lineComment') {
				if (char === '\n') {
					mode = 'prefix';
					prefixBuffer = '';
				}
				continue;
			}

			if (mode === 'blockComment') {
				blockCommentTail = `${blockCommentTail}${char}`.slice(-2);
				if (blockCommentTail === '*/') {
					mode = 'prefix';
					prefixBuffer = '';
					blockCommentTail = '';
				}
				continue;
			}

			if (mode === 'generic' || mode === 'create') {
				statementBuffer += char;

				if (statementInString) {
					if (statementEscaped) {
						statementEscaped = false;
					} else if (char === '\\') {
						statementEscaped = true;
					} else if (char === '\'') {
						statementInString = false;
					}
					continue;
				}

				if (char === '\'') {
					statementInString = true;
					continue;
				}

				if (char === ';') {
					if (mode === 'create') {
						const table = parseCreateTableStatement(statementBuffer);
						if (table) {
							tables[table.name] = table;
						}
					}
					mode = 'prefix';
					prefixBuffer = '';
					resetStatementState();
				}
				continue;
			}

			if (mode === 'insertHeader') {
				headerBuffer += char;

				if (char === '(') {
					const candidateHeader = headerBuffer.slice(0, -1);
					const match = candidateHeader.match(/^\s*INSERT INTO `([^`]+)`(?: \(([\s\S]*?)\))? VALUES\s*$/i);
					if (match) {
						const tableName = match[1];
						const explicitColumns = match[2] ? parseColumnList(match[2]) : undefined;
						const columns = explicitColumns ?? tables[tableName]?.columns.map((column) => column.name) ?? [];
						const retainRows = retainRowsForTables.has(tableName);

						if (retainRows && columns.length === 0) {
							throw new Error(`Cannot stream rows for table "${tableName}" before its CREATE TABLE definition is available.`);
						}

						tablesWithData.add(tableName);
						activeInsert = {
							tableName,
							columns,
							projectedColumns: projectedColumnSets.get(tableName),
							retainRows,
							depth: 0,
							inString: false,
							escaped: false,
							currentFieldIndex: 0,
							currentToken: '',
							currentRow: {},
						};
						headerBuffer = '';
						mode = 'insertBody';
						processInsertBodyChar(char);
					}
				}
				continue;
			}

			if (mode === 'insertBody') {
				processInsertBodyChar(char);
				continue;
			}

			prefixBuffer += char;
			const trimmed = prefixBuffer.trimStart();

			if (trimmed.length === 0) {
				continue;
			}

			if (trimmed.startsWith('--')) {
				mode = 'lineComment';
				prefixBuffer = '';
				continue;
			}

			if (trimmed.startsWith('/*') && !trimmed.startsWith('/*!')) {
				mode = 'blockComment';
				blockCommentTail = trimmed.slice(-2);
				prefixBuffer = '';
				continue;
			}

			if (/^\s*CREATE TABLE /i.test(prefixBuffer)) {
				mode = 'create';
				statementBuffer = prefixBuffer;
				prefixBuffer = '';
				statementInString = false;
				statementEscaped = false;
				continue;
			}

			if (/^\s*INSERT INTO /i.test(prefixBuffer)) {
				mode = 'insertHeader';
				headerBuffer = prefixBuffer;
				prefixBuffer = '';
				continue;
			}

			if (char === ';') {
				prefixBuffer = '';
				continue;
			}

			if (prefixBuffer.length > 64) {
				mode = 'generic';
				statementBuffer = prefixBuffer;
				prefixBuffer = '';
				statementInString = false;
				statementEscaped = false;
			}
		}
	}

	if (mode === 'create' || mode === 'generic' || mode === 'insertHeader' || mode === 'insertBody' || mode === 'blockComment') {
		throw new Error('The SQL file ended before the current statement was complete. Wait until the upload finishes before analyzing or importing it.');
	}

	return {
		tables,
		rowsByTable,
		tablesWithData: Array.from(tablesWithData),
	};
}

function extractInsertStatements(sql: string) {
	const statements: string[] = [];
	const marker = 'INSERT INTO `';
	let start = sql.indexOf(marker);

	while (start !== -1) {
		let index = start;
		let inString = false;
		let escaped = false;

		while (index < sql.length) {
			const char = sql[index];
			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (char === '\\') {
					escaped = true;
				} else if (char === '\'') {
					inString = false;
				}
			} else if (char === '\'') {
				inString = true;
			} else if (char === ';') {
				statements.push(sql.slice(start, index + 1));
				break;
			}
			index += 1;
		}

		start = sql.indexOf(marker, index + 1);
	}

	return statements;
}

function splitValueTuples(valuesSegment: string) {
	const tuples: string[] = [];
	let tupleStart = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = 0; index < valuesSegment.length; index += 1) {
		const char = valuesSegment[index];

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '\'') {
				inString = false;
			}
			continue;
		}

		if (char === '\'') {
			inString = true;
			continue;
		}

		if (char === '(') {
			if (depth === 0) tupleStart = index;
			depth += 1;
			continue;
		}

		if (char === ')') {
			depth -= 1;
			if (depth === 0 && tupleStart !== -1) {
				tuples.push(valuesSegment.slice(tupleStart, index + 1));
				tupleStart = -1;
			}
		}
	}

	return tuples;
}

function splitTupleValues(tuple: string) {
	const values: string[] = [];
	let current = '';
	let inString = false;
	let escaped = false;

	for (let index = 1; index < tuple.length - 1; index += 1) {
		const char = tuple[index];

		if (inString) {
			current += char;
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '\'') {
				inString = false;
			}
			continue;
		}

		if (char === '\'') {
			inString = true;
			current += char;
			continue;
		}

		if (char === ',') {
			values.push(current.trim());
			current = '';
			continue;
		}

		current += char;
	}

	values.push(current.trim());
	return values;
}

function unescapeMysqlString(value: string) {
	return value
		.replace(/\\\\/g, '\\')
		.replace(/\\'/g, '\'')
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\t/g, '\t')
		.replace(/\\"/g, '"')
		.replace(/\\0/g, '\0');
}

function parseSqlValue(token: string): LegacyScalar {
	if (token === 'NULL') return null;
	if (token.startsWith('\'') && token.endsWith('\'')) {
		return unescapeMysqlString(token.slice(1, -1));
	}

	if (/^0x[0-9a-f]+$/i.test(token)) {
		return token;
	}

	if (/^-?\d+(\.\d+)?$/.test(token)) {
		if (token.includes('.')) return Number(token);
		const parsed = Number(token);
		return Number.isSafeInteger(parsed) ? parsed : token;
	}

	return token;
}

function buildRowMap(rows: LegacyRow[], key: string) {
	const map = new Map<string, LegacyRow>();
	for (const row of rows) {
		const sourceId = asId(row[key]);
		if (!sourceId) continue;
		map.set(sourceId, row);
	}
	return map;
}

function groupRows(rows: LegacyRow[], keyBuilder: (row: LegacyRow) => string | undefined) {
	const map = new Map<string, LegacyRow[]>();
	for (const row of rows) {
		const key = keyBuilder(row);
		if (!key) continue;
		const current = map.get(key);
		if (current) {
			current.push(row);
			continue;
		}
		map.set(key, [row]);
	}
	return map;
}

function getFreshnessScore(row: LegacyRow, idKeys: string[]) {
	const dateValue = asDateString(row.DocumentDate)
		?? asDateString(row.CreatedDate)
		?? asDateString(row.ModifiedDate)
		?? '1970-01-01';
	const dateScore = new Date(`${dateValue}T00:00:00.000Z`).getTime();

	for (const key of idKeys) {
		const idValue = asNumber(row[key]);
		if (idValue !== undefined) {
			return dateScore * 1_000_000 + idValue;
		}
	}

	return dateScore;
}

function humanizeCountKey(key: keyof LegacySqlImportCounts) {
	return key
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function composeCategorySlug(parentSlug: string | undefined, segmentSlug: string) {
	return parentSlug ? `${parentSlug}--${segmentSlug}` : segmentSlug;
}

function detectUnitType(name: string) {
	const key = normalizeLookup(name);
	if (key.includes('kg') || key.includes('gram') || key.includes('g ')) return 'Weight';
	if (key.includes('liter') || key.includes('litre') || key.includes('l ') || key === 'ml' || key.includes('milliliter')) return 'Volume';
	if (key.includes('meter') || key.includes('centimeter') || key === 'm' || key === 'cm') return 'Length';
	if (key.includes('piece') || key.includes('pack') || key.includes('box') || key.includes('unit')) return 'Count';
	return 'Other';
}

function detectBarcodeType(barcode: string) {
	const digitsOnly = /^\d+$/.test(barcode);
	if (digitsOnly && barcode.length === 13) return 'EAN13';
	if (digitsOnly && barcode.length === 12) return 'UPC';
	return 'Custom';
}

function buildLegacyNotes(parts: Array<string | undefined>) {
	const values = parts.filter((value): value is string => Boolean(value));
	return values.length > 0 ? values.join('\n') : undefined;
}

function zeroCounts(): LegacySqlImportCounts {
	return {
		usersCreated: 0,
		unitsCreated: 0,
		vendorsCreated: 0,
		branchesCreated: 0,
		floorsCreated: 0,
		categoriesCreated: 0,
		attributesCreated: 0,
		attributeValuesCreated: 0,
		skuAttributesCreated: 0,
		skusCreated: 0,
		skuVendorLinksCreated: 0,
		barcodesCreated: 0,
		variantsCreated: 0,
		variantValuesCreated: 0,
		batchesCreated: 0,
		grnsCreated: 0,
		grnLinesCreated: 0,
		stockTransfersCreated: 0,
		stockTransferLinesCreated: 0,
		inventoryEventsCreated: 0,
		inventoryRecordsCreated: 0,
		inventoryRecordsUpdated: 0,
		inventoryRowsSkipped: 0,
	};
}

export function parseLegacySqlDump(rawSql: string): LegacySqlDump {
	const sql = normalizeSql(rawSql);
	const tables: Record<string, LegacyTableDefinition> = {};
	const rowsByTable: Record<string, LegacyRow[]> = {};

	const createTableRegex = /CREATE TABLE `([^`]+)` \(([\s\S]*?)\)\s*ENGINE=/g;
	let createMatch = createTableRegex.exec(sql);

	while (createMatch) {
		const tableName = createMatch[1];
		const body = createMatch[2];
		const columns: LegacyColumnDefinition[] = [];

		for (const line of body.split('\n')) {
			const match = line.match(/^\s*`([^`]+)`\s+(.+?)(?:,)?$/);
			if (!match) continue;
			const rawDefinition = match[2].trim();
			columns.push({
				name: match[1],
				type: rawDefinition.split(/\s+/)[0].toLowerCase(),
				rawDefinition,
			});
		}

		tables[tableName] = { name: tableName, columns };
		createMatch = createTableRegex.exec(sql);
	}

	for (const statement of extractInsertStatements(sql)) {
		const headerMatch = statement.match(/^INSERT INTO `([^`]+)`(?: \(([\s\S]*?)\))? VALUES\s*/i);
		if (!headerMatch) continue;

		const tableName = headerMatch[1];
		const explicitColumns = headerMatch[2] ? parseColumnList(headerMatch[2]) : undefined;
		const table = tables[tableName];
		const valuesSegment = statement.slice(headerMatch[0].length, -1);
		const tuples = splitValueTuples(valuesSegment);
		const columns = explicitColumns ?? table?.columns.map((column) => column.name) ?? [];

		if (columns.length === 0) continue;
		rowsByTable[tableName] = rowsByTable[tableName] ?? [];

		for (const tuple of tuples) {
			const rawValues = splitTupleValues(tuple);
			const row: LegacyRow = {};
			for (let index = 0; index < columns.length; index += 1) {
				row[columns[index]] = parseSqlValue(rawValues[index] ?? 'NULL');
			}
			rowsByTable[tableName].push(row);
		}
	}

	return { tables, rowsByTable };
}

export function buildLegacySchemaAnalysis(dump: LegacySqlDump): LegacySchemaAnalysis {
	const tableNames = Object.keys(dump.tables).sort();
	const dataTableSet = dump.tablesWithData
		? new Set(dump.tablesWithData.filter((name) => dump.tables[name]))
		: new Set(tableNames.filter((name) => (dump.rowsByTable[name]?.length ?? 0) > 0));
	const tablesWithData = Array.from(dataTableSet).sort();
	const supportedSourceTables = tableNames.filter((name) => DIRECT_SUPPORT_LEVELS[name] === 'full');
	const partiallySupportedSourceTables = tableNames.filter((name) => DIRECT_SUPPORT_LEVELS[name] === 'partial');
	const unsupportedSourceTables = tableNames.filter((name) => !DIRECT_SUPPORT_LEVELS[name] || DIRECT_SUPPORT_LEVELS[name] === 'missing');
	const notes: string[] = [];

	if (tablesWithData.length === 0) {
		notes.push('This SQL file contains schema definitions only. There are no `INSERT INTO` statements to populate the current database yet.');
	}

	if (tableNames.some((name) => ['stock', 'productdetail', 'purchasedetail', 'invoicedetail', 'postransaction'].includes(name))) {
		notes.push('The legacy system stores quantities as decimals. Inventory quantities now support decimals, but receiving, returns, and transfer workflows are still whole-unit only.');
	}

	if (tableNames.includes('location')) {
		notes.push('Legacy locations will import as branches with one default floor each because the old schema does not include floors, racks, shelves, or boxes.');
	}

	if (tableNames.includes('productdetail')) {
		notes.push('Legacy `BinLocation` values are plain text. The importer preserves stock at floor level and does not auto-build a physical shelf layout from those labels.');
	}

	return {
		tableCount: tableNames.length,
		dataTableCount: tablesWithData.length,
		tablesWithData,
		hasData: tablesWithData.length > 0,
		supportedSourceTables,
		partiallySupportedSourceTables,
		unsupportedSourceTables,
		importableDomains: IMPORTABLE_DOMAINS.filter((domain) => domain.sourceTables.some((table) => tableNames.includes(table))),
		missingDomains: FEATURE_GAPS.filter((gap) => gap.sourceTables.some((table) => tableNames.includes(table))),
		notes,
	};
}

export function buildLegacyInventorySnapshots(
	dump: LegacySqlDump,
	options: LegacyInventorySnapshotOptions = {},
): LegacyInventorySnapshotResult {
	const warnings: string[] = [];
	let skippedCount = 0;
	const mode = options.fractionalQuantityMode ?? 'preserve';
	const rowsByTable = dump.rowsByTable;
	const stockRows = rowsByTable.stock ?? [];
	const productDetailRows = rowsByTable.productdetail ?? [];
	const purchaseDetailRows = rowsByTable.purchasedetail ?? [];
	const items: LegacyInventorySnapshot[] = [];

	function normalizeQuantity(quantity: number, label: string) {
		if (Number.isInteger(quantity) || mode === 'preserve') return quantity;
		if (mode === 'round') {
			const rounded = Math.round(quantity);
			warnings.push(`${label} had fractional quantity ${quantity}. It was rounded to ${rounded}.`);
			return rounded;
		}
		warnings.push(`${label} had fractional quantity ${quantity}. It was skipped because fractional quantity import is configured to skip decimals.`);
		skippedCount += 1;
		return undefined;
	}

	if (stockRows.length > 0) {
		const latestByKey = new Map<string, { row: LegacyRow; quantity: number }>();

		for (const row of stockRows) {
			const locationSourceId = asId(row.LocationID);
			const productSourceId = asId(row.ProductID);
			if (!locationSourceId || !productSourceId) continue;

			const baseQuantity = asNumber(row.Balance) ?? asNumber(row.Qty);
			if (baseQuantity === undefined || baseQuantity <= 0) continue;
			const freeQuantity = Math.max(asNumber(row.FreeQty) ?? 0, 0);
			const normalized = normalizeQuantity(baseQuantity + freeQuantity, `Stock row ${asId(row.StockID) ?? 'unknown'}`);
			if (normalized === undefined || normalized <= 0) continue;

			const key = [
				locationSourceId,
				productSourceId,
				asId(row.ProductColorSizeID) ?? 'base',
				asDateString(row.ExpiryDate) ?? 'no-expiry',
				String(asNumber(row.CostPrice) ?? ''),
				String(asNumber(row.SellingPrice) ?? ''),
			].join('|');
			const current = latestByKey.get(key);
			if (!current || getFreshnessScore(row, ['StockID']) > getFreshnessScore(current.row, ['StockID'])) {
				latestByKey.set(key, { row, quantity: normalized });
			}
		}

		for (const { row, quantity } of latestByKey.values()) {
			items.push({
				source: 'stock',
				locationSourceId: asId(row.LocationID)!,
				productSourceId: asId(row.ProductID)!,
				productColorSizeSourceId: asId(row.ProductColorSizeID) ?? null,
				quantity,
				costPrice: asNumber(row.CostPrice),
				sellingPrice: asNumber(row.SellingPrice),
				expiryDate: asDateString(row.ExpiryDate),
				reference: compactString(row.ReferenceNo) ?? compactString(row.DocumentNo),
			});
		}

		return { items, skippedCount, warnings };
	}

	const latestByKey = new Map<string, LegacyRow>();

	for (const row of productDetailRows) {
		const locationSourceId = asId(row.LocationID);
		const productSourceId = asId(row.ProductID);
		if (!locationSourceId || !productSourceId) continue;
		const quantity = asNumber(row.Qty);
		if (quantity === undefined || quantity <= 0) continue;

		const key = `${locationSourceId}|${productSourceId}`;
		const current = latestByKey.get(key);
		if (!current || getFreshnessScore(row, ['ProductDetailID']) > getFreshnessScore(current, ['ProductDetailID'])) {
			latestByKey.set(key, row);
		}
	}

	for (const row of latestByKey.values()) {
		const quantity = asNumber(row.Qty);
		if (quantity === undefined || quantity <= 0) continue;
		const normalized = normalizeQuantity(quantity, `Product detail ${asId(row.ProductDetailID) ?? 'unknown'}`);
		if (normalized === undefined || normalized <= 0) continue;

		items.push({
			source: 'productdetail',
			locationSourceId: asId(row.LocationID)!,
			productSourceId: asId(row.ProductID)!,
			quantity: normalized,
			costPrice: asNumber(row.CostPrice),
			sellingPrice: asNumber(row.SellingPrice),
			wholesalePrice: asNumber(row.WholeSalePrice),
			bulkPrice: asNumber(row.SpecialPrice),
			binLocation: compactString(row.BinLocation),
			reference: compactString(row.CostCode),
		});
	}

	if (items.length > 0) {
		return { items, skippedCount, warnings };
	}

	for (const row of purchaseDetailRows) {
		const locationSourceId = asId(row.LocationID);
		const productSourceId = asId(row.ProductID);
		if (!locationSourceId || !productSourceId) continue;

		const quantityRaw = (asNumber(row.Balance) ?? 0) + Math.max(asNumber(row.FreeBalance) ?? 0, 0);
		if (quantityRaw <= 0) continue;
		const normalized = normalizeQuantity(
			quantityRaw,
			`Purchase detail ${asId(row.PurchaseDetailID) ?? 'unknown'} balance`,
		);
		if (normalized === undefined || normalized <= 0) continue;

		items.push({
			source: 'purchasedetail',
			locationSourceId,
			productSourceId,
			productColorSizeSourceId: asId(row.ProductColorSizeID) ?? null,
			supplierSourceId: asId(row.SupplierID),
			quantity: normalized,
			costPrice: asNumber(row.CostPrice),
			sellingPrice: asNumber(row.SellingPrice) ?? asNumber(row.UnitPrice),
			expiryDate: asDateString(row.ExpiryDate),
			reference: buildLegacyPurchaseBatchReference(row),
		});
	}

	return { items, skippedCount, warnings };
}

function buildSourceRowMaps(dump: LegacySqlDump): SourceRowMaps {
	const rowsByTable = dump.rowsByTable;
	const productDetailByProductLocation = new Map<string, LegacyRow>();
	for (const row of rowsByTable.productdetail ?? []) {
		const productId = asId(row.ProductID);
		const locationId = asId(row.LocationID);
		if (!productId || !locationId) continue;
		productDetailByProductLocation.set(`${productId}|${locationId}`, row);
	}

	const productColorSizeDetailByVariantLocation = new Map<string, LegacyRow>();
	for (const row of rowsByTable.productcolorsizedetail ?? []) {
		const variantId = asId(row.ProductColorSizeID);
		const locationId = asId(row.LocationID);
		if (!variantId || !locationId) continue;
		productColorSizeDetailByVariantLocation.set(`${variantId}|${locationId}`, row);
	}

	return {
		departments: buildRowMap(rowsByTable.department ?? [], 'DepartmentID'),
		categories: buildRowMap(rowsByTable.category ?? [], 'CategoryID'),
		subCategory1: buildRowMap(rowsByTable.subcategory1 ?? [], 'SubCategory1ID'),
		subCategory2: buildRowMap(rowsByTable.subcategory2 ?? [], 'SubCategory2ID'),
		subCategory3: buildRowMap(rowsByTable.subcategory3 ?? [], 'SubCategory3ID'),
		suppliers: buildRowMap(rowsByTable.supplier ?? [], 'SupplierID'),
		locations: buildRowMap(rowsByTable.location ?? [], 'LocationID'),
		units: buildRowMap(rowsByTable.unitofmeasure ?? [], 'UnitOfMeasureID'),
		products: buildRowMap(rowsByTable.product ?? [], 'ProductID'),
		colours: buildRowMap(rowsByTable.colour ?? [], 'ColourID'),
		sizes: buildRowMap(rowsByTable.size ?? [], 'SizeID'),
		productColorSizes: buildRowMap(rowsByTable.productcolorsize ?? [], 'ProductColorSizeID'),
		productDetailByProduct: groupRows(rowsByTable.productdetail ?? [], (row) => asId(row.ProductID)),
		productDetailByProductLocation,
		productColorSizeDetailByVariantLocation,
	};
}

async function preloadCaches(db: PrismaClient): Promise<CreatedCaches> {
	const [
		users,
		units,
		vendors,
		branches,
		floors,
		categories,
		attributes,
		productBarcodes,
		skus,
		variants,
		grns,
		stockTransfers,
		inventoryEvents,
	] = await Promise.all([
		db.user.findMany({ select: { id: true, email: true } }),
		db.unitOfMeasure.findMany({ select: { id: true, name: true, abbreviation: true } }),
		db.vendor.findMany({ select: { id: true, name: true } }),
		db.branch.findMany({ select: { id: true, code: true } }),
		db.floor.findMany({ select: { id: true, branchId: true, code: true } }),
		db.category.findMany({ select: { id: true, slug: true } }),
		db.attribute.findMany({ select: { id: true, name: true } }),
		db.productBarcode.findMany({ select: { barcode: true } }),
		db.sKU.findMany({ select: { id: true, skuCode: true } }),
		db.sKUVariant.findMany({ select: { id: true, variantCode: true } }),
		db.gRN.findMany({ where: { invoiceReference: { not: null } }, select: { supplierId: true, invoiceReference: true } }),
		db.stockTransfer.findMany({ select: { referenceNumber: true } }),
		db.inventoryEvent.findMany({
			where: { terminalId: 'legacy-sql-import', parentEntityId: { not: null } },
			select: { parentEntityId: true },
		}),
	]);

	return {
		userByEmail: new Map(users.map((user) => [normalizeLookup(user.email), user.id])),
		legacyUserByName: new Map(),
		unitByKey: new Map(
			units.flatMap((unit) => [
				[normalizeLookup(unit.name), { id: unit.id, name: unit.name, abbreviation: unit.abbreviation }],
				[normalizeLookup(unit.abbreviation), { id: unit.id, name: unit.name, abbreviation: unit.abbreviation }],
			]),
		),
		vendorBySourceId: new Map(),
		branchBySourceId: new Map(branches.map((branch) => [`code:${normalizeLookup(branch.code)}`, branch.id])),
		floorByBranchId: new Map(floors.map((floor) => [`${floor.branchId}|${floor.code}`, floor.id])),
		categoryBySlug: new Map(categories.map((category) => [category.slug, category.id])),
		skuBySourceId: new Map(),
		variantBySourceId: new Map(),
		attributeByName: new Map(attributes.map((attribute) => [normalizeLookup(attribute.name), attribute.id])),
		attributeValueByKey: new Map(),
		skuAttributeByKey: new Map(),
		barcodeSet: new Set(productBarcodes.map((barcode) => barcode.barcode)),
		batchByNumber: new Map(),
		grnBySupplierInvoice: new Set(
			grns
				.filter((grn) => Boolean(grn.invoiceReference))
				.map((grn) => `${grn.supplierId}|${normalizeLookup(grn.invoiceReference)}`),
		),
		stockTransferByReference: new Set(stockTransfers.map((transfer) => normalizeLookup(transfer.referenceNumber))),
		inventoryEventParentIds: new Set(
			inventoryEvents
				.map((event) => event.parentEntityId)
				.filter((value): value is string => Boolean(value)),
		),
	};
}

async function ensureUnit(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	name: string,
	abbreviation: string,
) {
	const existing = caches.unitByKey.get(normalizeLookup(name)) ?? caches.unitByKey.get(normalizeLookup(abbreviation));
	if (existing) return existing;

	const created = await db.unitOfMeasure.create({
		data: {
			name,
			abbreviation,
			type: detectUnitType(name),
			isActive: true,
			isSystem: false,
		},
		select: { id: true, name: true, abbreviation: true },
	});
	counts.unitsCreated += 1;
	caches.unitByKey.set(normalizeLookup(created.name), created);
	caches.unitByKey.set(normalizeLookup(created.abbreviation), created);
	return created;
}

async function ensureLegacyUser(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	legacyUsername?: LegacyScalar,
) {
	const normalizedName = normalizeLookup(legacyUsername) || 'legacy-import';
	const cached = caches.legacyUserByName.get(normalizedName);
	if (cached) return cached;

	const email = buildLegacyImportUserEmail(compactString(legacyUsername) ?? 'legacy-import');
	const existing = caches.userByEmail.get(normalizeLookup(email));
	if (existing) {
		caches.legacyUserByName.set(normalizedName, existing);
		return existing;
	}

	const created = await db.user.create({
		data: {
			email,
			passwordHash: 'legacy-import-disabled',
			role: 'Staff',
			isActive: false,
		},
		select: { id: true, email: true },
	});
	counts.usersCreated += 1;
	caches.userByEmail.set(normalizeLookup(created.email), created.id);
	caches.legacyUserByName.set(normalizedName, created.id);
	return created.id;
}

async function ensureVendor(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	sourceId: string,
	data: {
		name: string;
		contactEmail: string;
		contactPhone?: string;
		address?: string;
		website?: string;
		taxId?: string;
		paymentTerms?: string;
		notes?: string;
	},
) {
	const existingBySource = caches.vendorBySourceId.get(sourceId);
	if (existingBySource) return existingBySource;

	const existing = await db.vendor.findUnique({ where: { name: data.name }, select: { id: true } });
	if (existing) {
		caches.vendorBySourceId.set(sourceId, existing.id);
		return existing.id;
	}

	const created = await db.vendor.create({
		data: {
			name: data.name,
			contactEmail: data.contactEmail,
			contactPhone: data.contactPhone,
			address: data.address,
			type: 'Supplier',
			website: data.website,
			taxId: data.taxId,
			paymentTerms: data.paymentTerms,
			notes: data.notes,
			isActive: true,
		},
		select: { id: true },
	});
	counts.vendorsCreated += 1;
	caches.vendorBySourceId.set(sourceId, created.id);
	return created.id;
}

async function ensureCategory(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	slug: string,
	name: string,
	parentId?: string,
	description?: string,
) {
	const existing = caches.categoryBySlug.get(slug);
	if (existing) return existing;

	const created = await db.category.create({
		data: {
			name,
			slug,
			parentId,
			description,
			isActive: true,
		},
		select: { id: true },
	});
	counts.categoriesCreated += 1;
	caches.categoryBySlug.set(slug, created.id);
	return created.id;
}

async function ensureBranchAndFloor(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	sourceId: string,
	data: {
		code: string;
		name: string;
		address?: string;
		phone?: string;
		email?: string;
		isActive: boolean;
		isDefault: boolean;
		floorCode: string;
		floorName: string;
	},
) {
	const sourceKey = `source:${sourceId}`;
	const existingBySource = caches.branchBySourceId.get(sourceKey);
	if (existingBySource) {
		const floorId = caches.floorByBranchId.get(`${existingBySource}|${data.floorCode}`);
		return { branchId: existingBySource, floorId };
	}

	let branchId = caches.branchBySourceId.get(`code:${normalizeLookup(data.code)}`);
	if (!branchId) {
		const created = await db.branch.create({
			data: {
				code: data.code,
				name: data.name,
				address: data.address,
				phone: data.phone,
				email: data.email,
				isActive: data.isActive,
				isDefault: data.isDefault,
			},
			select: { id: true },
		});
		branchId = created.id;
		counts.branchesCreated += 1;
	}

	caches.branchBySourceId.set(sourceKey, branchId);
	caches.branchBySourceId.set(`code:${normalizeLookup(data.code)}`, branchId);

	let floorId = caches.floorByBranchId.get(`${branchId}|${data.floorCode}`);
	if (!floorId) {
		const createdFloor = await db.floor.create({
			data: {
				branchId,
				code: data.floorCode,
				name: data.floorName,
				floorNumber: 1,
				isActive: true,
			},
			select: { id: true },
		});
		floorId = createdFloor.id;
		counts.floorsCreated += 1;
		caches.floorByBranchId.set(`${branchId}|${data.floorCode}`, floorId);
	}

	return { branchId, floorId };
}

async function ensureAttribute(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	name: string,
) {
	const existing = caches.attributeByName.get(normalizeLookup(name));
	if (existing) return existing;

	const created = await db.attribute.create({
		data: { name, type: 'dropdown', isActive: true },
		select: { id: true },
	});
	counts.attributesCreated += 1;
	caches.attributeByName.set(normalizeLookup(name), created.id);
	return created.id;
}

async function ensureAttributeValue(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	attributeId: string,
	displayName: string,
	representedValue: string,
) {
	const cacheKey = `${attributeId}|${normalizeLookup(representedValue)}|${normalizeLookup(displayName)}`;
	const existingCache = caches.attributeValueByKey.get(cacheKey);
	if (existingCache) return existingCache;

	const existing = await db.attributeValue.findFirst({
		where: {
			attributeId,
			OR: [
				{ representedValue },
				{ displayName },
			],
		},
		select: { id: true, representedValue: true, displayName: true },
	});
	if (existing) {
		const resolvedKey = `${attributeId}|${normalizeLookup(existing.representedValue)}|${normalizeLookup(existing.displayName)}`;
		caches.attributeValueByKey.set(resolvedKey, existing.id);
		caches.attributeValueByKey.set(cacheKey, existing.id);
		return existing.id;
	}

	const created = await db.attributeValue.create({
		data: {
			attributeId,
			displayName,
			representedValue,
			isActive: true,
		},
		select: { id: true },
	});
	counts.attributeValuesCreated += 1;
	caches.attributeValueByKey.set(cacheKey, created.id);
	return created.id;
}

async function ensureSkuAttributeSelection(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	skuId: string,
	attributeId: string,
	attributeValueId: string,
) {
	const key = `${skuId}|${attributeId}`;
	let skuAttributeId = caches.skuAttributeByKey.get(key);
	if (!skuAttributeId) {
		const existing = await db.sKUAttribute.findUnique({
			where: { skuId_attributeId: { skuId, attributeId } },
			select: { id: true },
		});
		if (existing) {
			skuAttributeId = existing.id;
		} else {
			const skuAttribute = await db.sKUAttribute.create({
				data: { skuId, attributeId },
				select: { id: true },
			});
			skuAttributeId = skuAttribute.id;
			counts.skuAttributesCreated += 1;
		}
		caches.skuAttributeByKey.set(key, skuAttributeId);
	}

	await db.sKUAttributeValue.createMany({
		data: [{ skuAttributeId, attributeValueId }],
		skipDuplicates: true,
	});
	return skuAttributeId;
}

async function ensureVariantValue(
	db: PrismaClient,
	counts: LegacySqlImportCounts,
	variantId: string,
	attributeId: string,
	attributeValueId: string,
) {
	const existing = await db.sKUVariantValue.findUnique({
		where: { variantId_attributeId: { variantId, attributeId } },
		select: { variantId: true },
	});
	if (existing) {
		await db.sKUVariantValue.update({
			where: { variantId_attributeId: { variantId, attributeId } },
			data: { attributeValueId },
		});
		return;
	}
	await db.sKUVariantValue.create({
		data: { variantId, attributeId, attributeValueId },
	});
	counts.variantValuesCreated += 1;
}

async function ensureBatch(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	data: {
		batchNumber: string;
		skuId: string;
		variantId?: string | null;
		vendorId?: string | null;
		costPrice?: number;
		sellingPrice?: number;
		wholesalePrice?: number;
		bulkPrice?: number;
		expiryDate?: string;
		notes?: string;
	},
) {
	const cached = caches.batchByNumber.get(data.batchNumber);
	if (cached) return cached;

	const existing = await db.batch.findUnique({
		where: { batchNumber: data.batchNumber },
		select: { id: true },
	});
	if (existing) {
		caches.batchByNumber.set(data.batchNumber, existing.id);
		return existing.id;
	}

	const lastBatch = await db.batch.findFirst({
		where: { skuId: data.skuId, variantId: data.variantId ?? null },
		orderBy: { sequenceNumber: 'desc' },
		select: { sequenceNumber: true },
	});

	const created = await db.batch.create({
		data: {
			batchNumber: data.batchNumber,
			skuId: data.skuId,
			variantId: data.variantId ?? null,
			vendorId: data.vendorId ?? null,
			sequenceNumber: (lastBatch?.sequenceNumber ?? 0) + 1,
			costPrice: data.costPrice,
			sellingPrice: data.sellingPrice,
			wholesalePrice: data.wholesalePrice,
			bulkPrice: data.bulkPrice,
			currency: 'LKR',
			expiryDate: data.expiryDate ? new Date(`${data.expiryDate}T00:00:00.000Z`) : undefined,
			notes: data.notes,
			isActive: true,
		},
		select: { id: true },
	});
	counts.batchesCreated += 1;
	caches.batchByNumber.set(data.batchNumber, created.id);
	return created.id;
}

function buildProductDescription(product: LegacyRow) {
	const flags = [
		asBoolean(product.IsBulkProduct) ? 'Bulk product' : undefined,
		asBoolean(product.IsBundleProduct) ? 'Bundle product' : undefined,
		asBoolean(product.IsCombinedProduct) ? 'Combined product' : undefined,
		asBoolean(product.IsRowMaterialProduct) ? 'Raw material product' : undefined,
		asBoolean(product.IsUseReturnProduct) ? 'Returnable product' : undefined,
		asBoolean(product.IsNoLoyaltyPoint) ? 'No loyalty points' : undefined,
	];

	return buildLegacyNotes([
		compactString(product.ReferenceCode) ? `Legacy reference code: ${compactString(product.ReferenceCode)}` : undefined,
		compactString(product.PrintOnInvoice) && compactString(product.PrintOnInvoice) !== compactString(product.ProductName)
			? `Legacy invoice label: ${compactString(product.PrintOnInvoice)}`
			: undefined,
		compactString(product.NameInSinhala) ? `Legacy Sinhala name: ${compactString(product.NameInSinhala)}` : undefined,
		flags.filter((flag): flag is string => Boolean(flag)).length > 0 ? `Legacy flags: ${flags.filter((flag): flag is string => Boolean(flag)).join(', ')}` : undefined,
	]);
}

function buildCategoryPathSegments(product: LegacyRow, sourceMaps: SourceRowMaps) {
	const segments: Array<{ slug: string; name: string; description?: string }> = [];

	const department = sourceMaps.departments.get(asId(product.DepartmentID) ?? '');
	if (department) {
		const code = compactString(department.DepartmentCode) ?? `dept-${asId(department.DepartmentID)}`;
		const name = compactString(department.DepartmentName) ?? code;
		segments.push({
			slug: `legacy-department-${slugify(code)}`,
			name,
			description: compactString(department.Remark),
		});
	}

	const category = sourceMaps.categories.get(asId(product.CategoryID) ?? '');
	if (category) {
		const code = compactString(category.CategoryCode) ?? `category-${asId(category.CategoryID)}`;
		const name = compactString(category.CategoryName) ?? code;
		segments.push({
			slug: `legacy-category-${slugify(code)}`,
			name,
			description: compactString(category.Remark),
		});
	}

	const subCategoryMaps: Array<[string | undefined, LegacyRow | undefined, string, string, string]> = [
		[asId(product.SubCategory1ID), sourceMaps.subCategory1.get(asId(product.SubCategory1ID) ?? ''), 'SubCategory1Code', 'SubCategory1Name', 'legacy-subcategory1'],
		[asId(product.SubCategory2ID), sourceMaps.subCategory2.get(asId(product.SubCategory2ID) ?? ''), 'SubCategory2Code', 'SubCategory2Name', 'legacy-subcategory2'],
		[asId(product.SubCategory3ID), sourceMaps.subCategory3.get(asId(product.SubCategory3ID) ?? ''), 'SubCategory3Code', 'SubCategory3Name', 'legacy-subcategory3'],
	];

	for (const [sourceId, row, codeField, nameField, prefix] of subCategoryMaps) {
		if (!sourceId || !row) continue;
		const code = compactString(row[codeField]) ?? sourceId;
		const name = compactString(row[nameField]) ?? code;
		segments.push({
			slug: `${prefix}-${slugify(code)}`,
			name,
			description: compactString(row.Remark),
		});
	}

	return segments;
}

async function ensureProductCategoryPath(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	product: LegacyRow,
	sourceMaps: SourceRowMaps,
) {
	const segments = buildCategoryPathSegments(product, sourceMaps);
	let parentId: string | undefined;
	let parentSlug: string | undefined;
	let resolvedId: string | undefined;

	for (const segment of segments) {
		const slug = composeCategorySlug(parentSlug, segment.slug);
		resolvedId = await ensureCategory(db, caches, counts, slug, segment.name, parentId, segment.description);
		parentId = resolvedId;
		parentSlug = slug;
	}

	return resolvedId;
}

function selectProductPricing(product: LegacyRow, sourceMaps: SourceRowMaps) {
	const productId = asId(product.ProductID);
	if (!productId) return {};
	const detailRows = sourceMaps.productDetailByProduct.get(productId) ?? [];
	const detailRow = detailRows[0];
	if (!detailRow) return {};

	return {
		costPrice: asNumber(detailRow.CostPrice),
		sellingPrice: asNumber(detailRow.SellingPrice),
		wholesalePrice: asNumber(detailRow.WholeSalePrice),
		bulkPrice: asNumber(detailRow.SpecialPrice),
		lowStockThreshold: asInteger(detailRow.ReOrderLevel),
	};
}

function resolveProductUnitInfo(product: LegacyRow, sourceMaps: SourceRowMaps) {
	const purchaseUnit = compactString(product.PUnit);
	const eachUnit = compactString(product.EUnit) ?? purchaseUnit ?? 'Piece';
	const packSize = asNumber(product.PackSize);
	const conversionRules: Array<{ fromUnit: string; toUnit: string; ratio: number }> = [];

	if (purchaseUnit && purchaseUnit !== eachUnit && packSize && packSize > 0) {
		conversionRules.push({
			fromUnit: purchaseUnit,
			toUnit: eachUnit,
			ratio: packSize,
		});
	}

	const unitName = purchaseUnit ?? eachUnit;
	const unitRow = Array.from(sourceMaps.units.values()).find((row) => {
		const code = compactString(row.UnitOfMeasureCode);
		const name = compactString(row.UnitOfMeasureName);
		return normalizeLookup(code) === normalizeLookup(unitName) || normalizeLookup(name) === normalizeLookup(unitName);
	});

	return {
		unitName,
		unitCode: compactString(unitRow?.UnitOfMeasureCode) ?? unitName.slice(0, 3).toUpperCase(),
		conversionRules,
	};
}

async function ensureProductBarcode(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	skuId: string,
	barcode: string,
) {
	if (caches.barcodeSet.has(barcode)) return;

	await db.productBarcode.create({
		data: {
			skuId,
			barcode,
			barcodeType: detectBarcodeType(barcode),
			isDefault: true,
			label: 'Legacy barcode',
		},
	});
	caches.barcodeSet.add(barcode);
	counts.barcodesCreated += 1;
}

function createSupplierNameResolver(rows: LegacyRow[]) {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const name = normalizeLookup(row.SupplierName);
		if (!name) continue;
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}

	return (row: LegacyRow) => {
		const baseName = compactString(row.SupplierName) ?? `Legacy Supplier ${asId(row.SupplierID) ?? 'Unknown'}`;
		if ((counts.get(normalizeLookup(baseName)) ?? 0) <= 1) return baseName;
		const code = compactString(row.SupplierCode);
		return code ? `${baseName} [${code}]` : baseName;
	};
}

function createCategorySeedRows(sourceMaps: SourceRowMaps) {
	return {
		departments: Array.from(sourceMaps.departments.values()),
		categories: Array.from(sourceMaps.categories.values()),
	};
}

async function ensureSeedCategories(
	db: PrismaClient,
	caches: CreatedCaches,
	counts: LegacySqlImportCounts,
	sourceMaps: SourceRowMaps,
) {
	const { departments, categories } = createCategorySeedRows(sourceMaps);

	for (const department of departments) {
		const code = compactString(department.DepartmentCode) ?? asId(department.DepartmentID) ?? 'department';
		const name = compactString(department.DepartmentName) ?? code;
		await ensureCategory(
			db,
			caches,
			counts,
			`legacy-department-${slugify(code)}`,
			name,
			undefined,
			compactString(department.Remark),
		);
	}

	for (const category of categories) {
		const department = sourceMaps.departments.get(asId(category.DepartmentID) ?? '');
		const parentSlug = department
			? `legacy-department-${slugify(compactString(department.DepartmentCode) ?? asId(department.DepartmentID) ?? 'department')}`
			: undefined;
		const parentId = parentSlug ? caches.categoryBySlug.get(parentSlug) : undefined;
		const code = compactString(category.CategoryCode) ?? asId(category.CategoryID) ?? 'category';
		const name = compactString(category.CategoryName) ?? code;
		const slug = composeCategorySlug(parentSlug, `legacy-category-${slugify(code)}`);
		await ensureCategory(db, caches, counts, slug, name, parentId, compactString(category.Remark));
	}
}

function buildBatchNumber(args: {
	locationCode: string;
	skuCode: string;
	variantCode?: string;
	reference?: string;
	expiryDate?: string;
}) {
	const parts = [
		'LEG',
		slugify(args.locationCode || 'location'),
		slugify(args.variantCode ?? args.skuCode),
		args.reference ? slugify(args.reference).slice(0, 16) : 'snapshot',
		args.expiryDate ? args.expiryDate.replace(/-/g, '') : 'na',
	].filter((part) => part.length > 0);
	return parts.join('-').toUpperCase();
}

function buildLegacyPurchaseBatchReference(detail: LegacyRow, fallbackReference?: string) {
	const purchaseDetailId = asId(detail.PurchaseDetailID);
	return joinParts([
		purchaseDetailId ? `PD${purchaseDetailId}` : undefined,
		compactString(detail.ReferenceNo) ?? compactString(detail.DocumentNo) ?? fallbackReference,
	], '-');
}

function resolveBranchAndFloorForLocation(
	caches: CreatedCaches,
	locationSourceId: string | undefined,
	defaultFloorCode: string,
) {
	if (!locationSourceId) return {};
	const branchId = caches.branchBySourceId.get(`source:${locationSourceId}`);
	if (!branchId) return {};
	return {
		branchId,
		floorId: caches.floorByBranchId.get(`${branchId}|${defaultFloorCode}`),
	};
}

function mapLegacyPurchaseStatus(status: number | undefined) {
	if ((status ?? 0) <= 0) return 'Draft';
	return 'Closed';
}

function mapLegacyTransferStatus(status: number | undefined, accepted: boolean | undefined) {
	if (accepted) return 'Completed';
	if ((status ?? 0) <= 0) return 'Draft';
	return 'InTransit';
}

function appendNotes(...parts: Array<string | undefined>) {
	return buildLegacyNotes(parts);
}

export async function importLegacySqlDump(
	db: PrismaClient,
	dump: LegacySqlDump,
	options: LegacySqlImportOptions = {},
): Promise<LegacySqlImportResult> {
	const analysis = buildLegacySchemaAnalysis(dump);
	const counts = zeroCounts();
	const warnings = [...analysis.notes];
	const sourceMaps = buildSourceRowMaps(dump);

	if (!analysis.hasData) {
		warnings.push('No data rows were imported because this dump contains schema only.');
		return { analysis, counts, warnings };
	}

	const effectiveOptions = {
		defaultFloorCode: options.defaultFloorCode ?? 'MAIN',
		defaultFloorName: options.defaultFloorName ?? 'Main Floor',
		inventoryState: options.inventoryState ?? 'ShelfReady',
		importInventorySnapshot: options.importInventorySnapshot ?? true,
		fractionalQuantityMode: options.fractionalQuantityMode ?? 'preserve',
	} as const;

	const caches = await preloadCaches(db);
	const supplierRows = dump.rowsByTable.supplier ?? [];
	const resolveSupplierName = createSupplierNameResolver(supplierRows);

	const existingDefaultBranch = await db.branch.findFirst({
		where: { isDefault: true },
		select: { id: true },
	});
	let defaultBranchAssigned = Boolean(existingDefaultBranch);

	for (const row of dump.rowsByTable.unitofmeasure ?? []) {
		const name = compactString(row.UnitOfMeasureName);
		if (!name) continue;
		const abbreviation = compactString(row.UnitOfMeasureCode) ?? name.slice(0, 3).toUpperCase();
		await ensureUnit(db, caches, counts, name, abbreviation);
	}

	for (const row of supplierRows) {
		const sourceId = asId(row.SupplierID);
		if (!sourceId) continue;
		const name = resolveSupplierName(row);
		const code = compactString(row.SupplierCode) ?? sourceId;
		const email = compactString(row.Email) ?? `${slugify(code)}@legacy-import.local`;
		const paymentTerms = asInteger(row.CreditPeriod) !== undefined ? `Net ${asInteger(row.CreditPeriod)} days` : undefined;

		await ensureVendor(db, caches, counts, sourceId, {
			name,
			contactEmail: email,
			contactPhone: joinParts([row.ContactNo, row.Phone1, row.Phone2, row.Phone3], ' / '),
			address: joinParts([row.Address1, row.Address2, row.Address3, row.Country]),
			website: compactString(row.WebSite),
			taxId: compactString(row.VatNo) ?? compactString(row.NICNo),
			paymentTerms,
			notes: buildLegacyNotes([
				compactString(row.AccountNo) ? `Legacy account no: ${compactString(row.AccountNo)}` : undefined,
				compactString(row.Branch) ? `Legacy supplier branch: ${compactString(row.Branch)}` : undefined,
				compactString(row.PayeeName) ? `Legacy payee name: ${compactString(row.PayeeName)}` : undefined,
				compactString(row.Reference) ? `Legacy reference: ${compactString(row.Reference)}` : undefined,
			]),
		});
	}

	for (const row of dump.rowsByTable.location ?? []) {
		const sourceId = asId(row.LocationID);
		if (!sourceId) continue;
		const code = compactString(row.LocationCode) ?? `LOC-${sourceId}`;
		await ensureBranchAndFloor(db, caches, counts, sourceId, {
			code,
			name: compactString(row.LocationName) ?? code,
			address: joinParts([row.Address1, row.Address2, row.Address3]),
			phone: joinParts([row.ContactNo, row.Phone1, row.Phone2, row.Phone3], ' / '),
			email: compactString(row.Email),
			isActive: (asBoolean(row.IsActive) ?? true) && !(asBoolean(row.IsDelete) ?? false),
			isDefault: !defaultBranchAssigned,
			floorCode: effectiveOptions.defaultFloorCode,
			floorName: effectiveOptions.defaultFloorName,
		});
		defaultBranchAssigned = true;
	}

	await ensureSeedCategories(db, caches, counts, sourceMaps);

	const colorAttributeId = (dump.rowsByTable.productcolorsize?.length ?? 0) > 0
		? await ensureAttribute(db, caches, counts, 'Color')
		: undefined;
	const sizeAttributeId = (dump.rowsByTable.productcolorsize?.length ?? 0) > 0
		? await ensureAttribute(db, caches, counts, 'Size')
		: undefined;

	for (const product of dump.rowsByTable.product ?? []) {
		const sourceId = asId(product.ProductID);
		if (!sourceId) continue;

		const vendorSourceId = asId(product.SupplierID);
		let vendorId = vendorSourceId ? caches.vendorBySourceId.get(vendorSourceId) : undefined;
		if (!vendorId) {
			const fallbackSourceId = vendorSourceId ?? `fallback-${sourceId}`;
			vendorId = await ensureVendor(db, caches, counts, fallbackSourceId, {
				name: `Legacy Supplier ${vendorSourceId ?? sourceId}`,
				contactEmail: `${slugify(fallbackSourceId)}@legacy-import.local`,
			});
		}

		const categoryId = await ensureProductCategoryPath(db, caches, counts, product, sourceMaps);
		const unitInfo = resolveProductUnitInfo(product, sourceMaps);
		const ensuredUnit = await ensureUnit(db, caches, counts, unitInfo.unitName, unitInfo.unitCode);
		const pricing = selectProductPricing(product, sourceMaps);
		const skuCode = compactString(product.ProductCode) ?? `LEGACY-SKU-${sourceId}`;
		const existingSku = await db.sKU.findUnique({ where: { skuCode }, select: { id: true, skuCode: true } });
		const sku = existingSku ?? await db.sKU.create({
			data: {
				skuCode,
				name: compactString(product.ProductName) ?? compactString(product.PrintOnInvoice) ?? skuCode,
				description: buildProductDescription(product),
				categoryId,
				vendorId,
				unitOfMeasureId: ensuredUnit.id,
				unitOfMeasure: ensuredUnit.name,
				conversionRules: unitInfo.conversionRules.length > 0 ? unitInfo.conversionRules : undefined,
				costPrice: pricing.costPrice,
				sellingPrice: pricing.sellingPrice,
				wholesalePrice: pricing.wholesalePrice,
				bulkPrice: pricing.bulkPrice,
				currency: 'LKR',
				lowStockThreshold: pricing.lowStockThreshold,
				isActive: (asBoolean(product.IsActive) ?? true) && !(asBoolean(product.IsDelete) ?? false),
			},
			select: { id: true, skuCode: true },
		});
		if (!existingSku) counts.skusCreated += 1;
		caches.skuBySourceId.set(sourceId, sku);
		caches.skuBySourceId.set(normalizeLookup(skuCode), sku);

		const existingSkuVendor = await db.sKUVendor.findUnique({
			where: { skuId_vendorId: { skuId: sku.id, vendorId } },
			select: { skuId: true },
		});
		if (!existingSkuVendor) {
			await db.sKUVendor.create({
				data: { skuId: sku.id, vendorId },
			});
			counts.skuVendorLinksCreated += 1;
		}

		const barcode = compactString(product.BarCode);
		if (barcode) {
			await ensureProductBarcode(db, caches, counts, sku.id, barcode);
		}
	}

	for (const row of dump.rowsByTable.productcolorsize ?? []) {
		const sourceId = asId(row.ProductColorSizeID);
		const productSourceId = asId(row.ProductID);
		if (!sourceId || !productSourceId) continue;
		const sku = caches.skuBySourceId.get(productSourceId);
		if (!sku) continue;

		const colorRow = sourceMaps.colours.get(asId(row.ColorID) ?? '');
		const sizeRow = sourceMaps.sizes.get(asId(row.SizeID) ?? '');
		const colorName = compactString(colorRow?.ColourName);
		const sizeName = compactString(sizeRow?.SizeName);
		const colorCode = compactString(colorRow?.ColourCode) ?? colorName;
		const sizeCode = compactString(sizeRow?.SizeCode) ?? sizeName;
		const variantCodeSeed = compactString(row.ColorSizeCode) ?? joinParts([colorCode, sizeCode], '-') ?? sourceId;
		const variantCode = `${sku.skuCode}-${slugify(variantCodeSeed).toUpperCase()}`;
		const variantName = compactString(row.ColorSizeName) ?? joinParts([colorName, sizeName], ' / ') ?? variantCodeSeed;

		const existingVariant = await db.sKUVariant.findUnique({ where: { variantCode }, select: { id: true, variantCode: true } });
		const variant = existingVariant ?? await db.sKUVariant.create({
			data: {
				skuId: sku.id,
				variantCode,
				name: variantName,
				isActive: (asBoolean(row.IsActive) ?? true) && !(asBoolean(row.IsDelete) ?? false),
			},
			select: { id: true, variantCode: true },
		});
		if (!existingVariant) counts.variantsCreated += 1;
		caches.variantBySourceId.set(sourceId, variant);

		if (colorAttributeId && colorName && colorCode) {
			const attributeValueId = await ensureAttributeValue(db, caches, counts, colorAttributeId, colorName, colorCode);
			await ensureSkuAttributeSelection(db, caches, counts, sku.id, colorAttributeId, attributeValueId);
			await ensureVariantValue(db, counts, variant.id, colorAttributeId, attributeValueId);
		}

		if (sizeAttributeId && sizeName && sizeCode) {
			const attributeValueId = await ensureAttributeValue(db, caches, counts, sizeAttributeId, sizeName, sizeCode);
			await ensureSkuAttributeSelection(db, caches, counts, sku.id, sizeAttributeId, attributeValueId);
			await ensureVariantValue(db, counts, variant.id, sizeAttributeId, attributeValueId);
		}
	}

	const purchaseHeadersById = buildRowMap(dump.rowsByTable.purchaseheader ?? [], 'PurchaseHeaderID');
	const purchaseDetailsByImportKey = groupRows(
		dump.rowsByTable.purchasedetail ?? [],
		(row) => {
			const headerId = asId(row.PurchaseHeaderID);
			if (headerId) return `header:${headerId}`;

			const purchaseDetailId = asId(row.PurchaseDetailID);
			const documentNo = compactString(row.DocumentNo);
			if (!purchaseDetailId && !documentNo) return undefined;

			const supplierSourceId = asId(row.SupplierID) ?? 'supplier';
			const locationSourceId = asId(row.LocationID) ?? 'location';
			const purchaseDate = asDateString(row.PurchaseDate) ?? asDateString(row.CreatedDate) ?? 'date';
			return purchaseDetailId
				? `detail:${purchaseDetailId}`
				: `detail:${supplierSourceId}|${locationSourceId}|${normalizeLookup(documentNo)}|${purchaseDate}`;
		},
	);

	async function importPurchaseDocument(args: {
		importKey: string;
		detailRows: LegacyRow[];
		header?: LegacyRow;
		reconstructedFromDetailsOnly?: boolean;
	}) {
		const leadDetail = args.detailRows[0];
		if (!leadDetail) return;

		const header = args.header;
		const headerId = asId(header?.PurchaseHeaderID) ?? asId(leadDetail.PurchaseHeaderID);
		const vendorSourceId = asId(header?.SupplierID) ?? asId(leadDetail.SupplierID);
		let vendorId = vendorSourceId ? caches.vendorBySourceId.get(vendorSourceId) : undefined;
		if (!vendorId) {
			const fallbackSourceId = vendorSourceId ?? headerId ?? `purchase-detail-${asId(leadDetail.PurchaseDetailID) ?? args.importKey}`;
			vendorId = await ensureVendor(db, caches, counts, fallbackSourceId, {
				name: `Legacy Supplier ${vendorSourceId ?? headerId ?? asId(leadDetail.PurchaseDetailID) ?? 'Unknown'}`,
				contactEmail: `${slugify(fallbackSourceId)}@legacy-import.local`,
			});
		}

		const invoiceReference = headerId
			? `LEGACY-PUR-${headerId}`
			: `LEGACY-PUR-DET-${asId(leadDetail.PurchaseDetailID) ?? slugify(args.importKey).toUpperCase().slice(0, 32)}`;
		const grnKey = `${vendorId}|${normalizeLookup(invoiceReference)}`;
		if (caches.grnBySupplierInvoice.has(grnKey)) return;

		const createdByUserId = await ensureLegacyUser(
			db,
			caches,
			counts,
			header?.CreatedUser ?? `legacy-purchase-${args.reconstructedFromDetailsOnly ? 'detail' : 'header'}`,
		);
		const deliveryLocationSourceId = asId(header?.DeliveryLocationID) ?? asId(header?.LocationID) ?? asId(leadDetail.LocationID);
		const { floorId } = resolveBranchAndFloorForLocation(caches, deliveryLocationSourceId, effectiveOptions.defaultFloorCode);
		const grnStatus = mapLegacyPurchaseStatus(asInteger(header?.Status) ?? asInteger(leadDetail.Status));
		const batchReferenceFallback = compactString(header?.ReferenceNo) ?? compactString(header?.DocumentNo);
		const grnLines: Array<{
			skuId: string;
			variantId?: string;
			batchId?: string;
			expectedQuantity: number;
			receivedQuantity: number;
			costPrice?: number;
			sellingPrice?: number;
			notes?: string;
		}> = [];

		for (const detail of args.detailRows) {
			const productSourceId = asId(detail.ProductID);
			if (!productSourceId) continue;
			const sku = caches.skuBySourceId.get(productSourceId);
			if (!sku) {
				warnings.push(`Skipped purchase detail ${asId(detail.PurchaseDetailID) ?? 'unknown'} because product ${productSourceId} did not resolve to a SKU.`);
				continue;
			}

			const variant = asId(detail.ProductColorSizeID) ? caches.variantBySourceId.get(asId(detail.ProductColorSizeID)!) : undefined;
			const quantityRaw = (asNumber(detail.Qty) ?? 0) + Math.max(asNumber(detail.FreeQty) ?? 0, 0);
			const quantity = normalizeDocumentQuantity(
				quantityRaw,
				`Purchase detail ${asId(detail.PurchaseDetailID) ?? 'unknown'}`,
				warnings,
			);
			if (!quantity || quantity <= 0) {
				warnings.push(`Skipped purchase detail ${asId(detail.PurchaseDetailID) ?? 'unknown'} because it has no importable quantity.`);
				continue;
			}

			const lineLocationSourceId = asId(detail.LocationID) ?? deliveryLocationSourceId;
			const locationCode = compactString(sourceMaps.locations.get(lineLocationSourceId ?? '')?.LocationCode) ?? lineLocationSourceId ?? 'legacy';
			const batchId = await ensureBatch(db, caches, counts, {
				batchNumber: buildBatchNumber({
					locationCode,
					skuCode: sku.skuCode,
					variantCode: variant?.variantCode,
					reference: buildLegacyPurchaseBatchReference(detail, batchReferenceFallback),
					expiryDate: asDateString(detail.ExpiryDate),
				}),
				skuId: sku.id,
				variantId: variant?.id,
				vendorId,
				costPrice: asNumber(detail.CostPrice),
				sellingPrice: asNumber(detail.SellingPrice) ?? asNumber(detail.UnitPrice),
				expiryDate: asDateString(detail.ExpiryDate),
				notes: appendNotes(
					'Imported from legacy purchase detail.',
					asId(detail.PurchaseDetailID) ? `Legacy purchase detail id: ${asId(detail.PurchaseDetailID)}` : undefined,
					compactString(detail.ReferenceNo) ? `Legacy reference no: ${compactString(detail.ReferenceNo)}` : undefined,
					compactString(detail.DocumentNo) ? `Legacy document no: ${compactString(detail.DocumentNo)}` : undefined,
				),
			});

			grnLines.push({
				skuId: sku.id,
				variantId: variant?.id,
				batchId,
				expectedQuantity: quantity,
				receivedQuantity: grnStatus === 'Draft' ? 0 : quantity,
				costPrice: asNumber(detail.CostPrice),
				sellingPrice: asNumber(detail.SellingPrice) ?? asNumber(detail.UnitPrice),
				notes: appendNotes(
					asId(detail.PurchaseDetailID) ? `Legacy purchase detail id: ${asId(detail.PurchaseDetailID)}` : undefined,
					compactString(detail.DocumentNo) ? `Legacy document no: ${compactString(detail.DocumentNo)}` : undefined,
					compactString(detail.ReferenceNo) ? `Legacy reference no: ${compactString(detail.ReferenceNo)}` : undefined,
					asNumber(detail.FreeQty) ? `Legacy free quantity: ${asNumber(detail.FreeQty)}` : undefined,
					quantityRaw !== quantity ? `Legacy exact received quantity: ${quantityRaw}` : undefined,
				),
			});
		}

		if (grnLines.length === 0) {
			warnings.push(`Skipped purchase import ${headerId ?? args.importKey} because none of its lines could be mapped into the current GRN model.`);
			return;
		}

		const createdAt = asDate(header?.CreatedDate) ?? asDate(leadDetail.CreatedDate) ?? asDate(header?.PurchaseDate) ?? asDate(leadDetail.PurchaseDate) ?? new Date();
		const purchaseDate = asDate(header?.PurchaseDate) ?? asDate(leadDetail.PurchaseDate);
		const deliveryDate = asDate(header?.DeliveryDate) ?? purchaseDate;
		const documentNo = compactString(header?.DocumentNo) ?? compactString(leadDetail.DocumentNo);
		const referenceNo = compactString(header?.ReferenceNo) ?? compactString(leadDetail.ReferenceNo);
		const legacyStatusCode = asInteger(header?.Status) ?? asInteger(leadDetail.Status);
		const createdGrn = await db.gRN.create({
			data: {
				supplierId: vendorId,
				floorId: floorId ?? null,
				invoiceReference,
				supplierInvoiceDate: purchaseDate,
				expectedDeliveryDate: deliveryDate,
				deliveryDate: grnStatus === 'Draft' ? undefined : deliveryDate,
				status: grnStatus,
				notes: appendNotes(
					args.reconstructedFromDetailsOnly
						? 'Imported from legacy purchase detail rows without a matching purchase header.'
						: 'Imported from legacy purchase history.',
					documentNo ? `Legacy document no: ${documentNo}` : undefined,
					referenceNo ? `Legacy supplier invoice/reference: ${referenceNo}` : undefined,
					deliveryLocationSourceId ? `Legacy delivery location id: ${deliveryLocationSourceId}` : undefined,
					asInteger(header?.PurchaseTypeID) !== undefined ? `Legacy purchase type id: ${asInteger(header?.PurchaseTypeID)}` : undefined,
					asInteger(header?.PaymentModeID) !== undefined ? `Legacy payment mode id: ${asInteger(header?.PaymentModeID)}` : undefined,
					asNumber(header?.NetAmount) !== undefined ? `Legacy net amount: ${asNumber(header?.NetAmount)}` : undefined,
					asNumber(header?.Balance) !== undefined ? `Legacy supplier balance: ${asNumber(header?.Balance)}` : undefined,
					compactString(header?.CreatedUser) ? `Legacy created user: ${compactString(header?.CreatedUser)}` : undefined,
					args.reconstructedFromDetailsOnly ? `Legacy reconstructed import key: ${args.importKey}` : undefined,
					legacyStatusCode !== undefined ? `Legacy status code: ${legacyStatusCode}` : undefined,
				),
				createdBy: createdByUserId,
				createdAt,
				lines: {
					create: grnLines,
				},
			},
			select: { id: true },
		});
		counts.grnsCreated += 1;
		counts.grnLinesCreated += grnLines.length;
		caches.grnBySupplierInvoice.add(grnKey);

		await db.inventoryEvent.create({
			data: {
				eventType: 'GRN_CREATED',
				parentEntityId: createdGrn.id,
				userId: createdByUserId,
				terminalId: 'legacy-sql-import',
				timestamp: createdAt,
				metadata: {
					importedAs: args.reconstructedFromDetailsOnly ? 'historical-grn-reconstructed' : 'historical-grn',
					legacyPurchaseHeaderId: headerId,
					legacyDocumentNo: documentNo,
					legacyReferenceNo: referenceNo,
				},
			},
		});
		counts.inventoryEventsCreated += 1;
		caches.inventoryEventParentIds.add(createdGrn.id);
	}

	for (const header of dump.rowsByTable.purchaseheader ?? []) {
		const headerId = asId(header.PurchaseHeaderID);
		if (!headerId) continue;

		await importPurchaseDocument({
			importKey: `header:${headerId}`,
			header,
			detailRows: purchaseDetailsByImportKey.get(`header:${headerId}`) ?? [],
		});
	}

	for (const [importKey, detailRows] of purchaseDetailsByImportKey.entries()) {
		const leadDetail = detailRows[0];
		if (!leadDetail) continue;
		const headerId = asId(leadDetail.PurchaseHeaderID);
		if (headerId && purchaseHeadersById.has(headerId)) continue;

		await importPurchaseDocument({
			importKey,
			detailRows,
			reconstructedFromDetailsOnly: true,
		});
	}

	const transferDetailsByHeaderKey = groupRows(
		dump.rowsByTable.transfernotedetail ?? [],
		(row) => {
			const fromLocationId = asId(row.LocationID);
			const toLocationId = asId(row.ToLocationID);
			const documentNo = compactString(row.DocumentNo);
			return fromLocationId && toLocationId && documentNo
				? `${fromLocationId}|${toLocationId}|${normalizeLookup(documentNo)}`
				: undefined;
		},
	);
	for (const header of dump.rowsByTable.transfernoteheader ?? []) {
		const headerId = asId(header.TransferNoteHeaderID);
		if (!headerId) continue;

		const referenceNumber = `LEGACY-TN-${headerId}`;
		const referenceKey = normalizeLookup(referenceNumber);
		if (caches.stockTransferByReference.has(referenceKey)) continue;

		const fromLocationSourceId = asId(header.LocationID);
		const toLocationSourceId = asId(header.ToLocationID);
		const detailRows = transferDetailsByHeaderKey.get(
			`${fromLocationSourceId ?? ''}|${toLocationSourceId ?? ''}|${normalizeLookup(compactString(header.DocumentNo))}`,
		) ?? [];
		const requestedBy = await ensureLegacyUser(db, caches, counts, header.CreatedUser);
		const approvedByName = compactString(header.AcceptedBy);
		const approvedBy = approvedByName ? await ensureLegacyUser(db, caches, counts, approvedByName) : undefined;
		const fromLocation = resolveBranchAndFloorForLocation(caches, fromLocationSourceId, effectiveOptions.defaultFloorCode);
		const toLocation = resolveBranchAndFloorForLocation(caches, toLocationSourceId, effectiveOptions.defaultFloorCode);
		const transferStatus = mapLegacyTransferStatus(asInteger(header.Status), asBoolean(header.Accepted));
		const transferLines = new Map<string, {
			skuId: string;
			variantId?: string;
			batchId?: string;
			requestedQty: number;
			transferredQty: number;
			notes?: string;
		}>();

		for (const detail of detailRows) {
			const productSourceId = asId(detail.ProductID);
			if (!productSourceId) continue;
			const sku = caches.skuBySourceId.get(productSourceId);
			if (!sku) {
				warnings.push(`Skipped transfer detail ${asId(detail.TransferNoteDetailID) ?? 'unknown'} because product ${productSourceId} did not resolve to a SKU.`);
				continue;
			}

			const variant = asId(detail.ProductColorSizeID) ? caches.variantBySourceId.get(asId(detail.ProductColorSizeID)!) : undefined;
			const requestedRaw = (asNumber(detail.Qty) ?? 0) + Math.max(asNumber(detail.FreeQty) ?? 0, 0);
			const transferredRawBase = asNumber(detail.AcceptedQty);
			const transferredRaw = transferredRawBase !== undefined && transferredRawBase > 0
				? transferredRawBase + Math.max(asNumber(detail.FreeQty) ?? 0, 0)
				: ((asBoolean(header.Accepted) ?? false) ? requestedRaw : 0);
			const requestedQty = normalizeDocumentQuantity(
				requestedRaw,
				`Transfer detail ${asId(detail.TransferNoteDetailID) ?? 'unknown'} requested quantity`,
				warnings,
			);
			const transferredQty = normalizeDocumentQuantity(
				transferredRaw,
				`Transfer detail ${asId(detail.TransferNoteDetailID) ?? 'unknown'} transferred quantity`,
				warnings,
			) ?? 0;
			if (!requestedQty || requestedQty <= 0) {
				warnings.push(`Skipped transfer detail ${asId(detail.TransferNoteDetailID) ?? 'unknown'} because it has no importable requested quantity.`);
				continue;
			}

			const locationCode = compactString(sourceMaps.locations.get(fromLocationSourceId ?? '')?.LocationCode) ?? fromLocationSourceId ?? 'legacy';
			const vendorSourceId = asId(detail.SupplierID);
			const vendorId = vendorSourceId ? caches.vendorBySourceId.get(vendorSourceId) : undefined;
			const batchId = await ensureBatch(db, caches, counts, {
				batchNumber: buildBatchNumber({
					locationCode,
					skuCode: sku.skuCode,
					variantCode: variant?.variantCode,
					reference: compactString(header.ReferenceNo) ?? compactString(detail.DocumentNo),
					expiryDate: asDateString(detail.ExpiryDate),
				}),
				skuId: sku.id,
				variantId: variant?.id,
				vendorId,
				costPrice: asNumber(detail.CostPrice),
				sellingPrice: asNumber(detail.SellingPrice),
				expiryDate: asDateString(detail.ExpiryDate),
				notes: appendNotes(
					'Imported from legacy transfer note detail.',
					asId(detail.TransferNoteDetailID) ? `Legacy transfer detail id: ${asId(detail.TransferNoteDetailID)}` : undefined,
					compactString(detail.DocumentNo) ? `Legacy document no: ${compactString(detail.DocumentNo)}` : undefined,
				),
			});

			const lineKey = `${sku.id}|${variant?.id ?? ''}|${batchId ?? ''}`;
			const existingLine = transferLines.get(lineKey);
			const lineNotes = appendNotes(
				asId(detail.TransferNoteDetailID) ? `Legacy transfer detail id: ${asId(detail.TransferNoteDetailID)}` : undefined,
				asNumber(detail.FreeQty) ? `Legacy free quantity: ${asNumber(detail.FreeQty)}` : undefined,
				compactString(detail.DocumentNo) ? `Legacy document no: ${compactString(detail.DocumentNo)}` : undefined,
				compactString(header.ReferenceNo) ? `Legacy reference no: ${compactString(header.ReferenceNo)}` : undefined,
				requestedRaw !== requestedQty ? `Legacy exact requested quantity: ${requestedRaw}` : undefined,
				transferredRaw !== transferredQty ? `Legacy exact accepted quantity: ${transferredRaw}` : undefined,
			);

			if (existingLine) {
				existingLine.requestedQty += requestedQty;
				existingLine.transferredQty += transferredQty;
				existingLine.notes = appendNotes(existingLine.notes, lineNotes);
				continue;
			}

			transferLines.set(lineKey, {
				skuId: sku.id,
				variantId: variant?.id,
				batchId,
				requestedQty,
				transferredQty,
				notes: lineNotes,
			});
		}

		if (transferLines.size === 0) {
			warnings.push(`Skipped transfer header ${headerId} because none of its lines could be mapped into the current transfer model.`);
			continue;
		}

		const requestedAt = asDate(header.DocumentDate) ?? asDate(header.CreatedDate) ?? new Date();
		const approvedAt = transferStatus === 'Draft' ? undefined : (asDate(header.AcceptedDate) ?? requestedAt);
		const completedAt = transferStatus === 'Completed' ? (approvedAt ?? requestedAt) : undefined;
		await db.stockTransfer.create({
			data: {
				referenceNumber,
				fromBranchId: fromLocation.branchId ?? null,
				toBranchId: toLocation.branchId ?? null,
				fromFloorId: fromLocation.floorId ?? null,
				toFloorId: toLocation.floorId ?? null,
				status: transferStatus,
				notes: appendNotes(
					'Imported from legacy transfer history.',
					compactString(header.DocumentNo) ? `Legacy document no: ${compactString(header.DocumentNo)}` : undefined,
					compactString(header.ReferenceNo) ? `Legacy reference no: ${compactString(header.ReferenceNo)}` : undefined,
					compactString(header.GRNNo) ? `Legacy GRN no: ${compactString(header.GRNNo)}` : undefined,
					asInteger(header.TransferType) !== undefined ? `Legacy transfer type: ${asInteger(header.TransferType)}` : undefined,
					asInteger(header.Status) !== undefined ? `Legacy status code: ${asInteger(header.Status)}` : undefined,
					asBoolean(header.Accepted) !== undefined ? `Legacy accepted flag: ${asBoolean(header.Accepted) ? 1 : 0}` : undefined,
					compactString(header.CreatedUser) ? `Legacy created user: ${compactString(header.CreatedUser)}` : undefined,
					approvedByName ? `Legacy accepted by: ${approvedByName}` : undefined,
				),
				requestedBy,
				approvedBy: transferStatus === 'Draft' ? undefined : (approvedBy ?? requestedBy),
				requestedAt,
				approvedAt,
				completedAt,
				lines: {
					create: Array.from(transferLines.values()),
				},
			},
			select: { id: true },
		});
		counts.stockTransfersCreated += 1;
		counts.stockTransferLinesCreated += transferLines.size;
		caches.stockTransferByReference.add(referenceKey);
	}

	const adjustmentHeadersById = buildRowMap(dump.rowsByTable.adjustmentheader ?? [], 'AdjustmentHeaderID');
	for (const detail of dump.rowsByTable.adjustmentdetail ?? []) {
		const detailId = asId(detail.AdjustmentDetailID);
		if (!detailId) continue;

		const parentEntityId = `legacy-adjustment:${detailId}`;
		if (caches.inventoryEventParentIds.has(parentEntityId)) continue;

		const header = adjustmentHeadersById.get(asId(detail.AdjustmentHeaderID) ?? '');
		const userId = await ensureLegacyUser(db, caches, counts, header?.CreatedUser ?? detail.CreatedUser);
		const sku = asId(detail.ProductID) ? caches.skuBySourceId.get(asId(detail.ProductID)!) : undefined;
		const variant = asId(detail.ProductColorSizeID) ? caches.variantBySourceId.get(asId(detail.ProductColorSizeID)!) : undefined;
		await db.inventoryEvent.create({
			data: {
				eventType: 'MANUAL_ADJUSTMENT',
				parentEntityId,
				reasonCode: 'LEGACY_ADJUSTMENT',
				userId,
				terminalId: 'legacy-sql-import',
				timestamp: asDate(detail.DocumentDate) ?? asDate(detail.CreatedDate) ?? asDate(header?.DocumentDate) ?? new Date(),
				metadata: {
					importedAs: 'legacy-adjustment-event',
					legacyAdjustmentHeaderId: asId(header?.AdjustmentHeaderID),
					legacyAdjustmentDetailId: detailId,
					legacyDocumentNo: compactString(detail.DocumentNo) ?? compactString(header?.DocumentNo),
					legacyReferenceNo: compactString(detail.ReferenceNo) ?? compactString(header?.ReferenceNo),
					legacyAdjustmentMode: asInteger(header?.AdjustmentMode),
					legacyStatusCode: asInteger(detail.Status) ?? asInteger(header?.Status),
					legacyRemark: compactString(header?.AdjustmentRemark),
					quantity: asNumber(detail.Qty),
					costPrice: asNumber(detail.CostPrice),
					sellingPrice: asNumber(detail.SellingPrice),
					locationSourceId: asId(detail.LocationID),
					skuId: sku?.id,
					variantId: variant?.id,
					supplierSourceId: asId(detail.SupplierID),
					expiryDate: asDateString(detail.ExpiryDate),
				},
			},
		});
		counts.inventoryEventsCreated += 1;
		caches.inventoryEventParentIds.add(parentEntityId);
	}

	if (effectiveOptions.importInventorySnapshot) {
		const snapshotResult = buildLegacyInventorySnapshots(dump, {
			fractionalQuantityMode: effectiveOptions.fractionalQuantityMode,
		});
		counts.inventoryRowsSkipped += snapshotResult.skippedCount;
		warnings.push(...snapshotResult.warnings);

		for (const snapshot of snapshotResult.items) {
			const sku = caches.skuBySourceId.get(snapshot.productSourceId);
			if (!sku) {
				counts.inventoryRowsSkipped += 1;
				warnings.push(`Skipped inventory snapshot for product ${snapshot.productSourceId} because no SKU was created.`);
				continue;
			}

			const locationRow = sourceMaps.locations.get(snapshot.locationSourceId);
			const locationCode = compactString(locationRow?.LocationCode) ?? snapshot.locationSourceId;
			const branchId = caches.branchBySourceId.get(`source:${snapshot.locationSourceId}`);
			if (!branchId) {
				counts.inventoryRowsSkipped += 1;
				warnings.push(`Skipped inventory snapshot for product ${sku.skuCode} because location ${snapshot.locationSourceId} did not resolve to a branch.`);
				continue;
			}
			const floorId = caches.floorByBranchId.get(`${branchId}|${effectiveOptions.defaultFloorCode}`);
			if (!floorId) {
				counts.inventoryRowsSkipped += 1;
				warnings.push(`Skipped inventory snapshot for product ${sku.skuCode} because branch ${branchId} has no default floor.`);
				continue;
			}

			const variant = snapshot.productColorSizeSourceId ? caches.variantBySourceId.get(snapshot.productColorSizeSourceId) : undefined;
			const detailRow = sourceMaps.productDetailByProductLocation.get(`${snapshot.productSourceId}|${snapshot.locationSourceId}`);
			const variantDetail = snapshot.productColorSizeSourceId
				? sourceMaps.productColorSizeDetailByVariantLocation.get(`${snapshot.productColorSizeSourceId}|${snapshot.locationSourceId}`)
				: undefined;
			const sourcePricing = variantDetail ?? detailRow;
			const supplierSourceId = snapshot.supplierSourceId ?? asId(sourceMaps.products.get(snapshot.productSourceId)?.SupplierID);
			const vendorId = supplierSourceId ? caches.vendorBySourceId.get(supplierSourceId) : undefined;
			const batchNumber = buildBatchNumber({
				locationCode,
				skuCode: sku.skuCode,
				variantCode: variant?.variantCode,
				reference: snapshot.reference,
				expiryDate: snapshot.expiryDate,
			});

			const batchId = await ensureBatch(db, caches, counts, {
				batchNumber,
				skuId: sku.id,
				variantId: variant?.id,
				vendorId,
				costPrice: snapshot.costPrice ?? asNumber(sourcePricing?.CostPrice),
				sellingPrice: snapshot.sellingPrice ?? asNumber(sourcePricing?.SellingPrice),
				wholesalePrice: snapshot.wholesalePrice ?? asNumber(sourcePricing?.WholeSalePrice),
				bulkPrice: snapshot.bulkPrice ?? asNumber(sourcePricing?.SpecialPrice),
				expiryDate: snapshot.expiryDate,
				notes: buildLegacyNotes([
					`Imported from legacy ${snapshot.source} snapshot.`,
					snapshot.reference ? `Legacy reference: ${snapshot.reference}` : undefined,
					snapshot.binLocation ? `Legacy bin location: ${snapshot.binLocation}` : undefined,
				]),
			});

			const existingInventory = await db.inventoryRecord.findFirst({
				where: {
					batchId,
					floorId,
					shelfId: null,
					boxId: null,
					state: effectiveOptions.inventoryState,
				},
				select: { id: true },
			});

			if (existingInventory) {
				await db.inventoryRecord.update({
					where: { id: existingInventory.id },
					data: {
						quantity: snapshot.quantity,
						skuId: sku.id,
						variantId: variant?.id ?? null,
						terminalId: 'legacy-sql-import',
					},
				});
				counts.inventoryRecordsUpdated += 1;
				continue;
			}

			await db.inventoryRecord.create({
				data: {
					skuId: sku.id,
					variantId: variant?.id ?? null,
					batchId,
					floorId,
					quantity: snapshot.quantity,
					state: effectiveOptions.inventoryState,
					terminalId: 'legacy-sql-import',
				},
			});
			counts.inventoryRecordsCreated += 1;
		}
	}

	return { analysis, counts, warnings: unique(warnings) };
}

export function renderLegacySchemaAnalysis(analysis: LegacySchemaAnalysis, label = 'Legacy SQL dump') {
	const lines = [
		`${label}`,
		`Tables found: ${analysis.tableCount}`,
		`Tables with data: ${analysis.dataTableCount}`,
	];

	if (analysis.tablesWithData.length > 0) {
		lines.push(`Data tables: ${analysis.tablesWithData.join(', ')}`);
	}

	lines.push('');
	lines.push('Import coverage:');
	for (const domain of analysis.importableDomains) {
		lines.push(`- [${domain.support}] ${domain.label}: ${domain.notes.join(' ')}`);
	}

	if (analysis.missingDomains.length > 0) {
		lines.push('');
		lines.push('Major gaps in the current schema:');
		for (const gap of analysis.missingDomains) {
			lines.push(`- [${gap.severity}] ${gap.label}: ${gap.reason}`);
		}
	}

	if (analysis.notes.length > 0) {
		lines.push('');
		lines.push('Notes:');
		for (const note of analysis.notes) {
			lines.push(`- ${note}`);
		}
	}

	return lines.join('\n');
}

export function renderLegacyImportResult(result: LegacySqlImportResult, label = 'Legacy SQL import') {
	const lines = [
		renderLegacySchemaAnalysis(result.analysis, label),
		'',
		'Import results:',
	];

	for (const [key, value] of Object.entries(result.counts) as Array<[keyof LegacySqlImportCounts, number]>) {
		lines.push(`- ${humanizeCountKey(key)}: ${value}`);
	}

	if (result.warnings.length > 0) {
		lines.push('');
		lines.push('Warnings:');
		for (const warning of result.warnings) {
			lines.push(`- ${warning}`);
		}
	}

	return lines.join('\n');
}
