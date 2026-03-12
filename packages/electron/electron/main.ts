import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { initLocalDB } from '../src/offline/localDB';
import { setupBarcodeIPC } from '../src/barcode/scanner';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
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

  // Load the web app
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../web/dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize local SQLite database
  initLocalDB();

  // Setup IPC handlers
  setupBarcodeIPC(ipcMain);
  setupOfflineIPC(ipcMain);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function setupOfflineIPC(ipcMain: Electron.IpcMain) {
  ipcMain.handle('offline:check', () => {
    // Network check - the renderer can also use navigator.onLine
    return true;
  });

  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:open-external', (_event, url: string) => {
    shell.openExternal(url);
  });
}
