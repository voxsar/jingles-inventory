import fs from 'fs';
import path from 'path';

export interface LegacyDatabaseConfig {
	dialect: 'mssql' | 'mysql';
	host: string;
	port?: number;
	database: string;
	user: string;
	password: string;
	/** MSSQL only — schema the legacy tables live in. Default: dbo */
	schema?: string;
	options?: {
		encrypt?: boolean;
		trustServerCertificate?: boolean;
		connectTimeoutMs?: number;
		requestTimeoutMs?: number;
	};
}

export interface AgentConfig {
	agentId: string;
	legacyDatabase: LegacyDatabaseConfig;
	server: {
		baseUrl: string;
		/** Literal token, or "env:VAR_NAME" to read from the environment. */
		token: string;
	};
	intervalMinutes: number;
	chunkSize: number;
	stateFile: string;
	logFile?: string;
}

const DEFAULTS = {
	intervalMinutes: 5,
	chunkSize: 150,
	stateFile: 'sync-agent.state.json',
};

export function loadConfig(configPath: string): AgentConfig {
	const absolutePath = path.resolve(configPath);
	if (!fs.existsSync(absolutePath)) {
		throw new Error(
			`Config file not found: ${absolutePath}. Copy sync-agent.config.example.json to sync-agent.config.json and fill it in.`,
		);
	}

	const raw = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
	if (!raw.legacyDatabase?.host || !raw.legacyDatabase?.database || !raw.legacyDatabase?.user) {
		throw new Error('Config: legacyDatabase.host, .database and .user are required.');
	}
	if (raw.legacyDatabase.dialect !== 'mssql' && raw.legacyDatabase.dialect !== 'mysql') {
		throw new Error("Config: legacyDatabase.dialect must be 'mssql' or 'mysql'.");
	}
	if (!raw.server?.baseUrl) {
		throw new Error('Config: server.baseUrl is required.');
	}

	let token: string = process.env.JINGLES_LEGACY_SYNC_TOKEN?.trim() || raw.server.token || '';
	if (token.startsWith('env:')) {
		const variable = token.slice(4);
		token = process.env[variable]?.trim() ?? '';
		if (!token) throw new Error(`Config: environment variable ${variable} (server.token) is empty.`);
	}
	if (!token) {
		throw new Error('Config: server.token (or JINGLES_LEGACY_SYNC_TOKEN env var) is required.');
	}

	const baseDir = path.dirname(absolutePath);
	return {
		agentId: raw.agentId || `sync-agent@${require('os').hostname()}`,
		legacyDatabase: {
			...raw.legacyDatabase,
			password: process.env.JINGLES_LEGACY_DB_PASSWORD?.trim() || raw.legacyDatabase.password || '',
		},
		server: {
			baseUrl: String(raw.server.baseUrl).replace(/\/+$/, ''),
			token,
		},
		intervalMinutes: Number(raw.intervalMinutes) > 0 ? Number(raw.intervalMinutes) : DEFAULTS.intervalMinutes,
		chunkSize: Number(raw.chunkSize) > 0 ? Number(raw.chunkSize) : DEFAULTS.chunkSize,
		stateFile: path.resolve(baseDir, raw.stateFile || DEFAULTS.stateFile),
		logFile: raw.logFile ? path.resolve(baseDir, raw.logFile) : undefined,
	};
}
