import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import prisma from '../prisma/client';
import logger from '../utils/logger';
import { isLocalReplicaMode } from '../utils/runtimePaths';

type SyncableRequestFile = {
  fieldname: string;
  path: string;
  originalname: string;
  mimetype: string;
};

const SYNC_EXCLUDED_PREFIXES = [
  '/health',
  '/api/auth/login',
  '/api/auth/me',
  '/api/inventory',
  '/api/sync/push-ops',
  '/api/sync/log',
  '/api/sync/conflicts',
  '/api/sync/replica/export',
];

function shouldQueueMutation(req: Request) {
  if (!isLocalReplicaMode()) {
    return false;
  }

  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return false;
  }

  return !SYNC_EXCLUDED_PREFIXES.some((prefix) => req.path.startsWith(prefix));
}

function extractFiles(req: Request): SyncableRequestFile[] {
  const requestWithFiles = req as Request & {
    file?: Express.Multer.File;
    files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>;
  };

  if (requestWithFiles.file) {
    return [
      {
        fieldname: requestWithFiles.file.fieldname,
        path: requestWithFiles.file.path,
        originalname: requestWithFiles.file.originalname,
        mimetype: requestWithFiles.file.mimetype,
      },
    ];
  }

  if (Array.isArray(requestWithFiles.files)) {
    return requestWithFiles.files.map((file) => ({
      fieldname: file.fieldname,
      path: file.path,
      originalname: file.originalname,
      mimetype: file.mimetype,
    }));
  }

  if (!requestWithFiles.files) {
    return [];
  }

  return Object.values(requestWithFiles.files).flatMap((files) =>
    files.map((file) => ({
      fieldname: file.fieldname,
      path: file.path,
      originalname: file.originalname,
      mimetype: file.mimetype,
    }))
  );
}

function cloneSerializableBody(body: unknown): unknown {
  if (body === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(body));
  } catch {
    return body ?? null;
  }
}

async function enqueueSuccessfulMutation(req: Request) {
  const contentType = req.headers['content-type'];
  const files = extractFiles(req);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO request_sync_queue (
        id,
        method,
        path,
        content_type,
        body,
        files,
        status,
        created_at,
        attempt_count
      )
      VALUES (?, ?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP, 0)
    `,
    randomUUID(),
    req.method.toUpperCase(),
    req.originalUrl,
    Array.isArray(contentType) ? contentType[0] : contentType ?? null,
    JSON.stringify(cloneSerializableBody(req.body)),
    JSON.stringify(files),
  );
}

export function localReplicaSyncMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!shouldQueueMutation(req)) {
    next();
    return;
  }

  res.on('finish', () => {
    if (res.statusCode >= 400) {
      return;
    }

    void enqueueSuccessfulMutation(req).catch((error) => {
      logger.error('Failed to queue local replica request for sync', error);
    });
  });

  next();
}
