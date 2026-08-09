import { parentPort, workerData } from 'worker_threads';
import type { AppConfig } from './sync/config';
import { runSyncCycle } from './sync/runner';

type WorkerInput = {
	config: AppConfig;
	userDataDir: string;
	force: boolean;
};

const input = workerData as WorkerInput;

void runSyncCycle(
	input.config,
	input.userDataDir,
	(message) => parentPort?.postMessage({ type: 'log', message }),
	{ force: input.force },
).then(
	(summary) => parentPort?.postMessage({ type: 'complete', summary }),
	(error) => parentPort?.postMessage({
		type: 'error',
		message: String(error?.message ?? error),
		stack: typeof error?.stack === 'string' ? error.stack : undefined,
	}),
);
