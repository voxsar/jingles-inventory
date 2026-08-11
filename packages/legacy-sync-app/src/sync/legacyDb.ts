// Direct connection to the legacy POS database — a desktop MSSQL server.
// Everything is sourced with plain SELECT queries; a MySQL dialect is also
// supported for converted copies of the same schema.

import type { AppConfig } from './config';

export type LegacyRow = Record<string, unknown>;

export interface LegacyDb {
	query(sql: string): Promise<LegacyRow[]>;
	listTables(): Promise<string[]>;
	iterateTable(table: string, batchSize: number): AsyncIterable<LegacyRow[]>;
	close(): Promise<void>;
}

function safeIdentifier(value: string) {
	if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`Unsafe database identifier: ${value}`);
	return value;
}

async function createMssqlDb(config: AppConfig['legacyDatabase']): Promise<LegacyDb> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const sql = require('mssql');
	const pool = await new sql.ConnectionPool({
		server: config.host,
		port: config.port ?? 1433,
		database: config.database,
		user: config.user,
		password: config.password,
		options: {
			encrypt: config.encrypt ?? false,
			trustServerCertificate: config.trustServerCertificate ?? true,
		},
		connectionTimeout: 15000,
		requestTimeout: 120000,
	}).connect();

	const schema = config.schema || 'dbo';
	return {
		async query(sqlText: string) {
			// Queries use bare lowercase table names; MSSQL default collation is
			// case-insensitive and the schema gets prefixed here.
			const prefixed = sqlText.replace(/\bFROM\s+(\w+)/gi, (_match, table) => `FROM [${schema}].[${table}]`);
			const result = await pool.request().query(prefixed);
			return result.recordset as LegacyRow[];
		},
		async listTables() {
			const result = await pool.request().query(
				`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${safeIdentifier(schema)}' AND TABLE_TYPE = 'BASE TABLE'`,
			);
			return result.recordset.map((row: any) => String(row.TABLE_NAME));
		},
		async *iterateTable(table: string, batchSize: number) {
			const safeTable = safeIdentifier(table);
			const primaryKeyResult = await pool.request().query(`
				SELECT c.name AS COLUMN_NAME
				FROM sys.indexes i
				JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
				JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
				JOIN sys.tables t ON i.object_id = t.object_id
				JOIN sys.schemas s ON t.schema_id = s.schema_id
				WHERE i.is_primary_key = 1 AND s.name = '${safeIdentifier(schema)}' AND t.name = '${safeTable}'
				ORDER BY ic.key_ordinal
			`);
			const orderColumns = primaryKeyResult.recordset.map((row: any) => `[${safeIdentifier(String(row.COLUMN_NAME))}]`);
			const orderBy = orderColumns.length > 0 ? ` ORDER BY ${orderColumns.join(', ')}` : '';
			const request = pool.request();
			request.stream = true;
			const batches: LegacyRow[][] = [];
			let current: LegacyRow[] = [];
			let finished = false;
			let failure: unknown;
			let wake: (() => void) | undefined;

			const signal = () => {
				wake?.();
				wake = undefined;
			};
			request.on('row', (row: LegacyRow) => {
				current.push(row);
				if (current.length >= batchSize) {
					request.pause();
					batches.push(current);
					current = [];
					signal();
				}
			});
			request.on('error', (error: unknown) => {
				failure = error;
				finished = true;
				signal();
			});
			request.on('done', () => {
				if (current.length > 0) batches.push(current);
				finished = true;
				signal();
			});
			const queryPromise = request.query(`SELECT * FROM [${safeIdentifier(schema)}].[${safeTable}]${orderBy}`);

			try {
				while (!finished || batches.length > 0) {
					if (batches.length === 0) {
						await new Promise<void>((resolve) => { wake = resolve; });
						continue;
					}
					const batch = batches.shift()!;
					yield batch;
					if (!finished) request.resume();
				}
			} finally {
				if (!finished) request.cancel();
				await queryPromise.catch((error: unknown) => { failure ??= error; });
			}
			if (failure) throw failure;
		},
		async close() {
			await pool.close();
		},
	};
}

async function createMysqlDb(config: AppConfig['legacyDatabase']): Promise<LegacyDb> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const mysql = require('mysql2/promise');
	const pool = mysql.createPool({
		host: config.host,
		port: config.port ?? 3306,
		database: config.database,
		user: config.user,
		password: config.password,
		decimalNumbers: true,
		connectionLimit: 2,
		connectTimeout: 15000,
	});

	return {
		async query(sqlText: string) {
			const [rows] = await pool.query(sqlText);
			return rows as LegacyRow[];
		},
		async listTables() {
			const [rows] = await pool.query(
				'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = \'BASE TABLE\'',
			);
			return (rows as any[]).map((row) => String(row.TABLE_NAME));
		},
		async *iterateTable(table: string, batchSize: number) {
			const safeTable = safeIdentifier(table);
			const [primaryKeyRows] = await pool.query(
				`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
				 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
				 ORDER BY ORDINAL_POSITION`,
				[safeTable],
			);
			const orderColumns = (primaryKeyRows as any[]).map((row) => `\`${safeIdentifier(String(row.COLUMN_NAME))}\``);
			const orderBy = orderColumns.length > 0 ? ` ORDER BY ${orderColumns.join(', ')}` : '';
			const connection = await pool.getConnection();
			try {
				const stream = connection.connection
					.query(`SELECT * FROM \`${safeTable}\`${orderBy}`)
					.stream({ highWaterMark: batchSize });
				let batch: LegacyRow[] = [];
				for await (const row of stream) {
					batch.push(row as LegacyRow);
					if (batch.length >= batchSize) {
						yield batch;
						batch = [];
					}
				}
				if (batch.length > 0) yield batch;
			} finally {
				connection.release();
			}
		},
		async close() {
			await pool.end();
		},
	};
}

export async function connectLegacyDb(config: AppConfig['legacyDatabase']): Promise<LegacyDb> {
	return config.dialect === 'mssql' ? createMssqlDb(config) : createMysqlDb(config);
}
