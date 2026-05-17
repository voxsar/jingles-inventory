import prisma from '../../prisma/client';
import {
	ClaudeImportResult,
	GRNImportInput,
	GRNLineImportInput,
	ImportEntityType,
	InventoryImportInput,
	PreparedImportRecord,
	PRNImportInput,
	PRNLineImportInput,
	ProductImportInput,
	RelatedRecordPreview,
	SupplierImportInput,
} from './types';

type VendorRef = {
	id: string;
	name: string;
	contactEmail: string;
	taxId: string | null;
	type: string;
	isActive: boolean;
};

type CategoryRef = { id: string; name: string };
type UnitRef = { id: string; name: string; abbreviation: string };
type SKURef = {
	id: string;
	skuCode: string;
	name: string;
	vendorId: string;
	categoryId: string | null;
	unitOfMeasure: string;
	unitOfMeasureId: string | null;
};
type VariantRef = { id: string; skuId: string; variantCode: string; name: string | null };
type BatchRef = {
	id: string;
	batchNumber: string;
	skuId: string;
	variantId: string | null;
	vendorId: string | null;
	costPrice: number | null;
	sellingPrice: number | null;
	wholesalePrice: number | null;
	bulkPrice: number | null;
	currency: string;
	manufacturingDate: Date | null;
	expiryDate: Date | null;
	notes: string | null;
};
type BranchRef = { id: string; code: string; name: string };
type FloorRef = { id: string; branchId: string; code: string; name: string };
type ShelfRef = { id: string; floorId: string; code: string; name: string };
type BoxRef = { id: string; shelfId: string | null; floorId: string | null; code: string; name: string };
type StatusRef = { value: string; label: string };

type MultiMap<T> = Map<string, T[]>;

interface ImportReferenceData {
	vendors: VendorRef[];
	vendorsByName: MultiMap<VendorRef>;
	vendorsByEmail: MultiMap<VendorRef>;
	vendorsByTaxId: MultiMap<VendorRef>;
	categories: CategoryRef[];
	categoriesByName: MultiMap<CategoryRef>;
	units: UnitRef[];
	unitsByKey: MultiMap<UnitRef>;
	skus: SKURef[];
	skuByCode: Map<string, SKURef>;
	skusByName: MultiMap<SKURef>;
	variants: VariantRef[];
	variantByCode: Map<string, VariantRef>;
	variantsBySkuId: Map<string, VariantRef[]>;
	batches: BatchRef[];
	batchByNumber: Map<string, BatchRef>;
	branches: BranchRef[];
	branchesByCode: MultiMap<BranchRef>;
	branchesByName: MultiMap<BranchRef>;
	branchById: Map<string, BranchRef>;
	floors: FloorRef[];
	floorsByCode: MultiMap<FloorRef>;
	floorsByName: MultiMap<FloorRef>;
	floorById: Map<string, FloorRef>;
	shelves: ShelfRef[];
	shelvesByCode: MultiMap<ShelfRef>;
	shelvesByName: MultiMap<ShelfRef>;
	shelfById: Map<string, ShelfRef>;
	boxes: BoxRef[];
	boxByCode: Map<string, BoxRef>;
	boxesByName: MultiMap<BoxRef>;
	inventoryStates: StatusRef[];
	inventoryStatesByKey: Map<string, string>;
}

type VendorResolution = {
	action: 'match' | 'create' | 'unresolved';
	vendorId?: string;
	matchReason?: string;
	finalData?: Record<string, any>;
};

type LocationResolution = {
	branch?: BranchRef;
	floor?: FloorRef;
	shelf?: ShelfRef;
	box?: BoxRef;
	warnings: string[];
	errors: string[];
};

type BatchResolution = {
	action: 'none' | 'match' | 'create';
	batchId?: string;
	batchNumber?: string;
	createData?: Record<string, any>;
};

type EntityBuilder = (
	record: { summary?: string; confidence?: number; warnings?: string[]; data: any },
	refs: ImportReferenceData,
	jobId: string,
	sourceIndex: number,
) => PreparedImportRecord;

function addToMultiMap<T>(map: MultiMap<T>, key: string | null | undefined, value: T) {
	const normalized = normalizeLookup(key);
	if (!normalized) return;
	const existing = map.get(normalized);
	if (existing) {
		existing.push(value);
		return;
	}
	map.set(normalized, [value]);
}

function buildMultiMap<T>(items: T[], keys: Array<(item: T) => string | null | undefined>) {
	const map: MultiMap<T> = new Map();
	for (const item of items) {
		for (const getKey of keys) {
			addToMultiMap(map, getKey(item), item);
		}
	}
	return map;
}

function buildIdMap<T extends { id: string }>(items: T[]) {
	return new Map(items.map((item) => [item.id, item]));
}

