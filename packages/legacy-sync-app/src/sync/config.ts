import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AppConfig {
	agentId: string;
	autoSync: boolean;
	intervalMinutes: number;
	chunkSize: number;
	legacyDatabase: {
		dialect: 'mssql' | 'mysql';
		host: string;
		port?: number;
		database: string;
		user: string;
		password: string;
		schema?: string;
		encrypt?: boolean;
		trustServerCertificate?: boolean;
	};
	server: {
		baseUrl: string;
		token: string;
	};
}

export function defaultConfig(): AppConfig {
	return {
		agentId: `legacy-sync@${os.hostname()}`,
		autoSync: true,
		intervalMinutes: 5,
		chunkSize: 150,
		legacyDatabase: {
			dialect: 'mssql',
			host: 'localhost',
			port: 1433,
			database: 'inventory',
			user: '',
			password: '',
			schema: 'dbo',
			encrypt: false,
			trustServerCertificate: true,
		},
		server: {
			baseUrl: '',
			token: '',
		},
	};
}

export function configPath(userDataDir: string) {
	return path.join(userDataDir, 'config.json');
}

export function loadConfig(userDataDir: string): AppConfig {
	const defaults = defaultConfig();
	try {
		const file = configPath(userDataDir);
		if (fs.existsSync(file)) {
			const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
			return {
				...defaults,
				...saved,
				legacyDatabase: { ...defaults.legacyDatabase, ...(saved.legacyDatabase ?? {}) },
				server: { ...defaults.server, ...(saved.server ?? {}) },
			};
		}
	} catch {
		// Fall through to defaults; the UI will show an unconfigured state.
	}
	return defaults;
}

export function saveConfig(userDataDir: string, config: AppConfig) {
	fs.mkdirSync(userDataDir, { recursive: true });
	fs.writeFileSync(configPath(userDataDir), JSON.stringify(config, null, '\t'));
}

export function isConfigured(config: AppConfig) {
	return Boolean(
		config.legacyDatabase.host
		&& config.legacyDatabase.database
		&& config.legacyDatabase.user
		&& config.server.baseUrl
		&& config.server.token,
	);
}
