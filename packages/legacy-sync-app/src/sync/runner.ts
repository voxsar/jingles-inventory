import type { LegacySyncChunk } from '@jingles/shared';
import type { AppConfig } from './config';
import { connectLegacyDb } from './legacyDb';
import { extractSnapshot, listPosTables, toPosRecords } from './extract';
import { hashRow, StoredHash, SyncState } from './state';
import { completeRun, openRun, sendChunk } from './serverClient';

interface Keyed<T> extends StoredHash {
	row: T;
}

function inspectRows<T>(
	prefix: string,
	rows: T[],
	keyOf: (row: T) => string,
	state: SyncState,
	force: boolean,
): { all: Keyed<T>[]; changed: Keyed<T>[] } {
	const all: Keyed<T>[] = [];
	const changed: Keyed<T>[] = [];
	for (const row of rows) {
		const key = `${prefix}:${keyOf(row)}`;
		const hash = hashRow(row);
		const entry = { key, hash, row };
		all.push(entry);
		if (force || state.getHash(key) !== hash) changed.push(entry);
	}
	return { all, changed };
}

function chunked<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
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
	const cycle = `${startedAt}-${process.pid}`;
	const force = Boolean(options.force);
	const state = new SyncState(userDataDir);
	let run: { id: string } | null = null;
	let warnings = 0;
	let rowsSent = 0;
	let changedCount = 0;

	onLog(`Connecting to legacy ${config.legacyDatabase.dialect} at ${config.legacyDatabase.host}/${config.legacyDatabase.database}...`);
	const db = await connectLegacyDb(config.legacyDatabase);

	const ensureRun = async () => {
		if (!run) {
			run = await openRun(config, onLog);
			onLog(`Opened sync run ${run.id}.`);
		}
		return run as { id: string };
	};

	const push = async (chunk: LegacySyncChunk, keys: Keyed<unknown>[], label: string) => {
		if (keys.length === 0) return;
		const activeRun = await ensureRun();
		const result = await sendChunk(config, activeRun.id, chunk, onLog);
		state.markManySeen(keys, cycle);
		rowsSent += keys.length;
		warnings += result.warnings.length;
		for (const warning of result.warnings) onLog(`server: ${warning}`);
		onLog(`Applied ${label} (${keys.length} rows, ${result.inventoryAdjustments} inventory adjustments).`);
	};

	try {
		onLog('Reading legacy catalog and stock tables...');
		const snapshot = await extractSnapshot(db, onLog);
		warnings += snapshot.warnings.length;
		for (const warning of snapshot.warnings) onLog(`extractor: ${warning}`);
		onLog(
			`Snapshot: ${snapshot.products.length} products, ${snapshot.variants.length} color/size variants, `
			+ `${snapshot.suppliers.length} suppliers, ${snapshot.locations.length} locations, ${snapshot.units.length} units.`,
		);

		const units = inspectRows('unit', snapshot.units, (row) => row.unitId, state, force);
		const suppliers = inspectRows('supplier', snapshot.suppliers, (row) => row.supplierId, state, force);
		const locations = inspectRows('location', snapshot.locations, (row) => row.locationId, state, force);
		const products = inspectRows('product', snapshot.products, (row) => row.productId, state, force);
		const variants = inspectRows('variant', snapshot.variants, (row) => row.productColorSizeId, state, force);
		changedCount += units.changed.length + suppliers.changed.length + locations.changed.length
			+ products.changed.length + variants.changed.length;

		await push(
			{
				units: units.changed.map((entry) => entry.row),
				suppliers: suppliers.changed.map((entry) => entry.row),
				locations: locations.changed.map((entry) => entry.row),
			},
			[...units.changed, ...suppliers.changed, ...locations.changed],
			'master data',
		);
		state.markManySeen([...units.all, ...suppliers.all, ...locations.all], cycle);
		for (const prefix of ['unit:', 'supplier:', 'location:']) state.prunePrefix(prefix, cycle);

		for (const [index, group] of chunked(products.changed, config.chunkSize).entries()) {
			await push({ products: group.map((entry) => entry.row) }, group, `products chunk ${index + 1}`);
		}
		state.markManySeen(products.all, cycle);
		state.prunePrefix('product:', cycle);

		for (const [index, group] of chunked(variants.changed, config.chunkSize).entries()) {
			await push({ variants: group.map((entry) => entry.row) }, group, `variants chunk ${index + 1}`);
		}
		state.markManySeen(variants.all, cycle);
		state.prunePrefix('variant:', cycle);

		const posTables = await listPosTables(db);
		onLog(`Discovered ${posTables.length} legacy POS/report tables.`);
		let posRows = 0;
		for (const table of posTables) {
			onLog(`Reading legacy table ${table} in bounded batches...`);
			let tableRows = 0;
			let chunkNumber = 0;
			for await (const rawRows of db.iterateTable(table, config.chunkSize)) {
				const records = toPosRecords(table, rawRows, tableRows);
				tableRows += records.length;
				posRows += records.length;
				const inspected = inspectRows('pos', records, (row) => `${row.sourceTable}:${row.sourceId}`, state, force);
				changedCount += inspected.changed.length;
				chunkNumber += 1;
				await push(
					{ posRecords: inspected.changed.map((entry) => entry.row) },
					inspected.changed,
					`${table} chunk ${chunkNumber}`,
				);
				state.markManySeen(inspected.all, cycle);
			}
			state.prunePrefix(`pos:${table.toLowerCase()}:`, cycle);
			onLog(`Read ${tableRows} rows from ${table}.`);
		}
		onLog(`${posRows} POS/report rows discovered; ${changedCount} total changed rows.`);

		const completedRun = run as { id: string } | null;
		if (!completedRun) {
			state.finishCycle(new Date().toISOString());
			onLog('No changes since the last sync.');
			return { rowsSent: 0, warnings: 0, durationMs: Date.now() - startedAt, runId: null, message: 'No changes' };
		}

		await completeRun(config, completedRun.id, {
			status: warnings > 0 ? 'CompletedWithWarnings' : 'Completed',
			stats: { agentId: config.agentId, durationMs: Date.now() - startedAt, rowsSent, warnings },
		}, onLog);
		state.finishCycle(new Date().toISOString());
		const durationMs = Date.now() - startedAt;
		onLog(`Cycle finished: ${rowsSent} rows in ${(durationMs / 1000).toFixed(1)}s, ${warnings} warnings.`);
		return { rowsSent, warnings, durationMs, runId: completedRun.id, message: `Synced ${rowsSent} rows` };
	} catch (error: any) {
		const failedRun = run as { id: string } | null;
		if (failedRun) {
			await completeRun(config, failedRun.id, {
				status: 'Failed',
				errorMessage: String(error?.message ?? error).slice(0, 4000),
				stats: { agentId: config.agentId, durationMs: Date.now() - startedAt, rowsSent, warnings },
			}, onLog).catch(() => undefined);
		}
		throw error;
	} finally {
		await db.close().catch(() => undefined);
		state.close();
	}
}
