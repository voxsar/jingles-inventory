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
		<div className="flex flex-col gap-4">
			{/* Page header */}
			<div className="page-header">
				<div className="page-header-left">
					<h1 className="page-title">📍 Locations</h1>
					<p className="page-subtitle">Manage warehouse storage locations</p>
				</div>
				<button className="btn-primary" onClick={() => setShowForm(true)}>+ New Location</button>
			</div>

			{/* Table section */}
			<div className="content-section">
				<DataTable columns={columns} data={locations} isLoading={isLoading} emptyMessage="No locations found" />
			</div>

			{/* Create Location Modal */}
			{showForm && (
				<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
					<div className="modal-panel-md">
						<div className="modal-header">
							<h2 className="modal-title">➕ Create Location</h2>
							<button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
						</div>
						<form onSubmit={handleCreate}>
							<div className="modal-body form-stack">
								<div className="form-grid-2">
									{(['floor', 'section', 'shelf', 'zone'] as const).map(field => (
										<div key={field} className="form-group">
											<label className="form-label">
												{field.charAt(0).toUpperCase() + field.slice(1)}
												{['floor', 'section', 'shelf'].includes(field) ? ' *' : ''}
											</label>
											<input
												className="input-field"
												type="text"
												value={form[field]}
												required={['floor', 'section', 'shelf'].includes(field)}
												onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))}
											/>
										</div>
									))}
									<div className="form-group">
										<label className="form-label">Capacity (cm³)</label>
										<input className="input-field" type="number" value={form.capacityCubicCm} onChange={(e) => setForm(f => ({ ...f, capacityCubicCm: e.target.value }))} />
									</div>
								</div>
								<div className="form-group">
									<label className="form-label">Notes</label>
									<input className="input-field" type="text" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
								</div>
							</div>
							<div className="modal-footer">
								<button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
								<button type="submit" className="btn-primary">Create Location</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
