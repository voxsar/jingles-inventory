import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Prisma } from '@prisma/client';
import XLSX from 'xlsx';
import prisma from '../prisma/client';
import { refreshDashboardStats } from '../modules/dashboard/dashboardService';
import { syncAll } from '../modules/typesense/syncService';
import { upsertDefaultAttributes, upsertDefaultTags, upsertDefaultUnits } from '../prisma/catalogDefaults';

type WorkbookRow = {
	skuCode: string;
	name: string;
	departmentRaw: string;
	categoryRaw: string;
	supplierRaw: string;
	unitRaw: string;
	packSizeRaw: string | number | null | undefined;
	costPriceRaw: string | number | null | undefined;
	sellingPriceRaw: string | number | null | undefined;
	wholesalePriceRaw: string | number | null | undefined;
};

type NormalizedRow = {
	rowNumber: number;
	skuCode: string;
	name: string;
	departmentName: string;
	departmentCode: string | null;
	categoryName: string;
	categoryCode: string | null;
	supplierName: string;
	supplierCode: string | null;
	unitName: string;
	packSize: number | null;
	costPrice: number | null;
	sellingPrice: number | null;
	wholesalePrice: number | null;
	imageFilename: string | null;
};

type CategorySeedRecord = {
	key: string;
	name: string;
	slug: string;
	description: string | null;
	parentId: string | null;
};

type DbTx = Prisma.TransactionClient;

const repoRoot = path.resolve(__dirname, '../../../..');
const workbookPath = path.join(repoRoot, 'all_products_recovered2.xlsx');
const imageZipPath = path.join(repoRoot, 'product_images.zip');
const uploadDir = path.join(repoRoot, 'uploads', 'products');
const chunkSize = 500;

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

function parseCodeAndLabel(value: string): { code: string | null; label: string } {
	const trimmed = value.trim().replace(/\s+/g, ' ');
	const match = trimmed.match(/^([A-Za-z0-9]+)\s+(.*)$/);
	if (!match) {
		return { code: null, label: trimmed };
	}

	return {
		code: match[1],
		label: match[2].trim(),
	};
}

