import { useEffect, useState } from 'react';
import type {
  ElectronFailedPermanentPolicy,
  ElectronSyncHealth,
  ElectronSyncResult,
} from '@jingles/shared';

const STALE_SYNC_WARNING_MS = 3 * 24 * 60 * 60 * 1000;
const STALE_SYNC_CLOCK_INTERVAL_MS = 60 * 1000;

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
  policy: ElectronFailedPermanentPolicy | null | undefined
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

function buildPendingMessage(pendingCount: number, running: boolean) {
  if (running || pendingCount <= 0) {
    return null;
  }

  return pendingCount === 1
    ? '1 desktop change is waiting to sync.'
    : `${pendingCount} desktop changes are waiting to sync.`;
}

function buildCursorLagMessage(cursorLag: number, running: boolean) {
  if (running || cursorLag <= 0) {
    return null;
  }

  return cursorLag === 1
    ? 'Desktop replica is 1 server change behind the host.'
    : `Desktop replica is ${cursorLag} server changes behind the host.`;
}

function buildStaleSyncMessage(
  lastSuccessfulSyncAt: string | null,
  nowMs: number,
  running: boolean
) {
  if (running || !lastSuccessfulSyncAt) {
    return null;
  }

  const parsed = new Date(lastSuccessfulSyncAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (nowMs - parsed.getTime() < STALE_SYNC_WARNING_MS) {
    return null;
  }

  return `Desktop sync has not completed successfully since ${parsed.toLocaleString()}.`;
}

export default function DesktopStatusBanner() {
  const [isElectron] = useState(hasElectronBridge);
  const [isOnline, setIsOnline] = useState(getInitialOnlineStatus);
  const [syncHealth, setSyncHealth] = useState<ElectronSyncHealth | null>(null);
  const [fallbackSyncError, setFallbackSyncError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const applySyncHealth = (health: ElectronSyncHealth) => {
    setSyncHealth(health);
    setFallbackSyncError(null);
  };

  const triggerSync = async () => {
    if (!window.electronAPI?.sync.push) {
      return;
    }

    try {
      const result = (await window.electronAPI.sync.push()) as ElectronSyncResult;
      setFallbackSyncError(result.errors[0] ?? null);
    } catch (error) {
      console.error('[DesktopSync] Failed to push local changes:', error);
      setFallbackSyncError('Desktop sync failed. The next reconnect will retry automatically.');
    }
  };

  useEffect(() => {
    if (!window.electronAPI?.sync.getHealth || !window.electronAPI.sync.onHealthChanged) {
      return;
    }

    void window.electronAPI.sync
      .getHealth()
      .then((health) => {
        applySyncHealth(health);
      })
      .catch((error) => {
        console.error('[DesktopSync] Failed to read desktop sync health:', error);
      });

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, STALE_SYNC_CLOCK_INTERVAL_MS);
    const unsubscribeHealth = window.electronAPI.sync.onHealthChanged((health) => {
      applySyncHealth(health);
    });

    const unsubscribe = window.electronAPI.network.onStatusChange((online: boolean) => {
      setIsOnline(online);

      if (online) {
        void triggerSync();
      }
    });

    return () => {
      window.clearInterval(intervalId);
      unsubscribeHealth?.();
      unsubscribe?.();
    };
  }, []);

  const running = syncHealth?.running ?? false;
  const conflictCount = syncHealth?.conflictCount ?? 0;
  const syncError = syncHealth?.lastSyncError ?? fallbackSyncError;
  const pendingNotice = buildPendingMessage(syncHealth?.pendingCount ?? 0, running);
  const cursorLagNotice = buildCursorLagMessage(syncHealth?.cursorLag ?? 0, running);
  const staleSyncNotice = buildStaleSyncMessage(
    syncHealth?.lastSuccessfulSyncAt ?? null,
    nowMs,
    running
  );
  const permanentFailureNotice = buildPermanentFailureMessage(
    syncHealth?.failedPermanentCount ?? 0,
    syncHealth?.failedPermanentPolicy
  );

  const shouldRender =
    isElectron &&
    (!isOnline ||
      running ||
      conflictCount > 0 ||
      Boolean(syncError) ||
      Boolean(pendingNotice) ||
      Boolean(cursorLagNotice) ||
      Boolean(staleSyncNotice) ||
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
      {running && (
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
      {pendingNotice && <s-banner tone="info">{pendingNotice}</s-banner>}
      {cursorLagNotice && <s-banner tone="warning">{cursorLagNotice}</s-banner>}
      {staleSyncNotice && <s-banner tone="warning">{staleSyncNotice}</s-banner>}
      {permanentFailureNotice && (
        <s-banner tone="warning">{permanentFailureNotice}</s-banner>
      )}
    </div>
  );
}
