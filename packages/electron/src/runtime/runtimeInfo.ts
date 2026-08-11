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
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status < 500 || attempt === 2) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }

  if (!response || !response.ok) {
    throw new Error(
      response
        ? `received HTTP ${response.status} from ${targetUrl.pathname}`
        : `received no response from ${targetUrl.pathname}`
    );
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
