import { REPLICA_TABLES } from '../backend/replicaTables';

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
