// Direct connection to the legacy POS database — a desktop MSSQL server.
// Everything is sourced with plain SELECT queries; a MySQL dialect is also
// supported for converted copies of the same schema.

import type { AppConfig } from './config';

export type LegacyRow = Record<string, unknown>;

export interface LegacyDb {
	query(sql: string): Promise<LegacyRow[]>;
	listTables(): Promise<string[]>;
	queryTable(table: string): Promise<LegacyRow[]>;
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
		async queryTable(table: string) {
			const result = await pool.request().query(`SELECT * FROM [${safeIdentifier(schema)}].[${safeIdentifier(table)}]`);
			return result.recordset as LegacyRow[];
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
		async queryTable(table: string) {
			const [rows] = await pool.query(`SELECT * FROM \`${safeIdentifier(table)}\``);
			return rows as LegacyRow[];
		},
		async close() {
			await pool.end();
		},
	};
}

export async function connectLegacyDb(config: AppConfig['legacyDatabase']): Promise<LegacyDb> {
	return config.dialect === 'mssql' ? createMssqlDb(config) : createMysqlDb(config);
}
