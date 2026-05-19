import { useEffect, useState } from 'react';
import { dashboardApi } from '../api/client';
import { formatQuantity } from '../utils/quantity';

interface StatCard {
  label: string;
  value: string | number;
  color: string;
  icon: string;
}

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

  useEffect(() => {
    dashboardApi.getStats()
      .then((res) => {
        const data = res.data?.data;
        if (data) {
          setStats(data);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const cards: StatCard[] = stats ? [
    { label: 'Total Items', value: formatQuantity(stats.totalItems), color: 'bg-blue-500', icon: '📦' },
    { label: 'Shelf Ready', value: formatQuantity(stats.shelfReadyItems), color: 'bg-green-500', icon: '✅' },
    { label: 'Open GRNs', value: stats.openGRNs, color: 'bg-yellow-500', icon: '📋' },
    { label: 'Damaged Items', value: formatQuantity(stats.damagedItems), color: 'bg-red-500', icon: '⚠️' },
  ] : [];

  // Build inventory by state array from stats
  const statsByState = stats ? 
    Object.entries(stats.inventoryByState)
      .map(([state, data]) => ({
        state,
        count: data.count,
        quantity: data.quantity,
      }))
      .filter(({ quantity }) => quantity > 0)
    : [];

  const totalItems = stats?.totalItems ?? 0;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="page-header">
          <h1 className="page-title">📊 Dashboard</h1>
        </div>
        <div className="content-section px-6 py-8 text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">📊 Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(card => (
          <div key={card.label} className="content-section p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${card.color} bg-opacity-15 flex items-center justify-center text-2xl flex-shrink-0`}>
              {card.icon}
            </div>
            <div>
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Inventory by state */}
      <div className="content-section">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Inventory by State</h2>
        </div>
        <div className="px-6 py-4 flex flex-col gap-3">
          {statsByState.map(({ state, quantity }) => (
            <div key={state} className="flex items-center gap-4">
              <span className="text-sm text-gray-600 w-36 flex-shrink-0">{state}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all"
                  style={{ width: `${totalItems > 0 ? (quantity / totalItems) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 w-16 text-right">{formatQuantity(quantity)}</span>
            </div>
          ))}
          {statsByState.length === 0 && (
            <p className="text-sm text-gray-500">No inventory data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
