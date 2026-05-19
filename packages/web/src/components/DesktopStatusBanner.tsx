import { useEffect, useState } from 'react';
import {
  emitDesktopOutboxChanged,
  subscribeDesktopOutboxChanged,
} from '../utils/desktopSync';

type DesktopSyncState = 'idle' | 'syncing';

type DesktopSyncResult = {
  errors?: string[];
};

type FailedPermanentPolicy = {
  mode?: 'auto_discard' | 'hold' | 'auto_keep_server';
  retainDays?: number | null;
};

type DesktopSyncStatusPayload = {
  lastResult?: DesktopSyncResult | null;
  outbox?: {
    failedPermanent?: number;
  } | null;
  failedPermanentPolicy?: FailedPermanentPolicy | null;
};

const STATUS_POLL_INTERVAL_MS = 15000;

function hasElectronBridge() {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}

function getInitialOnlineStatus() {
  if (!hasElectronBridge()) {
    return true;
  }

  return window.electronAPI?.network.isOnline() ?? navigator.onLine;
}

function buildPermanentFailureMessage(
  failedPermanentCount: number,
  policy: FailedPermanentPolicy | null | undefined
) {
  if (failedPermanentCount <= 0) {
    return null;
  }

  const changeLabel =
    failedPermanentCount === 1
      ? '1 desktop change'
      : `${failedPermanentCount} desktop changes`;
  const verb = failedPermanentCount === 1 ? 'is' : 'are';

  if (policy?.mode === 'hold') {
    return `${changeLabel} could not be synced and ${verb} being held for manual review.`;
  }

  if (policy?.mode === 'auto_discard') {
    return `${changeLabel} could not be synced and ${verb} being discarded so future syncs can continue.`;
  }

  const retainDays = policy?.retainDays ?? 7;
  const dayLabel = retainDays === 1 ? 'day' : 'days';
  return `${changeLabel} could not be synced and ${verb} being held for review. Server state will be kept automatically after ${retainDays} ${dayLabel}.`;
}

export default function DesktopStatusBanner() {
  const [isElectron] = useState(hasElectronBridge);
  const [isOnline, setIsOnline] = useState(getInitialOnlineStatus);
  const [syncState, setSyncState] = useState<DesktopSyncState>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflictCount, setConflictCount] = useState(0);
  const [permanentFailureNotice, setPermanentFailureNotice] = useState<string | null>(null);

  const refreshSyncStatus = async () => {
    if (!window.electronAPI) {
      return;
    }

    try {
      const status = (await window.electronAPI.sync.getStatus()) as DesktopSyncStatusPayload;
      const latestError = status.lastResult?.errors?.[0] ?? null;
      setSyncError(latestError);
      setPermanentFailureNotice(
        buildPermanentFailureMessage(
          status.outbox?.failedPermanent ?? 0,
          status.failedPermanentPolicy
        )
      );
    } catch (error) {
      console.error('[DesktopSync] Failed to read desktop sync status:', error);
    }
  };

  const refreshOutbox = async () => {
    if (!window.electronAPI?.sync.getOutbox) {
      return;
    }

    try {
      const outbox = await window.electronAPI.sync.getOutbox();
      setConflictCount(outbox.summary.conflictCount);
    } catch (error) {
      console.error('[DesktopSync] Failed to read desktop outbox:', error);
    }
  };

  const triggerSync = async () => {
    if (!window.electronAPI) {
      return;
    }

    setSyncState('syncing');

    try {
      const result = (await window.electronAPI.sync.push()) as DesktopSyncResult;
      setSyncError(result.errors?.[0] ?? null);
    } catch (error) {
      console.error('[DesktopSync] Failed to push local changes:', error);
      setSyncError('Desktop sync failed. The next reconnect will retry automatically.');
    } finally {
      setSyncState('idle');
      emitDesktopOutboxChanged();
      await refreshOutbox();
      await refreshSyncStatus();
    }
  };

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    void refreshOutbox();
    void refreshSyncStatus();

    const intervalId = window.setInterval(() => {
      void refreshOutbox();
      void refreshSyncStatus();
    }, STATUS_POLL_INTERVAL_MS);
    const unsubscribeOutbox = subscribeDesktopOutboxChanged(() => {
      void refreshOutbox();
    });

    const unsubscribe = window.electronAPI.network.onStatusChange((online: boolean) => {
      setIsOnline(online);

      if (online) {
        void triggerSync();
      }
    });

    return () => {
      window.clearInterval(intervalId);
      unsubscribeOutbox();
      unsubscribe?.();
    };
  }, []);

  const shouldRender =
    isElectron &&
    (!isOnline ||
      syncState === 'syncing' ||
      conflictCount > 0 ||
      Boolean(syncError) ||
      Boolean(permanentFailureNotice));

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-3 space-y-2">
      {!isOnline && (
        <s-banner tone="warning">
          Offline mode. Changes will sync when the connection returns.
        </s-banner>
      )}
      {syncState === 'syncing' && (
        <s-banner tone="info">Syncing desktop changes...</s-banner>
      )}
      {syncError && (
        <s-banner tone="critical">
          Desktop sync failed: {syncError}
        </s-banner>
      )}
      {conflictCount > 0 && (
        <s-banner tone="warning">
          {conflictCount === 1
            ? '1 sync conflict needs review in the desktop outbox.'
            : `${conflictCount} sync conflicts need review in the desktop outbox.`}
        </s-banner>
      )}
      {permanentFailureNotice && (
        <s-banner tone="warning">{permanentFailureNotice}</s-banner>
      )}
    </div>
  );
}
