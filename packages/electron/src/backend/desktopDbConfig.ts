import fs from 'fs';
import path from 'path';
import { app } from 'electron';

type DesktopDbConfig = {
  databasePath?: string | null;
};

const DESKTOP_DB_CONFIG_FILE = 'desktop-db.json';

function getDesktopDbConfigFilePath() {
  return path.join(app.getPath('userData'), DESKTOP_DB_CONFIG_FILE);
}

function readDesktopDbConfig(): DesktopDbConfig {
  const configFilePath = getDesktopDbConfigFilePath();

  if (!fs.existsSync(configFilePath)) {
    return {};
  }

  try {
    const rawValue = fs.readFileSync(configFilePath, 'utf8');
    if (!rawValue.trim()) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as DesktopDbConfig;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (error) {
    console.warn('[Electron] Failed to read desktop DB config. Falling back to the default DB path.', error);
    return {};
  }
}

function writeDesktopDbConfig(config: DesktopDbConfig) {
  const configFilePath = getDesktopDbConfigFilePath();
  const configDirectory = path.dirname(configFilePath);

  if (!fs.existsSync(configDirectory)) {
    fs.mkdirSync(configDirectory, { recursive: true });
  }

  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
}

export function getConfiguredDesktopDatabasePath() {
  const configuredPath = readDesktopDbConfig().databasePath?.trim();
  if (!configuredPath) {
    return null;
  }

  return path.resolve(configuredPath);
}

export function setConfiguredDesktopDatabasePath(databasePath: string) {
  writeDesktopDbConfig({
    databasePath: path.resolve(databasePath),
  });
}

export function clearConfiguredDesktopDatabasePath() {
  const configFilePath = getDesktopDbConfigFilePath();

  if (fs.existsSync(configFilePath)) {
    fs.unlinkSync(configFilePath);
  }
}
