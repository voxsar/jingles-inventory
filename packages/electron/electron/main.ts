import fs from 'fs';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  protocol,
  shell,
  Tray,
} from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  addToSyncQueue,
  clearProcessedQueue,
  deleteConfig,
  setConfig,
  getGRNs,
  getInventoryRecords,
  getSKUs,
  getSyncQueue,
  initLocalDB,
  upsertGRN,
  upsertInventoryRecord,
  upsertSKU,
} from '../src/offline/localDB';
import { setupBarcodeIPC } from '../src/barcode/scanner';
import { getDesktopLocalApiUrl, startLocalApiServer } from '../src/backend/localApi';
import {
  getSyncHealth,
  getSyncOutbox,
  getSyncStatus,
  refreshRealtimeSyncConnection,
  resolveSyncConflict,
  stopAutoSync,
  subscribeSyncHealth,
  syncAll,
} from '../src/sync/syncEngine';

let mainWindow: BrowserWindow | null = null;
let localApiServer: Awaited<ReturnType<typeof startLocalApiServer>> | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let hasShownBackgroundNotice = false;
let unsubscribeSyncHealth: (() => void) | null = null;

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173';
const SYNC_HEALTH_EVENT = 'sync:health-changed';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'jingles',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function getRendererEntryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'web/dist/index.html');
  }

  return path.resolve(__dirname, '..', '..', '..', 'web', 'dist', 'index.html');
}

function getRendererRootDir() {
  return path.dirname(getRendererEntryPath());
}

