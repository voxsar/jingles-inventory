import { useEffect, useState } from 'react';
import { inventoryApi, grnsApi } from '../api/client';
import { InventoryState, GRNStatus } from '@jingles/shared';

interface StatCard {
  label: string;
  value: string | number;
  color: string;
  icon: string;
}

export default function DashboardPage() {
  const [inventorySummary, setInventorySummary] = useState<any[]>([]);
  const [grnSummary, setGrnSummary] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      inventoryApi.list({ pageSize: '1000' }),
      grnsApi.list({ pageSize: '100' }),
    ]).then(([invRes, grnRes]) => {
      const invData = invRes.data?.data?.items ?? invRes.data?.data ?? invRes.data ?? [];
      const grnData = grnRes.data?.data?.items ?? grnRes.data?.data ?? grnRes.data ?? [];
      setInventorySummary(Array.isArray(invData) ? invData : []);
      setGrnSummary(Array.isArray(grnData) ? grnData : []);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const statsByState = Object.values(InventoryState).map(state => ({
    state,
    count: inventorySummary.filter(r => r.state === state).length,
    quantity: inventorySummary.filter(r => r.state === state).reduce((s: number, r: any) => s + r.quantity, 0),
  }));

  const totalItems = inventorySummary.reduce((s: number, r: any) => s + r.quantity, 0);
  const openGRNs = grnSummary.filter(g => [GRNStatus.Draft, GRNStatus.Submitted, GRNStatus.PartiallyInspected].includes(g.status)).length;
  const damagedItems = inventorySummary.filter(r => r.state === InventoryState.Damaged).reduce((s: number, r: any) => s + r.quantity, 0);
  const shelfReadyItems = inventorySummary.filter(r => r.state === InventoryState.ShelfReady).reduce((s: number, r: any) => s + r.quantity, 0);

  const cards: StatCard[] = [
    { label: 'Total Items', value: totalItems.toLocaleString(), color: 'bg-blue-500', icon: '📦' },
    { label: 'Shelf Ready', value: shelfReadyItems.toLocaleString(), color: 'bg-green-500', icon: '✅' },
    { label: 'Open GRNs', value: openGRNs, color: 'bg-yellow-500', icon: '📋' },
    { label: 'Damaged Items', value: damagedItems.toLocaleString(), color: 'bg-red-500', icon: '⚠️' },
  ];

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
          {statsByState.filter(({ quantity }) => quantity > 0).map(({ state, quantity }) => (
            <div key={state} className="flex items-center gap-4">
              <span className="text-sm text-gray-600 w-36 flex-shrink-0">{state}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all"
                  style={{ width: `${totalItems > 0 ? (quantity / totalItems) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 w-16 text-right">{quantity.toLocaleString()}</span>
            </div>
          ))}
          {statsByState.filter(({ quantity }) => quantity > 0).length === 0 && (
            <p className="text-sm text-gray-500">No inventory data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
