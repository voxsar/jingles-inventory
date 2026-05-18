import path from 'path';
import * as PrismaModule from '@prisma/client';
import { isLocalReplicaMode } from '../utils/runtimePaths';

const PostgresPrismaClient = PrismaModule.PrismaClient;
const PrismaNamespace = (PrismaModule as Record<string, unknown>).Prisma as
  | Record<string, unknown>
  | undefined;

const JSON_FIELD_MAP: Record<string, Set<string>> = {
  SKU: new Set(['conversionRules', 'dimensions', 'batchPricing', 'batchReferencePricing']),
  InventoryEvent: new Set(['metadata']),
  PricingOverlay: new Set(['appliesTo', 'conditions']),
  ImportJob: new Set(['metadata', 'warnings']),
  ImportRecord: new Set(['payload', 'relatedRecords', 'warnings', 'errors']),
  AuditLog: new Set(['changes']),
  SyncQueue: new Set(['payload']),
  DashboardStats: new Set(['inventoryByState']),
};

const GLOBAL_JSON_FIELD_NAMES = new Set(
  Object.values(JSON_FIELD_MAP).flatMap((fields) => [...fields])
);

const JSON_NULL_SENTINELS = [
  PrismaNamespace?.JsonNull,
  PrismaNamespace?.DbNull,
  PrismaNamespace?.AnyNull,
].filter((value) => value !== undefined);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonNullSentinel(value: unknown) {
  return JSON_NULL_SENTINELS.some((sentinel) => sentinel === value);
}

function shouldLeaveValueUntouched(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  );
}

function stripInsensitiveMode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripInsensitiveMode);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'mode' && child === 'insensitive') {
      continue;
    }

    next[key] = stripInsensitiveMode(child);
  }

  return next;
}

function serializeJsonFieldValue(value: unknown): unknown {
  if (value === undefined) {
    return value;
  }

  if (value === null || isJsonNullSentinel(value)) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function normalizeArgsForLocalClient(model: string | undefined, value: unknown): unknown {
  if (isJsonNullSentinel(value)) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeArgsForLocalClient(model, item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const jsonFields = model ? JSON_FIELD_MAP[model] : undefined;
  const next: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    const normalizedChild = normalizeArgsForLocalClient(model, child);
    next[key] = jsonFields?.has(key)
      ? serializeJsonFieldValue(normalizedChild)
      : normalizedChild;
  }

  return next;
}

function tryParseJson(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function parseLocalResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(parseLocalResult);
  }

  if (shouldLeaveValueUntouched(value) || !isPlainObject(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const parsedChild = parseLocalResult(child);
    next[key] = GLOBAL_JSON_FIELD_NAMES.has(key) ? tryParseJson(parsedChild) : parsedChild;
  }

  return next;
}

function createLocalReplicaClient() {
  const localClientPath = path.resolve(__dirname, '..', '..', 'generated', 'local-prisma');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const localPrismaModule = require(localClientPath) as { PrismaClient: new () => any };
  const localClient = new localPrismaModule.PrismaClient();

  return localClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, args, query }: { model?: string; args?: unknown; query: (args: unknown) => Promise<unknown> }) {
          const strippedArgs = stripInsensitiveMode(args);
          const normalizedArgs = normalizeArgsForLocalClient(model, strippedArgs);
          const result = await query(normalizedArgs);
          return parseLocalResult(result);
        },
      },
    },
  });
}

const prisma = isLocalReplicaMode()
  ? createLocalReplicaClient()
  : new PostgresPrismaClient();

export default prisma as PostgresPrismaClient;
