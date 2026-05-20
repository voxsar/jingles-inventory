import { useEffect, useState, type FormEvent } from 'react';
import type {
  BackendRuntimeInfo,
  ElectronAppLogEntry,
  ElectronDatabaseInfo,
  ElectronDatabaseSwitchMode,
  ElectronSyncHealth,
  ElectronSyncOutboxSnapshot,
  ElectronSyncResult,
  ElectronSyncStatus,
  RuntimeBuildInfo,
} from '@jingles/shared';
import { authApi } from '../api/client';
import { emitDesktopOutboxChanged } from '../utils/desktopSync';
import { isDesktopRuntime } from '../utils/runtime';

const REFRESH_INTERVAL_MS = 15000;
const LOG_LIMIT = 400;

function createFallbackBuildInfo(
  packageName: string,
  appVersion: string | null | undefined
): RuntimeBuildInfo | null {
  if (!appVersion) {
    return null;
  }

  return {
    packageName,
    appVersion,
    buildNumber: null,
    commitHash: null,
    commitShortHash: null,
    builtAt: null,
  };
}

function hasElectronBridge() {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function summarizeSyncResult(label: string, result: ElectronSyncResult) {
  if (result.errors.length > 0) {
    return `${label} finished with an issue: ${result.errors[0]}`;
  }

  return `${label} finished. Pushed ${result.pushed}, pulled ${result.pulled}, conflicts ${result.conflicts}.`;
}

function needsSyncAuthExchange(result: ElectronSyncResult) {
  return result.errors.some((error) => {
    const normalized = error.toLowerCase();
    return (
      normalized.includes('no cached host sync token') ||
      normalized.includes('not authenticated') ||
      normalized.includes('unauthorized') ||
      normalized.includes('invalid or expired token') ||
      normalized.includes('expired token')
    );
  });
}

function buildVersionLabel(buildInfo: RuntimeBuildInfo | null) {
  if (!buildInfo) {
    return 'Not available';
  }

  const parts = [`v${buildInfo.appVersion}`];
  if (buildInfo.buildNumber) {
    parts.push(`build ${buildInfo.buildNumber}`);
  }
  if (buildInfo.commitShortHash) {
    parts.push(buildInfo.commitShortHash);
  }

  return parts.join(' · ');
}

function getBuildSignature(buildInfo: RuntimeBuildInfo | null) {
  if (!buildInfo) {
    return null;
  }

  if (buildInfo.commitHash) {
    return buildInfo.commitHash;
  }

  if (buildInfo.buildNumber) {
    return `${buildInfo.appVersion}:${buildInfo.buildNumber}`;
  }

  return buildInfo.appVersion;
}

function describeBuildParity(
  desktopBuildInfo: RuntimeBuildInfo | null,
  hostBuildInfo: RuntimeBuildInfo | null
) {
  if (!desktopBuildInfo || !hostBuildInfo) {
    return {
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
      message: 'Build comparison becomes available when both desktop and host metadata can be read.',
    };
  }

  const desktopSignature = getBuildSignature(desktopBuildInfo);
  const hostSignature = getBuildSignature(hostBuildInfo);

  if (desktopSignature && hostSignature && desktopSignature === hostSignature) {
    return {
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      message: `Desktop and host are on the same build (${buildVersionLabel(hostBuildInfo)}).`,
    };
  }

  return {
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    message: `Desktop is ${buildVersionLabel(desktopBuildInfo)} while the host is ${buildVersionLabel(hostBuildInfo)}.`,
  };
}

function toneForLogLevel(level: ElectronAppLogEntry['level']) {
  if (level === 'error') {
    return 'bg-red-100 text-red-700';
  }

  if (level === 'warn') {
    return 'bg-amber-100 text-amber-800';
  }

  if (level === 'debug') {
    return 'bg-slate-200 text-slate-700';
  }

  return 'bg-sky-100 text-sky-800';
}

function toneForLogSource(source: ElectronAppLogEntry['source']) {
  if (source === 'backend') {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (source === 'renderer') {
    return 'bg-violet-100 text-violet-800';
  }

  return 'bg-slate-100 text-slate-800';
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <span className={mono ? 'break-all font-mono text-sm text-slate-900' : 'text-sm text-slate-900'}>
        {value}
      </span>
    </div>
  );
}

function BuildCard({
  title,
  description,
  buildInfo,
}: {
  title: string;
  description: string;
  buildInfo: RuntimeBuildInfo | null;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-4 grid gap-3">
        <DetailRow label="Version" value={buildVersionLabel(buildInfo)} />
        <DetailRow label="Package" value={buildInfo?.packageName ?? 'Not available'} mono />
        <DetailRow label="Commit" value={buildInfo?.commitHash ?? 'Not available'} mono />
        <DetailRow label="Built At" value={formatTimestamp(buildInfo?.builtAt ?? null)} />
      </div>
    </div>
  );
}

export default function DesktopSyncPage() {
  const [databaseInfo, setDatabaseInfo] = useState<ElectronDatabaseInfo | null>(null);
  const [syncStatus, setSyncStatus] = useState<ElectronSyncStatus | null>(null);
  const [syncHealth, setSyncHealth] = useState<ElectronSyncHealth | null>(null);
  const [outboxSnapshot, setOutboxSnapshot] = useState<ElectronSyncOutboxSnapshot | null>(null);
  const [desktopBuildInfo, setDesktopBuildInfo] = useState<RuntimeBuildInfo | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<BackendRuntimeInfo | null>(null);
  const [appLogs, setAppLogs] = useState<ElectronAppLogEntry[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSyncAuthModal, setShowSyncAuthModal] = useState(false);
  const [syncAuthPassword, setSyncAuthPassword] = useState('');
  const [syncAuthError, setSyncAuthError] = useState<string | null>(null);
  const [syncAuthSubmitting, setSyncAuthSubmitting] = useState(false);
  const [pendingSyncAction, setPendingSyncAction] = useState<'runNow' | 'pushOnly' | 'pullOnly' | null>(null);

  const isDesktopShell = isDesktopRuntime();
  const hasBridge = hasElectronBridge();
  const isDesktop = isDesktopShell && hasBridge;

  async function refreshState() {
    if (
      !window.electronAPI?.db.getInfo ||
      !window.electronAPI?.sync.getStatus ||
      !window.electronAPI?.sync.getHealth ||
      !window.electronAPI?.sync.getOutbox
    ) {
      return;
    }

    const [nextDatabaseInfo, nextSyncStatus, nextSyncHealth, nextOutboxSnapshot] =
      await Promise.all([
        window.electronAPI.db.getInfo(),
        window.electronAPI.sync.getStatus(),
        window.electronAPI.sync.getHealth(),
        window.electronAPI.sync.getOutbox(),
      ]);

    const [nextDesktopVersion, nextDesktopBuildInfo, nextRuntimeInfoResponse, nextLogs] =
      await Promise.all([
        window.electronAPI.app.version?.().catch(() => null) ?? Promise.resolve(null),
        window.electronAPI.app.getBuildInfo?.().catch(() => null) ?? Promise.resolve(null),
        window.electronAPI.app.getRuntimeInfo?.().catch(() => null) ?? Promise.resolve(null),
        window.electronAPI.logs?.list?.({ limit: LOG_LIMIT }).catch(() => []) ??
          Promise.resolve([]),
    ]);

    const fallbackDesktopBuildInfo =
      createFallbackBuildInfo('@jingles/electron', nextDesktopVersion) ?? null;
    const resolvedDesktopBuildInfo = nextDesktopBuildInfo ?? fallbackDesktopBuildInfo;
    const fallbackRuntimeInfo: BackendRuntimeInfo | null =
      nextRuntimeInfoResponse ??
      (resolvedDesktopBuildInfo
        ? {
            mode: 'local_replica',
            build:
              createFallbackBuildInfo('@jingles/backend', resolvedDesktopBuildInfo.appVersion) ??
              resolvedDesktopBuildInfo,
            upstream: nextSyncStatus.serverUrl
              ? {
                  url: nextSyncStatus.serverUrl,
                  build: null,
                  error: 'Host build info is unavailable in the current desktop shell.',
                }
              : null,
          }
        : null);

    setDatabaseInfo(nextDatabaseInfo);
    setSyncStatus(nextSyncStatus);
    setSyncHealth(nextSyncHealth);
    setOutboxSnapshot(nextOutboxSnapshot);
    setDesktopBuildInfo(resolvedDesktopBuildInfo);
    setRuntimeInfo(fallbackRuntimeInfo);
    setAppLogs(nextLogs);
  }

  useEffect(() => {
    if (!isDesktop) {
      setLoading(false);
      return;
    }

    void refreshState()
      .catch((error) => {
        console.error('[DesktopSyncPage] Failed to load desktop runtime state:', error);
        setFeedback({
          tone: 'error',
          message: error instanceof Error ? error.message : 'Failed to load desktop runtime state.',
        });
      })
      .finally(() => {
        setLoading(false);
      });

    const intervalId = window.setInterval(() => {
      void refreshState().catch((error) => {
        console.error('[DesktopSyncPage] Failed to refresh desktop runtime state:', error);
      });
    }, REFRESH_INTERVAL_MS);

    const unsubscribeHealth = window.electronAPI?.sync.onHealthChanged?.((health) => {
      setSyncHealth(health);
      void Promise.all([
        window.electronAPI?.sync.getStatus?.(),
        window.electronAPI?.sync.getOutbox?.(),
        window.electronAPI?.db.getInfo?.(),
      ])
        .then(([nextSyncStatus, nextOutboxSnapshot, nextDatabaseInfo]) => {
          if (nextSyncStatus) {
            setSyncStatus(nextSyncStatus);
          }
          if (nextOutboxSnapshot) {
            setOutboxSnapshot(nextOutboxSnapshot);
          }
          if (nextDatabaseInfo) {
            setDatabaseInfo(nextDatabaseInfo);
          }
        })
        .catch((error) => {
          console.error('[DesktopSyncPage] Failed to refresh after sync health update:', error);
        });
    });

    const unsubscribeLogs = window.electronAPI?.logs.onEntry?.((entry) => {
      setAppLogs((currentEntries) => {
        if (currentEntries.some((currentEntry) => currentEntry.id === entry.id)) {
          return currentEntries;
        }

        const nextEntries = [...currentEntries, entry];
        return nextEntries.length > LOG_LIMIT
          ? nextEntries.slice(nextEntries.length - LOG_LIMIT)
          : nextEntries;
      });
    });

    return () => {
      window.clearInterval(intervalId);
      unsubscribeHealth?.();
      unsubscribeLogs?.();
    };
  }, [isDesktop]);

  async function handleSyncAction(action: 'runNow' | 'pushOnly' | 'pullOnly') {
    if (!window.electronAPI?.sync[action]) {
      return;
    }

    setBusyAction(action);
    setFeedback(null);

    try {
      const result = await window.electronAPI.sync[action]();
      emitDesktopOutboxChanged();
      await refreshState();
      if (needsSyncAuthExchange(result)) {
        setPendingSyncAction(action);
        setSyncAuthPassword('');
        setSyncAuthError(null);
        setShowSyncAuthModal(true);
      }
      setFeedback({
        tone: result.errors.length > 0 ? 'error' : 'success',
        message: summarizeSyncResult(
          action === 'runNow'
            ? 'Full sync'
            : action === 'pushOnly'
              ? 'Forward-only sync'
              : 'Backward-only sync',
          result
        ),
      });
    } catch (error) {
      console.error('[DesktopSyncPage] Sync action failed:', error);
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Desktop sync action failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  function closeSyncAuthModal() {
    if (syncAuthSubmitting) {
      return;
    }

    setShowSyncAuthModal(false);
    setSyncAuthPassword('');
    setSyncAuthError(null);
    setPendingSyncAction(null);
  }

  async function handleRefreshSyncToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!window.electronAPI?.app?.setSyncToken) {
      setSyncAuthError('Desktop sync token storage is unavailable in this renderer.');
      return;
    }

    setSyncAuthSubmitting(true);
    setSyncAuthError(null);

    try {
      const response = await authApi.refreshSyncToken(syncAuthPassword);
      const responseData = response.data?.data ?? response.data;
      const syncToken =
        typeof responseData?.syncToken === 'string' ? responseData.syncToken.trim() : '';
      const userId =
        typeof responseData?.userId === 'string' && responseData.userId.trim()
          ? responseData.userId.trim()
          : null;

      if (!syncToken) {
        throw new Error('The local backend did not return a host sync token.');
      }

      await window.electronAPI.app.setSyncToken({ token: syncToken, userId });
      const retryAction = pendingSyncAction;

      setShowSyncAuthModal(false);
      setSyncAuthPassword('');
      setPendingSyncAction(null);
      setFeedback({
        tone: 'info',
        message: 'Host sync credentials refreshed. Retrying sync.',
      });

      if (retryAction) {
        await handleSyncAction(retryAction);
        return;
      }

      await refreshState();
    } catch (error: any) {
      setSyncAuthError(
        error.response?.data?.error ??
          (error instanceof Error ? error.message : 'Failed to refresh the host sync token.')
      );
    } finally {
      setSyncAuthSubmitting(false);
    }
  }

  async function handleBackup() {
    if (!window.electronAPI?.db.backup) {
      return;
    }

    setBusyAction('backup');
    setFeedback(null);

    try {
      const result = await window.electronAPI.db.backup();
      await refreshState();

      if (result.canceled) {
        setFeedback({
          tone: 'info',
          message: 'Backup canceled.',
        });
        return;
      }

      setFeedback({
        tone: 'success',
        message: `Backup created at ${result.backupPath}.`,
      });
    } catch (error) {
      console.error('[DesktopSyncPage] Backup failed:', error);
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Desktop database backup failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSwitchFile(mode: ElectronDatabaseSwitchMode) {
    if (!window.electronAPI?.db.switchFile) {
      return;
    }

    setBusyAction(`switch:${mode}`);
    setFeedback(null);

    try {
      const result = await window.electronAPI.db.switchFile(mode);
      if (result.canceled) {
        setFeedback({
          tone: 'info',
          message: 'Database switch canceled.',
        });
        return;
      }

      setFeedback({
        tone: 'info',
        message: `Desktop app is relaunching with ${result.selectedPath ?? 'the default database file'}.`,
      });
    } catch (error) {
      console.error('[DesktopSyncPage] Database switch failed:', error);
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Database switch failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRevealFile() {
    if (!window.electronAPI?.db.revealFile) {
      return;
    }

    setBusyAction('reveal');
    setFeedback(null);

    try {
      await window.electronAPI.db.revealFile();
    } catch (error) {
      console.error('[DesktopSyncPage] Failed to reveal database file:', error);
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to open the database location.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClearLogs() {
    if (!window.electronAPI?.logs.clear) {
      return;
    }

    try {
      await window.electronAPI.logs.clear();
      setAppLogs([]);
    } catch (error) {
      console.error('[DesktopSyncPage] Failed to clear application logs:', error);
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to clear application logs.',
      });
    }
  }

  if (!isDesktopShell) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Desktop Only
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Sync and local database</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This page is only available inside the Electron desktop shell because it needs direct access
          to the local replica database file, application logs, and desktop sync engine.
        </p>
      </div>
    );
  }

  if (!hasBridge) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
          Desktop Bridge Missing
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Sync and local database</h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          This Electron window is running without the preload bridge, so desktop controls such as
          logs, backup, file switching, and manual sync buttons are unavailable in this renderer.
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Reload the Electron window first. If the page still shows this message after reload, the
          Electron preload path is failing and needs to be fixed in the desktop shell.
        </p>
      </div>
    );
  }

  const outboxSummary = outboxSnapshot?.summary ?? {
    syncOperationCount: 0,
    requestQueueCount: 0,
    conflictCount: 0,
    totalCount: 0,
  };
  const connectionLabel = syncStatus?.websocketConnected ? 'Realtime connected' : 'Realtime offline';
  const feedbackToneClasses =
    feedback?.tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : feedback?.tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-sky-200 bg-sky-50 text-sky-700';
  const buttonBaseClass =
    'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';
  const primaryButtonClass = `${buttonBaseClass} bg-slate-950 text-white hover:bg-slate-800`;
  const secondaryButtonClass = `${buttonBaseClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
  const hostBuildInfo = runtimeInfo?.upstream?.build ?? null;
  const buildParity = describeBuildParity(desktopBuildInfo, hostBuildInfo);
  const visibleLogs = [...appLogs].reverse();

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.18),_transparent_48%),linear-gradient(135deg,_#f8fafc,_#ffffff)] p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
          Desktop Runtime
        </p>
        <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Sync and local database
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This page is intentionally kept out of the main app chrome. Use it from Settings when
              you need desktop replica controls, application logs, or a build comparison against the
              connected host.
            </p>
          </div>
          <div className="inline-flex self-start rounded-full border border-sky-200 bg-white/85 px-4 py-2 text-sm font-semibold text-sky-800 shadow-sm">
            {connectionLabel}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/70 bg-white/85 px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">DB Size</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {databaseInfo ? formatBytes(databaseInfo.sizeBytes) : '...'}
            </p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/85 px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pending</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {syncHealth?.pendingCount ?? 0}
            </p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/85 px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Conflicts</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {syncHealth?.conflictCount ?? 0}
            </p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/85 px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Last Success</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {formatTimestamp(syncHealth?.lastSuccessfulSyncAt ?? null)}
            </p>
          </div>
        </div>
      </section>

      {feedback && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${feedbackToneClasses}`}>
          {feedback.message}
        </div>
      )}

      {syncHealth?.lastSyncError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Last sync error: {syncHealth.lastSyncError}
        </div>
      )}

      {runtimeInfo?.upstream?.error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Host build lookup failed for {runtimeInfo.upstream.url}: {runtimeInfo.upstream.error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          Loading desktop runtime controls...
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Database File
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Replica storage</h2>
              </div>
              <span className={`inline-flex self-start rounded-full px-3 py-1 text-xs font-semibold ${databaseInfo?.usesCustomPath ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {databaseInfo?.usesCustomPath ? 'Custom file' : 'Default file'}
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              <DetailRow label="Current file" value={databaseInfo?.currentPath ?? 'Not available'} mono />
              <DetailRow label="Folder" value={databaseInfo?.directory ?? 'Not available'} mono />
              <DetailRow label="Last modified" value={formatTimestamp(databaseInfo?.lastModifiedAt ?? null)} />
              <DetailRow label="Default file" value={databaseInfo?.defaultPath ?? 'Not available'} mono />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void handleRevealFile()}
                disabled={busyAction !== null}
              >
                Show In Folder
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => void handleBackup()}
                disabled={busyAction !== null}
              >
                {busyAction === 'backup' ? 'Backing Up...' : 'Backup Database'}
              </button>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Switch File
                </p>
                <h3 className="text-lg font-semibold text-slate-950">Move this desktop to another replica</h3>
                <p className="text-sm leading-6 text-slate-600">
                  Switching files relaunches the desktop app. A new file starts as a fresh local replica and
                  can then be hydrated from the host with a backward-only or full sync.
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={() => void handleSwitchFile('new')}
                  disabled={busyAction !== null}
                >
                  {busyAction === 'switch:new' ? 'Preparing...' : 'Switch To New File'}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => void handleSwitchFile('existing')}
                  disabled={busyAction !== null}
                >
                  {busyAction === 'switch:existing' ? 'Preparing...' : 'Switch Existing File'}
                </button>
                {databaseInfo?.usesCustomPath && (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => void handleSwitchFile('default')}
                    disabled={busyAction !== null}
                  >
                    {busyAction === 'switch:default' ? 'Preparing...' : 'Use Default File'}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Sync Controls
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Manual sync direction</h2>

            <div className="mt-5 grid gap-3">
              <DetailRow label="Server" value={syncStatus?.serverUrl ?? 'Not configured'} mono />
              <DetailRow label="Last started" value={formatTimestamp(syncStatus?.lastStartedAt ?? null)} />
              <DetailRow label="Last completed" value={formatTimestamp(syncStatus?.lastCompletedAt ?? null)} />
              <DetailRow label="Last realtime event" value={formatTimestamp(syncStatus?.lastRealtimeEventAt ?? null)} />
            </div>

            {syncHealth?.progress && (
              <div className="mt-5 rounded-3xl border border-sky-200 bg-sky-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-sky-900">{syncHealth.progress.label}</p>
                    {syncHealth.progress.detail && (
                      <p className="mt-1 text-sm text-sky-800">{syncHealth.progress.detail}</p>
                    )}
                  </div>
                  <span className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-sm font-semibold text-sky-900">
                    {syncHealth.progress.percent}%
                  </span>
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => void handleSyncAction('runNow')}
                disabled={busyAction !== null}
              >
                {busyAction === 'runNow' ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void handleSyncAction('pushOnly')}
                disabled={busyAction !== null}
              >
                {busyAction === 'pushOnly' ? 'Pushing...' : 'Manual Forward Only Sync'}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void handleSyncAction('pullOnly')}
                disabled={busyAction !== null}
              >
                {busyAction === 'pullOnly' ? 'Pulling...' : 'Manual Backward Only Sync'}
              </button>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                What each button does
              </p>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                <p><span className="font-semibold text-slate-900">Sync Now:</span> push queued local changes and refresh the replica from the server.</p>
                <p><span className="font-semibold text-slate-900">Manual Forward Only Sync:</span> send local queued changes without pulling a fresh snapshot.</p>
                <p><span className="font-semibold text-slate-900">Manual Backward Only Sync:</span> refresh the local replica from the server without sending queued local changes.</p>
              </div>
            </div>
          </section>
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Outbox Snapshot
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Queued desktop work</h2>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{outboxSummary.totalCount}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sync Ops</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{outboxSummary.syncOperationCount}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Requests</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{outboxSummary.requestQueueCount}</p>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Conflicts</p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">{outboxSummary.conflictCount}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Build Tracking
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Desktop versus host versions</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Each build now carries a package version, git-derived build number, and commit hash so you
              can see whether the desktop and connected cloud host are actually running the same code.
            </p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${buildParity.tone}`}>
            {buildParity.message}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <BuildCard
            title="Desktop Shell"
            description="The installed Electron application."
            buildInfo={desktopBuildInfo}
          />
          <BuildCard
            title="Desktop API"
            description={`The local backend process running in ${runtimeInfo?.mode === 'local_replica' ? 'replica mode' : 'server mode'}.`}
            buildInfo={runtimeInfo?.build ?? null}
          />
          <BuildCard
            title="Connected Host"
            description={runtimeInfo?.upstream?.url ?? 'No upstream host is configured.'}
            buildInfo={hostBuildInfo}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Application Logs
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Desktop log stream</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Recent desktop logs from the Electron main process, renderer console, and bundled backend.
              Newest entries appear first.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {appLogs.length} entries
            </span>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void handleClearLogs()}
            >
              Clear Logs
            </button>
          </div>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-sm text-slate-500">
            No application logs captured yet.
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            <div className="max-h-[32rem] overflow-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Level</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLogs.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneForLogSource(entry.source)}`}>
                          {entry.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneForLogLevel(entry.level)}`}>
                          {entry.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs leading-6 text-slate-700">
                        {entry.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {showSyncAuthModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-panel-md">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Reconnect host sync</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Local access is still active. Enter the host password to refresh the sync token without logging out of the desktop app.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeSyncAuthModal}
                disabled={syncAuthSubmitting}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(event) => void handleRefreshSyncToken(event)}>
              <div className="modal-body space-y-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Host password</span>
                  <input
                    type="password"
                    value={syncAuthPassword}
                    onChange={(event) => setSyncAuthPassword(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    placeholder="Enter the host password"
                    autoFocus
                    required
                    disabled={syncAuthSubmitting}
                  />
                </label>
                {syncAuthError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {syncAuthError}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={closeSyncAuthModal}
                  disabled={syncAuthSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={primaryButtonClass}
                  disabled={syncAuthSubmitting || syncAuthPassword.trim().length === 0}
                >
                  {syncAuthSubmitting ? 'Refreshing...' : 'Refresh Host Sync'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
