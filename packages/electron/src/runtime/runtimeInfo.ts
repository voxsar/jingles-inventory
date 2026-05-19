import type { BackendRuntimeInfo, RuntimeBuildInfo } from '@jingles/shared';
import { getDesktopLocalApiConfig } from '../backend/localApiConfig';
import { GENERATED_BUILD_INFO as GENERATED_BACKEND_BUILD_INFO } from '../generated/backendBuildInfo';

function getDesktopBackendBuildInfo(): RuntimeBuildInfo {
  return {
    packageName: GENERATED_BACKEND_BUILD_INFO.packageName,
    appVersion: GENERATED_BACKEND_BUILD_INFO.appVersion,
    buildNumber: GENERATED_BACKEND_BUILD_INFO.buildNumber,
    commitHash: GENERATED_BACKEND_BUILD_INFO.commitHash,
    commitShortHash: GENERATED_BACKEND_BUILD_INFO.commitShortHash,
    builtAt: GENERATED_BACKEND_BUILD_INFO.builtAt,
  };
}

async function fetchUpstreamBuildInfo(upstreamUrl: string) {
  const targetUrl = new URL('/api/runtime/build', `${upstreamUrl}/`);
  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`received HTTP ${response.status} from ${targetUrl.pathname}`);
  }

  const payload = (await response.json()) as {
    data?: RuntimeBuildInfo;
  };

  if (!payload?.data) {
    throw new Error('upstream build payload did not include data');
  }

  return payload.data;
}

export async function getDesktopRuntimeInfo(): Promise<BackendRuntimeInfo> {
  const localConfig = getDesktopLocalApiConfig();
  const upstreamUrl = localConfig.upstreamUrl?.trim() || null;

  if (!upstreamUrl) {
    return {
      mode: 'local_replica',
      build: getDesktopBackendBuildInfo(),
      upstream: null,
    };
  }

  let upstreamBuild: RuntimeBuildInfo | null = null;
  let upstreamError: string | null = null;

  try {
    upstreamBuild = await fetchUpstreamBuildInfo(upstreamUrl);
  } catch (error) {
    upstreamError =
      error instanceof Error ? error.message : 'Failed to load upstream build info.';
  }

  return {
    mode: 'local_replica',
    build: getDesktopBackendBuildInfo(),
    upstream: {
      url: upstreamUrl,
      build: upstreamBuild,
      error: upstreamError,
    },
  };
}
