import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface AgentState {
	version: 1;
	lastRunAt?: string;
	// One hash per legacy entity ("product:123" -> sha1 of its payload).
	// A row is re-sent only when its hash changes.
	hashes: Record<string, string>;
}

export function statePath(userDataDir: string) {
	return path.join(userDataDir, 'sync-state.json');
}

export function hashRow(row: unknown): string {
	return crypto.createHash('sha1').update(JSON.stringify(row)).digest('hex');
}

export function loadState(userDataDir: string): AgentState {
	try {
		const file = statePath(userDataDir);
		if (fs.existsSync(file)) {
			const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
			if (parsed && parsed.version === 1 && typeof parsed.hashes === 'object') {
				return parsed as AgentState;
			}
		}
	} catch {
		// Corrupt state just means the next cycle re-sends everything (idempotent).
	}
	return { version: 1, hashes: {} };
}

export function saveState(userDataDir: string, state: AgentState) {
	const file = statePath(userDataDir);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temp = `${file}.tmp`;
	fs.writeFileSync(temp, JSON.stringify(state));
	fs.renameSync(temp, file);
}

export function clearState(userDataDir: string) {
	try {
		fs.rmSync(statePath(userDataDir), { force: true });
	} catch {
		// ignore
	}
}