function normalizeSourceLabel(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

function parseNumber(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}

	const normalized = String(value).replace(/,/g, '').trim();
	if (!normalized) return null;

	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUnit(value: string): string {
	return value.trim().toUpperCase();
}

function buildDescription(packSize: number | null): string | null {
	if (packSize === null || packSize === 1) return null;
	return `Pack Size: ${packSize}`;
}

function unitDefinition(unitName: string) {
	switch (unitName) {
		case 'KGS':
			return { abbreviation: 'kgs', type: 'Weight' };
		case 'MTR':
			return { abbreviation: 'mtr', type: 'Length' };
		case 'LTR':
			return { abbreviation: 'ltr', type: 'Volume' };
		case 'NOS':
		default:
			return { abbreviation: unitName.toLowerCase(), type: 'Count' };
	}
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function ensureInputFiles(): void {
	if (!fs.existsSync(workbookPath)) {
		throw new Error(`Workbook not found: ${workbookPath}`);
	}

	if (!fs.existsSync(imageZipPath)) {
		throw new Error(`Image archive not found: ${imageZipPath}`);
	}
}

function loadRows(): NormalizedRow[] {
	const workbook = XLSX.readFile(workbookPath, { raw: false });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];

	if (!sheet) {
		throw new Error('No worksheet found in workbook');
	}

	const rawRows = XLSX.utils.sheet_to_json<WorkbookRow>(sheet, {
		defval: '',
		range: 1,
		header: [
			'skuCode',
			'name',
			'departmentRaw',
			'categoryRaw',
			'supplierRaw',
			'unitRaw',
			'packSizeRaw',
			'costPriceRaw',
			'sellingPriceRaw',
			'wholesalePriceRaw',
			'createdByRaw',
			'modifiedByRaw',
		],
	}) as (WorkbookRow & { createdByRaw?: string; modifiedByRaw?: string })[];

	const deduped = new Map<string, NormalizedRow>();

	for (const [index, row] of rawRows.entries()) {
		const skuCode = String(row.skuCode ?? '').trim();
		const name = String(row.name ?? '').trim();
		if (!skuCode || !name) continue;

		const departmentInfo = parseCodeAndLabel(String(row.departmentRaw ?? ''));
		const categoryInfo = parseCodeAndLabel(String(row.categoryRaw ?? ''));
		const supplierInfo = parseCodeAndLabel(String(row.supplierRaw ?? ''));
		const rowNumber = index + 1;
		const imageFilename = `product_${String(rowNumber).padStart(4, '0')}.jpg`;

		deduped.set(skuCode, {
			rowNumber,
			skuCode,
			name,
			departmentName: normalizeSourceLabel(String(row.departmentRaw ?? '')),
			departmentCode: departmentInfo.code,
			categoryName: normalizeSourceLabel(String(row.categoryRaw ?? '')),
			categoryCode: categoryInfo.code,
			supplierName: normalizeSourceLabel(String(row.supplierRaw ?? '')),
			supplierCode: supplierInfo.code,
			unitName: normalizeUnit(String(row.unitRaw ?? 'NOS') || 'NOS'),
			packSize: parseNumber(row.packSizeRaw),
			costPrice: parseNumber(row.costPriceRaw),
			sellingPrice: parseNumber(row.sellingPriceRaw),
			wholesalePrice: parseNumber(row.wholesalePriceRaw),
			imageFilename,
		});
	}

	return Array.from(deduped.values());
}

function prepareUploadDirectory(): Set<string> {
	fs.rmSync(uploadDir, { recursive: true, force: true });
	fs.mkdirSync(uploadDir, { recursive: true });
	execFileSync('unzip', ['-ojq', imageZipPath, '-d', uploadDir], { stdio: 'inherit' });

	const filenames = new Set(
		fs.readdirSync(uploadDir).filter((filename) => fs.statSync(path.join(uploadDir, filename)).isFile())
	);

	return filenames;
}

async function resetCatalogDomain(tx: DbTx): Promise<void> {
	await tx.user.updateMany({
		where: { vendorId: { not: null } },
		data: { vendorId: null },
	});

	const candidateTables = [
		'inventory_records',
		'inventory_events',
		'stock_transfer_lines',
		'stock_transfers',
		'inspection_records',
		'grn_lines',
		'grns',
		'prn_lines',
		'prns',
		'batches',
		'product_images',
		'product_barcodes',
		'sku_attribute_values',
		'sku_attributes',
		'sku_variant_values',
		'sku_variants',
		'sku_tags',
		'sku_vendors',
		'skus',
		'pricing_overlays',
		'attribute_values',
		'attributes',
		'tags',
	];

	const existingTables = (
		await tx.$queryRawUnsafe<Array<{ table_name: string }>>(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			  AND table_name IN (${candidateTables.map((tableName) => `'${tableName}'`).join(', ')})
		`)
	).map((row) => row.table_name);

	if (existingTables.length > 0) {
		await tx.$executeRawUnsafe(`TRUNCATE TABLE ${existingTables.join(', ')} RESTART IDENTITY CASCADE`);
	}

	await tx.category.deleteMany();
	await tx.vendor.deleteMany();
	await tx.unitOfMeasure.deleteMany();
}

async function createUnits(tx: DbTx, rows: NormalizedRow[]) {
	const unitNames = Array.from(new Set(rows.map((row) => row.unitName))).sort();

	for (const unitName of unitNames) {
		const definition = unitDefinition(unitName);
		await tx.unitOfMeasure.upsert({
			where: { name: unitName },
			update: {
				abbreviation: definition.abbreviation,
				type: definition.type,
				isActive: true,
			},
			create: {
				name: unitName,
				abbreviation: definition.abbreviation,
				type: definition.type,
				baseUnit: null,
				conversionFactor: null,
				isActive: true,
				isSystem: false,
			},
		});
	}

	return new Map(
		(await tx.unitOfMeasure.findMany({ select: { id: true, name: true } })).map((unit) => [unit.name, unit.id])
	);
}

async function createVendors(tx: DbTx, rows: NormalizedRow[]) {
	const uniqueSuppliers = new Map<string, { supplierCode: string | null; supplierName: string }>();

	for (const row of rows) {
		const key = row.supplierName;
		if (!uniqueSuppliers.has(key)) {
			uniqueSuppliers.set(key, {
				supplierCode: row.supplierCode,
				supplierName: row.supplierName,
			});
		}
	}

	const ordered = Array.from(uniqueSuppliers.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName));
	for (const supplier of ordered) {
		const emailLocalPart = slugify(supplier.supplierCode ?? supplier.supplierName) || 'vendor';
		await tx.vendor.create({
			data: {
				name: supplier.supplierName,
				contactEmail: `${emailLocalPart}@import.local`,
				contactPhone: null,
				address: null,
				type: 'Supplier',
				website: null,
				taxId: supplier.supplierCode,
				paymentTerms: null,
				notes: supplier.supplierCode ? `Imported supplier code: ${supplier.supplierCode}` : null,
				isActive: true,
			},
		});
	}

	return new Map(
		(await tx.vendor.findMany({ select: { id: true, name: true } })).map((vendor) => [vendor.name, vendor.id])
	);
}

async function createCategories(tx: DbTx, rows: NormalizedRow[]) {
	const departmentKeyToId = new Map<string, string>();

	const departments = Array.from(
		new Map(
			rows.map((row) => {
				const key = `${row.departmentCode ?? 'na'}::${row.departmentName}`;
				const slug = slugify(`${row.departmentCode ?? 'dept'}-${row.departmentName}`);
				return [
					key,
					{
						name: row.departmentName,
						slug,
						description: row.departmentCode ? `Imported department code: ${row.departmentCode}` : null,
					},
				];
			})
		).values()
	).sort((a, b) => a.name.localeCompare(b.name));

	for (const department of departments) {
		const created = await tx.category.create({
			data: {
				name: department.name,
				slug: department.slug,
				description: department.description,
				parentId: null,
				sortOrder: 0,
				isActive: true,
			},
		});

		const key = `${department.description ?? 'na'}::${department.name}`;
		departmentKeyToId.set(key, created.id);
	}

	for (const row of rows) {
		const key = `${row.departmentCode ? `Imported department code: ${row.departmentCode}` : 'na'}::${row.departmentName}`;
		if (!departmentKeyToId.has(key)) {
			const existing = await tx.category.findFirst({
				where: { name: row.departmentName, parentId: null },
				select: { id: true },
			});
			if (existing) {
				departmentKeyToId.set(key, existing.id);
			}
		}
	}

	const categorySeeds = new Map<string, CategorySeedRecord>();
	for (const row of rows) {
		const departmentKey = `${row.departmentCode ? `Imported department code: ${row.departmentCode}` : 'na'}::${row.departmentName}`;
		const parentId = departmentKeyToId.get(departmentKey);
		if (!parentId) {
			throw new Error(`Missing parent category for department ${row.departmentName}`);
		}

		const key = `${departmentKey}::${row.categoryCode ?? 'na'}::${row.categoryName}`;
		if (!categorySeeds.has(key)) {
			categorySeeds.set(key, {
				key,
				name: row.categoryName,
				slug: slugify(`${row.departmentCode ?? 'dept'}-${row.categoryCode ?? 'cat'}-${row.categoryName}`),
				description: row.categoryCode ? `Imported category code: ${row.categoryCode}` : null,
				parentId,
			});
		}
	}

	for (const category of Array.from(categorySeeds.values()).sort((a, b) => a.slug.localeCompare(b.slug))) {
		await tx.category.create({
			data: {
				name: category.name,
				slug: category.slug,
				description: category.description,
				parentId: category.parentId,
				sortOrder: 0,
				isActive: true,
			},
		});
	}

	return new Map(
		(
			await tx.category.findMany({
				select: {
					id: true,
					name: true,
					description: true,
					parentId: true,
					parent: { select: { name: true, description: true } },
				},
			})
		)
			.filter((category) => category.parentId && category.parent?.name)
			.map((category) => {
				const parentKey = `${category.parent?.description ?? 'na'}::${category.parent?.name ?? ''}`;
				const categoryKey = `${parentKey}::${category.description ?? 'na'}::${category.name}`;
				return [categoryKey, category.id];
			})
	);
}

async function createSkusAndRelations(
	tx: DbTx,
	rows: NormalizedRow[],
	unitMap: Map<string, string>,
	vendorMap: Map<string, string>,
	categoryMap: Map<string, string>,
	availableImages: Set<string>
) {
	const skuRows = rows.map((row) => {
		const vendorId = vendorMap.get(row.supplierName);
		const unitOfMeasureId = unitMap.get(row.unitName);
		const categoryId = categoryMap.get(
			`${row.departmentCode ? `Imported department code: ${row.departmentCode}` : 'na'}::${row.departmentName}::${row.categoryCode ? `Imported category code: ${row.categoryCode}` : 'na'}::${row.categoryName}`
		);

		if (!vendorId) throw new Error(`Vendor not found for ${row.skuCode} (${row.supplierName})`);
		if (!unitOfMeasureId) throw new Error(`Unit not found for ${row.skuCode} (${row.unitName})`);
		if (!categoryId) {
			throw new Error(`Category not found for ${row.skuCode} (${row.departmentName} / ${row.categoryName})`);
		}

		return {
			skuCode: row.skuCode,
			name: row.name,
			description: buildDescription(row.packSize),
			categoryId,
			vendorId,
			unitOfMeasureId,
			unitOfMeasure: row.unitName,
			conversionRules: Prisma.JsonNull,
			dimensions: Prisma.JsonNull,
			isFragile: false,
			maxStackHeight: null,
			costPrice: row.costPrice,
			sellingPrice: row.sellingPrice,
			wholesalePrice: row.wholesalePrice,
			bulkPrice: null,
			marginType: null,
			marginValue: null,
			currency: 'LKR',
			defaultManufacturingDate: null,
			defaultExpiryDate: null,
			shelfLifeDays: null,
			batchPricing: Prisma.JsonNull,
			batchReferencePricing: Prisma.JsonNull,
			lowStockThreshold: null,
			isActive: true,
		};
	});

	for (const batch of chunkArray(skuRows, chunkSize)) {
		await tx.sKU.createMany({ data: batch });
	}

	const insertedSkus = await tx.sKU.findMany({
		select: { id: true, skuCode: true },
	});
	const skuIdMap = new Map(insertedSkus.map((sku) => [sku.skuCode, sku.id]));

	const skuVendorRows = rows.map((row) => {
		const skuId = skuIdMap.get(row.skuCode);
		const vendorId = vendorMap.get(row.supplierName);
		if (!skuId || !vendorId) {
			throw new Error(`Failed to resolve SKU vendor relation for ${row.skuCode}`);
		}
		return { skuId, vendorId };
	});

	for (const batch of chunkArray(skuVendorRows, chunkSize)) {
		await tx.sKUVendor.createMany({ data: batch });
	}

	const batchRows = rows.map((row) => {
		const skuId = skuIdMap.get(row.skuCode);
		const vendorId = vendorMap.get(row.supplierName);
		if (!skuId || !vendorId) {
			throw new Error(`Failed to resolve batch data for ${row.skuCode}`);
		}
		return {
			batchNumber: `${row.skuCode}-B001`,
			skuId,
			variantId: null,
			sequenceNumber: 1,
			costPrice: row.costPrice,
			sellingPrice: row.sellingPrice,
			wholesalePrice: row.wholesalePrice,
			bulkPrice: null,
			currency: 'LKR',
			marginType: null,
			marginValue: null,
			vendorId,
			expiryDate: null,
			manufacturingDate: null,
			notes: 'Imported default batch from recovered catalog',
			isActive: true,
		};
	});

	for (const batch of chunkArray(batchRows, chunkSize)) {
		await tx.batch.createMany({ data: batch });
	}

	const imageRows = rows
		.filter((row) => row.imageFilename && availableImages.has(row.imageFilename))
		.map((row) => {
			const skuId = skuIdMap.get(row.skuCode);
			if (!skuId) {
				throw new Error(`Failed to resolve image SKU for ${row.skuCode}`);
			}

			return {
				skuId,
				url: `/uploads/products/${row.imageFilename}`,
				altText: row.name,
				isPrimary: true,
				sortOrder: 0,
			};
		});

	for (const batch of chunkArray(imageRows, chunkSize)) {
		await tx.productImage.createMany({ data: batch });
	}

	return {
		skuCount: skuRows.length,
		batchCount: batchRows.length,
		imageCount: imageRows.length,
	};
}

async function main() {
	ensureInputFiles();

	console.log('Preparing upload directory...');
	const availableImages = prepareUploadDirectory();

	console.log('Reading workbook...');
	const rows = loadRows();
	console.log(`Loaded ${rows.length} unique catalog rows`);

	const importSummary = await prisma.$transaction(
		async (tx) => {
			await resetCatalogDomain(tx);
			await upsertDefaultUnits(tx);
			await upsertDefaultTags(tx);
			await upsertDefaultAttributes(tx);
			const unitMap = await createUnits(tx, rows);
			const vendorMap = await createVendors(tx, rows);
			const categoryMap = await createCategories(tx, rows);
			const result = await createSkusAndRelations(tx, rows, unitMap, vendorMap, categoryMap, availableImages);
			return {
				...result,
				unitCount: unitMap.size,
				vendorCount: vendorMap.size,
				categoryCount: (await tx.category.count()),
			};
		},
		{ maxWait: 600000, timeout: 600000 }
	);

	console.log('Refreshing dashboard stats...');
	await refreshDashboardStats();

	let typesenseStatus = 'skipped';
	try {
		console.log('Syncing Typesense indexes...');
		await syncAll(true);
		typesenseStatus = 'synced';
	} catch (error) {
		typesenseStatus = `failed: ${(error as Error).message}`;
		console.warn('Typesense sync failed, but database import completed:', error);
	}

	const [skuCount, vendorCount, categoryCount, batchCount, imageCount] = await Promise.all([
		prisma.sKU.count(),
		prisma.vendor.count(),
		prisma.category.count(),
		prisma.batch.count(),
		prisma.productImage.count(),
	]);

	console.log('Import complete');
	console.log(
		JSON.stringify(
			{
				loadedRows: rows.length,
				units: importSummary.unitCount,
				vendors: vendorCount,
				categories: categoryCount,
				skus: skuCount,
				batches: batchCount,
				images: imageCount,
				typesense: typesenseStatus,
			},
			null,
			2
		)
	);
}

let exitCode = 0;

main()
	.catch((error) => {
		console.error('Recovered catalog import failed:', error);
		exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
		process.exit(exitCode);
	});
