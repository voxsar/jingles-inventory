import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fixtures must use the host platform's path style: runtimePaths works with
// the native `path` module, so Windows-style fixtures only behave correctly
// on Windows and vice versa.
const IS_WINDOWS = process.platform === 'win32';
const FAKE_REPO_ROOT = IS_WINDOWS ? 'D:\\Projects\\jingles-inventory' : '/home/dev/jingles-inventory';
const FAKE_APP_PATH = path.join(FAKE_REPO_ROOT, 'packages', 'electron');
const SCHEMA_DIRECTORY = path.join(FAKE_REPO_ROOT, 'packages', 'backend', 'prisma');

const getConfiguredDesktopDatabasePath = vi.fn<() => string | null>(() => null);
const mockGetPath = vi.fn((name: string) => {
  if (name === 'userData') {
    return path.join(os.tmpdir(), 'jingles-electron-vitest');
  }

  throw new Error(`Unexpected app.getPath(${name}) call in runtimePaths test`);
});

const mockGetAppPath = vi.fn(() => FAKE_APP_PATH);

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

  it('produces a SQLite URL that resolves to the default database file', async () => {
    const { getDesktopSqliteDatabaseUrl } = await import('../backend/runtimePaths');

    const url = getDesktopSqliteDatabaseUrl();
    expect(url.startsWith('file:')).toBe(true);
    expect(url).not.toContain('\\');

    // Prisma resolves relative file: URLs against the schema directory; either
    // way the URL must point at the default database file without a malformed
    // extra slash before a Windows drive letter.
    const target = url.slice('file:'.length);
    expect(/^\/[A-Za-z]:\//.test(target)).toBe(false);
    const resolved = path.resolve(SCHEMA_DIRECTORY, target.replace(/\//g, path.sep));
    expect(resolved).toBe(
      path.join(os.tmpdir(), 'jingles-electron-vitest', 'backend', 'jingles-inventory.sqlite')
    );
  });

  it('keeps relative SQLite paths for databases under the same root as the schema', async () => {
    getConfiguredDesktopDatabasePath.mockReturnValue(path.join(FAKE_REPO_ROOT, 'data', 'custom.sqlite'));
    const { getDesktopSqliteDatabaseUrl } = await import('../backend/runtimePaths');

    expect(getDesktopSqliteDatabaseUrl()).toBe('file:../../../data/custom.sqlite');
  });

  it('checks the web package env files before the repo root env files in dev', async () => {
    const { getDesktopEnvFilePaths } = await import('../backend/runtimePaths');
    const envPaths = getDesktopEnvFilePaths('development');
    const webEnvLocal = path.join(FAKE_REPO_ROOT, 'packages', 'web', '.env.local');
    const repoEnv = path.join(FAKE_REPO_ROOT, '.env');

    expect(envPaths).toContain(webEnvLocal);
    expect(envPaths).toContain(repoEnv);
    expect(envPaths.indexOf(webEnvLocal)).toBeLessThan(envPaths.indexOf(repoEnv));
  });
});
