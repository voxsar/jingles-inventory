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
			const reportData = res.data?.data ?? res.data ?? [];
			setData(Array.isArray(reportData) ? reportData : []);
		} catch (err) {
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => { loadReport(activeReport); }, [activeReport]);

	const valuationColumns = [
		{ key: 'skuCode', header: 'SKU Code', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.skuCode}</span> },
		{ key: 'name', header: 'Name' },
		{ key: 'vendor', header: 'Vendor', render: (r: any) => r.vendor?.name },
		{ key: 'totalQuantity', header: 'Total Qty', sortable: true },
		{
			key: 'byState', header: 'By State', render: (r: any) => (
				<s-stack gap="small">
					{Object.entries(r.byState ?? {}).map(([state, qty]) => (
						<div key={state}><s-text>{state}:</s-text> {String(qty)}</div>
					))}
				</s-stack>
			)
		},
	];

	const floorColumns = [
		{ key: 'floor', header: 'Floor' },
		{ key: 'locationCount', header: 'Locations' },
		{ key: 'totalQuantity', header: 'Total Items', sortable: true },
		{ key: 'skuCount', header: 'Unique SKUs' },
		{
			key: 'usagePercentage', header: 'Usage %', render: (r: any) => (
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<div style={{ flex: 1, background: '#e1e3e5', borderRadius: '9999px', height: '8px', width: '96px' }}>
						<div style={{ background: '#008060', height: '8px', borderRadius: '9999px', width: `${r.usagePercentage ?? 0}%` }} />
					</div>
					<span style={{ fontSize: '12px' }}>{(r.usagePercentage ?? 0).toFixed(1)}%</span>
				</div>
			)
		},
	];

	const salesColumns = [
		{ key: 'totalSold', header: 'Total Units Sold' },
		{ key: 'totalTransactions', header: 'Total Transactions' },
	];

	const columns = activeReport === 'valuation' ? valuationColumns : activeReport === 'floor' ? floorColumns : salesColumns;
	const tableData = activeReport === 'sales' && !Array.isArray(data) ? [data] : (Array.isArray(data) ? data : []);

	return (
		<>
			<s-heading>Reports & Analytics</s-heading>

			<s-stack direction="inline" gap="base">
				{(['valuation', 'floor', 'sales'] as const).map(type => (
					<s-button
						key={type}
						variant={activeReport === type ? 'primary' : undefined}
						onClick={() => setActiveReport(type)}
					>
						{type === 'valuation' ? '📦 Inventory Valuation' : type === 'floor' ? '🏢 Floor Performance' : '💰 Sales Summary'}
					</s-button>
				))}
			</s-stack>

			<s-section>
				<DataTable columns={columns as any} data={tableData} isLoading={isLoading} emptyMessage="No data available" />
			</s-section>
		</>
	);
}
