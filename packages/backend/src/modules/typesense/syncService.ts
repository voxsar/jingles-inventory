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

type SyncProgress = (message: string) => void;

// Let other work run between chunks so a long sync never starves the event loop
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Sync all SKUs to Typesense.
 * Reads the database in chunks (cursor pagination) so only one chunk is ever
 * held in memory, instead of loading the whole table up front.
 */
export async function syncSKUs(batchSize: number = 200, onProgress?: SyncProgress) {
	let synced = 0;
	let cursorId: string | undefined;

	for (;;) {
		const skus = await prisma.sKU.findMany({
			take: batchSize,
			...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
			orderBy: { id: 'asc' },
			include: {
				vendor: { select: { id: true, name: true } },
				category: { select: { id: true, name: true } },
			},
		});

		if (skus.length === 0) break;

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

		await typesenseClient.collections('skus').documents().import(documents, { action: 'upsert' });
		synced += documents.length;
		cursorId = skus[skus.length - 1].id;
		onProgress?.(`Synced ${synced} SKUs...`);
		logger.info(`Synced SKUs batch: ${synced}`);

		if (skus.length < batchSize) break;
		await yieldToEventLoop();
	}

	logger.info(`Completed syncing ${synced} SKUs to Typesense`);
	return { synced };
}

/**
 * Sync all inventory records to Typesense in database-side chunks.
 */
export async function syncInventory(batchSize: number = 200, onProgress?: SyncProgress) {
	let synced = 0;
	let cursorId: string | undefined;

	for (;;) {
		const inventory = await prisma.inventoryRecord.findMany({
			take: batchSize,
			...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
			orderBy: { id: 'asc' },
			include: {
				sku: { select: { id: true, name: true, skuCode: true } },
				floor: { include: { branch: { select: { id: true, name: true } } } },
				shelf: { select: { id: true, name: true } },
			},
		});

		if (inventory.length === 0) break;

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

		await typesenseClient.collections('inventory').documents().import(documents, { action: 'upsert' });
		synced += documents.length;
		cursorId = inventory[inventory.length - 1].id;
		onProgress?.(`Synced ${synced} inventory records...`);
		logger.info(`Synced inventory batch: ${synced}`);

		if (inventory.length < batchSize) break;
		await yieldToEventLoop();
	}

	logger.info(`Completed syncing ${synced} inventory records to Typesense`);
	return { synced };
}

/**
 * Sync all vendors to Typesense in database-side chunks.
 */
export async function syncVendors(batchSize: number = 200, onProgress?: SyncProgress) {
	let synced = 0;
	let cursorId: string | undefined;

	for (;;) {
		const vendors = await prisma.vendor.findMany({
			take: batchSize,
			...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
			orderBy: { id: 'asc' },
		});

		if (vendors.length === 0) break;

		const documents = vendors.map((vendor) => ({
			id: vendor.id,
			name: vendor.name,
			contactEmail: vendor.contactEmail || '',
			contactPhone: vendor.contactPhone || '',
			isActive: vendor.isActive,
			createdAt: Math.floor(vendor.createdAt.getTime() / 1000),
		}));

		await typesenseClient.collections('vendors').documents().import(documents, { action: 'upsert' });
		synced += documents.length;
		cursorId = vendors[vendors.length - 1].id;
		onProgress?.(`Synced ${synced} vendors...`);

		if (vendors.length < batchSize) break;
		await yieldToEventLoop();
	}

	logger.info(`Synced ${synced} vendors to Typesense`);
	return { synced };
}

/**
 * Sync all data to Typesense.
 * Entities are synced sequentially (not in parallel) to keep peak memory and
 * database load low — this runs in the background while the app serves traffic.
 */
export async function syncAll(recreate: boolean = false, onProgress?: SyncProgress) {
	await initializeCollections(recreate);

	const skuResult = await syncSKUs(undefined, onProgress);
	const inventoryResult = await syncInventory(undefined, onProgress);
	const vendorResult = await syncVendors(undefined, onProgress);

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
			const reportProgress = (message: string) => updateJob(jobId, { progress: message });

			let result;
			if (entity === 'skus') {
				updateJob(jobId, { progress: 'Syncing SKUs...' });
				result = await syncSKUs(undefined, reportProgress);
			} else if (entity === 'inventory') {
				updateJob(jobId, { progress: 'Syncing inventory...' });
				result = await syncInventory(undefined, reportProgress);
			} else if (entity === 'vendors') {
				updateJob(jobId, { progress: 'Syncing vendors...' });
				result = await syncVendors(undefined, reportProgress);
			} else {
				updateJob(jobId, { progress: 'Syncing all data...' });
				result = await syncAll(recreate, reportProgress);
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
