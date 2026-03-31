import typesenseClient from './client';
import prisma from '../../prisma/client';
import logger from '../../utils/logger';
import { createJob, updateJob } from './jobTracker';

// Collection schemas
const SKU_COLLECTION_SCHEMA = {
	name: 'skus',
	fields: [
		{ name: 'id', type: 'string' as const },
		{ name: 'skuCode', type: 'string' as const },
		{ name: 'name', type: 'string' as const },
		{ name: 'description', type: 'string' as const, optional: true },
		{ name: 'vendorId', type: 'string' as const },
		{ name: 'vendorName', type: 'string' as const },
		{ name: 'categoryId', type: 'string' as const, optional: true },
		{ name: 'categoryName', type: 'string' as const, optional: true },
		{ name: 'isActive', type: 'bool' as const },
		{ name: 'createdAt', type: 'int64' as const },
		{ name: 'updatedAt', type: 'int64' as const },
	],
	default_sorting_field: 'updatedAt',
};

const INVENTORY_COLLECTION_SCHEMA = {
	name: 'inventory',
	fields: [
		{ name: 'id', type: 'string' as const },
		{ name: 'skuId', type: 'string' as const },
		{ name: 'skuName', type: 'string' as const },
		{ name: 'skuCode', type: 'string' as const },
		{ name: 'state', type: 'string' as const },
		{ name: 'quantity', type: 'float' as const },
		{ name: 'branchId', type: 'string' as const, optional: true },
		{ name: 'branchName', type: 'string' as const, optional: true },
		{ name: 'floorId', type: 'string' as const, optional: true },
		{ name: 'floorName', type: 'string' as const, optional: true },
		{ name: 'shelfId', type: 'string' as const, optional: true },
		{ name: 'shelfName', type: 'string' as const, optional: true },
		{ name: 'updatedAt', type: 'int64' as const },
	],
	default_sorting_field: 'updatedAt',
};

const VENDOR_COLLECTION_SCHEMA = {
	name: 'vendors',
	fields: [
		{ name: 'id', type: 'string' as const },
		{ name: 'name', type: 'string' as const },
		{ name: 'contactEmail', type: 'string' as const, optional: true },
		{ name: 'contactPhone', type: 'string' as const, optional: true },
		{ name: 'isActive', type: 'bool' as const },
		{ name: 'createdAt', type: 'int64' as const },
	],
	default_sorting_field: 'createdAt',
};

/**
 * Initialize or recreate Typesense collections
 */
export async function initializeCollections(recreate: boolean = false) {
	const collections = [SKU_COLLECTION_SCHEMA, INVENTORY_COLLECTION_SCHEMA, VENDOR_COLLECTION_SCHEMA];

	for (const schema of collections) {
		try {
			if (recreate) {
				try {
					await typesenseClient.collections(schema.name).delete();
					logger.info(`Deleted existing collection: ${schema.name}`);
				} catch (err) {
					// Collection might not exist
				}
			}

			await typesenseClient.collections().create(schema);
			logger.info(`Created collection: ${schema.name}`);
		} catch (error: any) {
			if (error.httpStatus === 409) {
				logger.info(`Collection already exists: ${schema.name}`);
			} else {
				logger.error(`Failed to create collection ${schema.name}`, error);
				throw error;
			}
		}
	}
}

/**
 * Sync all SKUs to Typesense with batching
 */
export async function syncSKUs(batchSize: number = 500) {
	const skus = await prisma.sKU.findMany({
		include: {
			vendor: { select: { id: true, name: true } },
			category: { select: { id: true, name: true } },
		},
	});

	const documents = skus.map((sku) => ({
		id: sku.id,
		skuCode: sku.skuCode,
		name: sku.name,
		description: sku.description || '',
		vendorId: sku.vendorId,
		vendorName: sku.vendor.name,
		categoryId: sku.categoryId || '',
		categoryName: sku.category?.name || '',
		isActive: sku.isActive,
		createdAt: Math.floor(sku.createdAt.getTime() / 1000),
		updatedAt: Math.floor(sku.updatedAt.getTime() / 1000),
	}));

	if (documents.length === 0) {
		return { synced: 0 };
	}

	// Process in batches to avoid memory issues and timeouts
	let synced = 0;
	for (let i = 0; i < documents.length; i += batchSize) {
		const batch = documents.slice(i, i + batchSize);
		await typesenseClient.collections('skus').documents().import(batch, { action: 'upsert' });
		synced += batch.length;
		logger.info(`Synced SKUs batch: ${synced}/${documents.length}`);
	}

	logger.info(`Completed syncing ${synced} SKUs to Typesense`);
	return { synced };
}

/**
 * Sync all inventory records to Typesense with batching
 */
