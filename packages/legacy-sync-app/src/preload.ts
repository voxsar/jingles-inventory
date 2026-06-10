import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('legacySync', {
	getConfig: () => ipcRenderer.invoke('legacy-sync:get-config'),
	saveConfig: (config: unknown) => ipcRenderer.invoke('legacy-sync:save-config', config),
	getStatus: () => ipcRenderer.invoke('legacy-sync:get-status'),
	getLog: () => ipcRenderer.invoke('legacy-sync:get-log'),
	syncNow: (force: boolean) => ipcRenderer.invoke('legacy-sync:sync-now', force),
	resetState: () => ipcRenderer.invoke('legacy-sync:reset-state'),
	onLog: (handler: (line: string) => void) => {
		ipcRenderer.on('legacy-sync:log', (_event, line: string) => handler(line));
	},
	onStatus: (handler: (status: unknown) => void) => {
		ipcRenderer.on('legacy-sync:status', (_event, status: unknown) => handler(status));
	},
});
