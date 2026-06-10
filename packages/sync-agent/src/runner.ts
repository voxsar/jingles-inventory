import type { LegacySyncChunk } from '@jingles/shared';
import type { AgentConfig } from './config';
import { connectLegacyDb } from './legacyDb';
import { extractSnapshot, LegacySnapshot } from './extract';
import { AgentState, hashRow, loadState, saveState } from './state';
import { completeRun, openRun, sendChunk } from './serverClient';
import { log } from './log';

interface Keyed<T> {
	key: string;
	hash: string;
	row: T;
}

function diffRows<T>(prefix: string, rows: T[], keyOf: (row: T) => string, state: AgentState, force: boolean): Keyed<T>[] {
	const changed: Keyed<T>[] = [];
	for (const row of rows) {
		const key = `${prefix}:${keyOf(row)}`;
		const hash = hashRow(row);
		if (force || state.hashes[key] !== hash) {
			changed.push({ key, hash, row });
		}
	}
	return changed;
}

function chunked<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}
	return result;
}

export interface CycleResult {
	sent: number;
	warnings: number;
}

export async function runSyncCycle(config: AgentConfig, options: { force?: boolean } = {}): Promise<CycleResult> {
	const startedAt = Date.now();
	const state = loadState(config.stateFile);
	const force = Boolean(options.force);

	log.info(`Connecting to legacy ${config.legacyDatabase.dialect} database ${config.legacyDatabase.host}/${config.legacyDatabase.database}...`);
	const db = await connectLegacyDb(config.legacyDatabase);
	let snapshot: LegacySnapshot;
	try {
		snapshot = await extractSnapshot(db);
	} finally {
		await db.close().catch(() => undefined);
	}

	log.info(
		`Legacy snapshot: ${snapshot.products.length} products, ${snapshot.variants.length} color/size variants, `
		+ `${snapshot.suppliers.length} suppliers, ${snapshot.locations.length} locations, ${snapshot.units.length} units.`,
	);

	const changedUnits = diffRows('unit', snapshot.units, (row) => row.unitId, state, force);
	const changedSuppliers = diffRows('supplier', snapshot.suppliers, (row) => row.supplierId, state, force);
	const changedLocations = diffRows('location', snapshot.locations, (row) => row.locationId, state, force);
	const changedProducts = diffRows('product', snapshot.products, (row) => row.productId, state, force);
	const changedVariants = diffRows('variant', snapshot.variants, (row) => row.productColorSizeId, state, force);

	const totalChanged =
		changedUnits.length + changedSuppliers.length + changedLocations.length
		+ changedProducts.length + changedVariants.length;

	if (totalChanged === 0) {
		log.info('No changes since the last sync.');
		state.lastRunAt = new Date().toISOString();
		saveState(config.stateFile, state);
		return { sent: 0, warnings: 0 };
	}

	log.info(
		`Changes to sync: ${changedProducts.length} products, ${changedVariants.length} variants, `
		+ `${changedSuppliers.length} suppliers, ${changedLocations.length} locations, ${changedUnits.length} units.`,
	);

	const run = await openRun(config);
	log.info(`Opened sync run ${run.id}.`);

	let warnings = 0;
	let sent = 0;
	const acked: Keyed<unknown>[] = [];

	const pushChunk = async (chunk: LegacySyncChunk, keys: Keyed<unknown>[], label: string) => {
		const result = await sendChunk(config, run.id, chunk);
		acked.push(...keys);
		sent += keys.length;
		warnings += result.warnings.length;
		for (const warning of result.warnings) {
			log.warn(`server: ${warning}`);
		}
		log.info(`Applied ${label} (${keys.length} rows, ${result.inventoryAdjustments} inventory adjustments).`);
	};

	try {
		// Master data first (small), then products, then variants — the server
		// needs product links in place before color/size variants arrive.
		if (changedUnits.length + changedSuppliers.length + changedLocations.length > 0) {
			await pushChunk(
				{
					units: changedUnits.map((entry) => entry.row),
					suppliers: changedSuppliers.map((entry) => entry.row),
					locations: changedLocations.map((entry) => entry.row),
				},
				[...changedUnits, ...changedSuppliers, ...changedLocations],
				'master data',
			);
		}

		for (const [index, group] of chunked(changedProducts, config.chunkSize).entries()) {
			await pushChunk({ products: group.map((entry) => entry.row) }, group, `products chunk ${index + 1}`);
		}
		for (const [index, group] of chunked(changedVariants, config.chunkSize).entries()) {
			await pushChunk({ variants: group.map((entry) => entry.row) }, group, `variants chunk ${index + 1}`);
		}

		await completeRun(config, run.id, {
			status: warnings > 0 ? 'CompletedWithWarnings' : 'Completed',
			stats: {
				agentId: config.agentId,
				durationMs: Date.now() - startedAt,
				rowsSent: sent,
				warnings,
			},
		});
	} catch (error: any) {
		await completeRun(config, run.id, {
			status: 'Failed',
			errorMessage: String(error?.message ?? error).slice(0, 4000),
			stats: { agentId: config.agentId, durationMs: Date.now() - startedAt, rowsSent: sent, warnings },
		}).catch(() => undefined);
		// Keep the hashes of chunks the server acknowledged so they are not
		// re-sent, then rethrow for the daemon loop to log.
		for (const entry of acked) {
			state.hashes[entry.key] = entry.hash;
		}
		saveState(config.stateFile, state);
		throw error;
	}

	for (const entry of acked) {
		state.hashes[entry.key] = entry.hash;
	}

	// Prune state entries for rows that vanished from the legacy database so
	// they are re-sent if they ever reappear.
	const liveKeys = new Set<string>([
		...snapshot.units.map((row) => `unit:${row.unitId}`),
		...snapshot.suppliers.map((row) => `supplier:${row.supplierId}`),
		...snapshot.locations.map((row) => `location:${row.locationId}`),
		...snapshot.products.map((row) => `product:${row.productId}`),
		...snapshot.variants.map((row) => `variant:${row.productColorSizeId}`),
	]);
	for (const key of Object.keys(state.hashes)) {
		if (!liveKeys.has(key)) delete state.hashes[key];
	}

	state.lastRunAt = new Date().toISOString();
	saveState(config.stateFile, state);
	log.info(`Sync cycle finished: ${sent} rows in ${((Date.now() - startedAt) / 1000).toFixed(1)}s, ${warnings} warnings.`);
	return { sent, warnings };
}
