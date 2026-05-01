import { useEffect, useState } from 'react';
import { batchesApi, vendorsApi } from '../api/client';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import EffectivePricePreview from '../components/EffectivePricePreview';

const PAGE_SIZE = 20;

export default function PricingPage() {
	const [batches, setBatches] = useState<any[]>([]);
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(1);
	const [isLoading, setIsLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(PAGE_SIZE);
	const [searchTerm, setSearchTerm] = useState('');
	const [vendorFilter, setVendorFilter] = useState('');
	const [activeFilter, setActiveFilter] = useState('');
	const [vendors, setVendors] = useState<any[]>([]);
	const [showBulkPricingModal, setShowBulkPricingModal] = useState(false);
	const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
	const [bulkOperation, setBulkOperation] = useState<'set' | 'increase_fixed' | 'increase_percentage'>('set');
	const [bulkPriceField, setBulkPriceField] = useState<'costPrice' | 'sellingPrice' | 'wholesalePrice' | 'bulkPrice'>('sellingPrice');
	const [bulkValue, setBulkValue] = useState('');
	const [editingBatch, setEditingBatch] = useState<any>(null);
	const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState({
		costPrice: '',
		sellingPrice: '',
		wholesalePrice: '',
		bulkPrice: '',
		marginType: '',
		marginValue: '',
	});

	const loadBatches = async () => {
		setIsLoading(true);
		try {
			const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
			if (searchTerm) params.search = searchTerm;
			if (vendorFilter) params.vendorId = vendorFilter;
			if (activeFilter) params.isActive = activeFilter;

			const [batchRes, vendorRes] = await Promise.all([
				batchesApi.list(params),
				vendorsApi.list(),
			]);
			const data = batchRes.data?.data ?? batchRes.data;
			setBatches(data.items ?? []);
			setTotal(data.total ?? 0);
			setTotalPages(data.totalPages ?? 1);
			setVendors(vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? []);
		} catch (err) {
			console.error('Failed to load batches', err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadBatches();
	}, [page, pageSize, searchTerm, vendorFilter, activeFilter]);

	const handleBulkPricingSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (selectedBatches.length === 0) {
			alert('Please select at least one batch');
			return;
		}
		try {
			await batchesApi.bulkUpdatePricing({
				batchIds: selectedBatches,
				operation: bulkOperation,
				priceField: bulkPriceField,
				value: parseFloat(bulkValue),
			});
			setShowBulkPricingModal(false);
			setSelectedBatches([]);
			setBulkValue('');
			await loadBatches();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to update pricing');
		}
	};

	const handleApplyMargin = async (batchId: string) => {
		try {
			await batchesApi.applyMargin(batchId);
			await loadBatches();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to apply margin');
		}
	};

	const handleBulkApplyMargin = async () => {
		if (selectedBatches.length === 0) {
			alert('Please select at least one batch');
			return;
		}
		try {
			await batchesApi.bulkApplyMargin(selectedBatches);
			setSelectedBatches([]);
			await loadBatches();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to apply margins');
		}
	};

	const handleEditBatch = (batch: any) => {
		setEditingBatch(batch);
		setEditForm({
			costPrice: batch.costPrice?.toString() ?? '',
			sellingPrice: batch.sellingPrice?.toString() ?? '',
			wholesalePrice: batch.wholesalePrice?.toString() ?? '',
			bulkPrice: batch.bulkPrice?.toString() ?? '',
			marginType: batch.marginType ?? '',
			marginValue: batch.marginValue?.toString() ?? '',
		});
	};

	const handleSaveEdit = async () => {
		if (!editingBatch) return;
		try {
			await batchesApi.update(editingBatch.id, {
				costPrice: editForm.costPrice ? parseFloat(editForm.costPrice) : null,
				sellingPrice: editForm.sellingPrice ? parseFloat(editForm.sellingPrice) : null,
				wholesalePrice: editForm.wholesalePrice ? parseFloat(editForm.wholesalePrice) : null,
				bulkPrice: editForm.bulkPrice ? parseFloat(editForm.bulkPrice) : null,
				marginType: editForm.marginType || null,
				marginValue: editForm.marginValue ? parseFloat(editForm.marginValue) : null,
			});
			setEditingBatch(null);
			await loadBatches();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to update batch');
		}
	};

	const columns = [
		{
			key: 'select',
			header: '',
			render: (b: any) => (
				<input
					type="checkbox"
					checked={selectedBatches.includes(b.id)}
					onChange={(e) => {
						if (e.target.checked) {
							setSelectedBatches([...selectedBatches, b.id]);
						} else {
							setSelectedBatches(selectedBatches.filter(id => id !== b.id));
						}
					}}
				/>
			),
		},
		{ key: 'batchNumber', header: 'Batch #', render: (b: any) => <span className="font-mono text-sm">{b.batchNumber}</span> },
		{ key: 'sku', header: 'Product', render: (b: any) => <div><div className="font-medium">{b.sku?.name}</div><div className="text-xs text-gray-500">{b.sku?.skuCode}</div></div> },
		{ key: 'variant', header: 'Variant', render: (b: any) => b.variant ? <span className="text-sm">{b.variant.name ?? b.variant.variantCode}</span> : <span className="text-gray-400">—</span> },
		{ key: 'costPrice', header: 'Cost', align: 'right' as const, render: (b: any) => b.costPrice ? `${b.costPrice.toFixed(2)}` : <span className="text-gray-400">—</span> },
		{ key: 'sellingPrice', header: 'Selling', align: 'right' as const, render: (b: any) => b.sellingPrice ? <span className="font-semibold">{b.sellingPrice.toFixed(2)}</span> : <span className="text-gray-400">—</span> },
		{ key: 'wholesalePrice', header: 'Wholesale', align: 'right' as const, render: (b: any) => b.wholesalePrice ? `${b.wholesalePrice.toFixed(2)}` : <span className="text-gray-400">—</span> },
		{ key: 'bulkPrice', header: 'Bulk', align: 'right' as const, render: (b: any) => b.bulkPrice ? `${b.bulkPrice.toFixed(2)}` : <span className="text-gray-400">—</span> },
		{
			key: 'margin', header: 'Margin', render: (b: any) => {
				if (b.marginType && b.marginValue) {
					return <span className="text-xs">{b.marginType === 'fixed' ? `+${b.marginValue}` : `+${b.marginValue}%`}</span>;
				}
				return <span className="text-gray-400">—</span>;
			}
		},
		{
			key: 'actions',
			header: 'Actions',
			render: (b: any) => (
				<div className="flex items-center gap-2">
					<button
						className="btn-sm text-xs"
						onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}
						title="View effective price with overlays"
					>
						{expandedBatchId === b.id ? '▼' : '🎯'}
					</button>
					<button className="btn-sm" onClick={() => handleEditBatch(b)}>Edit</button>
					{b.marginType && b.marginValue && b.costPrice && (
						<button className="btn-sm" onClick={() => handleApplyMargin(b.id)}>Apply Margin</button>
					)}
				</div>
			),
		},
	];

	return (
		<div className="flex flex-col gap-4">
			{/* Page header */}
			<div className="page-header">
				<div>
					<h1 className="page-title">💰 Batch Pricing Management</h1>
					<p className="page-subtitle">Manage pricing for product batches</p>
				</div>
				<div className="flex items-center gap-3">
					{selectedBatches.length > 0 && (
						<>
							<span className="text-sm text-gray-600">{selectedBatches.length} selected</span>
							<button className="btn-secondary" onClick={handleBulkApplyMargin}>Apply Margins</button>
							<button className="btn-primary" onClick={() => setShowBulkPricingModal(true)}>Bulk Update Pricing</button>
						</>
					)}
				</div>
			</div>

			{/* Filters */}
			<div className="filter-bar">
				<input
					type="search"
					placeholder="Search batch, SKU, vendor, variant…"
					className="filter-input-wide"
					value={searchTerm}
					onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
				/>
				<div style={{ width: '220px' }}>
					<SearchableSelect
						options={[
							{ value: '', label: 'All Vendors' },
							...vendors.map((vendor: any) => ({ value: vendor.id, label: vendor.name }))
						]}
						value={vendorFilter}
						onChange={(value) => { setVendorFilter(value); setPage(1); }}
						placeholder="All Vendors"
						isClearable={false}
					/>
				</div>
				<div style={{ width: '180px' }}>
					<SearchableSelect
						options={[
							{ value: '', label: 'All Statuses' },
							{ value: 'true', label: 'Active' },
							{ value: 'false', label: 'Inactive' },
						]}
						value={activeFilter}
						onChange={(value) => { setActiveFilter(value); setPage(1); }}
						placeholder="All Statuses"
						isClearable={false}
					/>
				</div>
				{(searchTerm || vendorFilter || activeFilter) && (
					<button className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setVendorFilter(''); setActiveFilter(''); setPage(1); }}>
						✕ Clear filters
					</button>
				)}
			</div>

			{/* Table */}
			<div className="content-section">
				{isLoading ? (
					<div className="px-6 py-8 text-center text-sm text-gray-500">Loading...</div>
				) : batches.length === 0 ? (
					<div className="px-6 py-8 text-center text-sm text-gray-500">No batches found</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-gray-200">
								<thead className="bg-gray-50">
									<tr>
										{columns.map((col) => (
											<th
												key={col.key}
												className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
													}`}
											>
												{col.header}
											</th>
										))}
									</tr>
								</thead>
								<tbody className="bg-white divide-y divide-gray-200">
									{batches.map((batch) => (
										<>
											<tr key={batch.id}>
												{columns.map((col) => (
													<td
														key={col.key}
														className={`px-6 py-4 whitespace-nowrap text-sm ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
															}`}
													>
														{col.render(batch)}
													</td>
												))}
											</tr>
											{expandedBatchId === batch.id && batch.sellingPrice && (
												<tr key={`${batch.id}-preview`}>
													<td colSpan={columns.length} className="px-6 py-4 bg-gray-50">
														<EffectivePricePreview
															skuId={batch.skuId}
															variantId={batch.variantId}
															batchId={batch.id}
															basePrice={batch.sellingPrice}
															priceType="selling"
														/>
													</td>
												</tr>
											)}
										</>
									))}
								</tbody>
							</table>
						</div>
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

			{/* Edit Modal */}
			{editingBatch && (
				<div className="modal-overlay" onClick={() => setEditingBatch(null)}>
					<div className="modal-panel-md" onClick={(e) => e.stopPropagation()}>
						<h2 className="text-lg font-semibold mb-4">Edit Batch Pricing: {editingBatch.batchNumber}</h2>
						<form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Cost Price</label>
									<input
										type="number"
										step="0.01"
										className="w-full px-3 py-2 border border-gray-300 rounded"
										value={editForm.costPrice}
										onChange={(e) => setEditForm({ ...editForm, costPrice: e.target.value })}
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Selling Price</label>
									<input
										type="number"
										step="0.01"
										className="w-full px-3 py-2 border border-gray-300 rounded"
										value={editForm.sellingPrice}
										onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })}
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Wholesale Price</label>
									<input
										type="number"
										step="0.01"
										className="w-full px-3 py-2 border border-gray-300 rounded"
										value={editForm.wholesalePrice}
										onChange={(e) => setEditForm({ ...editForm, wholesalePrice: e.target.value })}
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Bulk Price</label>
									<input
										type="number"
										step="0.01"
										className="w-full px-3 py-2 border border-gray-300 rounded"
										value={editForm.bulkPrice}
										onChange={(e) => setEditForm({ ...editForm, bulkPrice: e.target.value })}
									/>
								</div>
							</div>

							<div className="border-t pt-4">
								<h3 className="text-sm font-medium text-gray-700 mb-3">Margin Settings</h3>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Margin Type</label>
										<SearchableSelect
											options={[
												{ value: '', label: 'None' },
												{ value: 'fixed', label: 'Fixed Amount' },
												{ value: 'percentage', label: 'Percentage' }
											]}
											value={editForm.marginType}
											onChange={(value) => setEditForm({ ...editForm, marginType: value })}
											placeholder="None"
											isClearable={false}
										/>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Margin Value</label>
										<input
											type="number"
											step="0.01"
											className="w-full px-3 py-2 border border-gray-300 rounded"
											value={editForm.marginValue}
											onChange={(e) => setEditForm({ ...editForm, marginValue: e.target.value })}
											placeholder={editForm.marginType === 'percentage' ? 'e.g., 25 (for 25%)' : 'e.g., 50'}
										/>
									</div>
								</div>
							</div>

							<div className="flex justify-end gap-3 pt-4 border-t">
								<button type="button" className="btn-secondary" onClick={() => setEditingBatch(null)}>Cancel</button>
								<button type="submit" className="btn-primary">Save Changes</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Bulk Pricing Modal */}
			{showBulkPricingModal && (
				<div className="modal-overlay" onClick={() => setShowBulkPricingModal(false)}>
					<div className="modal-panel-md" onClick={(e) => e.stopPropagation()}>
						<h2 className="text-lg font-semibold mb-4">Bulk Update Pricing</h2>
						<form onSubmit={handleBulkPricingSubmit} className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Price Field</label>
								<SearchableSelect
									options={[
										{ value: 'costPrice', label: 'Cost Price' },
										{ value: 'sellingPrice', label: 'Selling Price' },
										{ value: 'wholesalePrice', label: 'Wholesale Price' },
										{ value: 'bulkPrice', label: 'Bulk Price' }
									]}
									value={bulkPriceField}
									onChange={(value) => setBulkPriceField(value as any)}
									placeholder="Select Price Field"
									isClearable={false}
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">Operation</label>
								<SearchableSelect
									options={[
										{ value: 'set', label: 'Set to Amount' },
										{ value: 'increase_fixed', label: 'Increase by Fixed Amount' },
										{ value: 'increase_percentage', label: 'Increase by Percentage' }
									]}
									value={bulkOperation}
									onChange={(value) => setBulkOperation(value as any)}
									placeholder="Select Operation"
									isClearable={false}
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									{bulkOperation === 'increase_percentage' ? 'Percentage (%)' : 'Amount'}
								</label>
								<input
									type="number"
									step="0.01"
									className="w-full px-3 py-2 border border-gray-300 rounded"
									value={bulkValue}
									onChange={(e) => setBulkValue(e.target.value)}
									placeholder={bulkOperation === 'increase_percentage' ? 'e.g., 10 (for 10%)' : 'e.g., 50.00'}
									required
								/>
							</div>

							<div className="bg-blue-50 border border-blue-200 rounded p-3">
								<p className="text-sm text-blue-800">
									<strong>Preview:</strong> This will update <strong>{selectedBatches.length} batch(es)</strong>
									{bulkOperation === 'set' && ` to ${bulkValue}`}
									{bulkOperation === 'increase_fixed' && ` by adding +${bulkValue}`}
									{bulkOperation === 'increase_percentage' && ` by increasing ${bulkValue}%`}
								</p>
							</div>

							<div className="flex justify-end gap-3 pt-4 border-t">
								<button type="button" className="btn-secondary" onClick={() => setShowBulkPricingModal(false)}>Cancel</button>
								<button type="submit" className="btn-primary">Apply to {selectedBatches.length} Batches</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
