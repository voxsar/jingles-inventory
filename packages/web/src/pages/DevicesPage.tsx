import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ElectronDiscoveredDevice } from '@jingles/shared';
import { devicesApi } from '../api/client';

type ManagedDevice = {
  id: string;
  displayName: string;
  reportedName: string;
  nameVersion: number;
  application: 'inventory' | 'pos';
  applicationVersion: string;
  platform?: string | null;
  hostname?: string | null;
  branchId?: string | null;
  terminalId?: string | null;
  lastIp?: string | null;
  lastConnection?: string | null;
  lastSeenAt: string;
  lastSyncAt?: string | null;
  pendingCount: number;
  conflictCount: number;
  online: boolean;
};

type DeviceRow = ManagedDevice & {
  lan?: ElectronDiscoveredDevice;
  lanOnline: boolean;
};

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString();
}

export default function DevicesPage() {
  const [cloudDevices, setCloudDevices] = useState<ManagedDevice[]>([]);
  const [lanDevices, setLanDevices] = useState<ElectronDiscoveredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const loadCloudDevices = useCallback(async () => {
    try {
      const response = await devicesApi.list();
      setCloudDevices(response.data as ManagedDevice[]);
      setError(null);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error ?? 'The cloud device registry is unavailable. LAN devices are still shown.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      loadCloudDevices(),
      window.electronAPI?.devices?.refresh().then(setLanDevices).catch(() => undefined),
    ]);
  }, [loadCloudDevices]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void loadCloudDevices(), 30_000);
    const unsubscribe = window.electronAPI?.devices?.onChanged(setLanDevices);
    return () => {
      window.clearInterval(timer);
      unsubscribe?.();
    };
  }, [loadCloudDevices, refresh]);

  const rows = useMemo<DeviceRow[]>(() => {
    const byId = new Map<string, DeviceRow>();
    for (const device of cloudDevices) {
      byId.set(device.id, { ...device, lanOnline: false });
    }
    for (const device of lanDevices) {
      const existing = byId.get(device.deviceId);
      byId.set(device.deviceId, existing
        ? { ...existing, lan: device, lanOnline: true }
        : {
            id: device.deviceId,
            displayName: device.deviceName,
            reportedName: device.deviceName,
            nameVersion: 0,
            application: device.application,
            applicationVersion: device.applicationVersion,
            hostname: device.hostname,
            terminalId: device.terminalId,
            branchId: device.branchId,
            lastIp: device.address,
            lastConnection: 'lan',
            lastSeenAt: device.lastSeenAt,
            lastSyncAt: null,
            pendingCount: 0,
            conflictCount: 0,
            online: true,
            lan: device,
            lanOnline: true,
          });
    }
    return [...byId.values()].sort((left, right) => {
      const onlineDifference = Number(right.online || right.lanOnline) - Number(left.online || left.lanOnline);
      return onlineDifference || left.displayName.localeCompare(right.displayName);
    });
  }, [cloudDevices, lanDevices]);

  const rename = async (device: DeviceRow) => {
    const nextName = window.prompt('Device name', device.displayName)?.trim();
    if (!nextName || nextName === device.displayName) return;
    setRenamingId(device.id);
    try {
      await devicesApi.rename(device.id, nextName);
      await loadCloudDevices();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error ?? 'Failed to rename the device.');
    } finally {
      setRenamingId(null);
    }
  };

  const onlineCount = rows.filter((device) => device.online || device.lanOnline).length;

  return (
    <div className="devices-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Devices</h1>
          <p className="page-subtitle">Running POS and Inventory applications discovered through LAN and cloud.</p>
        </div>
        <button className="btn-primary" type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Discovering…' : 'Refresh devices'}
        </button>
      </div>

      <div className="device-summary-grid">
        <div className="card"><strong>{rows.length}</strong><span>Registered devices</span></div>
        <div className="card"><strong>{onlineCount}</strong><span>Online now</span></div>
        <div className="card"><strong>{lanDevices.length}</strong><span>On this LAN</span></div>
        <div className="card"><strong>{rows.reduce((sum, row) => sum + row.conflictCount, 0)}</strong><span>Sync conflicts</span></div>
      </div>

      {error && <div className="inline-alert warning">{error}</div>}

      <div className="card device-table-wrap">
        <table className="device-table">
          <thead>
            <tr>
              <th>Device</th><th>Application</th><th>Connection</th><th>Sync</th><th>Last seen</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((device) => {
              const online = device.online || device.lanOnline;
              return (
                <tr key={device.id}>
                  <td>
                    <div className="device-name"><span className={`device-dot ${online ? 'online' : ''}`} />{device.displayName}</div>
                    <div className="device-muted">{device.hostname ?? device.id}</div>
                  </td>
                  <td><strong>{device.application === 'pos' ? 'Jingles POS' : 'Jingles Inventory'}</strong><div className="device-muted">v{device.applicationVersion}</div></td>
                  <td>
                    <div>{device.lanOnline ? 'LAN + mDNS' : device.lastConnection === 'cloud' ? 'Cloud' : 'Offline'}</div>
                    <div className="device-muted">{device.lan?.address ?? device.lastIp ?? 'No address'}</div>
                  </td>
                  <td>
                    <div>{device.pendingCount} pending · {device.conflictCount} conflicts</div>
                    <div className="device-muted">Last sync: {formatDate(device.lastSyncAt)}</div>
                  </td>
                  <td>{formatDate(device.lan?.lastSeenAt ?? device.lastSeenAt)}</td>
                  <td><button className="btn-secondary" type="button" disabled={renamingId === device.id || !cloudDevices.some((item) => item.id === device.id)} onClick={() => void rename(device)}>Rename</button></td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="device-empty">No applications have been discovered yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
