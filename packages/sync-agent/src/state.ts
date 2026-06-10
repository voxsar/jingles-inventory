import crypto from 'crypto';
import fs from 'fs';

export interface AgentState {
	version: 1;
	lastRunAt?: string;
	// One hash per legacy entity ("product:123" -> sha1 of its payload).
	// A row is re-sent only when its hash changes.
	hashes: Record<string, string>;
}

export function hashRow(row: unknown): string {
	return crypto.createHash('sha1').update(JSON.stringify(row)).digest('hex');
}

export function loadState(stateFile: string): AgentState {
	try {
		if (fs.existsSync(stateFile)) {
			const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
			if (parsed && parsed.version === 1 && typeof parsed.hashes === 'object') {
				return parsed as AgentState;
			}
		}
	} catch {
		// Corrupt state just means a full resync.
	}
	return { version: 1, hashes: {} };
}

export function saveState(stateFile: string, state: AgentState) {
	const tempFile = `${stateFile}.tmp`;
	fs.writeFileSync(tempFile, JSON.stringify(state));
	fs.renameSync(tempFile, stateFile);
}
