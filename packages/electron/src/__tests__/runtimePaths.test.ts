import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getConfiguredDesktopDatabasePath = vi.fn<() => string | null>(() => null);
const mockGetPath = vi.fn((name: string) => {
  if (name === 'userData') {
    return path.join(os.tmpdir(), 'jingles-electron-vitest');
  }

  throw new Error(`Unexpected app.getPath(${name}) call in runtimePaths test`);
});

const mockGetAppPath = vi.fn(() => 'D:\\Projects\\jingles-inventory\\packages\\electron');

vi.mock('electron', () => ({
  app: {
    getPath: mockGetPath,
    getAppPath: mockGetAppPath,
    isPackaged: false,
  },
}));

vi.mock('../backend/desktopDbConfig', () => ({
  getConfiguredDesktopDatabasePath,
}));

describe('runtimePaths', () => {
  beforeEach(() => {
    getConfiguredDesktopDatabasePath.mockReset();
    getConfiguredDesktopDatabasePath.mockReturnValue(null);
    mockGetPath.mockClear();
    mockGetAppPath.mockClear();
  });

  it('formats Windows absolute SQLite paths without an extra slash before the drive letter', async () => {
    const { getDesktopSqliteDatabaseUrl } = await import('../backend/runtimePaths');

    expect(getDesktopSqliteDatabaseUrl()).toBe(
      `file:${path.join(os.tmpdir(), 'jingles-electron-vitest', 'backend', 'jingles-inventory.sqlite').replace(/\\/g, '/')}`
    );
  });

  it('keeps relative SQLite paths for databases on the same drive as the schema', async () => {
    getConfiguredDesktopDatabasePath.mockReturnValue('D:\\Projects\\jingles-inventory\\data\\custom.sqlite');
    const { getDesktopSqliteDatabaseUrl } = await import('../backend/runtimePaths');

    expect(getDesktopSqliteDatabaseUrl()).toBe('file:../../../data/custom.sqlite');
  });

  it('checks the web package env files before the repo root env files in dev', async () => {
    const { getDesktopEnvFilePaths } = await import('../backend/runtimePaths');
    const envPaths = getDesktopEnvFilePaths('development');
    const webEnvLocal = 'D:\\Projects\\jingles-inventory\\packages\\web\\.env.local';
    const repoEnv = 'D:\\Projects\\jingles-inventory\\.env';

    expect(envPaths).toContain(webEnvLocal);
    expect(envPaths).toContain(repoEnv);
    expect(envPaths.indexOf(webEnvLocal)).toBeLessThan(envPaths.indexOf(repoEnv));
  });
});
