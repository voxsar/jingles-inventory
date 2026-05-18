import fs from 'fs';
import path from 'path';
import { app } from 'electron';

function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
}

export function getDesktopRuntimeRoot() {
  return ensureDirectory(path.join(app.getPath('userData'), 'backend'));
}

export function getDesktopDatabasePath() {
  return path.join(getDesktopRuntimeRoot(), 'jingles-inventory.sqlite');
}

export function getDesktopSqliteDatabaseUrl() {
  const databasePath = getDesktopDatabasePath();
  const schemaDirectory = getDesktopBackendResourcePath('prisma');
  const relativePath = path.relative(schemaDirectory, databasePath).replace(/\\/g, '/');

  if (relativePath && !/^[A-Za-z]:/i.test(relativePath)) {
    return `file:${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}`;
  }

  const normalizedPath = databasePath.replace(/\\/g, '/');
  return normalizedPath.startsWith('/')
    ? `file:${normalizedPath}`
    : `file:/${normalizedPath}`;
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

export function getDesktopEnvFilePath() {
  if (app.isPackaged) {
    return null;
  }

  return path.resolve(app.getAppPath(), '..', '..', '.env');
}
