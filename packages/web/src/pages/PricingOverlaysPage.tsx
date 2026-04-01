import { useEffect, useState } from 'react';
import { pricingOverlaysApi, skusApi, variantsApi, batchesApi, categoriesApi } from '../api/client';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import { PricingOverlayType, PricingOverlayStatus } from '@jingles/shared';
import SearchableSelect from '../components/SearchableSelect';

const PAGE_SIZE = 20;

export default function PricingOverlaysPage() {
	const [overlays, setOverlays] = useState<any[]>([]);
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(1);
	const [isLoading, setIsLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(PAGE_SIZE);
	const [statusFilter, setStatusFilter] = useState('');
	const [typeFilter, setTypeFilter] = useState('');
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [editingOverlay, setEditingOverlay] = useState<any>(null);
	const [showConflictsModal, setShowConflictsModal] = useState(false);
	const [conflicts, setConflicts] = useState<any[]>([]);
	const [conflictOverlayName, setConflictOverlayName] = useState('');

	const [formData, setFormData] = useState({
		name: '',
		description: '',
		type: PricingOverlayType.PercentageDiscount,
		value: '',
		priority: '0',
		stackable: true,
		status: PricingOverlayStatus.Active,
		validFrom: '',
		validTo: '',
		// Applies To
		targetType: 'all' as 'all' | 'sku' | 'variant' | 'batch' | 'category',
		skuIds: [] as string[],
		variantIds: [] as string[],
		batchIds: [] as string[],
		categoryIds: [] as string[],
		// Conditions
		hasConditions: false,
		minQty: '',
		maxQty: '',
		customerType: '',
		customerGroups: [] as string[],
		branches: [] as string[],
		dateRangeStart: '',
		dateRangeEnd: '',
	});

	const loadOverlays = async () => {
		setIsLoading(true);
		try {
			const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
			if (statusFilter) params.status = statusFilter;
			if (typeFilter) params.type = typeFilter;

			const res = await pricingOverlaysApi.list(params);
			const data = res.data?.data ?? res.data;
			setOverlays(data.items ?? []);
			setTotal(data.total ?? 0);
			setTotalPages(data.totalPages ?? 1);
		} catch (err) {
			console.error('Failed to load overlays', err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadOverlays();
	}, [page, pageSize, statusFilter, typeFilter]);

	const resetForm = () => {
		setFormData({
			name: '',
			description: '',
			type: PricingOverlayType.PercentageDiscount,
			value: '',
			priority: '0',
			stackable: true,
			status: PricingOverlayStatus.Active,
			validFrom: '',
			validTo: '',
			targetType: 'all',
			skuIds: [],
			variantIds: [],
			batchIds: [],
			categoryIds: [],
			hasConditions: false,
			minQty: '',
			maxQty: '',
			customerType: '',
			customerGroups: [],
			branches: [],
			dateRangeStart: '',
			dateRangeEnd: '',
		});
	};

	const handleCreateClick = () => {
		resetForm();
		setShowCreateModal(true);
	};

	const handleEditClick = (overlay: any) => {
		setEditingOverlay(overlay);
		const appliesTo = overlay.appliesTo || {};
		const conditions = overlay.conditions || {};

		// Determine target type
		let targetType: 'all' | 'sku' | 'variant' | 'batch' | 'category' = 'all';
		if (appliesTo.batchIds && appliesTo.batchIds.length > 0) targetType = 'batch';
		else if (appliesTo.variantIds && appliesTo.variantIds.length > 0) targetType = 'variant';
		else if (appliesTo.skuIds && appliesTo.skuIds.length > 0) targetType = 'sku';
		else if (appliesTo.categoryIds && appliesTo.categoryIds.length > 0) targetType = 'category';

		setFormData({
			name: overlay.name,
			description: overlay.description || '',
			type: overlay.type,
			value: String(overlay.value),
			priority: String(overlay.priority),
			stackable: overlay.stackable,
			status: overlay.status,
			validFrom: overlay.validFrom ? new Date(overlay.validFrom).toISOString().slice(0, 16) : '',
			validTo: overlay.validTo ? new Date(overlay.validTo).toISOString().slice(0, 16) : '',
			targetType,
			skuIds: appliesTo.skuIds || [],
			variantIds: appliesTo.variantIds || [],
			batchIds: appliesTo.batchIds || [],
			categoryIds: appliesTo.categoryIds || [],
			hasConditions: !!conditions && Object.keys(conditions).length > 0,
			minQty: conditions.minQty ? String(conditions.minQty) : '',
			maxQty: conditions.maxQty ? String(conditions.maxQty) : '',
			customerType: conditions.customerType || '',
			customerGroups: conditions.customerGroups || [],
			branches: conditions.branches || [],
			dateRangeStart: conditions.dateRange?.start ? new Date(conditions.dateRange.start).toISOString().slice(0, 10) : '',
			dateRangeEnd: conditions.dateRange?.end ? new Date(conditions.dateRange.end).toISOString().slice(0, 10) : '',
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Build appliesTo object
		const appliesTo: any = {};
		if (formData.targetType === 'sku' && formData.skuIds.length > 0) {
			appliesTo.skuIds = formData.skuIds;
		} else if (formData.targetType === 'variant' && formData.variantIds.length > 0) {
			appliesTo.variantIds = formData.variantIds;
		} else if (formData.targetType === 'batch' && formData.batchIds.length > 0) {
			appliesTo.batchIds = formData.batchIds;
		} else if (formData.targetType === 'category' && formData.categoryIds.length > 0) {
			appliesTo.categoryIds = formData.categoryIds;
		}

		// Build conditions object
		let conditions = null;
		if (formData.hasConditions) {
			conditions = {} as any;
			if (formData.minQty) conditions.minQty = parseInt(formData.minQty);
			if (formData.maxQty) conditions.maxQty = parseInt(formData.maxQty);
			if (formData.customerType) conditions.customerType = formData.customerType;
			if (formData.customerGroups.length > 0) conditions.customerGroups = formData.customerGroups;
			if (formData.branches.length > 0) conditions.branches = formData.branches;
			if (formData.dateRangeStart && formData.dateRangeEnd) {
				conditions.dateRange = {
					start: formData.dateRangeStart,
					end: formData.dateRangeEnd,
				};
			}
		}

		const payload = {
			name: formData.name,
			description: formData.description || null,
			type: formData.type,
			value: parseFloat(formData.value),
			appliesTo,
			conditions,
			priority: parseInt(formData.priority),
			stackable: formData.stackable,
			status: formData.status,
			validFrom: formData.validFrom ? new Date(formData.validFrom).toISOString() : null,
			validTo: formData.validTo ? new Date(formData.validTo).toISOString() : null,
		};

		try {
			if (editingOverlay) {
				await pricingOverlaysApi.update(editingOverlay.id, payload);
			} else {
				await pricingOverlaysApi.create(payload);
			}
			setShowCreateModal(false);
			setEditingOverlay(null);
			await loadOverlays();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to save overlay');
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to delete this overlay?')) return;
		try {
			await pricingOverlaysApi.delete(id);
			await loadOverlays();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to delete overlay');
		}
	};

	const handleViewConflicts = async (overlay: any) => {
		try {
			const res = await pricingOverlaysApi.getConflicts(overlay.id);
			const data = res.data?.data ?? res.data;
			setConflicts(data);
			setConflictOverlayName(overlay.name);
			setShowConflictsModal(true);
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to load conflicts');
		}
	};

	const getTypeLabel = (type: string) => {
		switch (type) {
			case PricingOverlayType.PercentageDiscount:
				return '% Discount';
			case PricingOverlayType.FixedDiscount:
				return 'Fixed Discount';
			case PricingOverlayType.PercentageMarkup:
				return '% Markup';
			case PricingOverlayType.FixedMarkup:
				return 'Fixed Markup';
			default:
				return type;
		}
	};

	const getStatusBadge = (status: string) => {
		const colors: Record<string, string> = {
			[PricingOverlayStatus.Active]: 'bg-green-100 text-green-800',
			[PricingOverlayStatus.Inactive]: 'bg-gray-100 text-gray-800',
			[PricingOverlayStatus.Scheduled]: 'bg-blue-100 text-blue-800',
			[PricingOverlayStatus.Expired]: 'bg-red-100 text-red-800',
		};
		return (
			<span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
				{status}
			</span>
		);
	};

	const columns = [
		{ key: 'name', header: 'Name', render: (o: any) => <span className="font-medium">{o.name}</span> },
		{ key: 'type', header: 'Type', render: (o: any) => <span className="text-sm">{getTypeLabel(o.type)}</span> },
		{
			key: 'value', header: 'Value', align: 'right' as const, render: (o: any) => {
				if (o.type.includes('percentage')) {
					return <span className="font-mono">{o.value}%</span>;
				}
				return <span className="font-mono">{o.value}</span>;
			}
		},
		{ key: 'priority', header: 'Priority', align: 'center' as const, render: (o: any) => <span className="font-mono text-sm">{o.priority}</span> },
		{ key: 'stackable', header: 'Stackable', align: 'center' as const, render: (o: any) => o.stackable ? '✓' : '—' },
		{ key: 'status', header: 'Status', render: (o: any) => getStatusBadge(o.status) },
		{ key: 'validFrom', header: 'Valid From', render: (o: any) => o.validFrom ? new Date(o.validFrom).toLocaleDateString() : <span className="text-gray-400">—</span> },
		{ key: 'validTo', header: 'Valid To', render: (o: any) => o.validTo ? new Date(o.validTo).toLocaleDateString() : <span className="text-gray-400">—</span> },
		{
			key: 'actions',
			header: '',
			render: (o: any) => (
				<div className="flex items-center gap-2">
					<button className="btn-sm" onClick={() => handleEditClick(o)}>Edit</button>
					<button className="btn-sm" onClick={() => handleViewConflicts(o)}>Conflicts</button>
					<button className="btn-sm text-red-600" onClick={() => handleDelete(o.id)}>Delete</button>
				</div>
			),
		},
	];

	return (
		<div className="flex flex-col gap-4">
			{/* Page header */}
			<div className="page-header">
				<div>
					<h1 className="page-title">🎯 Pricing Overlays</h1>
					<p className="page-subtitle">Manage dynamic pricing rules and adjustments</p>
				</div>
				<button className="btn-primary" onClick={handleCreateClick}>Create Overlay</button>
			</div>

			{/* Filters */}
			<div className="filter-bar">
				<div style={{ width: '180px' }}>
					<SearchableSelect
						options={[
							{ value: '', label: 'All Statuses' },
							{ value: PricingOverlayStatus.Active, label: 'Active' },
							{ value: PricingOverlayStatus.Inactive, label: 'Inactive' },
							{ value: PricingOverlayStatus.Scheduled, label: 'Scheduled' },
							{ value: PricingOverlayStatus.Expired, label: 'Expired' }
						]}
						value={statusFilter}
						onChange={(value) => setStatusFilter(value)}
						placeholder="All Statuses"
						isClearable={false}
					/>
				</div>

				<div style={{ width: '180px' }}>
					<SearchableSelect
						options={[
							{ value: '', label: 'All Types' },
							{ value: PricingOverlayType.PercentageDiscount, label: '% Discount' },
							{ value: PricingOverlayType.FixedDiscount, label: 'Fixed Discount' },
							{ value: PricingOverlayType.PercentageMarkup, label: '% Markup' },
							{ value: PricingOverlayType.FixedMarkup, label: 'Fixed Markup' }
						]}
						value={typeFilter}
						onChange={(value) => setTypeFilter(value)}
						placeholder="All Types"
						isClearable={false}
					/>
				</div>
			</div>

			{/* Table */}
			<div className="content-section">
				{isLoading ? (
					<div className="px-6 py-8 text-center text-sm text-gray-500">Loading...</div>
				) : overlays.length === 0 ? (
					<div className="px-6 py-8 text-center text-sm text-gray-500">No overlays found</div>
				) : (
					<>
						<DataTable columns={columns} data={overlays} />
						{totalPages > 1 && (
							<div className="px-6 py-4 border-t border-gray-100">
								<Pagination
									page={page}
									totalPages={totalPages}
									pageSize={pageSize}
									total={total}
									onPageChange={setPage}
									onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
								/>
							</div>
						)}
					</>
				)}
			</div>

			{/* Create/Edit Modal */}
			{(showCreateModal || editingOverlay) && (
				<div className="modal-overlay" onClick={() => { setShowCreateModal(false); setEditingOverlay(null); }}>
					<div className="modal-panel-lg" onClick={(e) => e.stopPropagation()}>
						<h2 className="text-lg font-semibold mb-4">{editingOverlay ? 'Edit Overlay' : 'Create Overlay'}</h2>
						<form onSubmit={handleSubmit} className="space-y-4">
							{/* Basic Info */}
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
									<input
										type="text"
										className="w-full px-3 py-2 border border-gray-300 rounded"
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
										required
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
									<SearchableSelect
										options={[
											{ value: PricingOverlayStatus.Active, label: 'Active' },
											{ value: PricingOverlayStatus.Inactive, label: 'Inactive' },
											{ value: PricingOverlayStatus.Scheduled, label: 'Scheduled' }
										]}
										value={formData.status}
										onChange={(value) => setFormData({ ...formData, status: value as any })}
										placeholder="Select Status"
										isClearable={false}
									/>
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
								<textarea
									className="w-full px-3 py-2 border border-gray-300 rounded"
									rows={2}
									value={formData.description}
									onChange={(e) => setFormData({ ...formData, description: e.target.value })}
								/>
							</div>

							{/* Pricing Details */}
							<div className="border-t pt-4">
								<h3 className="text-sm font-medium text-gray-700 mb-3">Pricing Adjustment</h3>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
										<SearchableSelect
											options={[
												{ value: PricingOverlayType.PercentageDiscount, label: 'Percentage Discount' },
												{ value: PricingOverlayType.FixedDiscount, label: 'Fixed Discount' },
												{ value: PricingOverlayType.PercentageMarkup, label: 'Percentage Markup' },
												{ value: PricingOverlayType.FixedMarkup, label: 'Fixed Markup' }
											]}
											value={formData.type}
											onChange={(value) => setFormData({ ...formData, type: value as any })}
											placeholder="Select Type"
											isClearable={false}
										/>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Value *</label>
										<input
											type="number"
											step="0.01"
											className="w-full px-3 py-2 border border-gray-300 rounded"
											value={formData.value}
											onChange={(e) => setFormData({ ...formData, value: e.target.value })}
											placeholder={formData.type.includes('percentage') ? '10 (for 10%)' : '50.00'}
											required
										/>
									</div>
								</div>
							</div>

							{/* Priority and Stacking */}
							<div className="border-t pt-4">
								<h3 className="text-sm font-medium text-gray-700 mb-3">Priority & Stacking</h3>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
										<input
											type="number"
											className="w-full px-3 py-2 border border-gray-300 rounded"
											value={formData.priority}
											onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
										/>
										<p className="text-xs text-gray-500 mt-1">Higher values are applied first</p>
									</div>
									<div>
										<label className="flex items-center gap-2 mt-7">
											<input
												type="checkbox"
												checked={formData.stackable}
												onChange={(e) => setFormData({ ...formData, stackable: e.target.checked })}
											/>
											<span className="text-sm">Allow stacking with other overlays</span>
										</label>
									</div>
								</div>
							</div>

							{/* Validity Dates */}
							<div className="border-t pt-4">
								<h3 className="text-sm font-medium text-gray-700 mb-3">Validity Period</h3>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
										<input
											type="datetime-local"
											className="w-full px-3 py-2 border border-gray-300 rounded"
											value={formData.validFrom}
											onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
										/>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Valid To</label>
										<input
											type="datetime-local"
											className="w-full px-3 py-2 border border-gray-300 rounded"
											value={formData.validTo}
											onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
										/>
									</div>
								</div>
							</div>

							{/* Applies To */}
							<div className="border-t pt-4">
								<h3 className="text-sm font-medium text-gray-700 mb-3">Applies To</h3>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
									<SearchableSelect
										options={[
											{ value: 'all', label: 'All Products' },
											{ value: 'sku', label: 'Specific SKUs' },
											{ value: 'variant', label: 'Specific Variants' },
											{ value: 'batch', label: 'Specific Batches' },
											{ value: 'category', label: 'Specific Categories' }
										]}
										value={formData.targetType}
										onChange={(value) => setFormData({ ...formData, targetType: value as any })}
										placeholder="Select Target"
										isClearable={false}
									/>
								</div>

								{formData.targetType !== 'all' && (
									<div className="mt-3">
										<label className="block text-sm font-medium text-gray-700 mb-1">Target IDs (comma-separated)</label>
										<input
											type="text"
											className="w-full px-3 py-2 border border-gray-300 rounded"
											placeholder="Enter UUIDs separated by commas"
											value={
												formData.targetType === 'sku' ? formData.skuIds.join(',') :
													formData.targetType === 'variant' ? formData.variantIds.join(',') :
														formData.targetType === 'batch' ? formData.batchIds.join(',') :
															formData.targetType === 'category' ? formData.categoryIds.join(',') : ''
											}
											onChange={(e) => {
												const ids = e.target.value.split(',').map(id => id.trim()).filter(Boolean);
												if (formData.targetType === 'sku') setFormData({ ...formData, skuIds: ids });
												else if (formData.targetType === 'variant') setFormData({ ...formData, variantIds: ids });
												else if (formData.targetType === 'batch') setFormData({ ...formData, batchIds: ids });
												else if (formData.targetType === 'category') setFormData({ ...formData, categoryIds: ids });
											}}
										/>
									</div>
								)}
							</div>

							{/* Conditions */}
							<div className="border-t pt-4">
								<label className="flex items-center gap-2 mb-3">
									<input
										type="checkbox"
										checked={formData.hasConditions}
										onChange={(e) => setFormData({ ...formData, hasConditions: e.target.checked })}
									/>
									<span className="text-sm font-medium text-gray-700">Add Activation Conditions</span>
								</label>

								{formData.hasConditions && (
									<div className="space-y-4 ml-6 border-l-2 border-gray-200 pl-4">
										<div className="grid grid-cols-2 gap-4">
											<div>
												<label className="block text-sm font-medium text-gray-700 mb-1">Min Quantity</label>
												<input
													type="number"
													className="w-full px-3 py-2 border border-gray-300 rounded"
													value={formData.minQty}
													onChange={(e) => setFormData({ ...formData, minQty: e.target.value })}
												/>
											</div>
											<div>
												<label className="block text-sm font-medium text-gray-700 mb-1">Max Quantity</label>
												<input
													type="number"
													className="w-full px-3 py-2 border border-gray-300 rounded"
													value={formData.maxQty}
													onChange={(e) => setFormData({ ...formData, maxQty: e.target.value })}
												/>
											</div>
										</div>

										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
											<input
												type="text"
												className="w-full px-3 py-2 border border-gray-300 rounded"
												value={formData.customerType}
												onChange={(e) => setFormData({ ...formData, customerType: e.target.value })}
												placeholder="e.g., wholesale, retail"
											/>
										</div>

										<div className="grid grid-cols-2 gap-4">
											<div>
												<label className="block text-sm font-medium text-gray-700 mb-1">Date Range Start</label>
												<input
													type="date"
													className="w-full px-3 py-2 border border-gray-300 rounded"
													value={formData.dateRangeStart}
													onChange={(e) => setFormData({ ...formData, dateRangeStart: e.target.value })}
												/>
											</div>
											<div>
												<label className="block text-sm font-medium text-gray-700 mb-1">Date Range End</label>
												<input
													type="date"
													className="w-full px-3 py-2 border border-gray-300 rounded"
													value={formData.dateRangeEnd}
													onChange={(e) => setFormData({ ...formData, dateRangeEnd: e.target.value })}
												/>
											</div>
										</div>
									</div>
								)}
							</div>

							<div className="flex justify-end gap-3 pt-4 border-t">
								<button type="button" className="btn-secondary" onClick={() => { setShowCreateModal(false); setEditingOverlay(null); }}>
									Cancel
								</button>
								<button type="submit" className="btn-primary">{editingOverlay ? 'Save Changes' : 'Create Overlay'}</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Conflicts Modal */}
			{showConflictsModal && (
				<div className="modal-overlay" onClick={() => setShowConflictsModal(false)}>
					<div className="modal-panel-md" onClick={(e) => e.stopPropagation()}>
						<h2 className="text-lg font-semibold mb-4">Conflicts for "{conflictOverlayName}"</h2>
						{conflicts.length === 0 ? (
							<p className="text-sm text-gray-600">No conflicts detected. This overlay can be safely applied.</p>
						) : (
							<div className="space-y-2">
								<p className="text-sm text-gray-600 mb-3">
									The following overlays conflict with this one (same priority, non-stackable, overlapping targets):
								</p>
								{conflicts.map((c) => (
									<div key={c.id} className="p-3 bg-yellow-50 border border-yellow-200 rounded">
										<div className="font-medium">{c.name}</div>
										<div className="text-sm text-gray-600">
											{getTypeLabel(c.type)} • Priority: {c.priority} • Status: {c.status}
										</div>
									</div>
								))}
							</div>
						)}
						<div className="flex justify-end gap-3 pt-4 border-t mt-4">
							<button className="btn-primary" onClick={() => setShowConflictsModal(false)}>Close</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
