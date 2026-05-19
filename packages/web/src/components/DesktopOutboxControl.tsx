import { useEffect, useState } from 'react';
import type {
  ElectronSyncConflictEntry,
  ElectronSyncConflictResolutionChoice,
  ElectronSyncOutboxSnapshot,
} from '@jingles/shared';
import {
  emitDesktopOutboxChanged,
  subscribeDesktopOutboxChanged,
} from '../utils/desktopSync';

function hasElectronBridge() {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Unknown time';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatPayload(payload: Record<string, unknown> | null) {
  if (!payload) {
    return '{}';
  }

  return JSON.stringify(payload, null, 2);
}

function formatStatus(status: string) {
  if (status === 'Processed') {
    return 'synced';
  }

  if (status === 'failed_permanent') {
    return 'failed permanent';
  }

  return status;
}

function formatConflictLabel(conflict: ElectronSyncConflictEntry) {
  if (conflict.conflictMessage) {
    return conflict.conflictMessage;
  }

  return 'Sync conflict detected';
}

function formatConflictCode(code: string | null) {
  if (!code) {
    return null;
  }

  return code.replace(/_/g, ' ');
}

export default function DesktopOutboxControl() {
  const [snapshot, setSnapshot] = useState<ElectronSyncOutboxSnapshot | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedConflictId, setExpandedConflictId] = useState<string | null>(null);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function refreshOutbox(showLoading = false) {
    if (!window.electronAPI?.sync.getOutbox) {
      return;
    }

    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const nextSnapshot = await window.electronAPI.sync.getOutbox();
      setSnapshot(nextSnapshot);
    } catch (error) {
      console.error('[DesktopSync] Failed to load sync outbox:', error);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  async function handleResolve(
    conflict: ElectronSyncConflictEntry,
    resolution: ElectronSyncConflictResolutionChoice
  ) {
    if (!window.electronAPI?.sync.resolveConflict) {
      return;
    }

    setResolvingConflictId(conflict.id);
    setFeedback(null);

    try {
      const result = await window.electronAPI.sync.resolveConflict(conflict.id, resolution);
      setFeedback(`Conflict resolved. Operation marked ${formatStatus(result.operationStatus)}.`);
      await refreshOutbox();
      emitDesktopOutboxChanged();

      if (expandedConflictId === conflict.id) {
        setExpandedConflictId(null);
      }
    } catch (error: any) {
      setFeedback(error?.message ?? 'Failed to resolve the sync conflict.');
    } finally {
      setResolvingConflictId(null);
    }
  }

  useEffect(() => {
    if (!hasElectronBridge()) {
      return;
    }

    void refreshOutbox(true);
    const intervalId = window.setInterval(() => {
      void refreshOutbox();
    }, 10000);
    const unsubscribe = subscribeDesktopOutboxChanged(() => {
      void refreshOutbox();
    });

    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, []);

  if (!hasElectronBridge()) {
    return null;
  }

  const summary = snapshot?.summary ?? {
    legacyQueueCount: 0,
    syncOperationCount: 0,
    requestQueueCount: 0,
    conflictCount: 0,
    totalCount: 0,
  };
  const conflicts = snapshot?.conflicts ?? [];
  const badgeCount = summary.conflictCount > 0 ? summary.conflictCount : summary.totalCount;
  const buttonTone =
    summary.conflictCount > 0
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : summary.totalCount > 0
        ? 'border-sky-200 bg-sky-50 text-sky-800'
        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          void refreshOutbox(true);
        }}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${buttonTone}`}
      >
        <span>Outbox</span>
        {badgeCount > 0 && (
          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold">
            {badgeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-panel-lg">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Desktop Outbox</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Queued desktop sync work and conflicts that need resolution.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setIsOpen(false);
                  setFeedback(null);
                }}
                aria-label="Close desktop outbox"
              >
                ×
              </button>
            </div>

            <div className="modal-body space-y-6">
              {feedback && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  {feedback}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Legacy Queue
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {summary.legacyQueueCount}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Sync Ops
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {summary.syncOperationCount}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                    Conflicts
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-amber-900">
                    {summary.conflictCount}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Requests
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {summary.requestQueueCount}
                  </p>
                </div>
              </div>

              {isLoading && !snapshot ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                  Loading desktop outbox...
                </div>
              ) : conflicts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
                  <p className="text-sm font-medium text-gray-700">No unresolved sync conflicts.</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Pending outbox work will continue syncing automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conflicts.map((conflict) => {
                    const isExpanded = expandedConflictId === conflict.id;
                    const isResolving = resolvingConflictId === conflict.id;

                    return (
                      <section
                        key={conflict.id}
                        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-gray-900">
                                {formatConflictLabel(conflict)}
                              </h3>
                              {formatConflictCode(conflict.conflictCode) && (
                                <span className="badge bg-amber-100 text-amber-700">
                                  {formatConflictCode(conflict.conflictCode)}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                              <span>Operation: {conflict.operationType ?? 'unknown'}</span>
                              {conflict.aggregateId && <span>Record: {conflict.aggregateId}</span>}
                              <span>Created: {formatTimestamp(conflict.createdAt)}</span>
                            </div>
                            {conflict.operationLastError && (
                              <p className="text-sm text-gray-600">{conflict.operationLastError}</p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                setExpandedConflictId(isExpanded ? null : conflict.id)
                              }
                            >
                              Open both
                            </button>
                            <button
                              type="button"
                              className="btn-secondary border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => void handleResolve(conflict, 'keep_server')}
                              disabled={isResolving}
                            >
                              {isResolving ? 'Resolving...' : 'Keep server'}
                            </button>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => void handleResolve(conflict, 'keep_local')}
                              disabled={isResolving}
                            >
                              {isResolving ? 'Resolving...' : 'Keep local'}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-5 grid gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-gray-800">Local version</h4>
                                <span className="text-xs text-gray-500">What this device tried to sync</span>
                              </div>
                              <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                                {formatPayload(conflict.localPayload)}
                              </pre>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-gray-800">Server version</h4>
                                <span className="text-xs text-gray-500">What the server had when the conflict hit</span>
                              </div>
                              <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                                {formatPayload(conflict.serverPayload)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
