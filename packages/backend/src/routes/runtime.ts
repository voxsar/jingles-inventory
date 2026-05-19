import { Router } from 'express';
import logger from '../utils/logger';
import { getBackendBuildInfo } from '../utils/buildInfo';

const router = Router();

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
    data?: ReturnType<typeof getBackendBuildInfo>;
  };

  if (!payload?.data) {
    throw new Error('upstream build payload did not include data');
  }

  return payload.data;
}

router.get('/build', (_req, res) => {
  res.json({
    status: 'ok',
    data: getBackendBuildInfo(),
  });
});

router.get('/info', async (_req, res) => {
  const upstreamUrl = process.env.JINGLES_UPSTREAM_SERVER_URL?.trim() || null;

  if (!upstreamUrl) {
    res.json({
      status: 'ok',
      data: {
        mode: process.env.JINGLES_LOCAL_SQLITE === '1' ? 'local_replica' : 'server',
        build: getBackendBuildInfo(),
        upstream: null,
      },
    });
    return;
  }

  let upstreamBuild = null;
  let upstreamError: string | null = null;

  try {
    upstreamBuild = await fetchUpstreamBuildInfo(upstreamUrl);
  } catch (error) {
    upstreamError = error instanceof Error ? error.message : 'Failed to load upstream build info.';
    logger.warn('Failed to fetch upstream build info', error);
  }

  res.json({
    status: 'ok',
    data: {
      mode: process.env.JINGLES_LOCAL_SQLITE === '1' ? 'local_replica' : 'server',
      build: getBackendBuildInfo(),
      upstream: {
        url: upstreamUrl,
        build: upstreamBuild,
        error: upstreamError,
      },
    },
  });
});

export default router;
