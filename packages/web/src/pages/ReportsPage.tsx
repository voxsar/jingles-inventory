import { useEffect, useState } from 'react';
import { reportsApi } from '../api/client';
import DataTable from '../components/DataTable';

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<'valuation' | 'floor' | 'sales'>('valuation');
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadReport = async (type: typeof activeReport) => {
    setIsLoading(true);
    setData([]);
    try {
      let res;
      if (type === 'valuation') res = await reportsApi.inventoryValuation();
      else if (type === 'floor') res = await reportsApi.floorPerformance();
      else res = await reportsApi.salesSummary();
      setData(res.data.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadReport(activeReport); }, [activeReport]);

  const valuationColumns = [
    { key: 'skuCode', header: 'SKU Code', render: (r: any) => <span className="font-mono text-xs">{r.skuCode}</span> },
    { key: 'name', header: 'Name' },
    { key: 'vendor', header: 'Vendor', render: (r: any) => r.vendor?.name },
    { key: 'totalQuantity', header: 'Total Qty', sortable: true },
    { key: 'byState', header: 'By State', render: (r: any) => (
      <div className="text-xs space-y-0.5">
        {Object.entries(r.byState ?? {}).map(([state, qty]) => (
          <div key={state}><span className="text-gray-500">{state}:</span> {String(qty)}</div>
        ))}
      </div>
    )},
  ];

  const floorColumns = [
    { key: 'floor', header: 'Floor' },
    { key: 'locationCount', header: 'Locations' },
    { key: 'totalQuantity', header: 'Total Items', sortable: true },
    { key: 'skuCount', header: 'Unique SKUs' },
    { key: 'usagePercentage', header: 'Usage %', render: (r: any) => (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2 w-24">
          <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${r.usagePercentage ?? 0}%` }} />
        </div>
        <span className="text-xs">{(r.usagePercentage ?? 0).toFixed(1)}%</span>
      </div>
    )},
  ];

  const salesColumns = [
    { key: 'totalSold', header: 'Total Units Sold' },
    { key: 'totalTransactions', header: 'Total Transactions' },
  ];

  const columns = activeReport === 'valuation' ? valuationColumns : activeReport === 'floor' ? floorColumns : salesColumns;
  const tableData = activeReport === 'sales' && !Array.isArray(data) ? [data] : (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>

      <div className="flex gap-2">
        {(['valuation', 'floor', 'sales'] as const).map(type => (
          <button
            key={type}
            onClick={() => setActiveReport(type)}
            className={activeReport === type ? 'btn-primary' : 'btn-secondary'}
          >
            {type === 'valuation' ? '📦 Inventory Valuation' : type === 'floor' ? '🏢 Floor Performance' : '💰 Sales Summary'}
          </button>
        ))}
      </div>

      <div className="card">
        <DataTable columns={columns as any} data={tableData} isLoading={isLoading} emptyMessage="No data available" />
      </div>
    </div>
  );
}
