import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, dialog, ipcMain, type MenuItemConstructorOptions } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

export type UpdatePolicy = 'automatic' | 'ask' | 'manual';

export interface UpdateStatus {
  state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'current' | 'error';
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number | null;
  message: string;
  policy: UpdatePolicy;
  portable: boolean;
}

interface Preferences {
  policy: UpdatePolicy;
  skippedVersion: string | null;
}

interface UpdateConfig {
  url?: string;
  channel?: string;
}

const DEFAULT_PREFERENCES: Preferences = { policy: 'ask', skippedVersion: null };
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;

let preferences = DEFAULT_PREFERENCES;
let status: UpdateStatus;
let checking = false;
let manualCheck = false;
let checkTimer: NodeJS.Timeout | null = null;

function preferencesPath() {
  return path.join(app.getPath('userData'), 'update-preferences.json');
}

function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(fs.readFileSync(preferencesPath(), 'utf8')) as Partial<Preferences>;
    const policy: UpdatePolicy = ['automatic', 'ask', 'manual'].includes(value.policy ?? '')
      ? value.policy as UpdatePolicy
      : DEFAULT_PREFERENCES.policy;
    return {
      policy,
      skippedVersion: typeof value.skippedVersion === 'string' ? value.skippedVersion : null,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences() {
  fs.mkdirSync(path.dirname(preferencesPath()), { recursive: true });
  fs.writeFileSync(preferencesPath(), JSON.stringify(preferences, null, 2), 'utf8');
}

function getWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function showMessage(options: Electron.MessageBoxOptions) {
  const owner = getWindow();
  return owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options);
}

function broadcast(next: Partial<UpdateStatus>) {
  status = { ...status, ...next, policy: preferences.policy };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('updater:status', status);
  }
}

function readUpdateConfig(environmentVariable: string): UpdateConfig | null {
  const environmentUrl = process.env[environmentVariable]?.trim();
  if (environmentUrl) return { url: environmentUrl, channel: process.env.JINGLES_UPDATE_CHANNEL?.trim() };

  const configPath = path.join(process.resourcesPath, 'update-config.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as UpdateConfig;
    return config.url?.trim() ? config : null;
  } catch {
    return null;
  }
}

function validateFeedUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('The update feed must use HTTPS (except a local development feed).');
  }
  return parsed.toString().replace(/\/$/, '');
}

async function downloadUpdate() {
  broadcast({ state: 'downloading', progressPercent: 0, message: 'Downloading update…' });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    broadcast({ state: 'error', message: `Update download failed: ${String(error)}` });
  }
}

