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
      setInventorySummary(invRes.data.data.items);
      setGrnSummary(grnRes.data.data.items);
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
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className="card flex items-center gap-4">
            <div className={`${card.color} text-white text-2xl p-3 rounded-lg`}>{card.icon}</div>
            <div>
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Inventory by State</h2>
        <div className="space-y-2">
          {statsByState.map(({ state, quantity }) => (
            quantity > 0 && (
              <div key={state} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-600">{state}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-primary-500 h-3 rounded-full"
                    style={{ width: `${totalItems > 0 ? (quantity / totalItems) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-16 text-sm font-medium text-gray-900 text-right">{quantity.toLocaleString()}</span>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
