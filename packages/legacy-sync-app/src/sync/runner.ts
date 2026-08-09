import type { LegacySyncChunk } from '@jingles/shared';
import type { AppConfig } from './config';
import { connectLegacyDb } from './legacyDb';
import { extractSnapshot } from './extract';
import { hashRow, loadState, saveState } from './state';
import { completeRun, openRun, sendChunk } from './serverClient';

interface Keyed<T> {
	key: string;
	hash: string;
	row: T;
}

function diffRows<T>(
	prefix: string,
	rows: T[],
	keyOf: (row: T) => string,
	hashes: Record<string, string>,
	force: boolean,
): Keyed<T>[] {
	const changed: Keyed<T>[] = [];
	for (const row of rows) {
		const key = `${prefix}:${keyOf(row)}`;
		const hash = hashRow(row);
		if (force || hashes[key] !== hash) {
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

export interface CycleSummary {
	rowsSent: number;
	warnings: number;
	durationMs: number;
	runId: string | null;
	message: string;
}

export async function runSyncCycle(
	config: AppConfig,
	userDataDir: string,
	onLog: (message: string) => void,
	options: { force?: boolean } = {},
): Promise<CycleSummary> {
	const startedAt = Date.now();
	const state = loadState(userDataDir);
	const force = Boolean(options.force);

	onLog(`Connecting to legacy ${config.legacyDatabase.dialect} at ${config.legacyDatabase.host}/${config.legacyDatabase.database}...`);
	const db = await connectLegacyDb(config.legacyDatabase);
	let snapshot;
	try {
		snapshot = await extractSnapshot(db, onLog);
	} finally {
		await db.close().catch(() => undefined);
	}

	onLog(
		`Snapshot: ${snapshot.products.length} products, ${snapshot.variants.length} color/size variants, `
		+ `${snapshot.suppliers.length} suppliers, ${snapshot.locations.length} locations, ${snapshot.units.length} units. `
		+ `${snapshot.posRecords.length} POS/report rows discovered.`,
	);

	const changedUnits = diffRows('unit', snapshot.units, (row) => row.unitId, state.hashes, force);
	const changedSuppliers = diffRows('supplier', snapshot.suppliers, (row) => row.supplierId, state.hashes, force);
	const changedLocations = diffRows('location', snapshot.locations, (row) => row.locationId, state.hashes, force);
	const changedProducts = diffRows('product', snapshot.products, (row) => row.productId, state.hashes, force);
	const changedVariants = diffRows('variant', snapshot.variants, (row) => row.productColorSizeId, state.hashes, force);
	const changedPosRecords = diffRows('pos', snapshot.posRecords, (row) => `${row.sourceTable}:${row.sourceId}`, state.hashes, force);

	const totalChanged =
		changedUnits.length + changedSuppliers.length + changedLocations.length
		+ changedProducts.length + changedVariants.length + changedPosRecords.length;

	if (totalChanged === 0) {
		state.lastRunAt = new Date().toISOString();
		saveState(userDataDir, state);
		onLog('No changes since the last sync.');
		return { rowsSent: 0, warnings: 0, durationMs: Date.now() - startedAt, runId: null, message: 'No changes' };
	}

	onLog(
		`Changes: ${changedProducts.length} products, ${changedVariants.length} variants, `
		+ `${changedSuppliers.length} suppliers, ${changedLocations.length} locations, ${changedUnits.length} units. `
		+ `${changedPosRecords.length} POS/report rows.`,
	);

	const run = await openRun(config, onLog);
	onLog(`Opened sync run ${run.id}.`);

	let warnings = 0;
	let rowsSent = 0;
	const acked: Keyed<unknown>[] = [];

	const push = async (chunk: LegacySyncChunk, keys: Keyed<unknown>[], label: string) => {
		const result = await sendChunk(config, run.id, chunk, onLog);
		acked.push(...keys);
		rowsSent += keys.length;
		warnings += result.warnings.length;
		for (const warning of result.warnings) {
			onLog(`server: ${warning}`);
		}
		onLog(`Applied ${label} (${keys.length} rows, ${result.inventoryAdjustments} inventory adjustments).`);
	};

	try {
		// Master data first (small), then products, then variants — the server
		// needs product links in place before color/size variants arrive.
		if (changedUnits.length + changedSuppliers.length + changedLocations.length > 0) {
			await push(
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
			await push({ products: group.map((entry) => entry.row) }, group, `products chunk ${index + 1}`);
		}
		for (const [index, group] of chunked(changedVariants, config.chunkSize).entries()) {
			await push({ variants: group.map((entry) => entry.row) }, group, `variants chunk ${index + 1}`);
		}
		for (const [index, group] of chunked(changedPosRecords, config.chunkSize).entries()) {
			await push({ posRecords: group.map((entry) => entry.row) }, group, `POS/report chunk ${index + 1}`);
		}

		await completeRun(config, run.id, {
			status: warnings > 0 ? 'CompletedWithWarnings' : 'Completed',
			stats: { agentId: config.agentId, durationMs: Date.now() - startedAt, rowsSent, warnings },
		}, onLog);
	} catch (error: any) {
		await completeRun(config, run.id, {
			status: 'Failed',
			errorMessage: String(error?.message ?? error).slice(0, 4000),
			stats: { agentId: config.agentId, durationMs: Date.now() - startedAt, rowsSent, warnings },
		}, onLog).catch(() => undefined);
		// Keep hashes for chunks the server acknowledged so they are not re-sent.
		for (const entry of acked) {
			state.hashes[entry.key] = entry.hash;
		}
		saveState(userDataDir, state);
		throw error;
	}

	for (const entry of acked) {
		state.hashes[entry.key] = entry.hash;
	}

	// Prune hashes for rows that vanished from the legacy database so they are
	// re-sent if they ever reappear.
	const liveKeys = new Set<string>([
		...snapshot.units.map((row) => `unit:${row.unitId}`),
		...snapshot.suppliers.map((row) => `supplier:${row.supplierId}`),
		...snapshot.locations.map((row) => `location:${row.locationId}`),
		...snapshot.products.map((row) => `product:${row.productId}`),
		...snapshot.variants.map((row) => `variant:${row.productColorSizeId}`),
		...snapshot.posRecords.map((row) => `pos:${row.sourceTable}:${row.sourceId}`),
	]);
	for (const key of Object.keys(state.hashes)) {
		if (!liveKeys.has(key)) delete state.hashes[key];
	}

	state.lastRunAt = new Date().toISOString();
	saveState(userDataDir, state);

	const durationMs = Date.now() - startedAt;
	onLog(`Cycle finished: ${rowsSent} rows in ${(durationMs / 1000).toFixed(1)}s, ${warnings} warnings.`);
	return { rowsSent, warnings, durationMs, runId: run.id, message: `Synced ${rowsSent} rows` };
}
