import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { grnsApi, vendorsApi, skusApi } from '../api/client';
import { GRNStatus } from '@jingles/shared';
import DataTable from '../components/DataTable';

const STATUS_COLORS: Record<string, string> = {
	[GRNStatus.Draft]: 'bg-gray-100 text-gray-700',
	[GRNStatus.Submitted]: 'bg-blue-100 text-blue-700',
	[GRNStatus.PartiallyInspected]: 'bg-yellow-100 text-yellow-700',
	[GRNStatus.FullyInspected]: 'bg-green-100 text-green-700',
	[GRNStatus.Closed]: 'bg-gray-100 text-gray-500',
};

export default function GRNPage() {
	const [grns, setGrns] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [vendors, setVendors] = useState<any[]>([]);
	const [skus, setSkus] = useState<any[]>([]);
	const navigate = useNavigate();

	// Helper to get today's date in YYYY-MM-DD format
	const getTodayString = () => {
		const today = new Date();
		return today.toISOString().split('T')[0];
	};

	const [form, setForm] = useState({
		supplierId: '',
		invoiceReference: '',
		expectedDeliveryDate: getTodayString(),
		notes: '',
		lines: [{ skuId: '', expectedQuantity: 1, batchReference: '' }],
	});

	useEffect(() => {
		Promise.all([
			grnsApi.list(),
			vendorsApi.list(),
			skusApi.list(),
		]).then(([grnRes, vendorRes, skuRes]) => {
			// Handle both direct array response and nested { data: { items: [] } } structure
			const grnData = grnRes.data?.data?.items ?? grnRes.data?.data ?? grnRes.data ?? [];
			const vendorData = vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? [];
			const skuData = skuRes.data?.data?.items ?? skuRes.data?.data ?? skuRes.data ?? [];
			setGrns(Array.isArray(grnData) ? grnData : []);
			setVendors(Array.isArray(vendorData) ? vendorData : []);
			setSkus(Array.isArray(skuData) ? skuData : []);
			setIsLoading(false);
		}).catch(() => setIsLoading(false));
	}, []);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await grnsApi.create(form);
			const res = await grnsApi.list();
			// Handle both direct array response and nested { data: { items: [] } } structure
			const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
			setGrns(Array.isArray(data) ? data : []);
			setShowForm(false);
			setForm({ supplierId: '', invoiceReference: '', expectedDeliveryDate: getTodayString(), notes: '', lines: [{ skuId: '', expectedQuantity: 1, batchReference: '' }] });
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to create GRN');
		}
	};

	const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { skuId: '', expectedQuantity: 1, batchReference: '' }] }));
	const removeLine = (i: number) => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
	const updateLine = (i: number, field: string, value: any) => {
		setForm(f => ({
			...f,
			lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l),
		}));
	};

	const columns = [
		{ key: 'id', header: 'ID', render: (r: any) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
		{ key: 'supplier', header: 'Supplier', render: (r: any) => r.supplier?.name },
		{ key: 'invoiceReference', header: 'Invoice Ref', render: (r: any) => r.invoiceReference ?? '—' },
		{ key: 'status', header: 'Status', render: (r: any) => <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[r.status]}`}>{r.status}</span> },
		{ key: 'linesCount', header: 'Lines', render: (r: any) => r.lines?.length ?? 0 },
		{ key: 'createdAt', header: 'Created', render: (r: any) => new Date(r.createdAt).toLocaleDateString() },
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold text-gray-900">Goods Receipt Notes</h1>
				<button onClick={() => setShowForm(!showForm)} className="btn-primary">+ New GRN</button>
			</div>

			{showForm && (
				<div className="card">
					<h2 className="text-lg font-semibold mb-4">Create GRN</h2>
					<form onSubmit={handleCreate} className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
								<select
									value={form.supplierId}
									onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
									required
									className="input-field"
								>
									<option value="">Select supplier</option>
									{vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
								</select>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Invoice Reference</label>
								<input type="text" value={form.invoiceReference} onChange={e => setForm(f => ({ ...f, invoiceReference: e.target.value }))} className="input-field" />
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date</label>
								<input type="date" value={form.expectedDeliveryDate} onChange={e => setForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))} className="input-field" />
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
								<input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field" />
							</div>
						</div>

						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="text-sm font-medium text-gray-700">Lines</label>
								<button type="button" onClick={addLine} className="text-sm text-primary-600 hover:underline">+ Add Line</button>
							</div>
							{form.lines.map((line, i) => (
								<div key={i} className="flex gap-2 mb-2">
									<select value={line.skuId} onChange={e => updateLine(i, 'skuId', e.target.value)} required className="input-field flex-1">
										<option value="">Select SKU</option>
										{skus.map((s: any) => <option key={s.id} value={s.id}>{s.skuCode} - {s.name}</option>)}
									</select>
									<input type="number" min="1" value={line.expectedQuantity} onChange={e => updateLine(i, 'expectedQuantity', parseInt(e.target.value))} className="input-field w-24" placeholder="Qty" />
									<input type="text" value={line.batchReference} onChange={e => updateLine(i, 'batchReference', e.target.value)} className="input-field w-32" placeholder="Batch ref" />
									{form.lines.length > 1 && (
										<button type="button" onClick={() => removeLine(i)} className="text-red-500 hover:text-red-700">✕</button>
									)}
								</div>
							))}
						</div>

						<div className="flex gap-2">
							<button type="submit" className="btn-primary">Create GRN</button>
							<button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
						</div>
					</form>
				</div>
			)}

			<div className="card">
				<DataTable
					columns={columns}
					data={grns}
					isLoading={isLoading}
					emptyMessage="No GRNs found"
					onRowClick={row => navigate(`/grns/${row.id}`)}
				/>
			</div>
		</div>
	);
}
