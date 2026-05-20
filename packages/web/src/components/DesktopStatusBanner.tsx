import { useEffect, useState } from 'react';
import type {
  ElectronFailedPermanentPolicy,
  ElectronSyncHealth,
  ElectronSyncProgress,
  ElectronSyncProgressPhase,
  ElectronSyncResult,
} from '@jingles/shared';
import { UiBanner } from './UiPrimitives';

const STALE_SYNC_WARNING_MS = 3 * 24 * 60 * 60 * 1000;
const STALE_SYNC_CLOCK_INTERVAL_MS = 60 * 1000;
const PROGRESS_STEPS: Array<{ phase: ElectronSyncProgressPhase; label: string }> = [
  { phase: 'preparing', label: 'Prepare' },
  { phase: 'pushing', label: 'Push' },
  { phase: 'pulling', label: 'Pull' },
  { phase: 'finalizing', label: 'Finish' },
];
const PROGRESS_STEP_ORDER = PROGRESS_STEPS.reduce<Record<ElectronSyncProgressPhase, number>>(
  (accumulator, step, index) => {
    accumulator[step.phase] = index;
    return accumulator;
  },
  {
    preparing: 0,
    pushing: 1,
    pulling: 2,
    finalizing: 3,
  }
);

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

function formatMetricCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getProgressStepState(
  currentPhase: ElectronSyncProgressPhase,
  targetPhase: ElectronSyncProgressPhase
) {
  const currentIndex = PROGRESS_STEP_ORDER[currentPhase];
  const targetIndex = PROGRESS_STEP_ORDER[targetPhase];

  if (targetIndex < currentIndex) {
    return 'complete';
  }

  if (targetIndex === currentIndex) {
    return 'active';
  }

  return 'upcoming';
}

function renderSyncProgress(progress: ElectronSyncProgress) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Desktop Sync
          </p>
          <h2 className="mt-1 text-base font-semibold text-gray-900">{progress.label}</h2>
          {progress.detail && (
            <p className="mt-1 text-sm text-gray-600">{progress.detail}</p>
          )}
        </div>
        <div className="inline-flex self-start rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-sm font-semibold text-sky-800 shadow-sm">
          {progress.percent}%
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-sky-100">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-300"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/70 bg-white/85 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            Pending
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatMetricCount(progress.pending, 'change')}
          </p>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/85 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            Pushed
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatMetricCount(progress.pushed, 'change')}
          </p>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/85 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            Pulled
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatMetricCount(progress.pulled, 'row')}
          </p>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/85 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            Conflicts
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatMetricCount(progress.conflicts, 'issue', 'issues')}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PROGRESS_STEPS.map((step) => {
          const state = getProgressStepState(progress.phase, step.phase);
          const toneClasses =
            state === 'complete'
              ? 'border-sky-600 bg-sky-600 text-white'
              : state === 'active'
                ? 'border-sky-300 bg-sky-100 text-sky-900'
                : 'border-gray-200 bg-white text-gray-500';

          return (
            <span
              key={step.phase}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${toneClasses}`}
            >
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
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
  const progress = syncHealth?.progress ?? null;
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
      {progress && renderSyncProgress(progress)}
      {!isOnline && (
        <UiBanner tone="warning">
          Offline mode. Changes will sync when the connection returns.
        </UiBanner>
      )}
      {running && !progress && (
        <UiBanner tone="info">Syncing desktop changes...</UiBanner>
      )}
      {syncError && (
        <UiBanner tone="critical">
          Desktop sync failed: {syncError}
        </UiBanner>
      )}
      {conflictCount > 0 && (
        <UiBanner tone="warning">
          {conflictCount === 1
            ? '1 sync conflict needs review in the desktop outbox.'
            : `${conflictCount} sync conflicts need review in the desktop outbox.`}
        </UiBanner>
      )}
      {pendingNotice && <UiBanner tone="info">{pendingNotice}</UiBanner>}
      {cursorLagNotice && <UiBanner tone="warning">{cursorLagNotice}</UiBanner>}
      {staleSyncNotice && <UiBanner tone="warning">{staleSyncNotice}</UiBanner>}
      {permanentFailureNotice && (
        <UiBanner tone="warning">{permanentFailureNotice}</UiBanner>
      )}
    </div>
  );
}
