import type { ElectronAppLogEntry, ElectronAppLogLevel, ElectronAppLogSource } from '@jingles/shared';

const MAX_LOG_ENTRIES = 1000;
const listeners = new Set<(entry: ElectronAppLogEntry) => void>();
const entries: ElectronAppLogEntry[] = [];
let nextEntryId = 1;
let consoleCaptureInstalled = false;

function cloneEntry(entry: ElectronAppLogEntry): ElectronAppLogEntry {
  return { ...entry };
}

function serializeLogPart(part: unknown): string {
  if (part instanceof Error) {
    return part.stack || part.message;
  }

  if (typeof part === 'string') {
    return part;
  }

  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

function notifyListeners(entry: ElectronAppLogEntry) {
  for (const listener of listeners) {
    listener(cloneEntry(entry));
  }
}

export function appendDesktopLog(
  source: ElectronAppLogSource,
  level: ElectronAppLogLevel,
  message: string
) {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return;
  }

  const entry: ElectronAppLogEntry = {
    id: nextEntryId++,
    timestamp: new Date().toISOString(),
    source,
    level,
    message: normalizedMessage,
  };

  entries.push(entry);
  if (entries.length > MAX_LOG_ENTRIES) {
    entries.splice(0, entries.length - MAX_LOG_ENTRIES);
  }

  notifyListeners(entry);
}

export function appendDesktopLogLines(
  source: ElectronAppLogSource,
  level: ElectronAppLogLevel,
  message: string
) {
  for (const line of message.split(/\r?\n/)) {
    appendDesktopLog(source, level, line);
  }
}

export function listDesktopLogs(options?: { afterId?: number; limit?: number }) {
  const afterId = options?.afterId ?? 0;
  const limit = options?.limit ?? 400;
  const matchingEntries = entries.filter((entry) => entry.id > afterId);
  const slicedEntries =
    matchingEntries.length > limit
      ? matchingEntries.slice(matchingEntries.length - limit)
      : matchingEntries;

  return slicedEntries.map(cloneEntry);
}

export function clearDesktopLogs() {
  entries.length = 0;
}

export function subscribeDesktopLogs(listener: (entry: ElectronAppLogEntry) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installMainProcessConsoleCapture() {
  if (consoleCaptureInstalled) {
    return;
  }

  consoleCaptureInstalled = true;

  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const wrap =
    (method: keyof typeof originalConsole, level: ElectronAppLogLevel) =>
    (...args: unknown[]) => {
      appendDesktopLog('main', level, args.map(serializeLogPart).join(' '));
      originalConsole[method](...args);
    };

  console.log = wrap('log', 'info');
  console.info = wrap('info', 'info');
  console.warn = wrap('warn', 'warn');
  console.error = wrap('error', 'error');
  console.debug = wrap('debug', 'debug');
}
