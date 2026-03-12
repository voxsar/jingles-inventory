import { IpcMain, BrowserWindow } from 'electron';

let scanBuffer = '';
let scanTimeout: ReturnType<typeof setTimeout> | null = null;
const SCAN_TIMEOUT_MS = 100;

export function setupBarcodeIPC(ipcMain: IpcMain) {
  ipcMain.handle('barcode:start', async (_event, port?: string) => {
    console.log(`[Barcode] Starting barcode listener${port ? ` on port ${port}` : ''}`);
    // For keyboard wedge mode (most USB HID barcode scanners), no setup needed
    // The scanner injects keystrokes which the renderer captures
    return { success: true, mode: port ? 'serial' : 'keyboard-wedge' };
  });

  ipcMain.handle('barcode:stop', async () => {
    console.log('[Barcode] Stopping barcode listener');
    return { success: true };
  });
}

// Keyboard wedge mode: capture rapid keystroke sequences
// Call this in the renderer process to handle keyboard wedge scanners
export function setupKeyboardWedgeListener(onScan: (barcode: string) => void) {
  document.addEventListener('keypress', (event) => {
    // Ignore inputs when focus is on an input/textarea
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if (event.key === 'Enter') {
      if (scanBuffer.length > 0) {
        onScan(scanBuffer);
        scanBuffer = '';
      }
      return;
    }

    scanBuffer += event.key;

    // Reset buffer after timeout (human typing is slower than scanner)
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanBuffer = '';
    }, SCAN_TIMEOUT_MS);
  });
}

export function emitBarcodeEvent(window: BrowserWindow, barcode: string) {
  window.webContents.send('barcode:scan', barcode);
}
