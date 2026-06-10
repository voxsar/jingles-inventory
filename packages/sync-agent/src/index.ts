#!/usr/bin/env node
import { loadConfig } from './config';
import { initLog, log } from './log';
import { runSyncCycle } from './runner';

interface CliOptions {
	configPath: string;
	once: boolean;
	force: boolean;
	intervalMinutes?: number;
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = { configPath: 'sync-agent.config.json', once: false, force: false };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--config' || arg === '-c') options.configPath = argv[++index];
		else if (arg === '--once') options.once = true;
		else if (arg === '--full' || arg === '--force') options.force = true;
		else if (arg === '--interval' || arg === '-i') options.intervalMinutes = Number(argv[++index]);
		else if (arg === '--help' || arg === '-h') {
			// eslint-disable-next-line no-console
			console.log(`Jingles legacy desktop sync agent

Usage: jingles-sync-agent [options]

Options:
  -c, --config <path>     Config file (default: sync-agent.config.json)
      --once              Run a single sync cycle and exit
      --full, --force     Ignore local change-detection state and re-send everything
  -i, --interval <min>    Override the sync interval from the config
  -h, --help              Show this help`);
			process.exit(0);
		}
	}
	return options;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const config = loadConfig(options.configPath);
	if (options.intervalMinutes && options.intervalMinutes > 0) {
		config.intervalMinutes = options.intervalMinutes;
	}
	initLog(config.logFile);

	log.info(`Agent ${config.agentId} starting (interval: ${config.intervalMinutes} min, server: ${config.server.baseUrl}).`);

	let stopping = false;
	let running = false;
	let timer: NodeJS.Timeout | null = null;

	const cycle = async (force: boolean) => {
		if (running) {
			log.warn('Previous sync cycle is still running; skipping this tick.');
			return;
		}
		running = true;
		try {
			await runSyncCycle(config, { force });
		} catch (error: any) {
			log.error(`Sync cycle failed: ${error?.message ?? error}`);
		} finally {
			running = false;
		}
	};

	const stop = () => {
		if (stopping) return;
		stopping = true;
		if (timer) clearTimeout(timer);
		log.info(running ? 'Stopping after the current cycle...' : 'Stopped.');
		const wait = setInterval(() => {
			if (!running) {
				clearInterval(wait);
				process.exit(0);
			}
		}, 250);
	};
	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);

	await cycle(options.force);
	if (options.once) {
		process.exit(process.exitCode ?? 0);
	}

	const intervalMs = config.intervalMinutes * 60 * 1000;
	const schedule = () => {
		if (stopping) return;
		timer = setTimeout(async () => {
			await cycle(false);
			schedule();
		}, intervalMs);
	};
	schedule();
}

void main().catch((error) => {
	// eslint-disable-next-line no-console
	console.error(`Fatal: ${error?.message ?? error}`);
	process.exit(1);
});