async function offerUpdate(info: UpdateInfo) {
  if (!manualCheck && preferences.skippedVersion === info.version) {
    broadcast({ state: 'available', message: `Version ${info.version} is available but skipped.` });
    return;
  }

  if (!manualCheck && preferences.policy === 'automatic') {
    await downloadUpdate();
    return;
  }

  const result = await showMessage({
    type: 'info',
    title: 'Update available',
    message: `Version ${info.version} is available`,
    detail: `You are using ${app.getVersion()}. Download the update in the background now?`,
    buttons: ['Download now', 'Later', 'Skip this version'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (result.response === 0) await downloadUpdate();
  if (result.response === 2) {
    preferences.skippedVersion = info.version;
    savePreferences();
    broadcast({ message: `Version ${info.version} will be skipped.` });
  }
}

export async function checkForUpdates(showResult = true) {
  if (status.state === 'disabled') {
    if (showResult) await showMessage({ type: 'info', title: 'Updates unavailable', message: status.message });
    return status;
  }
  if (checking || status.state === 'downloading') return status;

  checking = true;
  manualCheck = showResult;
  broadcast({ state: 'checking', message: 'Checking for updates…', progressPercent: null });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    broadcast({ state: 'error', message: `Update check failed: ${String(error)}` });
    if (showResult) await showMessage({ type: 'error', title: 'Update check failed', message: status.message });
  } finally {
    checking = false;
    manualCheck = false;
  }
  return status;
}

export async function chooseUpdatePolicy() {
  const result = await showMessage({
    type: 'question',
    title: 'Update preferences',
    message: 'How should this app handle updates?',
    detail: 'Automatic downloads updates in the background. Ask lets you approve each download. Manual checks only when you request one.',
    buttons: ['Automatic', 'Ask before downloading', 'Manual only', 'Cancel'],
    defaultId: preferences.policy === 'automatic' ? 0 : preferences.policy === 'ask' ? 1 : 2,
    cancelId: 3,
    noLink: true,
  });
  if (result.response === 3) return preferences.policy;
  preferences.policy = (['automatic', 'ask', 'manual'] as const)[result.response];
  preferences.skippedVersion = null;
  savePreferences();
  broadcast({ message: `Update policy changed to ${preferences.policy}.` });
  scheduleChecks();
  return preferences.policy;
}

export function getUpdateMenu(): MenuItemConstructorOptions {
  return {
    label: 'Updates',
    submenu: [
      { label: 'Check for Updates…', click: () => void checkForUpdates(true) },
      { label: 'Update Preferences…', click: () => void chooseUpdatePolicy() },
      { type: 'separator' },
      { label: `Current version ${app.getVersion()}`, enabled: false },
    ],
  };
}

function scheduleChecks() {
  if (checkTimer) clearTimeout(checkTimer);
  checkTimer = null;
  if (preferences.policy === 'manual' || status.state === 'disabled') return;

  checkTimer = setTimeout(() => {
    void checkForUpdates(false);
    checkTimer = setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS);
    checkTimer.unref?.();
  }, STARTUP_DELAY_MS);
  checkTimer.unref?.();
}

export function initializeUpdater(environmentVariable: string) {
  preferences = loadPreferences();
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
  status = {
    state: 'idle', currentVersion: app.getVersion(), availableVersion: null,
    progressPercent: null, message: 'Ready to check for updates.', policy: preferences.policy, portable,
  };

  let externalConfig: UpdateConfig | null = null;
  try {
    externalConfig = readUpdateConfig(environmentVariable);
    if (externalConfig?.url) validateFeedUrl(externalConfig.url);
  } catch (error) {
    broadcast({ state: 'error', message: `Invalid update configuration: ${String(error)}` });
  }
  const embeddedConfig = path.join(process.resourcesPath, 'app-update.yml');
  if (status.state !== 'error' && (!app.isPackaged || portable || (!externalConfig && !fs.existsSync(embeddedConfig)))) {
    const reason = !app.isPackaged
      ? 'Updates are only enabled in packaged builds.'
      : portable
        ? 'Portable EXEs cannot safely self-update. Install the NSIS edition once to receive future updates automatically.'
        : 'No update feed is configured. Add update-config.json to resources or set the app update URL when launching.';
    broadcast({ state: 'disabled', message: reason });
  } else if (status.state !== 'error') {
    if (externalConfig?.url) {
      const channel = externalConfig.channel?.trim() || 'latest';
      autoUpdater.setFeedURL({ provider: 'generic', url: validateFeedUrl(externalConfig.url), channel });
      autoUpdater.channel = channel;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('update-available', (info) => {
      broadcast({ state: 'available', availableVersion: info.version, message: `Version ${info.version} is available.` });
      void offerUpdate(info);
    });
    autoUpdater.on('update-not-available', async () => {
      broadcast({ state: 'current', availableVersion: null, message: 'You have the latest version.' });
      if (manualCheck) await showMessage({ type: 'info', title: 'No updates available', message: status.message });
    });
    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      broadcast({ state: 'downloading', progressPercent: Math.round(progress.percent), message: `Downloading update… ${Math.round(progress.percent)}%` });
    });
    autoUpdater.on('update-downloaded', async (info) => {
      broadcast({ state: 'downloaded', availableVersion: info.version, progressPercent: 100, message: `Version ${info.version} is ready to install.` });
      const result = await showMessage({
        type: 'info', title: 'Update ready', message: `Version ${info.version} is ready`,
        detail: 'Restart now to install it, or choose Later. If you choose Later, it will install automatically when you quit the app.',
        buttons: ['Restart and install', 'Later'], defaultId: 0, cancelId: 1, noLink: true,
      });
      if (result.response === 0) autoUpdater.quitAndInstall(false, true);
    });
    autoUpdater.on('error', (error) => broadcast({ state: 'error', message: `Updater error: ${error.message}` }));
  }

  ipcMain.handle('updater:get-status', () => status);
  ipcMain.handle('updater:check', () => checkForUpdates(true));
  ipcMain.handle('updater:set-policy', (_event, policy: UpdatePolicy) => {
    if (!['automatic', 'ask', 'manual'].includes(policy)) throw new Error('Invalid update policy.');
    preferences.policy = policy;
    preferences.skippedVersion = null;
    savePreferences();
    broadcast({ message: `Update policy changed to ${policy}.` });
    scheduleChecks();
    return status;
  });
  ipcMain.handle('updater:install', () => {
    if (status.state !== 'downloaded') return false;
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  scheduleChecks();
  return status;
}
