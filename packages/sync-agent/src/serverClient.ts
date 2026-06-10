import type { LegacySyncChunk, LegacySyncChunkResult } from '@jingles/shared';
import type { AgentConfig } from './config';
import { log } from './log';

const TOKEN_HEADER = 'x-jingles-legacy-sync-token';
const MAX_ATTEMPTS = 3;

async function request<T>(config: AgentConfig, method: string, path: string, body?: unknown): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		try {
			const response = await fetch(`${config.server.baseUrl}${path}`, {
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
			log.warn(`${method} ${path} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${error?.message ?? error}. Retrying in ${delayMs / 1000}s.`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	throw lastError;
}

export async function openRun(config: AgentConfig): Promise<{ id: string }> {
	return request(config, 'POST', '/api/legacy-sync/runs', { agentId: config.agentId });
}

export async function sendChunk(config: AgentConfig, runId: string, chunk: LegacySyncChunk): Promise<LegacySyncChunkResult> {
	return request(config, 'POST', `/api/legacy-sync/runs/${runId}/chunks`, chunk);
}

export async function completeRun(
	config: AgentConfig,
	runId: string,
	args: { status: string; stats?: unknown; errorMessage?: string },
): Promise<void> {
	await request(config, 'POST', `/api/legacy-sync/runs/${runId}/complete`, args);
}
