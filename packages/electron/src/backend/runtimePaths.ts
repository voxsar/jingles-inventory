import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { getConfiguredDesktopDatabasePath } from './desktopDbConfig';

function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
}

export function getDesktopRuntimeRoot() {
  return ensureDirectory(path.join(app.getPath('userData'), 'backend'));
}

export function getDesktopDefaultDatabasePath() {
  return path.join(getDesktopRuntimeRoot(), 'jingles-inventory.sqlite');
}

export function getDesktopDatabasePath() {
  return getConfiguredDesktopDatabasePath() ?? getDesktopDefaultDatabasePath();
}

export function getDesktopSqliteDatabaseUrl() {
  const databasePath = getDesktopDatabasePath();
  const schemaDirectory = getDesktopBackendResourcePath('prisma');
  const relativePath = path.relative(schemaDirectory, databasePath).replace(/\\/g, '/');

  if (relativePath && !/^[A-Za-z]:/i.test(relativePath)) {
    return `file:${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}`;
  }

  const normalizedPath = databasePath.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalizedPath) || normalizedPath.startsWith('//')) {
    return `file:${normalizedPath}`;
  }

  return normalizedPath.startsWith('/') ? `file:${normalizedPath}` : `file:/${normalizedPath}`;
}

export function getDesktopBackendResourcePath(...segments: string[]) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', ...segments);
  }

  return path.resolve(app.getAppPath(), '..', 'backend', ...segments);
}

export function getDesktopBackendEntryPath() {
  return getDesktopBackendResourcePath('dist', 'server.js');
}

export function getDesktopReplicaSchemaSqlPath() {
  return getDesktopBackendResourcePath('prisma', 'schema.local.sql');
}

export function getDesktopEnvFilePaths(mode = process.env.NODE_ENV?.trim() || 'development') {
  if (app.isPackaged) {
    return [];
  }

  const appPath = app.getAppPath();
  const packageRoots = [
    path.resolve(appPath, '..', 'web'),
    path.resolve(appPath),
    path.resolve(appPath, '..', '..'),
  ];
  const envSuffixes = [
    `.env.${mode}.local`,
    '.env.local',
    `.env.${mode}`,
    '.env',
  ];

  return Array.from(
    new Set(
      packageRoots.flatMap((rootPath) =>
        envSuffixes.map((filename) => path.resolve(rootPath, filename))
      )
    )
  );
}
