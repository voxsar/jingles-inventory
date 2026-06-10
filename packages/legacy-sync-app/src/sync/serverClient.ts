import type { LegacySyncChunk, LegacySyncChunkResult } from '@jingles/shared';
import type { AppConfig } from './config';

const TOKEN_HEADER = 'x-jingles-legacy-sync-token';
const MAX_ATTEMPTS = 3;

async function request<T>(
	config: AppConfig,
	method: string,
	path: string,
	body: unknown,
	onLog: (message: string) => void,
): Promise<T> {
	const baseUrl = config.server.baseUrl.replace(/\/+$/, '');
	let lastError: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		try {
			const response = await fetch(`${baseUrl}${path}`, {
				method,
				headers: {
					'content-type': 'application/json',
					[TOKEN_HEADER]: config.server.token,
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			});

			if (response.status >= 500) {
				throw new Error(`Server error ${response.status} for ${method} ${path}`);
			}
			const payload = (await response.json().catch(() => ({}))) as any;
			if (!response.ok || payload?.success === false) {
				throw Object.assign(
					new Error(payload?.error ?? `Request failed (${response.status}) for ${method} ${path}`),
					{ permanent: true },
				);
			}
			return payload.data as T;
		} catch (error: any) {
			lastError = error;
			if (error?.permanent || attempt === MAX_ATTEMPTS) break;
			const delayMs = attempt * 5000;
			onLog(`${method} ${path} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${error?.message ?? error}. Retrying in ${delayMs / 1000}s.`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	throw lastError;
}

export async function openRun(config: AppConfig, onLog: (m: string) => void): Promise<{ id: string }> {
	return request(config, 'POST', '/api/legacy-sync/runs', { agentId: config.agentId }, onLog);
}

export async function sendChunk(
	config: AppConfig,
	runId: string,
	chunk: LegacySyncChunk,
	onLog: (m: string) => void,
): Promise<LegacySyncChunkResult> {
	return request(config, 'POST', `/api/legacy-sync/runs/${runId}/chunks`, chunk, onLog);
}

export async function completeRun(
	config: AppConfig,
	runId: string,
	args: { status: string; stats?: unknown; errorMessage?: string },
	onLog: (m: string) => void,
): Promise<void> {
	await request(config, 'POST', `/api/legacy-sync/runs/${runId}/complete`, args, onLog);
}