export function normalizeLookup(value: string | null | undefined) {
	return (value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function slugify(value: string | null | undefined) {
	return normalizeLookup(value).replace(/\s+/g, '-');
}

function compactString(value: string | null | undefined) {
	if (!value) return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalNumber(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value !== 'string') return undefined;
	const normalized = value.replace(/[, ]+/g, '').replace(/[^0-9.-]/g, '');
	if (!normalized) return undefined;
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalInteger(value: unknown) {
	const parsed = parseOptionalNumber(value);
	if (parsed === undefined) return undefined;
	return Math.round(parsed);
}

function parseOptionalDate(value: string | null | undefined) {
	const compact = compactString(value);
	if (!compact) return undefined;
	const parsed = new Date(compact);
	if (Number.isNaN(parsed.getTime())) return undefined;
	return parsed.toISOString().slice(0, 10);
}

function buildFallbackEmail(seed: string, source: string) {
	const slug = slugify(seed) || `${source}-import`;
	return `${slug}@import.local`;
}

function related(table: string, action: RelatedRecordPreview['action'], status: RelatedRecordPreview['status'], label: string, detail?: string): RelatedRecordPreview {
	return { table, action, status, label, detail };
}

function getSingleMatch<T>(candidates: T[], label: string, warnings: string[]) {
	if (candidates.length === 0) return undefined;
	if (candidates.length === 1) return candidates[0];
	warnings.push(`Ambiguous ${label}; the document matched ${candidates.length} existing records.`);
	return undefined;
}

function uniqueById<T extends { id: string }>(items: T[]) {
	return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function findVendor(
	refs: ImportReferenceData,
	name?: string,
	email?: string,
	taxId?: string,
	warnings: string[] = [],
) {
	const taxMatch = getSingleMatch(refs.vendorsByTaxId.get(normalizeLookup(taxId)) ?? [], 'supplier tax id', warnings);
	if (taxMatch) return { vendor: taxMatch, reason: 'taxId' as const };
	const emailMatch = getSingleMatch(refs.vendorsByEmail.get(normalizeLookup(email)) ?? [], 'supplier email', warnings);
	if (emailMatch) return { vendor: emailMatch, reason: 'email' as const };
	const nameMatch = getSingleMatch(refs.vendorsByName.get(normalizeLookup(name)) ?? [], 'supplier name', warnings);
	if (nameMatch) return { vendor: nameMatch, reason: 'name' as const };
	return null;
}

function findCategory(refs: ImportReferenceData, categoryName?: string, warnings: string[] = []) {
	return getSingleMatch(refs.categoriesByName.get(normalizeLookup(categoryName)) ?? [], 'category name', warnings);
}

function findUnit(refs: ImportReferenceData, unitValue?: string, warnings: string[] = []) {
	return getSingleMatch(refs.unitsByKey.get(normalizeLookup(unitValue)) ?? [], 'unit of measure', warnings);
}

function findSKU(refs: ImportReferenceData, skuCode?: string, skuName?: string, vendorId?: string, warnings: string[] = []) {
	const normalizedCode = normalizeLookup(skuCode);
	if (normalizedCode && refs.skuByCode.has(normalizedCode)) {
		return refs.skuByCode.get(normalizedCode);
	}

	const exactByName = refs.skusByName.get(normalizeLookup(skuName)) ?? [];
	const narrowedByVendor = vendorId ? exactByName.filter((sku) => sku.vendorId === vendorId) : exactByName;
	const exact = getSingleMatch(narrowedByVendor.length > 0 ? narrowedByVendor : exactByName, 'product name', warnings);
	if (exact) return exact;

	const normalizedName = normalizeLookup(skuName);
	if (!normalizedName || normalizedName.length < 4) return undefined;
	const fuzzy = refs.skus.filter((sku) => {
		const current = normalizeLookup(sku.name);
		if (!current) return false;
		if (vendorId && sku.vendorId !== vendorId) return false;
		return current.includes(normalizedName) || normalizedName.includes(current);
	});
	return getSingleMatch(fuzzy, 'product name', warnings);
}

function findVariant(refs: ImportReferenceData, skuId: string | undefined, variantCode?: string, variantName?: string, warnings: string[] = []) {
	const normalizedCode = normalizeLookup(variantCode);
	if (normalizedCode && refs.variantByCode.has(normalizedCode)) {
		const variant = refs.variantByCode.get(normalizedCode)!;
		if (!skuId || variant.skuId === skuId) return variant;
		warnings.push(`Variant code "${variantCode}" belongs to a different product than the matched SKU.`);
		return undefined;
	}

	if (!skuId) return undefined;
	const candidates = refs.variantsBySkuId.get(skuId) ?? [];
	return getSingleMatch(
		candidates.filter((variant) => normalizeLookup(variant.name) === normalizeLookup(variantName)),
		'variant name',
		warnings,
	);
}

function findBatch(refs: ImportReferenceData, batchNumber?: string) {
	if (!batchNumber) return undefined;
	return refs.batchByNumber.get(normalizeLookup(batchNumber));
}

function resolveVendorResolution(
	refs: ImportReferenceData,
	input: {
		name?: string;
		email?: string;
		phone?: string;
		address?: string;
		type?: string;
		website?: string;
		taxId?: string;
		paymentTerms?: string;
		notes?: string;
	},
	defaultType: string,
	warnings: string[],
	errors: string[],
): VendorResolution {
	const match = findVendor(refs, input.name, input.email, input.taxId, warnings);
	if (match) {
		return {
			action: 'match',
			vendorId: match.vendor.id,
			matchReason: match.reason,
			finalData: {
				name: input.name ?? match.vendor.name,
				contactEmail: input.email ?? match.vendor.contactEmail,
				contactPhone: input.phone,
				address: input.address,
				type: input.type ?? match.vendor.type,
				website: input.website,
				taxId: input.taxId ?? match.vendor.taxId,
				paymentTerms: input.paymentTerms,
				notes: input.notes,
			},
		};
	}

	const name = compactString(input.name);
	if (!name) {
		errors.push('A supplier or vendor name is required to map this record.');
		return { action: 'unresolved' };
	}

	const email = compactString(input.email) ?? buildFallbackEmail(name, 'vendor');
	if (!input.email) {
		warnings.push(`No supplier email was found for "${name}", so a placeholder import email will be used.`);
	}

	return {
		action: 'create',
		finalData: {
			name,
			contactEmail: email,
			contactPhone: compactString(input.phone),
			address: compactString(input.address),
			type: compactString(input.type) ?? defaultType,
			website: compactString(input.website),
			taxId: compactString(input.taxId),
			paymentTerms: compactString(input.paymentTerms),
			notes: compactString(input.notes),
		},
	};
}

function resolveLocation(
	refs: ImportReferenceData,
	input: {
		branchCode?: string;
		branchName?: string;
		floorCode?: string;
		floorName?: string;
		shelfCode?: string;
		shelfName?: string;
		boxCode?: string;
		boxName?: string;
	},
): LocationResolution {
	const warnings: string[] = [];
	const errors: string[] = [];

	const branchCandidates = uniqueById([
		...(refs.branchesByCode.get(normalizeLookup(input.branchCode)) ?? []),
		...(refs.branchesByName.get(normalizeLookup(input.branchName)) ?? []),
	]);
	let branch = getSingleMatch(branchCandidates, 'branch', warnings);

	let floorCandidates = uniqueById([
		...(refs.floorsByCode.get(normalizeLookup(input.floorCode)) ?? []),
		...(refs.floorsByName.get(normalizeLookup(input.floorName)) ?? []),
	]);
	if (branch) {
		floorCandidates = floorCandidates.filter((floor) => floor.branchId === branch!.id);
	}
	let floor = getSingleMatch(floorCandidates, 'floor', warnings);

	let shelfCandidates = uniqueById([
		...(refs.shelvesByCode.get(normalizeLookup(input.shelfCode)) ?? []),
		...(refs.shelvesByName.get(normalizeLookup(input.shelfName)) ?? []),
	]);
	if (floor) {
		shelfCandidates = shelfCandidates.filter((shelf) => shelf.floorId === floor!.id);
	}
	let shelf = getSingleMatch(shelfCandidates, 'shelf', warnings);

	let box: BoxRef | undefined;
	if (input.boxCode) {
		box = refs.boxByCode.get(normalizeLookup(input.boxCode));
	} else {
		const boxCandidates = refs.boxesByName.get(normalizeLookup(input.boxName)) ?? [];
		box = getSingleMatch(boxCandidates, 'box', warnings);
	}

	if (!shelf && box?.shelfId) {
		shelf = refs.shelfById.get(box.shelfId);
	}
	if (!floor && shelf) {
		floor = refs.floorById.get(shelf.floorId);
	}
	if (!floor && box?.floorId) {
		floor = refs.floorById.get(box.floorId);
	}
	if (!branch && floor) {
		branch = refs.branchById.get(floor.branchId);
	}

	if (floor && branch && floor.branchId !== branch.id) {
		errors.push('The matched floor belongs to a different branch than the branch identified in the document.');
	}
	if (shelf && floor && shelf.floorId !== floor.id) {
		errors.push('The matched shelf belongs to a different floor than the floor identified in the document.');
	}
	if (box && shelf && box.shelfId && box.shelfId !== shelf.id) {
		errors.push('The matched box belongs to a different shelf than the shelf identified in the document.');
	}

	if ((input.branchCode || input.branchName) && !branch) warnings.push('The branch in the document could not be matched to an existing branch.');
	if ((input.floorCode || input.floorName) && !floor) warnings.push('The floor in the document could not be matched to an existing floor.');
	if ((input.shelfCode || input.shelfName) && !shelf) warnings.push('The shelf in the document could not be matched to an existing shelf.');
	if ((input.boxCode || input.boxName) && !box) warnings.push('The box in the document could not be matched to an existing storage box.');

	return { branch, floor, shelf, box, warnings, errors };
}

function findInventoryState(refs: ImportReferenceData, inputState: string | undefined, warnings: string[]) {
	const normalized = normalizeLookup(inputState);
	if (!normalized) {
		return refs.inventoryStatesByKey.get('uninspected') ?? 'Uninspected';
	}

	const matched = refs.inventoryStatesByKey.get(normalized);
	if (matched) return matched;

	warnings.push(`Inventory state "${inputState}" was not recognized, so the default Uninspected state will be used.`);
	return refs.inventoryStatesByKey.get('uninspected') ?? 'Uninspected';
}

function buildGeneratedSkuCode(jobId: string, sourceIndex: number) {
	return `IMP-${jobId.slice(0, 6).toUpperCase()}-${String(sourceIndex + 1).padStart(4, '0')}`;
}

function buildBatchResolution(
	refs: ImportReferenceData,
	input: {
		batchNumber?: string;
		costPrice?: number;
		sellingPrice?: number;
		wholesalePrice?: number;
		bulkPrice?: number;
		currency?: string;
		manufacturingDate?: string;
		expiryDate?: string;
		notes?: string;
	},
	skuId: string | undefined,
	variantId: string | null | undefined,
	warnings: string[],
	errors: string[],
) {
	const batchNumber = compactString(input.batchNumber);
	const existingBatch = findBatch(refs, batchNumber);
	if (existingBatch) {
		if (skuId && existingBatch.skuId !== skuId) {
			errors.push(`Batch "${batchNumber}" belongs to a different product than the matched SKU.`);
			return { action: 'none' as const };
		}
		if (variantId && existingBatch.variantId && existingBatch.variantId !== variantId) {
			errors.push(`Batch "${batchNumber}" belongs to a different variant than the matched variant.`);
			return { action: 'none' as const };
		}
		return { action: 'match' as const, batchId: existingBatch.id, batchNumber: existingBatch.batchNumber };
	}

	const shouldCreate = Boolean(
		batchNumber
		|| input.costPrice !== undefined
		|| input.sellingPrice !== undefined
		|| input.wholesalePrice !== undefined
		|| input.bulkPrice !== undefined
		|| parseOptionalDate(input.manufacturingDate)
		|| parseOptionalDate(input.expiryDate),
	);
	if (!shouldCreate) {
		return { action: 'none' as const };
	}

	if (!skuId) {
		warnings.push('Batch details were found, but a product match is still required before the batch can be created.');
		return { action: 'none' as const };
	}

	return {
		action: 'create',
		batchNumber,
		createData: {
			batchNumber,
			costPrice: input.costPrice,
			sellingPrice: input.sellingPrice,
			wholesalePrice: input.wholesalePrice,
			bulkPrice: input.bulkPrice,
			currency: compactString(input.currency),
			manufacturingDate: parseOptionalDate(input.manufacturingDate),
			expiryDate: parseOptionalDate(input.expiryDate),
			notes: compactString(input.notes),
			variantId: variantId ?? null,
		},
	};
}

function buildSupplierRecord(
	record: { summary?: string; confidence?: number; warnings?: string[]; data: SupplierImportInput },
	refs: ImportReferenceData,
): PreparedImportRecord {
	const warnings = [...(record.warnings ?? [])];
	const errors: string[] = [];
	const vendorResolution = resolveVendorResolution(
		refs,
		{
			name: record.data.name,
			email: record.data.contactEmail,
			phone: record.data.contactPhone,
			address: record.data.address,
			type: record.data.type,
			website: record.data.website,
			taxId: record.data.taxId,
			paymentTerms: record.data.paymentTerms,
			notes: record.data.notes,
		},
		'Supplier',
		warnings,
		errors,
	);

	const label = compactString(record.data.name) ?? 'Unnamed supplier';
	const relatedRecords: RelatedRecordPreview[] = [
		related(
			'vendors',
			vendorResolution.action === 'match' ? 'update' : 'create',
			errors.length > 0 ? 'error' : 'ready',
			label,
			vendorResolution.action === 'match'
				? `Matched existing supplier by ${vendorResolution.matchReason}.`
				: 'A supplier/vendor record will be created or updated on approval.',
		),
	];

	return {
		recordType: 'supplier',
		summary: compactString(record.summary) ?? label,
		confidence: record.confidence ?? record.data.confidence ?? null,
		isSelected: errors.length === 0,
		payload: {
			entityType: 'supplier',
			action: vendorResolution.action === 'match' ? 'update' : 'create',
			extracted: record.data,
			vendorResolution,
		},
		relatedRecords,
		warnings,
		errors,
	};
}

function buildProductRecord(
	record: { summary?: string; confidence?: number; warnings?: string[]; data: ProductImportInput },
	refs: ImportReferenceData,
	jobId: string,
	sourceIndex: number,
): PreparedImportRecord {
	const warnings = [...(record.warnings ?? [])];
	const errors: string[] = [];
	let categoryWarnings: string[] = [];
	let unitWarnings: string[] = [];

	const existingByCode = record.data.skuCode
		? refs.skuByCode.get(normalizeLookup(record.data.skuCode))
		: undefined;
	const vendorResolution = resolveVendorResolution(
		refs,
		{
			name: record.data.vendorName,
			email: record.data.vendorEmail,
		},
		'Both',
		warnings,
		existingByCode ? [] : errors,
	);

	const vendorIdForLookup = existingByCode?.vendorId ?? vendorResolution.vendorId;
	const existingSku = existingByCode ?? findSKU(refs, record.data.skuCode, record.data.name, vendorIdForLookup, warnings);
	const category = findCategory(refs, record.data.categoryName, categoryWarnings);
	const unit = findUnit(refs, record.data.unitOfMeasure, unitWarnings);
	warnings.push(...categoryWarnings, ...unitWarnings);

	const name = compactString(record.data.name) ?? existingSku?.name;
	if (!name) {
		errors.push('A product name or a reliable existing SKU match is required.');
	}

	if (!existingSku && vendorResolution.action === 'unresolved') {
		errors.push('A vendor is required before a new product can be created.');
	}

	let skuCode = compactString(record.data.skuCode) ?? existingSku?.skuCode;
	if (!skuCode) {
		skuCode = buildGeneratedSkuCode(jobId, sourceIndex);
		warnings.push(`No SKU code was found, so "${skuCode}" will be used as the generated import code.`);
	}
	if (existingSku && compactString(record.data.skuCode) && record.data.skuCode !== existingSku.skuCode) {
		warnings.push(`The document SKU code "${record.data.skuCode}" differs from the matched existing SKU code "${existingSku.skuCode}". The existing SKU code will be preserved.`);
	}

	const finalData = {
		skuCode,
		name,
		description: compactString(record.data.description),
		categoryId: category?.id ?? existingSku?.categoryId ?? null,
		unitOfMeasure: unit?.name ?? compactString(record.data.unitOfMeasure) ?? existingSku?.unitOfMeasure ?? 'Piece',
		unitOfMeasureId: unit?.id ?? existingSku?.unitOfMeasureId ?? null,
		costPrice: parseOptionalNumber(record.data.costPrice),
		sellingPrice: parseOptionalNumber(record.data.sellingPrice),
		wholesalePrice: parseOptionalNumber(record.data.wholesalePrice),
		bulkPrice: parseOptionalNumber(record.data.bulkPrice),
		marginType: record.data.marginType,
		marginValue: parseOptionalNumber(record.data.marginValue),
		currency: compactString(record.data.currency) ?? 'LKR',
		defaultManufacturingDate: parseOptionalDate(record.data.defaultManufacturingDate),
		defaultExpiryDate: parseOptionalDate(record.data.defaultExpiryDate),
		shelfLifeDays: parseOptionalInteger(record.data.shelfLifeDays),
		lowStockThreshold: parseOptionalInteger(record.data.lowStockThreshold),
	};

	const relatedRecords: RelatedRecordPreview[] = [];
	if (vendorResolution.action !== 'unresolved') {
		relatedRecords.push(
			related(
				'vendors',
				vendorResolution.action === 'match' ? 'match' : 'create',
				'ready',
				compactString(record.data.vendorName) ?? vendorResolution.finalData?.name ?? 'Vendor',
				vendorResolution.action === 'match'
					? `Matched existing vendor by ${vendorResolution.matchReason}.`
					: 'A vendor/supplier record will be created for this product.',
			),
		);
	}
	if (category) {
		relatedRecords.push(related('categories', 'match', 'ready', category.name, 'Matched an existing category.'));
	} else if (record.data.categoryName) {
		relatedRecords.push(related('categories', 'derive', 'warning', record.data.categoryName, 'No existing category was matched; the product will be imported without a category.'));
	}
	if (unit) {
		relatedRecords.push(related('units_of_measure', 'match', 'ready', unit.name, 'Matched an existing unit of measure.'));
	}
	relatedRecords.push(
		related(
			'skus',
			existingSku ? 'update' : 'create',
			errors.length > 0 ? 'error' : 'ready',
			`${skuCode} - ${name ?? 'Unnamed product'}`,
			existingSku ? 'This import will update the matched existing product.' : 'This import will create a new product record.',
		),
	);

	return {
		recordType: 'product',
		summary: compactString(record.summary) ?? `${skuCode} - ${name ?? 'Unnamed product'}`,
		confidence: record.confidence ?? record.data.confidence ?? null,
		isSelected: errors.length === 0,
		payload: {
			entityType: 'product',
			action: existingSku ? 'update' : 'create',
			existingSkuId: existingSku?.id,
			extracted: record.data,
			vendorResolution,
			categoryId: category?.id ?? null,
			unitOfMeasureId: unit?.id ?? null,
			finalData,
		},
		relatedRecords,
		warnings,
		errors,
	};
}

function buildInventoryRecord(
	record: { summary?: string; confidence?: number; warnings?: string[]; data: InventoryImportInput },
	refs: ImportReferenceData,
): PreparedImportRecord {
	const warnings = [...(record.warnings ?? [])];
	const errors: string[] = [];
	const vendorResolution = record.data.vendorName
		? resolveVendorResolution(refs, { name: record.data.vendorName }, 'Supplier', warnings, [])
		: { action: 'unresolved' as const };
	const sku = findSKU(refs, record.data.skuCode, record.data.skuName, vendorResolution.vendorId, warnings);
	if (!sku) {
		errors.push('The inventory row could not be matched to an existing product.');
	}

	let variant = findVariant(refs, sku?.id, record.data.variantCode, record.data.variantName, warnings);
	const batchMatch = findBatch(refs, record.data.batchNumber);
	if (batchMatch) {
		if (sku && batchMatch.skuId !== sku.id) {
			errors.push(`Batch "${batchMatch.batchNumber}" belongs to a different product than the matched SKU.`);
		}
		if (!variant && batchMatch.variantId) {
			variant = refs.variants.find((current) => current.id === batchMatch.variantId);
		}
	}

	const batchResolution = batchMatch
		? ({ action: 'match', batchId: batchMatch.id, batchNumber: batchMatch.batchNumber } as BatchResolution)
		: buildBatchResolution(
			refs,
			{
				batchNumber: record.data.batchNumber,
				costPrice: parseOptionalNumber(record.data.costPrice),
				sellingPrice: parseOptionalNumber(record.data.sellingPrice),
				wholesalePrice: parseOptionalNumber(record.data.wholesalePrice),
				bulkPrice: parseOptionalNumber(record.data.bulkPrice),
				currency: record.data.currency,
				manufacturingDate: record.data.manufacturingDate,
				expiryDate: record.data.expiryDate,
				notes: record.data.notes,
			},
			sku?.id,
			variant?.id,
			warnings,
			errors,
		);

	const location = resolveLocation(refs, {
		branchCode: record.data.branchCode,
		branchName: record.data.branchName,
		floorCode: record.data.floorCode,
		floorName: record.data.floorName,
		shelfCode: record.data.shelfCode,
		shelfName: record.data.shelfName,
		boxCode: record.data.boxCode,
		boxName: record.data.boxName,
	});
	warnings.push(...location.warnings);
	errors.push(...location.errors);

	const quantity = parseOptionalNumber(record.data.quantity);
	if (!quantity || quantity <= 0) {
		errors.push('Inventory quantity must be greater than zero.');
	}

	const finalState = findInventoryState(refs, record.data.state, warnings);
	const relatedRecords: RelatedRecordPreview[] = [];
	if (sku) {
		relatedRecords.push(related('skus', 'match', 'ready', `${sku.skuCode} - ${sku.name}`, 'Matched an existing SKU.'));
	}
	if (variant) {
		relatedRecords.push(related('sku_variants', 'match', 'ready', variant.variantCode, 'Matched an existing variant.'));
	}
	if (batchResolution.action === 'match') {
		relatedRecords.push(related('batches', 'match', 'ready', batchResolution.batchNumber ?? 'Batch', 'Matched an existing batch.'));
	}
	if (batchResolution.action === 'create') {
		relatedRecords.push(related('batches', 'create', errors.length > 0 ? 'error' : 'ready', batchResolution.batchNumber ?? 'Generated batch', 'A new batch will be created before the inventory record.'));
	}
	if (location.branch) relatedRecords.push(related('branches', 'match', 'ready', location.branch.name, 'Matched an existing branch.'));
	if (location.floor) relatedRecords.push(related('floors', 'match', 'ready', location.floor.name, 'Matched an existing floor.'));
	if (location.shelf) relatedRecords.push(related('shelves', 'match', 'ready', location.shelf.name, 'Matched an existing shelf.'));
	if (location.box) relatedRecords.push(related('storage_boxes', 'match', 'ready', location.box.code, 'Matched an existing storage box.'));
	relatedRecords.push(
		related(
			'inventory_records',
			'create',
			errors.length > 0 ? 'error' : 'ready',
			`${quantity ?? '?'} x ${sku?.skuCode ?? record.data.skuCode ?? record.data.skuName ?? 'Unmatched SKU'}`,
			'A new inventory record will be created on approval.',
		),
	);

	return {
		recordType: 'inventory',
		summary: compactString(record.summary) ?? `${quantity ?? '?'} x ${sku?.skuCode ?? record.data.skuCode ?? record.data.skuName ?? 'Unmatched SKU'}`,
		confidence: record.confidence ?? record.data.confidence ?? null,
		isSelected: errors.length === 0,
		payload: {
			entityType: 'inventory',
			extracted: record.data,
			skuId: sku?.id,
			variantId: variant?.id ?? null,
			vendorResolution: vendorResolution.action === 'unresolved' ? null : vendorResolution,
			batchResolution,
			location: {
				branchId: location.branch?.id ?? null,
				floorId: location.floor?.id ?? null,
				shelfId: location.shelf?.id ?? null,
				boxId: location.box?.id ?? null,
			},
			finalData: {
				quantity,
				state: finalState,
				terminalId: compactString(record.data.terminalId),
				notes: compactString(record.data.notes),
			},
		},
		relatedRecords,
		warnings,
		errors,
	};
}

function resolveGRNLine(
	line: GRNLineImportInput,
	refs: ImportReferenceData,
	supplierResolution: VendorResolution,
	warnings: string[],
	errors: string[],
) {
	const sku = findSKU(refs, line.skuCode, line.skuName, supplierResolution.vendorId, warnings);
	if (!sku) {
		errors.push(`A GRN line could not be matched to an existing product (${line.skuCode ?? line.skuName ?? 'unknown line'}).`);
	}
	let variant = findVariant(refs, sku?.id, line.variantCode, line.variantName, warnings);
	const batchMatch = findBatch(refs, line.batchNumber);
	if (batchMatch) {
		if (sku && batchMatch.skuId !== sku.id) {
			errors.push(`Batch "${batchMatch.batchNumber}" belongs to a different product than the GRN line.`);
		}
		if (!variant && batchMatch.variantId) {
			variant = refs.variants.find((current) => current.id === batchMatch.variantId);
		}
	}
	const quantity = parseOptionalInteger(line.expectedQuantity);
	if (!quantity || quantity <= 0) {
		errors.push(`GRN line quantity must be greater than zero for ${line.skuCode ?? line.skuName ?? 'an import line'}.`);
	}

	const batchResolution = batchMatch
		? ({ action: 'match', batchId: batchMatch.id, batchNumber: batchMatch.batchNumber } as BatchResolution)
		: buildBatchResolution(
			refs,
			{
				batchNumber: line.batchNumber,
				costPrice: parseOptionalNumber(line.costPrice),
				sellingPrice: parseOptionalNumber(line.sellingPrice),
				wholesalePrice: parseOptionalNumber(line.wholesalePrice),
				bulkPrice: parseOptionalNumber(line.bulkPrice),
				notes: line.notes,
			},
			sku?.id,
			variant?.id,
			warnings,
			errors,
		);

	return {
		extracted: line,
		skuId: sku?.id,
		skuCode: sku?.skuCode ?? line.skuCode ?? line.skuName,
		variantId: variant?.id ?? null,
		variantCode: variant?.variantCode ?? line.variantCode ?? line.variantName,
		batchResolution,
		expectedQuantity: quantity,
		costPrice: parseOptionalNumber(line.costPrice),
		sellingPrice: parseOptionalNumber(line.sellingPrice),
		wholesalePrice: parseOptionalNumber(line.wholesalePrice),
		bulkPrice: parseOptionalNumber(line.bulkPrice),
		marginType: line.marginType,
		marginValue: parseOptionalNumber(line.marginValue),
		notes: compactString(line.notes),
	};
}

function buildGRNRecord(
	record: { summary?: string; confidence?: number; warnings?: string[]; data: GRNImportInput },
	refs: ImportReferenceData,
): PreparedImportRecord {
	const warnings = [...(record.warnings ?? [])];
	const errors: string[] = [];
	const supplierResolution = resolveVendorResolution(
		refs,
		{
			name: record.data.supplierName,
			email: record.data.supplierEmail,
		},
		'Supplier',
		warnings,
		errors,
	);
	const location = resolveLocation(refs, {
		branchCode: record.data.branchCode,
		branchName: record.data.branchName,
		floorCode: record.data.floorCode,
		floorName: record.data.floorName,
		shelfCode: record.data.shelfCode,
		shelfName: record.data.shelfName,
	});
	warnings.push(...location.warnings);
	errors.push(...location.errors);

	const lines = (record.data.lines ?? []).map((line) => resolveGRNLine(line, refs, supplierResolution, warnings, errors));
	if (lines.length === 0) {
		errors.push('The GRN document did not contain any line items.');
	}

	const label = compactString(record.data.invoiceReference)
		? `GRN ${record.data.invoiceReference}`
		: `GRN from ${record.data.supplierName ?? 'Unknown supplier'}`;
	const relatedRecords: RelatedRecordPreview[] = [];
	if (supplierResolution.action !== 'unresolved') {
		relatedRecords.push(
			related(
				'vendors',
				supplierResolution.action === 'match' ? 'match' : 'create',
				'ready',
				compactString(record.data.supplierName) ?? supplierResolution.finalData?.name ?? 'Supplier',
				supplierResolution.action === 'match'
					? `Matched existing supplier by ${supplierResolution.matchReason}.`
					: 'A supplier record will be created before the GRN is saved.',
			),
		);
	}
	if (location.floor) relatedRecords.push(related('floors', 'match', 'ready', location.floor.name, 'Matched an existing floor.'));
	if (location.shelf) relatedRecords.push(related('shelves', 'match', 'ready', location.shelf.name, 'Matched an existing shelf.'));
	relatedRecords.push(related('grns', 'create', errors.length > 0 ? 'error' : 'ready', label, 'A draft GRN will be created on approval.'));
	relatedRecords.push(related('grn_lines', 'create', errors.length > 0 ? 'error' : 'ready', `${lines.length} line(s)`, 'The GRN lines will be created with the mapped product references.'));
	for (const line of lines) {
		if (line.batchResolution.action === 'match') {
			relatedRecords.push(related('batches', 'match', 'ready', line.batchResolution.batchNumber ?? 'Batch', `Matched a batch for ${line.skuCode}.`));
		}
		if (line.batchResolution.action === 'create') {
			relatedRecords.push(related('batches', 'create', errors.length > 0 ? 'error' : 'ready', line.batchResolution.batchNumber ?? `Batch for ${line.skuCode}`, 'A new batch will be created for this GRN line.'));
		}
	}

	return {
		recordType: 'grn',
		summary: compactString(record.summary) ?? label,
		confidence: record.confidence ?? record.data.confidence ?? null,
		isSelected: errors.length === 0,
		payload: {
			entityType: 'grn',
			extracted: record.data,
			supplierResolution,
			location: {
				branchId: location.branch?.id ?? null,
				floorId: location.floor?.id ?? null,
				shelfId: location.shelf?.id ?? null,
			},
			finalData: {
				invoiceReference: compactString(record.data.invoiceReference),
				supplierInvoiceDate: parseOptionalDate(record.data.supplierInvoiceDate),
				expectedDeliveryDate: parseOptionalDate(record.data.expectedDeliveryDate),
				deliveryDate: parseOptionalDate(record.data.deliveryDate),
				notes: compactString(record.data.notes),
			},
			lines,
		},
		relatedRecords,
		warnings,
		errors,
	};
}

function resolvePRNLine(
	line: PRNLineImportInput,
	refs: ImportReferenceData,
	supplierResolution: VendorResolution,
	warnings: string[],
	errors: string[],
) {
	const sku = findSKU(refs, line.skuCode, line.skuName, supplierResolution.vendorId, warnings);
	if (!sku) {
		errors.push(`A PRN line could not be matched to an existing product (${line.skuCode ?? line.skuName ?? 'unknown line'}).`);
	}
	let variant = findVariant(refs, sku?.id, line.variantCode, line.variantName, warnings);
	const batch = findBatch(refs, line.batchNumber);
	if (batch) {
		if (sku && batch.skuId !== sku.id) {
			errors.push(`Batch "${batch.batchNumber}" belongs to a different product than the PRN line.`);
		}
		if (!variant && batch.variantId) {
			variant = refs.variants.find((current) => current.id === batch.variantId);
		}
	}
	const returnQuantity = parseOptionalInteger(line.returnQuantity);
	if (!returnQuantity || returnQuantity <= 0) {
		errors.push(`PRN line quantity must be greater than zero for ${line.skuCode ?? line.skuName ?? 'an import line'}.`);
	}

	return {
		extracted: line,
		skuId: sku?.id,
		skuCode: sku?.skuCode ?? line.skuCode ?? line.skuName,
		variantId: variant?.id ?? null,
		variantCode: variant?.variantCode ?? line.variantCode ?? line.variantName,
		batchId: batch?.id ?? null,
		batchNumber: batch?.batchNumber ?? line.batchNumber,
		returnQuantity,
		notes: compactString(line.notes),
	};
}

function buildPRNRecord(
	record: { summary?: string; confidence?: number; warnings?: string[]; data: PRNImportInput },
	refs: ImportReferenceData,
): PreparedImportRecord {
	const warnings = [...(record.warnings ?? [])];
	const errors: string[] = [];
	const supplierResolution = resolveVendorResolution(
		refs,
		{
			name: record.data.supplierName,
			email: record.data.supplierEmail,
		},
		'Supplier',
		warnings,
		errors,
	);
	const location = resolveLocation(refs, {
		branchCode: record.data.branchCode,
		branchName: record.data.branchName,
		floorCode: record.data.floorCode,
		floorName: record.data.floorName,
		shelfCode: record.data.shelfCode,
		shelfName: record.data.shelfName,
	});
	warnings.push(...location.warnings);
	errors.push(...location.errors);

	const lines = (record.data.lines ?? []).map((line) => resolvePRNLine(line, refs, supplierResolution, warnings, errors));
	if (lines.length === 0) {
		errors.push('The PRN document did not contain any line items.');
	}

	const label = compactString(record.data.returnReason)
		? `PRN - ${record.data.returnReason}`
		: `PRN for ${record.data.supplierName ?? 'Unknown supplier'}`;
	const relatedRecords: RelatedRecordPreview[] = [];
	if (supplierResolution.action !== 'unresolved') {
		relatedRecords.push(
			related(
				'vendors',
				supplierResolution.action === 'match' ? 'match' : 'create',
				'ready',
				compactString(record.data.supplierName) ?? supplierResolution.finalData?.name ?? 'Supplier',
				supplierResolution.action === 'match'
					? `Matched existing supplier by ${supplierResolution.matchReason}.`
					: 'A supplier record will be created before the PRN is saved.',
			),
		);
	}
	if (location.floor) relatedRecords.push(related('floors', 'match', 'ready', location.floor.name, 'Matched an existing floor.'));
	if (location.shelf) relatedRecords.push(related('shelves', 'match', 'ready', location.shelf.name, 'Matched an existing shelf.'));
	relatedRecords.push(related('prns', 'create', errors.length > 0 ? 'error' : 'ready', label, 'A draft PRN will be created on approval.'));
	relatedRecords.push(related('prn_lines', 'create', errors.length > 0 ? 'error' : 'ready', `${lines.length} line(s)`, 'The PRN lines will be created with the mapped product references.'));

	return {
		recordType: 'prn',
		summary: compactString(record.summary) ?? label,
		confidence: record.confidence ?? record.data.confidence ?? null,
		isSelected: errors.length === 0,
		payload: {
			entityType: 'prn',
			extracted: record.data,
			supplierResolution,
			location: {
				branchId: location.branch?.id ?? null,
				floorId: location.floor?.id ?? null,
				shelfId: location.shelf?.id ?? null,
			},
			finalData: {
				returnReason: compactString(record.data.returnReason),
				expectedPickupDate: parseOptionalDate(record.data.expectedPickupDate),
				notes: compactString(record.data.notes),
			},
			lines,
		},
		relatedRecords,
		warnings,
		errors,
	};
}

async function loadImportReferenceData(): Promise<ImportReferenceData> {
	const [
		vendors,
		categories,
		units,
		skus,
		variants,
		batches,
		branches,
		floors,
		shelves,
		boxes,
		inventoryStates,
	] = await Promise.all([
		prisma.vendor.findMany({
			select: { id: true, name: true, contactEmail: true, taxId: true, type: true, isActive: true },
		}),
		prisma.category.findMany({
			where: { isActive: true },
			select: { id: true, name: true },
		}),
		prisma.unitOfMeasure.findMany({
			where: { isActive: true },
			select: { id: true, name: true, abbreviation: true },
		}),
		prisma.sKU.findMany({
			where: { isActive: true },
			select: {
				id: true,
				skuCode: true,
				name: true,
				vendorId: true,
				categoryId: true,
				unitOfMeasure: true,
				unitOfMeasureId: true,
			},
		}),
		prisma.sKUVariant.findMany({
			where: { isActive: true },
			select: { id: true, skuId: true, variantCode: true, name: true },
		}),
		prisma.batch.findMany({
			where: { isActive: true },
			select: {
				id: true,
				batchNumber: true,
				skuId: true,
				variantId: true,
				vendorId: true,
				costPrice: true,
				sellingPrice: true,
				wholesalePrice: true,
				bulkPrice: true,
				currency: true,
				manufacturingDate: true,
				expiryDate: true,
				notes: true,
			},
		}),
		prisma.branch.findMany({
			where: { isActive: true },
			select: { id: true, code: true, name: true },
		}),
		prisma.floor.findMany({
			where: { isActive: true },
			select: { id: true, branchId: true, code: true, name: true },
		}),
		prisma.shelf.findMany({
			where: { isActive: true },
			select: { id: true, floorId: true, code: true, name: true },
		}),
		prisma.storageBox.findMany({
			where: { isActive: true },
			select: { id: true, shelfId: true, floorId: true, code: true, name: true },
		}),
		prisma.statusOption.findMany({
			where: { entityType: 'inventory', isActive: true },
			select: { value: true, label: true },
		}),
	]);

	return {
		vendors,
		vendorsByName: buildMultiMap(vendors, [(vendor) => vendor.name]),
		vendorsByEmail: buildMultiMap(vendors, [(vendor) => vendor.contactEmail]),
		vendorsByTaxId: buildMultiMap(vendors, [(vendor) => vendor.taxId]),
		categories,
		categoriesByName: buildMultiMap(categories, [(category) => category.name]),
		units,
		unitsByKey: buildMultiMap(units, [(unit) => unit.name, (unit) => unit.abbreviation]),
		skus,
		skuByCode: new Map(skus.map((sku) => [normalizeLookup(sku.skuCode), sku])),
		skusByName: buildMultiMap(skus, [(sku) => sku.name]),
		variants,
		variantByCode: new Map(variants.map((variant) => [normalizeLookup(variant.variantCode), variant])),
		variantsBySkuId: variants.reduce((map, variant) => {
			const existing = map.get(variant.skuId);
			if (existing) existing.push(variant);
			else map.set(variant.skuId, [variant]);
			return map;
		}, new Map<string, VariantRef[]>()),
		batches,
		batchByNumber: new Map(batches.map((batch) => [normalizeLookup(batch.batchNumber), batch])),
		branches,
		branchesByCode: buildMultiMap(branches, [(branch) => branch.code]),
		branchesByName: buildMultiMap(branches, [(branch) => branch.name]),
		branchById: buildIdMap(branches),
		floors,
		floorsByCode: buildMultiMap(floors, [(floor) => floor.code]),
		floorsByName: buildMultiMap(floors, [(floor) => floor.name]),
		floorById: buildIdMap(floors),
		shelves,
		shelvesByCode: buildMultiMap(shelves, [(shelf) => shelf.code]),
		shelvesByName: buildMultiMap(shelves, [(shelf) => shelf.name]),
		shelfById: buildIdMap(shelves),
		boxes,
		boxByCode: new Map(boxes.map((box) => [normalizeLookup(box.code), box])),
		boxesByName: buildMultiMap(boxes, [(box) => box.name]),
		inventoryStates,
		inventoryStatesByKey: inventoryStates.reduce((map, status) => {
			map.set(normalizeLookup(status.value), status.value);
			map.set(normalizeLookup(status.label), status.value);
			return map;
		}, new Map<string, string>()),
	};
}

const BUILDERS: Record<ImportEntityType, EntityBuilder> = {
	supplier: (record, refs) => buildSupplierRecord(record, refs),
	product: (record, refs, jobId, sourceIndex) => buildProductRecord(record, refs, jobId, sourceIndex),
	inventory: (record, refs) => buildInventoryRecord(record, refs),
	grn: (record, refs) => buildGRNRecord(record, refs),
	prn: (record, refs) => buildPRNRecord(record, refs),
};

export async function prepareImportRecords(entityType: ImportEntityType, claudeResult: ClaudeImportResult, jobId: string) {
	const refs = await loadImportReferenceData();
	const builder = BUILDERS[entityType];
	const preparedRecords = claudeResult.records.map((record, sourceIndex) => builder(record as any, refs, jobId, sourceIndex));
	return {
		documentSummary: compactString(claudeResult.documentSummary),
		warnings: claudeResult.warnings ?? [],
		preparedRecords,
	};
}
