import { describe, expect, it } from 'vitest';
import {
  type DesktopLocalApiConfig,
  formatHostForUrl,
  getDesktopLocalApiConfig,
  getDesktopLocalApiProbeUrls,
  getDesktopLocalApiUrl,
} from '../backend/localApiConfig';

function createConfig(overrides: Partial<DesktopLocalApiConfig>): DesktopLocalApiConfig {
  return {
    host: '127.0.0.1',
    port: 3630,
    upstreamUrl: 'http://localhost:3001',
    autoSyncIntervalMs: 30000,
    ...overrides,
  };
}

describe('localApiConfig', () => {
  it('uses the hosted inventory API by default for installed desktop builds', () => {
    expect(getDesktopLocalApiConfig({}).upstreamUrl).toBe('https://inv.theredsun.org');
  });

  it('reads the desktop local API config from the current environment values', () => {
    const config = getDesktopLocalApiConfig({
      ELECTRON_LOCAL_API_HOST: ' localhost ',
      ELECTRON_LOCAL_API_PORT: '4640',
      JINGLES_UPSTREAM_SERVER_URL: 'https://inv.example.com///',
      ELECTRON_SYNC_INTERVAL_MS: '45000',
    });

    expect(config).toEqual({
      host: 'localhost',
      port: 4640,
      upstreamUrl: 'https://inv.example.com',
      autoSyncIntervalMs: 45000,
    });
  });

  it('formats IPv6 hosts correctly in local API URLs', () => {
    expect(formatHostForUrl('::1')).toBe('[::1]');
    expect(getDesktopLocalApiUrl({ host: '::1', port: 3630 })).toBe('http://[::1]:3630');
  });

  it('adds loopback fallbacks for local hosts and removes duplicates', () => {
    expect(getDesktopLocalApiProbeUrls(createConfig({ host: '127.0.0.1' }))).toEqual([
      'http://127.0.0.1:3630',
      'http://localhost:3630',
      'http://[::1]:3630',
    ]);
  });

  it('uses loopback clients instead of wildcard bind addresses', () => {
    expect(getDesktopLocalApiProbeUrls(createConfig({ host: '0.0.0.0' }))).toEqual([
      'http://127.0.0.1:3630',
      'http://localhost:3630',
      'http://[::1]:3630',
    ]);
  });

  it('does not add loopback fallbacks for custom remote hosts', () => {
    expect(getDesktopLocalApiProbeUrls(createConfig({ host: '192.168.1.25' }))).toEqual([
      'http://192.168.1.25:3630',
    ]);
  });
});
