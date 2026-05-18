import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import type { Duplex } from 'stream';
import { Client } from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import {
  REPLICA_TABLES,
  type ReplicaMutationEvent,
  type ReplicaSnapshotRequiredEvent,
  type ReplicaSyncEvent,
  type ReplicaTable,
} from '@jingles/shared';
import { verifyAuthToken } from '../middleware/auth';
import logger from '../utils/logger';
import { isLocalReplicaMode } from '../utils/runtimePaths';

const REPLICA_SYNC_CHANNEL = 'jingles_replica_sync';
const REPLICA_SYNC_TRIGGER_FUNCTION = 'jingles_replica_sync_notify';
const REPLICA_SYNC_TRIGGER_NAME = 'jingles_replica_sync_trigger';

let websocketServer: WebSocketServer | null = null;
let websocketHttpServer: Server | null = null;
let notificationClient: Client | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = 1000;
let realtimeStarted = false;
let shouldBroadcastReconnectSnapshot = false;

function isReplicaTable(value: unknown): value is ReplicaTable {
  return typeof value === 'string' && (REPLICA_TABLES as readonly string[]).includes(value);
}

function buildReadyEvent(): ReplicaSyncEvent {
  return {
    type: 'replica.ready',
    emittedAt: new Date().toISOString(),
  };
}

function buildSnapshotRequiredEvent(reason: string): ReplicaSnapshotRequiredEvent {
  return {
    type: 'replica.snapshot-required',
    reason,
    emittedAt: new Date().toISOString(),
  };
}

function broadcastEvent(event: ReplicaSyncEvent) {
  if (!websocketServer) {
    return;
  }

  const payload = JSON.stringify(event);
  for (const client of websocketServer.clients) {
    if (client.readyState !== WebSocket.OPEN) {
      continue;
    }

    client.send(payload);
  }
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain\r\n' +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      '\r\n' +
      message
  );
  socket.destroy();
}

function attachWebSocketServer(server: Server) {
  if (websocketServer && websocketHttpServer === server) {
    return;
  }

  websocketServer = new WebSocketServer({ noServer: true });
  websocketHttpServer = server;

  websocketServer.on('connection', (socket: WebSocket) => {
    socket.send(JSON.stringify(buildReadyEvent()));
    socket.on('error', (error: Error) => {
      logger.warn('Replica realtime websocket client error', error);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (requestUrl.pathname !== '/api/sync/ws') {
      rejectUpgrade(socket, 404, 'Not found');
      return;
    }

    const token = requestUrl.searchParams.get('token')?.trim();
    if (!token) {
      rejectUpgrade(socket, 401, 'Missing access token');
      return;
    }

    try {
      verifyAuthToken(token);
    } catch (error) {
      const statusCode =
        error instanceof Error && error.message === 'JWT_SECRET is not configured' ? 500 : 401;
      rejectUpgrade(
        socket,
        statusCode,
        statusCode === 500 ? 'Server configuration error' : 'Invalid access token'
      );
      return;
    }

    websocketServer?.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
      websocketServer?.emit('connection', websocket, request);
    });
  });
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? '';
}

function buildTriggerSql() {
  const triggerStatements = REPLICA_TABLES.map(
    (tableName) => `
DROP TRIGGER IF EXISTS ${REPLICA_SYNC_TRIGGER_NAME} ON "${tableName}";
CREATE TRIGGER ${REPLICA_SYNC_TRIGGER_NAME}
AFTER INSERT OR UPDATE OR DELETE ON "${tableName}"
FOR EACH ROW EXECUTE FUNCTION ${REPLICA_SYNC_TRIGGER_FUNCTION}();`
  ).join('\n');

  return `
CREATE OR REPLACE FUNCTION ${REPLICA_SYNC_TRIGGER_FUNCTION}() RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'action', lower(TG_OP),
    'row', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END,
    'emittedAt', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
  );

  PERFORM pg_notify('${REPLICA_SYNC_CHANNEL}', payload::text);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

${triggerStatements}
`;
}

async function ensureRealtimeTriggers() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    logger.warn('Replica realtime sync is disabled because DATABASE_URL is not configured.');
    return false;
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query(buildTriggerSql());
    return true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function parseMutationNotification(payload: string): ReplicaMutationEvent | null {
  const decoded = JSON.parse(payload) as {
    table?: string;
    action?: string;
    row?: Record<string, unknown>;
    emittedAt?: string;
  };

  if (!isReplicaTable(decoded.table)) {
    return null;
  }

  if (!decoded.row || typeof decoded.row !== 'object' || Array.isArray(decoded.row)) {
    return null;
  }

  return {
    type: 'replica.mutation',
    table: decoded.table,
    action: decoded.action === 'delete' ? 'delete' : 'upsert',
    row: decoded.row,
    emittedAt:
      typeof decoded.emittedAt === 'string' && decoded.emittedAt.trim()
        ? decoded.emittedAt
        : new Date().toISOString(),
  };
}

function clearReconnectTimer() {
  if (!reconnectTimer) {
    return;
  }

  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect() {
  if (!realtimeStarted || isLocalReplicaMode()) {
    return;
  }

  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectNotificationListener();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
}

async function connectNotificationListener() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return;
  }

  clearReconnectTimer();

  const client = new Client({ connectionString: databaseUrl });
  const handleDisconnect = (error?: unknown) => {
    if (notificationClient !== client) {
      return;
    }

    notificationClient = null;
    shouldBroadcastReconnectSnapshot = true;

    if (error) {
      logger.error('Replica realtime listener disconnected unexpectedly', error);
    } else {
      logger.warn('Replica realtime listener disconnected unexpectedly');
    }

    scheduleReconnect();
  };

  client.on('notification', (message) => {
    if (!message.payload) {
      return;
    }

    try {
      const event = parseMutationNotification(message.payload);
      if (!event) {
        broadcastEvent(buildSnapshotRequiredEvent('Replica change notification was incomplete.'));
        return;
      }

      broadcastEvent(event);
    } catch (error) {
      logger.error('Failed to parse replica realtime notification', error);
      broadcastEvent(buildSnapshotRequiredEvent('Replica change notification parsing failed.'));
    }
  });

  client.on('error', (error) => {
    handleDisconnect(error);
  });

  client.on('end', () => {
    handleDisconnect();
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${REPLICA_SYNC_CHANNEL}`);
  } catch (error) {
    await client.end().catch(() => undefined);
    logger.error('Failed to connect replica realtime listener', error);
    scheduleReconnect();
    return;
  }

  notificationClient = client;
  reconnectDelayMs = 1000;
  logger.info('Replica realtime listener connected');

  if (shouldBroadcastReconnectSnapshot) {
    shouldBroadcastReconnectSnapshot = false;
    broadcastEvent(buildSnapshotRequiredEvent('Replica realtime listener reconnected.'));
  }
}

export async function startReplicaRealtime(server: Server) {
  if (isLocalReplicaMode()) {
    return;
  }

  attachWebSocketServer(server);
  if (realtimeStarted) {
    return;
  }

  realtimeStarted = true;

  const triggersReady = await ensureRealtimeTriggers();
  if (!triggersReady) {
    return;
  }

  await connectNotificationListener();
}
