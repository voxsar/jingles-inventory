import { useEffect, useState } from 'react';
import { reportsApi } from '../api/client';
import DataTable from '../components/DataTable';

type ReportType = 'valuation' | 'floor' | 'sales' | 'grn' | 'prn' | 'stockAdjustment' | 'stockBalance' | 'stockMovement' | 'tog';

export default function ReportsPage() {
	const [activeReport, setActiveReport] = useState<ReportType>('grn');
	const [data, setData] = useState<any[]>([]);
	const [summary, setSummary] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(false);

	const loadReport = async (type: ReportType) => {
		setIsLoading(true);
		setData([]);
		setSummary(null);
		try {
			let res;
			if (type === 'valuation') res = await reportsApi.inventoryValuation();
			else if (type === 'floor') res = await reportsApi.floorPerformance();
			else if (type === 'sales') res = await reportsApi.salesSummary();
			else if (type === 'grn') res = await reportsApi.grn();
			else if (type === 'prn') res = await reportsApi.prn();
			else if (type === 'stockAdjustment') res = await reportsApi.stockAdjustment();
			else if (type === 'stockBalance') res = await reportsApi.stockBalance();
			else if (type === 'stockMovement') res = await reportsApi.stockMovement();
			else res = await reportsApi.tog();

			const reportData = res.data?.data ?? res.data ?? {};

			// Handle paginated reports
			if (reportData.items) {
				setData(Array.isArray(reportData.items) ? reportData.items : []);
				setSummary(reportData.summary);
			} else {
				setData(Array.isArray(reportData) ? reportData : [reportData]);
			}
		} catch (err) {
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => { loadReport(activeReport); }, [activeReport]);

	// Column definitions for each report
	const grnColumns = [
		{ key: 'invoiceReference', header: 'Invoice Ref', render: (r: any) => <span style={{ fontFamily: 'monospace' }}>{r.invoiceReference || 'N/A'}</span> },
		{ key: 'supplier', header: 'Supplier', render: (r: any) => r.supplier?.name },
		{ key: 'status', header: 'Status', render: (r: any) => <s-badge>{r.status}</s-badge> },
		{ key: 'deliveryDate', header: 'Delivery Date', render: (r: any) => r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString() : 'N/A' },
		{ key: 'lines', header: 'Line Items', render: (r: any) => r.lines?.length || 0 },
		{ key: 'createdAt', header: 'Created', render: (r: any) => new Date(r.createdAt).toLocaleDateString() },
	];

	const prnColumns = [
		{ key: 'returnReason', header: 'Return Reason', render: (r: any) => r.returnReason || 'N/A' },
		{ key: 'supplier', header: 'Supplier', render: (r: any) => r.supplier?.name },
		{ key: 'status', header: 'Status', render: (r: any) => <s-badge>{r.status}</s-badge> },
		{ key: 'expectedPickupDate', header: 'Pickup Date', render: (r: any) => r.expectedPickupDate ? new Date(r.expectedPickupDate).toLocaleDateString() : 'N/A' },
		{ key: 'lines', header: 'Line Items', render: (r: any) => r.lines?.length || 0 },
		{ key: 'createdAt', header: 'Created', render: (r: any) => new Date(r.createdAt).toLocaleDateString() },
	];

	const stockAdjustmentColumns = [
		{ key: 'eventType', header: 'Event Type', render: (r: any) => <s-badge>{r.eventType}</s-badge> },
		{ key: 'quantityDelta', header: 'Qty Change', render: (r: any) => {
			const delta = r.quantityDelta || 0;
			return <span style={{ color: delta > 0 ? 'green' : delta < 0 ? 'red' : 'inherit' }}>{delta > 0 ? '+' : ''}{delta}</span>;
		}},
		{ key: 'beforeQuantity', header: 'Before', render: (r: any) => r.beforeQuantity ?? 'N/A' },
		{ key: 'afterQuantity', header: 'After', render: (r: any) => r.afterQuantity ?? 'N/A' },
		{ key: 'reasonCode', header: 'Reason', render: (r: any) => r.reasonCode || 'N/A' },
		{ key: 'user', header: 'User', render: (r: any) => r.user?.email || 'System' },
		{ key: 'timestamp', header: 'Date', render: (r: any) => new Date(r.timestamp).toLocaleString() },
	];

	const stockBalanceColumns = [
		{ key: 'skuCode', header: 'SKU Code', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.sku?.skuCode}</span> },
		{ key: 'name', header: 'Product Name', render: (r: any) => r.sku?.name },
		{ key: 'quantity', header: 'Quantity', sortable: true },
		{ key: 'state', header: 'State', render: (r: any) => <s-badge>{r.state}</s-badge> },
		{ key: 'location', header: 'Location', render: (r: any) => {
			const branch = r.floor?.branch?.name || 'N/A';
			const floor = r.floor?.name || 'N/A';
			return `${branch} - ${floor}`;
		}},
		{ key: 'batch', header: 'Batch', render: (r: any) => r.batch?.batchNumber || 'N/A' },
	];

	const stockMovementColumns = [
		{ key: 'eventType', header: 'Event Type', render: (r: any) => <s-badge>{r.eventType}</s-badge> },
		{ key: 'quantityDelta', header: 'Qty Change', render: (r: any) => {
			const delta = r.quantityDelta || 0;
			return <span style={{ color: delta > 0 ? 'green' : delta < 0 ? 'red' : 'inherit' }}>{delta > 0 ? '+' : ''}{delta}</span>;
		}},
		{ key: 'metadata', header: 'Details', render: (r: any) => {
			if (r.metadata && typeof r.metadata === 'object') {
				return JSON.stringify(r.metadata, null, 2).substring(0, 50) + '...';
			}
			return 'N/A';
		}},
		{ key: 'user', header: 'User', render: (r: any) => r.user?.email || 'System' },
		{ key: 'timestamp', header: 'Date', render: (r: any) => new Date(r.timestamp).toLocaleString() },
	];

	const togColumns = [
		{ key: 'referenceNumber', header: 'Reference', render: (r: any) => <span style={{ fontFamily: 'monospace' }}>{r.referenceNumber}</span> },
		{ key: 'fromBranch', header: 'From', render: (r: any) => `${r.fromBranch?.name || 'N/A'} - ${r.fromFloor?.name || 'N/A'}` },
		{ key: 'toBranch', header: 'To', render: (r: any) => `${r.toBranch?.name || 'N/A'} - ${r.toFloor?.name || 'N/A'}` },
		{ key: 'status', header: 'Status', render: (r: any) => <s-badge>{r.status}</s-badge> },
		{ key: 'lines', header: 'Line Items', render: (r: any) => r.lines?.length || 0 },
		{ key: 'requestedAt', header: 'Requested', render: (r: any) => new Date(r.requestedAt).toLocaleDateString() },
		{ key: 'approvedAt', header: 'Approved', render: (r: any) => r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : 'N/A' },
	];

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

	// Select appropriate columns based on active report
	let columns;
	if (activeReport === 'grn') columns = grnColumns;
	else if (activeReport === 'prn') columns = prnColumns;
	else if (activeReport === 'stockAdjustment') columns = stockAdjustmentColumns;
	else if (activeReport === 'stockBalance') columns = stockBalanceColumns;
	else if (activeReport === 'stockMovement') columns = stockMovementColumns;
	else if (activeReport === 'tog') columns = togColumns;
	else if (activeReport === 'valuation') columns = valuationColumns;
	else if (activeReport === 'floor') columns = floorColumns;
	else columns = salesColumns;

	const tableData = activeReport === 'sales' && !Array.isArray(data) ? [data] : (Array.isArray(data) ? data : []);

	// Report button config
	const reportButtons: { type: ReportType; label: string; emoji: string }[] = [
		{ type: 'grn', label: 'GRN Report', emoji: '📥' },
		{ type: 'prn', label: 'PRN Report', emoji: '📤' },
		{ type: 'stockAdjustment', label: 'Stock Adjustment', emoji: '⚖️' },
		{ type: 'stockBalance', label: 'Stock Balance', emoji: '📊' },
		{ type: 'stockMovement', label: 'Stock Movement', emoji: '🔄' },
		{ type: 'tog', label: 'Transfer (TOG)', emoji: '🚚' },
		{ type: 'valuation', label: 'Inventory Valuation', emoji: '📦' },
		{ type: 'floor', label: 'Floor Performance', emoji: '🏢' },
		{ type: 'sales', label: 'Sales Summary', emoji: '💰' },
	];

	return (
		<>
			<s-heading>Reports & Analytics</s-heading>

			<s-stack direction="inline" gap="base" style={{ flexWrap: 'wrap' }}>
				{reportButtons.map(({ type, label, emoji }) => (
					<s-button
						key={type}
						variant={activeReport === type ? 'primary' : undefined}
						onClick={() => setActiveReport(type)}
					>
						{emoji} {label}
					</s-button>
				))}
			</s-stack>

			{summary && (
				<s-section>
					<s-heading level={2}>Summary</s-heading>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
						{Object.entries(summary).map(([key, value]) => (
							<div key={key} style={{ padding: '12px', background: '#f6f6f7', borderRadius: '8px' }}>
								<div style={{ fontSize: '12px', color: '#6d7175', textTransform: 'capitalize' }}>
									{key.replace(/([A-Z])/g, ' $1').trim()}
								</div>
								<div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>
									{typeof value === 'number' ? value.toLocaleString() : JSON.stringify(value)}
								</div>
							</div>
						))}
					</div>
				</s-section>
			)}

			<s-section>
				<DataTable columns={columns as any} data={tableData} isLoading={isLoading} emptyMessage="No data available" />
			</s-section>
		</>
	);
}
