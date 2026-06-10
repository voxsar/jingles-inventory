import fs from 'fs';

let logFilePath: string | undefined;

export function initLog(filePath?: string) {
	logFilePath = filePath;
}

function write(level: string, message: string) {
	const line = `${new Date().toISOString()} [${level}] ${message}`;
	// eslint-disable-next-line no-console
	console.log(line);
	if (logFilePath) {
		try {
			fs.appendFileSync(logFilePath, `${line}\n`);
		} catch {
			// Logging must never crash the sync loop.
		}
	}
}

export const log = {
	info: (message: string) => write('INFO', message),
	warn: (message: string) => write('WARN', message),
	error: (message: string) => write('ERROR', message),
};
