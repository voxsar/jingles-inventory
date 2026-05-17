import type { ElectronAPI } from '@jingles/shared';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
