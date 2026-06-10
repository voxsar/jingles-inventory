import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../api/client';
import { formatQuantity } from '../utils/quantity';
import {
  BoxIcon,
  CheckCircleIcon,
  ReceiptIcon,
  RefreshIcon,
  SparklesIcon,
  WarningIcon,
} from '../components/AppIcons';

type StatTone = 'accent' | 'success' | 'warning' | 'danger';

interface DashboardStats {
  totalItems: number;
  shelfReadyItems: number;
  damagedItems: number;
  openGRNs: number;
  inventoryByState: {
    [state: string]: {
      count: number;
      quantity: number;
    };
  };
  lastUpdated: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  const loadStats = () =>
    dashboardApi.getStats().then((res) => {
      const data = res.data?.data;
      if (data) {
        setStats(data);
      }
    });

  useEffect(() => {
    loadStats().finally(() => setIsLoading(false));
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await dashboardApi.refreshStats();
      await loadStats();
    } catch {
      // keep showing the last known stats
    } finally {
      setIsRefreshing(false);
    }
  };

  const cards = useMemo(
    () =>
      stats
        ? [
            {
              label: 'Total Items',
              value: formatQuantity(stats.totalItems),
              delta: `${Object.keys(stats.inventoryByState).length} tracked states`,
              icon: BoxIcon,
              tone: 'accent' as StatTone,
            },
            {
              label: 'Shelf Ready',
              value: formatQuantity(stats.shelfReadyItems),
              delta: `${stats.totalItems > 0 ? Math.round((stats.shelfReadyItems / stats.totalItems) * 100) : 0}% of stock`,
              icon: CheckCircleIcon,
              tone: 'success' as StatTone,
            },
            {
              label: 'Open GRNs',
              value: stats.openGRNs,
              delta: stats.openGRNs > 0 ? 'Needs review' : 'All clear',
              icon: ReceiptIcon,
              tone: 'warning' as StatTone,
            },
            {
              label: 'Damaged',
              value: formatQuantity(stats.damagedItems),
              delta: stats.totalItems > 0 ? `${Math.round((stats.damagedItems / stats.totalItems) * 100)}% of stock` : 'No loss reported',
              icon: WarningIcon,
              tone: 'danger' as StatTone,
            },
          ]
        : [],
    [stats]
  );

  const statsByState = useMemo(
    () =>
      stats
        ? Object.entries(stats.inventoryByState)
            .map(([state, data]) => ({
              state,
              count: data.count,
              quantity: data.quantity,
            }))
            .filter(({ quantity }) => quantity > 0)
            .sort((left, right) => right.quantity - left.quantity)
        : [],
    [stats]
  );

  const totalItems = stats?.totalItems ?? 0;
  const shelfReadyRate =
    totalItems > 0 && stats ? Math.round((stats.shelfReadyItems / totalItems) * 100) : 0;
  const lastUpdatedLabel = stats?.lastUpdated
    ? new Date(stats.lastUpdated).toLocaleString()
    : 'Unavailable';
  const insightMessage = stats
    ? stats.openGRNs > 0
      ? `${stats.openGRNs} open GRNs are still blocking stock from fully landing. Clearing them will improve availability across the warehouse.`
      : shelfReadyRate >= 90
        ? `Most stock is already shelf ready. The main watch area now is preserving sync quality and reducing damaged inventory drift.`
        : `Shelf-ready stock is at ${shelfReadyRate}%. A quick review of uninspected items would improve fulfillment readiness.`
    : '';

  if (isLoading) {
    return (
      <div className="dashboard-shell">
        <div className="page-header">
          <div className="page-header-left">
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Warehouse health, activity, and stock readiness.</p>
          </div>
        </div>
        <div className="content-section px-6 py-8 text-sm text-gray-500">Loading dashboard metrics...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Live inventory posture across warehouse operations.</p>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="btn-secondary" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshIcon size={14} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/reports')}>
            View Reports
          </button>
          <button type="button" className="btn-primary" onClick={() => navigate('/inventory')}>
            Open Inventory
          </button>
        </div>
      </div>

      <section className="dashboard-insight-card">
        <div className="dashboard-insight-icon">
          <SparklesIcon size={18} />
        </div>
        <div className="dashboard-insight-content">
          <div className="dashboard-insight-meta">
            <span className="chip chip-accent">AI Insight</span>
            <span className="dashboard-insight-updated">Updated from live dashboard stats</span>
          </div>
          <p className="dashboard-insight-copy">{insightMessage}</p>
          <div className="dashboard-insight-actions">
            <button type="button" className="btn-primary btn-sm" onClick={() => navigate('/grns')}>
              Review GRNs
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/inventory')}>
              Open inventory
            </button>
          </div>
        </div>
      </section>

      <div className="dashboard-stat-grid">
        {cards.map(card => (
          <div
            key={card.label}
            className={`dashboard-stat-card dashboard-stat-card--${card.tone}`}
          >
            <div className="dashboard-stat-icon">
              <card.icon size={18} />
            </div>
            <div className="dashboard-stat-label">{card.label}</div>
            <div className="dashboard-stat-value">{card.value}</div>
            <div className="dashboard-stat-delta">{card.delta}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="content-section dashboard-panel dashboard-panel--wide">
          <div className="content-section-header">
            <div>
              <h2 className="section-title mb-0">Inventory by State</h2>
              <p className="dashboard-panel-subtitle">Current distribution across tracked stock states.</p>
            </div>
          </div>
          <div className="dashboard-state-list">
            {statsByState.map(({ state, quantity }) => (
              <div key={state} className="dashboard-state-row">
                <div className="dashboard-state-head">
                  <span>{state}</span>
                  <span>{formatQuantity(quantity)}</span>
                </div>
                <div className="dashboard-state-bar">
                  <span style={{ width: `${totalItems > 0 ? (quantity / totalItems) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {statsByState.length === 0 && (
              <p className="text-sm text-gray-500">No inventory data yet.</p>
            )}
          </div>
        </section>

        <section className="content-section dashboard-panel">
          <div className="content-section-header">
            <div>
              <h2 className="section-title mb-0">System Snapshot</h2>
              <p className="dashboard-panel-subtitle">Operational summary from the current dashboard payload.</p>
            </div>
          </div>
          <div className="dashboard-summary-list">
            <div className="dashboard-summary-item">
              <span className="dashboard-summary-label">Last updated</span>
              <strong>{lastUpdatedLabel}</strong>
            </div>
            <div className="dashboard-summary-item">
              <span className="dashboard-summary-label">Shelf-ready rate</span>
              <strong>{shelfReadyRate}%</strong>
            </div>
            <div className="dashboard-summary-item">
              <span className="dashboard-summary-label">States with stock</span>
              <strong>{statsByState.length}</strong>
            </div>
            <div className="dashboard-summary-item">
              <span className="dashboard-summary-label">Damaged units</span>
              <strong>{formatQuantity(stats?.damagedItems ?? 0)}</strong>
            </div>
            <div className="dashboard-summary-item">
              <span className="dashboard-summary-label">Open GRNs</span>
              <strong>{stats?.openGRNs ?? 0}</strong>
            </div>
            <div className="dashboard-summary-item">
              <span className="dashboard-summary-label">Tracked inventory count</span>
              <strong>{formatQuantity(totalItems)}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
