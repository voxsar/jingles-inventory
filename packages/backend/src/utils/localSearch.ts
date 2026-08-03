import prisma from '../prisma/client';
import { isLocalReplicaMode } from './runtimePaths';

function buildFtsQuery(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/["*()\[\]{}^~?:\\]/g, '').trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return '';
  }

  const last = tokens.pop()!;
  return [...tokens, `${last}*`].join(' ');
}

/**
 * When running in local SQLite replica mode (Electron desktop), query the FTS5
 * `skus_fts` virtual table and return matching SKU ids ranked by BM25 relevance.
 *
 * Returns `null` when not in local mode or when the FTS table is unavailable
 * (caller should fall back to the regular Prisma `contains` filter).
 */
export async function searchSKUIdsFts(query: string, limit = 500): Promise<string[] | null> {
  if (!isLocalReplicaMode() || !query.trim()) {
    return null;
  }

  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) {
    return null;
  }

  try {
    const exactBarcodeRows = await prisma.productBarcode.findMany({
      where: { barcode: query.trim() },
      select: { skuId: true },
      take: 10,
    });
    const rows = (await (prisma as any).$queryRawUnsafe(
      `SELECT id FROM skus_fts WHERE skus_fts MATCH ? ORDER BY rank LIMIT ?`,
      ftsQuery,
      limit
    )) as Array<{ id: string }>;
    return Array.from(new Set([
      ...exactBarcodeRows.map((row) => row.skuId),
      ...rows.map((row) => row.id),
    ])).slice(0, limit);
  } catch {
    return null;
  }
}

/**
 * When running in local SQLite replica mode, query the FTS5 `vendors_fts`
 * virtual table and return matching vendor ids ranked by BM25 relevance.
 *
 * Returns `null` when not in local mode or when the FTS table is unavailable.
 */
export async function searchVendorIdsFts(query: string, limit = 500): Promise<string[] | null> {
  if (!isLocalReplicaMode() || !query.trim()) {
    return null;
  }

  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) {
    return null;
  }

  try {
    const rows = (await (prisma as any).$queryRawUnsafe(
      `SELECT id FROM vendors_fts WHERE vendors_fts MATCH ? ORDER BY rank LIMIT ?`,
      ftsQuery,
      limit
    )) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  } catch {
    return null;
  }
}
