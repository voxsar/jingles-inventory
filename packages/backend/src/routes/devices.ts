import { Router, type Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, type AuthRequest, requireRole } from '../middleware/auth';
import { authenticatePosSyncRequest } from '../middleware/posSyncAuth';
import { isLocalReplicaMode } from '../utils/runtimePaths';

const router = Router();

type DeviceHeartbeat = {
  deviceId?: unknown;
  deviceName?: unknown;
  application?: unknown;
  applicationVersion?: unknown;
  platform?: unknown;
  hostname?: unknown;
  branchId?: unknown;
  terminalId?: unknown;
  connection?: unknown;
  lastSyncAt?: unknown;
  pendingCount?: unknown;
  conflictCount?: unknown;
};

function stringValue(value: unknown, maxLength = 160) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function nonNegativeInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function dateValue(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function readDesktopUpstreamToken() {
  if (!isLocalReplicaMode()) return null;
  try {
    const rows = await (prisma as any).$queryRawUnsafe(
      'SELECT value FROM config WHERE key = ? LIMIT 1',
      'upstreamAuthToken'
    ) as Array<{ value?: string }>;
    return rows[0]?.value?.trim() || null;
  } catch {
    return null;
  }
}

async function proxyToCloud(req: AuthRequest, res: Response) {
  const upstreamUrl = process.env.JINGLES_UPSTREAM_SERVER_URL?.trim();
  if (!upstreamUrl) {
    res.status(503).json({ error: 'The cloud device registry is not configured' });
    return;
  }

  const upstreamToken = await readDesktopUpstreamToken();
  const authorization = upstreamToken
    ? `Bearer ${upstreamToken}`
    : typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : undefined;
  const appToken = typeof req.headers['x-jingles-pos-app-token'] === 'string'
    ? req.headers['x-jingles-pos-app-token']
    : undefined;
  const target = new URL(`/api/devices${req.url}`, `${upstreamUrl.replace(/\/+$/, '')}/`);

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
        ...(appToken ? { 'x-jingles-pos-app-token': appToken } : {}),
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });
    const body = await response.text();
    res.status(response.status);
    res.type(response.headers.get('content-type') ?? 'application/json');
    res.send(body);
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : 'The cloud device registry is unavailable',
    });
  }
}

router.post('/heartbeat', authenticatePosSyncRequest, async (req: AuthRequest, res: Response) => {
  if (isLocalReplicaMode()) {
    await proxyToCloud(req, res);
    return;
  }

  const input = req.body as DeviceHeartbeat;
  const deviceId = stringValue(input.deviceId, 128);
  const reportedName = stringValue(input.deviceName, 80);
  const application = stringValue(input.application, 32);
  const applicationVersion = stringValue(input.applicationVersion, 40);
  if (!deviceId || !reportedName || !applicationVersion || !['inventory', 'pos'].includes(application ?? '')) {
    res.status(400).json({
      error: 'deviceId, deviceName, application, and applicationVersion are required',
    });
    return;
  }

  const device = await (prisma as any).managedDevice.upsert({
    where: { id: deviceId },
    create: {
      id: deviceId,
      displayName: reportedName,
      reportedName,
      application,
      applicationVersion,
      platform: stringValue(input.platform, 80),
      hostname: stringValue(input.hostname, 255),
      branchId: stringValue(input.branchId, 128),
      terminalId: stringValue(input.terminalId, 128),
      lastIp: req.ip,
      lastConnection: stringValue(input.connection, 16),
      lastSeenAt: new Date(),
      lastSyncAt: dateValue(input.lastSyncAt),
      pendingCount: nonNegativeInteger(input.pendingCount),
      conflictCount: nonNegativeInteger(input.conflictCount),
    },
    update: {
      reportedName,
      application,
      applicationVersion,
      platform: stringValue(input.platform, 80),
      hostname: stringValue(input.hostname, 255),
      branchId: stringValue(input.branchId, 128),
      terminalId: stringValue(input.terminalId, 128),
      lastIp: req.ip,
      lastConnection: stringValue(input.connection, 16),
      lastSeenAt: new Date(),
      lastSyncAt: dateValue(input.lastSyncAt),
      pendingCount: nonNegativeInteger(input.pendingCount),
      conflictCount: nonNegativeInteger(input.conflictCount),
    },
  });

  res.json({
    deviceId: device.id,
    deviceName: device.displayName,
    nameVersion: device.nameVersion,
    serverTime: new Date().toISOString(),
  });
});

router.get('/', authenticate, requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  if (isLocalReplicaMode()) {
    await proxyToCloud(req, res);
    return;
  }

  const devices = await (prisma as any).managedDevice.findMany({
    orderBy: [{ lastSeenAt: 'desc' }, { displayName: 'asc' }],
  });
  const now = Date.now();
  res.json(devices.map((device: any) => ({
    ...device,
    online: now - new Date(device.lastSeenAt).getTime() < 90_000,
  })));
});

router.patch('/:id/name', authenticate, requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  if (isLocalReplicaMode()) {
    await proxyToCloud(req, res);
    return;
  }

  const displayName = stringValue(req.body?.name, 80);
  if (!displayName) {
    res.status(400).json({ error: 'A device name is required' });
    return;
  }

  try {
    const device = await (prisma as any).managedDevice.update({
      where: { id: req.params.id },
      data: {
        displayName,
        nameVersion: { increment: 1 },
      },
    });
    res.json(device);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    throw error;
  }
});

export default router;
