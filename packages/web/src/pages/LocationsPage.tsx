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
		<>
			<s-stack direction="inline" gap="base">
				<s-heading>Locations</s-heading>
				<s-button variant="primary" onClick={() => setShowForm(!showForm)}>+ New Location</s-button>
			</s-stack>

			{showForm && (
				<s-section heading="Create Location">
					<form onSubmit={handleCreate}>
						<s-stack gap="base">
							<s-stack direction="inline" gap="base">
								{(['floor', 'section', 'shelf', 'zone'] as const).map(field => (
									<s-text-field
										key={field}
										label={`${field.charAt(0).toUpperCase() + field.slice(1)}${['floor', 'section', 'shelf'].includes(field) ? ' *' : ''}`}
										value={form[field]}
										required={['floor', 'section', 'shelf'].includes(field)}
										onChange={(e: any) => setForm(f => ({ ...f, [field]: e.currentTarget.value }))}
									/>
								))}
								<s-text-field label="Capacity (cm³)" type="number" value={form.capacityCubicCm} onChange={(e: any) => setForm(f => ({ ...f, capacityCubicCm: e.currentTarget.value }))} />
							</s-stack>
							<s-text-field label="Notes" value={form.notes} onChange={(e: any) => setForm(f => ({ ...f, notes: e.currentTarget.value }))} />
							<s-stack direction="inline" gap="base">
								<s-button variant="primary" type="submit">Create Location</s-button>
								<s-button type="button" onClick={() => setShowForm(false)}>Cancel</s-button>
							</s-stack>
						</s-stack>
					</form>
				</s-section>
			)}

			<s-section>
				<DataTable columns={columns} data={locations} isLoading={isLoading} emptyMessage="No locations found" />
			</s-section>
		</>
	);
}
