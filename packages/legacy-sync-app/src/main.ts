import path from 'path';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { Worker } from 'worker_threads';
import { AppConfig, isConfigured, loadConfig, saveConfig } from './sync/config';
import { clearState } from './sync/state';
import type { CycleSummary } from './sync/runner';
import { getUpdateMenu, initializeUpdater } from './updater';

const TRAY_ICON_DATA_URL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIElEQVR4nGOISrrTQwlmgDL+k4lHDRg1YNQAahtANgYAPAN8K8e5wnsAAAAASUVORK5CYII=';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

let config: AppConfig;
let syncRunning = false;
let autoTimer: NodeJS.Timeout | null = null;
let nextRunAt: string | null = null;
let lastCycle: (CycleSummary & { at: string; error?: string }) | null = null;
const logBuffer: string[] = [];

function pushLog(message: string) {
	const line = `${new Date().toLocaleTimeString()}  ${message}`;
	logBuffer.push(line);
	if (logBuffer.length > 500) logBuffer.shift();
	mainWindow?.webContents.send('legacy-sync:log', line);
}

function statusPayload() {
	return {
		configured: isConfigured(config),
		autoSync: config.autoSync,
		intervalMinutes: config.intervalMinutes,
		syncRunning,
		nextRunAt,
		lastCycle,
	};
}

function pushStatus() {
	mainWindow?.webContents.send('legacy-sync:status', statusPayload());
	updateTrayTooltip();
}

function runCycleInWorker(force: boolean): Promise<CycleSummary> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(path.join(__dirname, 'syncWorker.js'), {
			workerData: { config, userDataDir: app.getPath('userData'), force },
		});
		let settled = false;
		worker.on('message', (message: any) => {
			if (message?.type === 'log') pushLog(String(message.message));
			if (message?.type === 'complete') {
				settled = true;
				resolve(message.summary as CycleSummary);
			}
			if (message?.type === 'error') {
				settled = true;
				reject(new Error(String(message.message)));
			}
		});
		worker.once('error', (error) => {
			settled = true;
			reject(error);
		});
		worker.once('exit', (code) => {
			if (!settled) reject(new Error(`Sync worker exited before completion (code ${code}).`));
		});
	});
}

async function doCycle(force: boolean) {
	if (syncRunning) {
		pushLog('A sync cycle is already running; skipped.');
		return;
	}
	if (!isConfigured(config)) {
		pushLog('Not configured yet — fill in the settings and save.');
		return;
	}
	syncRunning = true;
	pushStatus();
	try {
		const summary = await runCycleInWorker(force);
		lastCycle = { ...summary, at: new Date().toISOString() };
	} catch (error: any) {
		lastCycle = {
			rowsSent: 0, warnings: 0, durationMs: 0, runId: null,
			message: 'Failed', at: new Date().toISOString(),
			error: String(error?.message ?? error),
		};
		pushLog(`Sync failed: ${error?.message ?? error}`);
	} finally {
		syncRunning = false;
		pushStatus();
	}
}

function scheduleLoop() {
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	nextRunAt = null;
	if (!config.autoSync || !isConfigured(config)) {
		pushStatus();
		return;
	}
	const intervalMs = Math.max(1, config.intervalMinutes) * 60 * 1000;
	nextRunAt = new Date(Date.now() + intervalMs).toISOString();
	autoTimer = setTimeout(async () => {
		await doCycle(false);
		scheduleLoop();
	}, intervalMs);
	pushStatus();
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 940,
		height: 720,
		title: 'Jingles Legacy Sync',
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	mainWindow.loadFile(path.join(app.getAppPath(), 'ui', 'index.html'));
	mainWindow.on('close', (event) => {
		// Keep syncing in the tray; Quit from the tray menu to exit.
		if (!quitting) {
			event.preventDefault();
			mainWindow?.hide();
		}
	});
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

function showWindow() {
	if (!mainWindow) createWindow();
	else {
		mainWindow.show();
		mainWindow.focus();
	}
}

function updateTrayTooltip() {
	if (!tray) return;
	const last = lastCycle
		? `last: ${lastCycle.error ? `failed (${lastCycle.error})` : lastCycle.message} at ${new Date(lastCycle.at).toLocaleTimeString()}`
		: 'no runs yet';
	tray.setToolTip(`Jingles Legacy Sync — ${syncRunning ? 'syncing…' : config.autoSync ? `every ${config.intervalMinutes} min` : 'auto-sync off'} (${last})`);
}

function createTray() {
	tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON_DATA_URL));
	tray.setContextMenu(Menu.buildFromTemplate([
		{ label: 'Open', click: showWindow },
		{ label: 'Sync now', click: () => void doCycle(false) },
		getUpdateMenu(),
		{ type: 'separator' },
		{
			label: 'Quit',
			click: () => {
				quitting = true;
				app.quit();
			},
		},
	]));
	tray.on('double-click', showWindow);
	updateTrayTooltip();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
} else {
	app.on('second-instance', showWindow);

	app.whenReady().then(() => {
		config = loadConfig(app.getPath('userData'));
		initializeUpdater('JINGLES_LEGACY_SYNC_UPDATE_URL');

		ipcMain.handle('legacy-sync:get-config', () => config);
		ipcMain.handle('legacy-sync:save-config', (_event, next: AppConfig) => {
			config = {
				...config,
				...next,
				legacyDatabase: { ...config.legacyDatabase, ...next.legacyDatabase },
				server: { ...config.server, ...next.server },
			};
			saveConfig(app.getPath('userData'), config);
			pushLog('Settings saved.');
			scheduleLoop();
			return config;
		});
		ipcMain.handle('legacy-sync:get-status', () => statusPayload());
		ipcMain.handle('legacy-sync:get-log', () => logBuffer);
		ipcMain.handle('legacy-sync:sync-now', async (_event, force: boolean) => {
			await doCycle(Boolean(force));
			return statusPayload();
		});
		ipcMain.handle('legacy-sync:reset-state', () => {
			clearState(app.getPath('userData'));
			pushLog('Local change-detection state cleared — the next cycle re-sends everything.');
			return true;
		});

		createWindow();
		createTray();
		pushLog('Jingles Legacy Sync started.');
		if (!isConfigured(config)) {
			pushLog('Not configured yet — fill in the legacy database and server settings, then save.');
		}
		scheduleLoop();
	});

	app.on('before-quit', () => {
		quitting = true;
	});

	app.on('window-all-closed', () => {
		// Stay alive in the tray on all platforms; quit only via the tray menu.
	});
}
