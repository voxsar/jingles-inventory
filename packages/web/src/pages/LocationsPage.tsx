import { useEffect, useState } from 'react';
import { locationsApi } from '../api/client';
import DataTable from '../components/DataTable';

export default function LocationsPage() {
	const [locations, setLocations] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [form, setForm] = useState({ floor: '', section: '', shelf: '', zone: '', capacityCubicCm: '', notes: '' });

	const load = async () => {
		try {
			const res = await locationsApi.list();
			// Handle both direct array response and nested { data: { items: [] } } structure
			const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
			setLocations(Array.isArray(data) ? data : []);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await locationsApi.create({ ...form, capacityCubicCm: form.capacityCubicCm ? parseFloat(form.capacityCubicCm) : null });
			setShowForm(false);
			setForm({ floor: '', section: '', shelf: '', zone: '', capacityCubicCm: '', notes: '' });
			await load();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to create location');
		}
	};

	const columns = [
		{ key: 'floor', header: 'Floor', sortable: true },
		{ key: 'section', header: 'Section', sortable: true },
		{ key: 'shelf', header: 'Shelf', sortable: true },
		{ key: 'zone', header: 'Zone', render: (r: any) => r.zone ?? '—' },
		{ key: 'capacityCubicCm', header: 'Capacity (cm³)', render: (r: any) => r.capacityCubicCm?.toLocaleString() ?? '—' },
		{ key: 'notes', header: 'Notes', render: (r: any) => r.notes ?? '—' },
		{ key: 'isActive', header: 'Active', render: (r: any) => r.isActive ? '✅' : '❌' },
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold text-gray-900">Locations</h1>
				<button onClick={() => setShowForm(!showForm)} className="btn-primary">+ New Location</button>
			</div>

			{showForm && (
				<div className="card">
					<h2 className="text-lg font-semibold mb-4">Create Location</h2>
					<form onSubmit={handleCreate} className="grid grid-cols-3 gap-4">
						{(['floor', 'section', 'shelf', 'zone'] as const).map(field => (
							<div key={field}>
								<label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{field}{['floor', 'section', 'shelf'].includes(field) ? ' *' : ''}</label>
								<input type="text" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} required={['floor', 'section', 'shelf'].includes(field)} className="input-field" />
							</div>
						))}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">Capacity (cm³)</label>
							<input type="number" value={form.capacityCubicCm} onChange={e => setForm(f => ({ ...f, capacityCubicCm: e.target.value }))} className="input-field" />
						</div>
						<div className="col-span-3">
							<label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
							<input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field" />
						</div>
						<div className="col-span-3 flex gap-2">
							<button type="submit" className="btn-primary">Create Location</button>
							<button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
						</div>
					</form>
				</div>
			)}

			<div className="card">
				<DataTable columns={columns} data={locations} isLoading={isLoading} emptyMessage="No locations found" />
			</div>
		</div>
	);
}
