import fs from 'fs';
import http from 'http';
import https from 'https';
import { randomBytes, randomUUID } from 'crypto';
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
import { appendDesktopLogLines } from '../runtime/logStore';
import { configureSyncEngine, startAutoSync, stopAutoSync } from '../sync/syncEngine';

type LocalApiServer = {
  url: string;
  close: () => Promise<void>;
};

type LocalBackendChild = ReturnType<typeof spawn>;

type LocalBackendRuntime = {
  child: LocalBackendChild;
  readyUrl: string;
};

const DESKTOP_LOCAL_JWT_SECRET_CONFIG_KEY = 'localJwtSecret';

function ensureDesktopJwtSecret() {
  const existingSecret = getConfig(DESKTOP_LOCAL_JWT_SECRET_CONFIG_KEY)?.trim();
  if (existingSecret) {
    return existingSecret;
  }

  const nextSecret = randomBytes(32).toString('hex');
  setConfig(DESKTOP_LOCAL_JWT_SECRET_CONFIG_KEY, nextSecret);
  return nextSecret;
}

function getDesktopSyncToken() {
  const localSessionToken = getConfig('localSessionToken')?.trim();
  if (!localSessionToken) {
    return null;
  }

  const upstreamToken = getConfig('upstreamAuthToken')?.trim();
  if (upstreamToken) {
    return upstreamToken;
  }

  const legacyToken = getConfig('authToken')?.trim();
  if (legacyToken) {
    setConfig('upstreamAuthToken', legacyToken);
    return legacyToken;
  }

  return null;
}

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
    const message = String(chunk);
    appendDesktopLogLines('backend', 'info', message);
    writeToParentStream(process.stdout, `[DesktopBackend] ${message}`);
  });

  child.stderr?.on('data', (chunk) => {
    const message = String(chunk);
    appendDesktopLogLines('backend', 'error', message);
    writeToParentStream(process.stderr, `[DesktopBackend] ${message}`);
  });
}

function buildChildEnv(
  runtimeRoot: string,
  config: ReturnType<typeof getDesktopLocalApiConfig>
) {
  const desktopJwtSecret = ensureDesktopJwtSecret();

  return {
    ...process.env,
    NODE_PATH: [path.join(app.getAppPath(), 'node_modules'), process.env.NODE_PATH ?? '']
      .filter(Boolean)
      .join(path.delimiter),
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(config.port),
    JINGLES_LOCAL_SQLITE: '1',
    JINGLES_STORAGE_ROOT: runtimeRoot,
    JINGLES_SERVER_AUTOSTART: 'true',
    JINGLES_UPSTREAM_SERVER_URL: config.upstreamUrl,
    LOCAL_SQLITE_DATABASE_URL: getDesktopSqliteDatabaseUrl(),
    JWT_SECRET: desktopJwtSecret,
  };
}

async function startBackendChild(
  localBackendEntryPath: string,
  runtimeRoot: string,
  config: ReturnType<typeof getDesktopLocalApiConfig>
): Promise<LocalBackendRuntime> {
  const child = spawn(process.execPath, [localBackendEntryPath], {
    cwd: runtimeRoot,
    env: buildChildEnv(runtimeRoot, config),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  pipeChildLogs(child);

  const preferredUrl = getDesktopLocalApiUrl(config);
  const readyUrl = await waitForBackendReady(getDesktopLocalApiProbeUrls(config), child);
  process.env.ELECTRON_LOCAL_API_URL = readyUrl;

  if (readyUrl !== preferredUrl) {
    const message = `[Electron] Desktop backend became ready via ${readyUrl}; using it instead of ${preferredUrl}.\n`;
    appendDesktopLogLines('main', 'warn', message);
    writeToParentStream(process.stderr, message);
  }

  return {
    child,
    readyUrl,
  };
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
    getToken: () => getDesktopSyncToken(),
  });
  let currentRuntime = await startBackendChild(localBackendEntryPath, runtimeRoot, config);
  let isClosing = false;
  let restartTimer: NodeJS.Timeout | null = null;
  let restartAttempt = 0;

  const clearRestartTimer = () => {
    if (!restartTimer) {
      return;
    }

    clearTimeout(restartTimer);
    restartTimer = null;
  };

  const scheduleRestart = () => {
    if (isClosing || restartTimer) {
      return;
    }

    restartAttempt += 1;
    const delayMs = Math.min(15000, 1000 * restartAttempt);
    const message = `[DesktopBackend] Restart attempt ${restartAttempt} scheduled in ${delayMs}ms.\n`;
    appendDesktopLogLines('main', 'warn', message);
    writeToParentStream(process.stderr, message);

    restartTimer = setTimeout(() => {
      restartTimer = null;
      void restartBackend();
    }, delayMs);
  };

  const restartBackend = async () => {
    if (isClosing) {
      return;
    }

    try {
      const message = '[DesktopBackend] Restarting local desktop backend.\n';
      appendDesktopLogLines('main', 'warn', message);
      writeToParentStream(process.stderr, message);

      currentRuntime = await startBackendChild(localBackendEntryPath, runtimeRoot, config);
      restartAttempt = 0;

      attachExitHandler(currentRuntime.child);

      const readyMessage = `[DesktopBackend] Local desktop backend is listening again at ${currentRuntime.readyUrl}.\n`;
      appendDesktopLogLines('main', 'info', readyMessage);
      writeToParentStream(process.stdout, readyMessage);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown desktop backend restart failure.';
      const message = `[DesktopBackend] Restart failed: ${errorMessage}\n`;
      appendDesktopLogLines('main', 'error', message);
      writeToParentStream(process.stderr, message);
      scheduleRestart();
    }
  };

  const attachExitHandler = (child: LocalBackendChild) => {
    child.on('exit', (code, signal) => {
      if (isClosing || code === 0 || signal === 'SIGTERM') {
        return;
      }

      const message = `[DesktopBackend] Child process exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}).\n`;
      appendDesktopLogLines('main', 'error', message);
      writeToParentStream(process.stderr, message);
      scheduleRestart();
    });
  };

  attachExitHandler(currentRuntime.child);

  startAutoSync(config.autoSyncIntervalMs);

  return {
    url: currentRuntime.readyUrl,
    close: async () => {
      isClosing = true;
      clearRestartTimer();
      stopAutoSync();
      await stopChildProcess(currentRuntime.child);
    },
  };
}

export { getDesktopLocalApiUrl, startLocalApiServer };
