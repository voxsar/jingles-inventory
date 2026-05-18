import fs from 'fs';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import { app } from 'electron';
import dotenv from 'dotenv';
import {
  getDesktopBackendEntryPath,
  getDesktopEnvFilePath,
  getDesktopRuntimeRoot,
  getDesktopSqliteDatabaseUrl,
} from './runtimePaths';
import { getConfig, setConfig } from '../offline/localDB';
import { configureSyncEngine, startAutoSync, stopAutoSync } from '../sync/syncEngine';

const DEFAULT_LOCAL_API_HOST = process.env.ELECTRON_LOCAL_API_HOST?.trim() || '127.0.0.1';
const DEFAULT_LOCAL_API_PORT =
  Number.parseInt(process.env.ELECTRON_LOCAL_API_PORT ?? '3630', 10) || 3630;
const DEFAULT_UPSTREAM_SERVER_URL = (
  process.env.JINGLES_UPSTREAM_SERVER_URL?.trim() ||
  process.env.ELECTRON_UPSTREAM_SERVER_URL?.trim() ||
  process.env.VITE_API_BASE_URL?.trim() ||
  'http://localhost:3001'
).replace(/\/+$/, '');
const AUTO_SYNC_INTERVAL_MS =
  Number.parseInt(process.env.ELECTRON_SYNC_INTERVAL_MS ?? '30000', 10) || 30000;

type LocalApiServer = {
  url: string;
  close: () => Promise<void>;
};

type LocalBackendChild = ReturnType<typeof spawn>;

function getDesktopLocalApiUrl() {
  return `http://${DEFAULT_LOCAL_API_HOST}:${DEFAULT_LOCAL_API_PORT}`;
}

function loadDesktopEnvironment() {
  const envFilePath = getDesktopEnvFilePath();
  if (envFilePath && fs.existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath, override: false });
  }
}

function pipeChildLogs(child: LocalBackendChild) {
  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`[DesktopBackend] ${chunk}`);
  });

  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[DesktopBackend] ${chunk}`);
  });
}

async function waitForBackendReady(url: string, child: LocalBackendChild, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Desktop backend exited with code ${child.exitCode} before becoming ready.`);
    }

    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore until the timeout window expires.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for the desktop backend at ${url}.`);
}

async function stopChildProcess(child: LocalBackendChild) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(resolve, 5000);
  });
}

async function startLocalApiServer(): Promise<LocalApiServer> {
  loadDesktopEnvironment();

  const localBackendEntryPath = getDesktopBackendEntryPath();
  if (!fs.existsSync(localBackendEntryPath)) {
    throw new Error(
      `[Electron] Backend entry not found at ${localBackendEntryPath}. Build packages/backend first.`
    );
  }

  const runtimeRoot = getDesktopRuntimeRoot();
  const clientId = getConfig('clientId') || randomUUID();
  setConfig('clientId', clientId);

  configureSyncEngine({
    serverUrl: DEFAULT_UPSTREAM_SERVER_URL,
    clientId,
    getToken: () => getConfig('authToken'),
  });

  const child = spawn(process.execPath, [localBackendEntryPath], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      NODE_PATH: [
        path.join(app.getAppPath(), 'node_modules'),
        process.env.NODE_PATH ?? '',
      ]
        .filter(Boolean)
        .join(path.delimiter),
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(DEFAULT_LOCAL_API_PORT),
      JINGLES_LOCAL_SQLITE: '1',
      JINGLES_STORAGE_ROOT: runtimeRoot,
      JINGLES_SERVER_AUTOSTART: 'true',
      JINGLES_UPSTREAM_SERVER_URL: DEFAULT_UPSTREAM_SERVER_URL,
      LOCAL_SQLITE_DATABASE_URL: getDesktopSqliteDatabaseUrl(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  pipeChildLogs(child);

  child.on('exit', (code, signal) => {
    if (code === 0 || signal === 'SIGTERM') {
      return;
    }

    process.stderr.write(
      `[DesktopBackend] Child process exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}).\n`
    );
  });

  const url = getDesktopLocalApiUrl();
  await waitForBackendReady(url, child);
  startAutoSync(AUTO_SYNC_INTERVAL_MS);

  return {
    url,
    close: async () => {
      stopAutoSync();
      await stopChildProcess(child);
    },
  };
}

export { getDesktopLocalApiUrl, startLocalApiServer };
