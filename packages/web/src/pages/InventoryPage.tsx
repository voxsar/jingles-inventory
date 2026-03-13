import { useEffect, useState } from 'react';
import { inventoryApi } from '../api/client';
import { InventoryState } from '@jingles/shared';
import DataTable from '../components/DataTable';
import StateBadge from '../components/StateBadge';
import BarcodeInput from '../components/BarcodeInput';

export default function InventoryPage() {
	const [records, setRecords] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [stateFilter, setStateFilter] = useState('');
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [barcodeScanResult, setBarcodeScanResult] = useState<any>(null);

	const fetchInventory = async () => {
		setIsLoading(true);
		try {
			const params: Record<string, string> = { page: String(page), pageSize: '20' };
			if (stateFilter) params.state = stateFilter;
			const res = await inventoryApi.list(params);
			// Handle both direct array response and nested { data: { items: [] } } structure
			const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
			setRecords(Array.isArray(data) ? data : []);
			setTotal(res.data?.data?.total ?? (Array.isArray(data) ? data.length : 0));
		} catch (err) {
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => { fetchInventory(); }, [page, stateFilter]);

	const handleTransition = async (record: any) => {
		const newState = prompt(`Transition "${record.sku?.name}" from ${record.state} to:`);
		if (!newState) return;
		const reason = prompt('Reason (optional):') ?? undefined;
		try {
			await inventoryApi.transition(record.id, newState, reason);
			fetchInventory();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Transition failed');
		}
	};

	const columns = [
		{ key: 'sku', header: 'SKU', render: (r: any) => <span className="font-mono text-xs">{r.sku?.skuCode}</span>, sortable: true },
		{ key: 'name', header: 'Name', render: (r: any) => r.sku?.name },
		{ key: 'quantity', header: 'Qty', sortable: true },
		{ key: 'state', header: 'State', render: (r: any) => <StateBadge state={r.state} /> },
		{ key: 'location', header: 'Location', render: (r: any) => r.location ? `${r.location.floor}-${r.location.section}-${r.location.shelf}` : '—' },
		{ key: 'updatedAt', header: 'Updated', render: (r: any) => new Date(r.updatedAt).toLocaleDateString(), sortable: true },
		{
			key: 'actions', header: 'Actions',
			render: (r: any) => (
				<button onClick={e => { e.stopPropagation(); handleTransition(r); }} className="text-xs text-primary-600 hover:underline">
					Transition
				</button>
			),
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
				<span className="text-sm text-gray-500">{total} records</span>
			</div>

			<div className="card">
				<div className="flex flex-col sm:flex-row gap-3 mb-4">
					<select
						value={stateFilter}
						onChange={e => { setStateFilter(e.target.value); setPage(1); }}
						className="input-field max-w-xs"
					>
						<option value="">All States</option>
						{Object.values(InventoryState).map(s => (
							<option key={s} value={s}>{s}</option>
						))}
					</select>
				</div>

				<div className="mb-4">
					<label className="block text-sm font-medium text-gray-700 mb-1">Barcode Scan</label>
					<BarcodeInput onResult={setBarcodeScanResult} />
					{barcodeScanResult && (
						<div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md text-sm">
							<strong>Found:</strong> {barcodeScanResult.sku?.name} — {barcodeScanResult.inventoryRecords?.length} records
						</div>
					)}
				</div>

				<DataTable columns={columns} data={records} isLoading={isLoading} emptyMessage="No inventory records found" />

				<div className="flex items-center justify-between mt-4">
					<button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm">← Previous</button>
					<span className="text-sm text-gray-500">Page {page}</span>
					<button disabled={records.length < 20} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm">Next →</button>
				</div>
			</div>
		</div>
	);
}
