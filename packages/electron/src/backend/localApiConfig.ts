const DEFAULT_LOCAL_API_HOST = '0.0.0.0';
const DEFAULT_LOCAL_API_PORT = 3630;
const DEFAULT_UPSTREAM_SERVER_URL = 'https://inv.theredsun.org';
const DEFAULT_AUTO_SYNC_INTERVAL_MS = 30000;

export type DesktopLocalApiConfig = {
  host: string;
  port: number;
  upstreamUrl: string;
  autoSyncIntervalMs: number;
};

function trimEnvValue(value: string | undefined) {
  return value?.trim() ?? '';
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHost(host: string) {
  return host.replace(/^\[|\]$/g, '').trim().toLowerCase();
}

function isWildcardHost(host: string) {
  const normalizedHost = normalizeHost(host);
  return normalizedHost === '0.0.0.0' || normalizedHost === '::';
}

function isLoopbackHost(host: string) {
  const normalizedHost = normalizeHost(host);
  return (
    normalizedHost === '127.0.0.1' ||
    normalizedHost === 'localhost' ||
    normalizedHost === '::1'
  );
}

export function formatHostForUrl(host: string) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

export function getDesktopLocalApiConfig(
  env: NodeJS.ProcessEnv = process.env
): DesktopLocalApiConfig {
  const host = trimEnvValue(env.ELECTRON_LOCAL_API_HOST) || DEFAULT_LOCAL_API_HOST;
  const port = parsePositiveInteger(env.ELECTRON_LOCAL_API_PORT, DEFAULT_LOCAL_API_PORT);
  const upstreamUrl = (
    trimEnvValue(env.JINGLES_UPSTREAM_SERVER_URL) ||
    trimEnvValue(env.ELECTRON_UPSTREAM_SERVER_URL) ||
    trimEnvValue(env.VITE_API_BASE_URL) ||
    DEFAULT_UPSTREAM_SERVER_URL
  ).replace(/\/+$/, '');
  const autoSyncIntervalMs = parsePositiveInteger(
    env.ELECTRON_SYNC_INTERVAL_MS,
    DEFAULT_AUTO_SYNC_INTERVAL_MS
  );

  return {
    host,
    port,
    upstreamUrl,
    autoSyncIntervalMs,
  };
}

export function getDesktopLocalApiUrl(
  config: Pick<DesktopLocalApiConfig, 'host' | 'port'> = getDesktopLocalApiConfig()
) {
  return `http://${formatHostForUrl(config.host)}:${config.port}`;
}

export function getDesktopLocalApiProbeUrls(config = getDesktopLocalApiConfig()) {
  const hosts = isWildcardHost(config.host)
    ? ['127.0.0.1', 'localhost', '::1']
    : [config.host, '127.0.0.1', 'localhost', '::1'];

  if (!isWildcardHost(config.host) && !isLoopbackHost(config.host)) {
    return [getDesktopLocalApiUrl(config)];
  }

  return Array.from(
    new Set(hosts.map((host) => getDesktopLocalApiUrl({ host, port: config.port })))
  );
}
