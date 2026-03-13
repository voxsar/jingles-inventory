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
    return <><s-section><s-text>Loading...</s-text></s-section></>;
  }

  return (
    <>
      <s-section heading="Dashboard">
        <s-stack direction="inline" gap="base">
          {cards.map(card => (
            <s-section key={card.label}>
              <s-stack direction="inline" gap="base">
                <div style={{ fontSize: '2rem' }}>{card.icon}</div>
                <s-stack gap="small-300">
                  <s-text>{card.label}</s-text>
                  <s-heading>{String(card.value)}</s-heading>
                </s-stack>
              </s-stack>
            </s-section>
          ))}
        </s-stack>
      </s-section>
      <s-section heading="Inventory by State">
        <s-stack gap="base">
          {statsByState.filter(({ quantity }) => quantity > 0).map(({ state, quantity }) => (
            <s-stack key={state} direction="inline" gap="base">
              <s-text>{state}</s-text>
              <div style={{ flex: 1, background: '#e1e3e5', borderRadius: '9999px', height: '12px' }}>
                <div style={{ background: '#008060', height: '12px', borderRadius: '9999px', width: `${totalItems > 0 ? (quantity / totalItems) * 100 : 0}%` }} />
              </div>
              <s-text>{quantity.toLocaleString()}</s-text>
            </s-stack>
          ))}
        </s-stack>
      </s-section>
    </>
  );
}
