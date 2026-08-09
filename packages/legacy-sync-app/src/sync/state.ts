import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

type DatabaseSync = {
	exec(sql: string): void;
	prepare(sql: string): {
		get(...params: unknown[]): unknown;
		run(...params: unknown[]): unknown;
	};
	close(): void;
};

export interface StoredHash {
	key: string;
	hash: string;
}

export function statePath(userDataDir: string) {
	return path.join(userDataDir, 'sync-state.sqlite');
}

export function hashRow(row: unknown): string {
	return crypto.createHash('sha1').update(JSON.stringify(row)).digest('hex');
}

export class SyncState {
	private readonly db: DatabaseSync;
	private readonly getHashStatement;
	private readonly putHashStatement;
	private readonly pruneStatement;
	private readonly setMetadataStatement;

	constructor(userDataDir: string) {
		fs.mkdirSync(userDataDir, { recursive: true });
		// node:sqlite is built into the Node runtime shipped with Electron. Keeping
		// row hashes in SQLite prevents multi-million-row databases from consuming
		// the JavaScript heap merely for change detection.
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { DatabaseSync: SQLiteDatabase } = require('node:sqlite') as { DatabaseSync: new (file: string) => DatabaseSync };
		this.db = new SQLiteDatabase(statePath(userDataDir));
		this.db.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA synchronous = NORMAL;
			CREATE TABLE IF NOT EXISTS row_hash (
				key TEXT PRIMARY KEY,
				hash TEXT NOT NULL,
				seen_cycle TEXT NOT NULL
			) WITHOUT ROWID;
			CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
		`);
		this.getHashStatement = this.db.prepare('SELECT hash FROM row_hash WHERE key = ?');
		this.putHashStatement = this.db.prepare(`
			INSERT INTO row_hash(key, hash, seen_cycle) VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET hash = excluded.hash, seen_cycle = excluded.seen_cycle
		`);
		this.pruneStatement = this.db.prepare('DELETE FROM row_hash WHERE key >= ? AND key < ? AND seen_cycle <> ?');
		this.setMetadataStatement = this.db.prepare(`
			INSERT INTO metadata(key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value
		`);
	}

	getHash(key: string): string | undefined {
		return (this.getHashStatement.get(key) as { hash?: string } | undefined)?.hash;
	}

	markSeen(entry: StoredHash, cycle: string) {
		this.putHashStatement.run(entry.key, entry.hash, cycle);
	}

	markManySeen(entries: StoredHash[], cycle: string) {
		if (entries.length === 0) return;
		this.db.exec('BEGIN IMMEDIATE');
		try {
			for (const entry of entries) this.markSeen(entry, cycle);
			this.db.exec('COMMIT');
		} catch (error) {
			this.db.exec('ROLLBACK');
			throw error;
		}
	}

	prunePrefix(prefix: string, cycle: string) {
		this.pruneStatement.run(prefix, `${prefix}\uffff`, cycle);
	}

	finishCycle(at: string) {
		this.setMetadataStatement.run('lastRunAt', at);
	}

	close() {
		this.db.close();
	}
}

export function clearState(userDataDir: string) {
	for (const suffix of ['', '-shm', '-wal']) {
		try {
			fs.rmSync(`${statePath(userDataDir)}${suffix}`, { force: true });
		} catch {
			// ignore
		}
	}
	// Remove the state format used by releases before bounded-memory syncing.
	try {
		fs.rmSync(path.join(userDataDir, 'sync-state.json'), { force: true });
	} catch {
		// ignore
	}
}