export async function syncInventory(batchSize: number = 500) {
	const inventory = await prisma.inventoryRecord.findMany({
		include: {
			sku: { select: { id: true, name: true, skuCode: true } },
			floor: { include: { branch: { select: { id: true, name: true } } } },
			shelf: { select: { id: true, name: true } },
		},
	});

	const documents = inventory.map((record) => ({
		id: record.id,
		skuId: record.skuId,
		skuName: record.sku.name,
		skuCode: record.sku.skuCode,
		state: record.state,
		quantity: record.quantity,
		branchId: record.floor?.branch?.id || '',
		branchName: record.floor?.branch?.name || '',
		floorId: record.floorId || '',
		floorName: record.floor?.name || '',
		shelfId: record.shelfId || '',
		shelfName: record.shelf?.name || '',
		updatedAt: Math.floor(record.updatedAt.getTime() / 1000),
	}));

	if (documents.length === 0) {
		return { synced: 0 };
	}

	// Process in batches
	let synced = 0;
	for (let i = 0; i < documents.length; i += batchSize) {
		const batch = documents.slice(i, i + batchSize);
		await typesenseClient.collections('inventory').documents().import(batch, { action: 'upsert' });
		synced += batch.length;
		logger.info(`Synced inventory batch: ${synced}/${documents.length}`);
	}

	logger.info(`Completed syncing ${synced} inventory records to Typesense`);
	return { synced };
}

/**
 * Sync all vendors to Typesense
 */
export async function syncVendors() {
	const vendors = await prisma.vendor.findMany();

	const documents = vendors.map((vendor) => ({
		id: vendor.id,
		name: vendor.name,
		contactEmail: vendor.contactEmail || '',
		contactPhone: vendor.contactPhone || '',
		isActive: vendor.isActive,
		createdAt: Math.floor(vendor.createdAt.getTime() / 1000),
	}));

	if (documents.length > 0) {
		const result = await typesenseClient.collections('vendors').documents().import(documents, { action: 'upsert' });
		logger.info(`Synced ${documents.length} vendors to Typesense`);
		return { synced: documents.length, result };
	}

	return { synced: 0 };
}

/**
 * Sync all data to Typesense
 */
export async function syncAll(recreate: boolean = false) {
	await initializeCollections(recreate);

	const [skuResult, inventoryResult, vendorResult] = await Promise.all([
		syncSKUs(),
		syncInventory(),
		syncVendors(),
	]);

	return {
		skus: skuResult.synced,
		inventory: inventoryResult.synced,
		vendors: vendorResult.synced,
	};
}

/**
 * Start async sync job - returns immediately with job ID
 */
export function startSyncJob(entity?: string, recreate?: boolean): string {
	const jobId = createJob(entity || 'all');
	
	// Run sync in background
	(async () => {
		try {
			updateJob(jobId, { status: 'running', progress: 'Starting sync...' });

			let result;
			if (entity === 'skus') {
				updateJob(jobId, { progress: 'Syncing SKUs...' });
				result = await syncSKUs();
			} else if (entity === 'inventory') {
				updateJob(jobId, { progress: 'Syncing inventory...' });
				result = await syncInventory();
			} else if (entity === 'vendors') {
				updateJob(jobId, { progress: 'Syncing vendors...' });
				result = await syncVendors();
			} else {
				updateJob(jobId, { progress: 'Syncing all data...' });
				result = await syncAll(recreate);
			}

			updateJob(jobId, { 
				status: 'completed', 
				result,
				progress: 'Sync completed successfully'
			});
		} catch (error: any) {
			logger.error('Async sync job failed', error);
			updateJob(jobId, { 
				status: 'failed', 
				error: error.message,
				progress: 'Sync failed'
			});
		}
	})();

	return jobId;
}

/**
 * Search across SKUs
 */
export async function searchSKUs(query: string, filters?: Record<string, any>) {
	const searchParams: any = {
		q: query,
		query_by: 'name,skuCode,description,vendorName,categoryName',
		per_page: 50,
	};

	if (filters) {
		const filterStrings = [];
		if (filters.vendorId) filterStrings.push(`vendorId:=${filters.vendorId}`);
		if (filters.categoryId) filterStrings.push(`categoryId:=${filters.categoryId}`);
		if (filters.isActive !== undefined) filterStrings.push(`isActive:=${filters.isActive}`);
		if (filterStrings.length > 0) {
			searchParams.filter_by = filterStrings.join(' && ');
		}
	}

	const results = await typesenseClient.collections('skus').documents().search(searchParams);
	return results;
}

/**
 * Search across inventory
 */
export async function searchInventory(query: string, filters?: Record<string, any>) {
	const searchParams: any = {
		q: query,
		query_by: 'skuName,skuCode,branchName,floorName,shelfName',
		per_page: 50,
	};

	if (filters) {
		const filterStrings = [];
		if (filters.state) filterStrings.push(`state:=${filters.state}`);
		if (filters.branchId) filterStrings.push(`branchId:=${filters.branchId}`);
		if (filters.floorId) filterStrings.push(`floorId:=${filters.floorId}`);
		if (filters.shelfId) filterStrings.push(`shelfId:=${filters.shelfId}`);
		if (filterStrings.length > 0) {
			searchParams.filter_by = filterStrings.join(' && ');
		}
	}

	const results = await typesenseClient.collections('inventory').documents().search(searchParams);
	return results;
}

/**
 * Search across vendors
 */
export async function searchVendors(query: string) {
	const results = await typesenseClient.collections('vendors').documents().search({
		q: query,
		query_by: 'name,contactEmail,contactPhone',
		per_page: 50,
	});
	return results;
}
