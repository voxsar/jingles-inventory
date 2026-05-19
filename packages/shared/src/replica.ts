export const REPLICA_TABLES = [
  'users',
  'vendors',
  'categories',
  'tags',
  'units_of_measure',
  'branches',
  'skus',
  'sku_vendors',
  'sku_tags',
  'attributes',
  'attribute_values',
  'sku_attributes',
  'sku_attribute_values',
  'sku_variants',
  'sku_variant_values',
  'product_images',
  'product_barcodes',
  'floors',
  'racks',
  'shelves',
  'storage_boxes',
  'box_barcodes',
  'stock_transfers',
  'stock_transfer_lines',
  'inventory_records',
  'inventory_events',
  'grns',
  'batches',
  'pricing_overlays',
  'grn_lines',
  'inspection_records',
  'prns',
  'prn_lines',
  'import_jobs',
  'import_records',
  'audit_logs',
  'status_options',
  'dashboard_stats',
] as const;

export type ReplicaTable = (typeof REPLICA_TABLES)[number];

export type ReplicaMutationAction = 'upsert' | 'delete';

export interface ReplicaMutationEvent {
  type: 'replica.mutation';
  table: ReplicaTable;
  action: ReplicaMutationAction;
  row: Record<string, unknown>;
  emittedAt: string;
}

export interface ReplicaReadyEvent {
  type: 'replica.ready';
  emittedAt: string;
}

export interface ReplicaSnapshotRequiredEvent {
  type: 'replica.snapshot-required';
  reason: string;
  emittedAt: string;
}

export type ReplicaSyncEvent =
  | ReplicaMutationEvent
  | ReplicaReadyEvent
  | ReplicaSnapshotRequiredEvent;
