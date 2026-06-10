import type { LegacyDatabaseConfig } from './config';

export type LegacyRow = Record<string, unknown>;

export interface LegacyDb {
	query(sql: string): Promise<LegacyRow[]>;
	close(): Promise<void>;
}

// Both adapters expose the same lowercase table names used by the legacy
// dump (MSSQL default collation is case-insensitive, so this works there too).

async function createMssqlDb(config: LegacyDatabaseConfig): Promise<LegacyDb> {
	// Lazy require so the mysql-only deployment does not need the mssql driver.
	const sql = require('mssql');
	const pool = await new sql.ConnectionPool({
		server: config.host,
		port: config.port ?? 1433,
		database: config.database,
		user: config.user,
		password: config.password,
		options: {
			encrypt: config.options?.encrypt ?? false,
			trustServerCertificate: config.options?.trustServerCertificate ?? true,
		},
		connectionTimeout: config.options?.connectTimeoutMs ?? 15000,
		requestTimeout: config.options?.requestTimeoutMs ?? 120000,
	}).connect();

	const schema = config.schema ?? 'dbo';
	return {
		async query(sqlText: string) {
			const prefixed = sqlText.replace(/\bFROM\s+`?(\w+)`?/gi, (_match, table) => `FROM [${schema}].[${table}]`);
			const result = await pool.request().query(prefixed);
			return result.recordset as LegacyRow[];
		},
		async close() {
			await pool.close();
		},
	};
}

async function createMysqlDb(config: LegacyDatabaseConfig): Promise<LegacyDb> {
	const mysql = require('mysql2/promise');
	const pool = mysql.createPool({
		host: config.host,
		port: config.port ?? 3306,
		database: config.database,
		user: config.user,
		password: config.password,
		decimalNumbers: true,
		connectionLimit: 2,
		connectTimeout: config.options?.connectTimeoutMs ?? 15000,
	});

	return {
		async query(sqlText: string) {
			const [rows] = await pool.query(sqlText);
			return rows as LegacyRow[];
		},
		async close() {
			await pool.end();
		},
	};
}

export async function connectLegacyDb(config: LegacyDatabaseConfig): Promise<LegacyDb> {
	return config.dialect === 'mssql' ? createMssqlDb(config) : createMysqlDb(config);
}