function setupLocalAssetProtocol() {
  protocol.handle('jingles', (request) => {
    const url = new URL(request.url);
    const requestPath = path.posix.normalize(`${url.host}${decodeURIComponent(url.pathname)}`);

    if (!requestPath || requestPath.startsWith('../') || requestPath.includes('/../')) {
      return new Response('Invalid path.', { status: 400 });
    }

    const rendererRootDir = getRendererRootDir();
    const assetPath = path.resolve(rendererRootDir, requestPath);
    const normalizedRendererRootDir = path.resolve(rendererRootDir);

    if (
      assetPath !== normalizedRendererRootDir &&
      !assetPath.startsWith(`${normalizedRendererRootDir}${path.sep}`)
    ) {
      return new Response('Forbidden.', { status: 403 });
    }

    if (!fs.existsSync(assetPath)) {
      return new Response('Not found.', { status: 404 });
    }

    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

async function loadRenderer(window: BrowserWindow) {
  if (!app.isPackaged) {
    try {
      await window.loadURL(DEV_SERVER_URL);
      return 'dev-server';
    } catch (error) {
      console.warn(
        `[Electron] Failed to load dev server at ${DEV_SERVER_URL}. Falling back to the local web build.`,
        error
      );
    }
  }

  const rendererEntryPath = getRendererEntryPath();
  if (!fs.existsSync(rendererEntryPath)) {
    throw new Error(
      `[Electron] Renderer entry not found at ${rendererEntryPath}. Build packages/web or start the Vite dev server first.`
    );
  }

  await window.loadFile(rendererEntryPath);
  return 'local-build';
}

function createTrayIcon() {
  const iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#111827"/>
      <path d="M18 18h28v8H26v12h16v8H18V18z" fill="#f9fafb"/>
      <rect x="42" y="38" width="10" height="10" rx="2" fill="#10b981"/>
    </svg>
  `.trim();

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
}

function formatLastSyncLabel() {
  const syncStatus = getSyncStatus();
  if (syncStatus.running) {
    return 'Sync in progress';
  }

  if (!syncStatus.lastSuccessfulSyncAt) {
    return 'No successful sync yet';
  }

  const lastSyncedAt = new Date(syncStatus.lastSuccessfulSyncAt);
  if (Number.isNaN(lastSyncedAt.getTime())) {
    return 'Last sync time unavailable';
  }

  return `Last sync: ${lastSyncedAt.toLocaleString()}`;
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  const syncStatus = getSyncStatus();
  const realtimeLabel = syncStatus.websocketConnected
    ? 'Realtime sync connected'
    : 'Realtime sync disconnected';

  tray.setToolTip(
    syncStatus.websocketConnected
      ? 'Jingles Inventory is running in the background.'
      : 'Jingles Inventory is running in the background. Realtime sync is offline.'
  );

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Jingles Inventory', enabled: false },
      { label: realtimeLabel, enabled: false },
      { label: formatLastSyncLabel(), enabled: false },
      { type: 'separator' },
      {
        label: 'Open Jingles Inventory',
        click: () => {
          void showMainWindow();
        },
      },
      {
        label: 'Run Sync Now',
        click: () => {
          refreshTrayMenu();
          void syncAll({ forcePull: true }).finally(() => {
            refreshTrayMenu();
          });
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function broadcastSyncHealth(syncHealth = getSyncHealth()) {
  refreshTrayMenu();

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send(SYNC_HEALTH_EVENT, syncHealth);
  }
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) {
    return tray;
  }

  try {
    tray = new Tray(createTrayIcon());
    tray.setIgnoreDoubleClickEvents(true);
    tray.on('click', () => {
      void showMainWindow();
    });
    tray.on('double-click', () => {
      void showMainWindow();
    });
    tray.on('right-click', () => {
      refreshTrayMenu();
    });
    refreshTrayMenu();
    return tray;
  } catch (error) {
    console.error('[Electron] Failed to initialize the system tray.', error);
    tray = null;
    return null;
  }
}

async function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
    return;
  }

  await createWindow();
}

function hideWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const activeTray = ensureTray();
  if (!activeTray) {
    return;
  }

  mainWindow.hide();
  refreshTrayMenu();

  if (hasShownBackgroundNotice) {
    return;
  }

  hasShownBackgroundNotice = true;
  if (process.platform === 'win32') {
    activeTray.displayBalloon({
      iconType: 'info',
      title: 'Jingles Inventory is still running',
      content: 'Use the tray icon to reopen the app or quit the background service.',
    });
    return;
  }

  if (Notification.isSupported()) {
    new Notification({
      title: 'Jingles Inventory is still running',
      body: 'Use the tray icon to reopen the app or quit the background service.',
    }).show();
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  let windowShown = false;
  const revealWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed() || windowShown) {
      return;
    }

    windowShown = true;
    mainWindow.show();
  };

  mainWindow.once('ready-to-show', revealWindow);
  mainWindow.webContents.once('did-finish-load', revealWindow);
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        console.error(
          `[Electron] Failed to load renderer (${errorCode}) ${errorDescription} at ${validatedURL}.`
        );
      }
    }
  );

  const rendererMode = await loadRenderer(mainWindow);
  if (rendererMode === 'dev-server') {
    mainWindow.webContents.openDevTools();
  }
  revealWindow();

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    if (!ensureTray()) {
      isQuitting = true;
      return;
    }

    event.preventDefault();
    hideWindowToTray();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    refreshTrayMenu();
  });
}

app.whenReady().then(async () => {
  try {
    app.setAppUserModelId('com.jingles.inventory');
    initLocalDB();
    localApiServer = await startLocalApiServer();

    setupBarcodeIPC(ipcMain);
    setupOfflineIPC(ipcMain);
    setupLocalAssetProtocol();
    ensureTray();
    unsubscribeSyncHealth = subscribeSyncHealth((syncHealth) => {
      broadcastSyncHealth(syncHealth);
    });

    await createWindow();
  } catch (error) {
    console.error('[Electron] Failed to initialize the desktop shell.', error);
    app.quit();
    return;
  }

  app.on('activate', () => {
    void showMainWindow().catch((error) => {
      console.error('[Electron] Failed to recreate the main window.', error);
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (isQuitting || !tray)) {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopAutoSync();
  unsubscribeSyncHealth?.();
  unsubscribeSyncHealth = null;

  if (tray) {
    tray.destroy();
    tray = null;
  }

  if (localApiServer) {
    void localApiServer.close().catch((error) => {
      console.error('[Electron] Failed to stop the local desktop backend cleanly.', error);
    });
  }
});

function setupOfflineIPC(ipcMain: Electron.IpcMain) {
  ipcMain.handle('offline:check', () => {
    // Network check - the renderer can also use navigator.onLine
    return true;
  });

  ipcMain.handle('db:inventory:get', (_event, filters?: Record<string, any>) => {
    return getInventoryRecords(filters ?? {});
  });

  ipcMain.handle('db:inventory:upsert', (_event, record: any) => {
    const result = upsertInventoryRecord(record, { markDirty: true });
    broadcastSyncHealth();
    return result;
  });

  ipcMain.handle('db:grns:get', (_event, filters?: Record<string, any>) => {
    return getGRNs(filters ?? {});
  });

  ipcMain.handle('db:grns:upsert', (_event, grn: any) => {
    const result = upsertGRN(grn, { markDirty: true });
    broadcastSyncHealth();
    return result;
  });

  ipcMain.handle('db:skus:get', () => {
    return getSKUs();
  });

  ipcMain.handle('db:skus:upsert', (_event, sku: any) => {
    const result = upsertSKU(sku);
    broadcastSyncHealth();
    return result;
  });

  ipcMain.handle('db:sync:getQueue', () => {
    return getSyncQueue();
  });

  ipcMain.handle('db:sync:add', (_event, operation: any) => {
    const result = addToSyncQueue(operation);
    broadcastSyncHealth();
    return result;
  });

  ipcMain.handle('db:sync:clearProcessed', () => {
    clearProcessedQueue();
    broadcastSyncHealth();
  });

  ipcMain.handle('sync:push', async () => {
    return syncAll();
  });

  ipcMain.handle('sync:pull', async () => {
    return syncAll({ forcePull: true });
  });

  ipcMain.handle('sync:status', () => {
    return getSyncStatus();
  });

  ipcMain.handle('sync:health', () => {
    return getSyncHealth();
  });

  ipcMain.handle('sync:outbox', () => {
    return getSyncOutbox();
  });

  ipcMain.handle(
    'sync:resolve-conflict',
    async (_event, conflictId: string, resolution: 'keep_local' | 'keep_server') => {
      const result = await resolveSyncConflict(conflictId, resolution);
      broadcastSyncHealth();
      return result;
    }
  );

  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:open-external', (_event, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.handle('app:set-auth-cache', async (_event, auth: { token: string; user: unknown }) => {
    setConfig('authToken', auth.token);
    setConfig('authUser', JSON.stringify(auth.user));

    refreshRealtimeSyncConnection();
    void syncAll();
    refreshTrayMenu();
  });

  ipcMain.handle('app:clear-auth-cache', () => {
    deleteConfig('authToken');
    deleteConfig('authUser');
    refreshRealtimeSyncConnection();
    refreshTrayMenu();
  });

  ipcMain.handle('app:backend-url', () => {
    return localApiServer?.url ?? getDesktopLocalApiUrl();
  });
}
