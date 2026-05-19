import fs from 'fs';
import http from 'http';
import https from 'https';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import { app } from 'electron';
import dotenv from 'dotenv';
import {
  getDesktopBackendEntryPath,
  getDesktopEnvFilePaths,
  getDesktopRuntimeRoot,
  getDesktopSqliteDatabaseUrl,
} from './runtimePaths';
import {
  getDesktopLocalApiConfig,
  getDesktopLocalApiProbeUrls,
  getDesktopLocalApiUrl,
} from './localApiConfig';
import { getConfig, setConfig } from '../offline/localDB';
import { configureSyncEngine, startAutoSync, stopAutoSync } from '../sync/syncEngine';

type LocalApiServer = {
  url: string;
  close: () => Promise<void>;
};

type LocalBackendChild = ReturnType<typeof spawn>;

function isBrokenPipeError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EPIPE'
  );
}

function writeToParentStream(stream: NodeJS.WriteStream, message: string) {
  if (stream.destroyed || !stream.writable) {
    return;
  }

  try {
    stream.write(message);
  } catch (error) {
    if (!isBrokenPipeError(error)) {
      throw error;
    }
  }
}

function loadDesktopEnvironment() {
  for (const envFilePath of getDesktopEnvFilePaths()) {
    if (!fs.existsSync(envFilePath)) {
      continue;
    }

    dotenv.config({ path: envFilePath, override: false });
  }
}

function pipeChildLogs(child: LocalBackendChild) {
  child.stdout?.on('data', (chunk) => {
    writeToParentStream(process.stdout, `[DesktopBackend] ${chunk}`);
  });

  child.stderr?.on('data', (chunk) => {
    writeToParentStream(process.stderr, `[DesktopBackend] ${chunk}`);
  });
}

function getHttpClient(protocol: string) {
  return protocol === 'https:' ? https : http;
}

async function probeBackendHealth(url: string, timeoutMs = 1000) {
  const healthUrl = new URL('/health', `${url}/`);

  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const request = getHttpClient(healthUrl.protocol).request(
      healthUrl,
      { method: 'GET' },
      (response) => {
        response.resume();
        response.on('end', () => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode >= 200 && statusCode < 300) {
            resolve({ ok: true });
            return;
          }

          resolve({
            ok: false,
            error: `received HTTP ${statusCode || 'unknown'} from ${healthUrl.pathname}`,
          });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    });
    request.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
    request.end();
  });
}

async function waitForBackendReady(urls: string[], child: LocalBackendChild, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastProbeError = 'No probe attempts completed.';

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Desktop backend exited with code ${child.exitCode} before becoming ready.`);
    }

    for (const url of urls) {
      const result = await probeBackendHealth(url);
      if (result.ok) {
        return url;
      }

      lastProbeError = `${url}/health -> ${result.error ?? 'unknown error'}`;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for the desktop backend. Probed ${urls.join(', ')}. Last probe error: ${lastProbeError}`
  );
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
  const config = getDesktopLocalApiConfig();

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
    serverUrl: config.upstreamUrl,
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
      PORT: String(config.port),
      JINGLES_LOCAL_SQLITE: '1',
      JINGLES_STORAGE_ROOT: runtimeRoot,
      JINGLES_SERVER_AUTOSTART: 'true',
      JINGLES_UPSTREAM_SERVER_URL: config.upstreamUrl,
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

    writeToParentStream(
      process.stderr,
      `[DesktopBackend] Child process exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}).\n`
    );
  });

  const preferredUrl = getDesktopLocalApiUrl(config);
  const readyUrl = await waitForBackendReady(getDesktopLocalApiProbeUrls(config), child);
  process.env.ELECTRON_LOCAL_API_URL = readyUrl;

  if (readyUrl !== preferredUrl) {
    writeToParentStream(
      process.stderr,
      `[Electron] Desktop backend became ready via ${readyUrl}; using it instead of ${preferredUrl}.\n`
    );
  }

  startAutoSync(config.autoSyncIntervalMs);

  return {
    url: readyUrl,
    close: async () => {
      stopAutoSync();
      await stopChildProcess(child);
    },
  };
}

export { getDesktopLocalApiUrl, startLocalApiServer };
