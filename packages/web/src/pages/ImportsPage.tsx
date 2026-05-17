import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { importsApi } from '../api/client';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import { formatQuantity } from '../utils/quantity';

const ENTITY_OPTIONS = [
	{ value: 'grn', label: 'GRNs' },
	{ value: 'prn', label: 'PRNs' },
	{ value: 'product', label: 'Products' },
	{ value: 'inventory', label: 'Inventory' },
	{ value: 'supplier', label: 'Suppliers' },
];

const RECORD_STATUS_OPTIONS = [
	{ value: '', label: 'All records' },
	{ value: 'Pending', label: 'Pending' },
	{ value: 'Approved', label: 'Approved' },
	{ value: 'Rejected', label: 'Rejected' },
	{ value: 'Failed', label: 'Failed' },
	{ value: 'Omitted', label: 'Omitted' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function asArray(value: any) {
	return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function asRelatedRecords(value: any) {
	return Array.isArray(value) ? value : [];
}

function formatDateTime(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function formatConfidence(value?: number | null) {
	if (typeof value !== 'number' || Number.isNaN(value)) return '—';
	return `${Math.round(value * 100)}%`;
}

function capitalize(value: string) {
	return value
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/_/g, ' ')
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusTone(status?: string) {
	switch (status) {
		case 'Processing':
		case 'Pending':
			return 'bg-blue-50 text-blue-700 border-blue-200';
		case 'Ready':
			return 'bg-amber-50 text-amber-700 border-amber-200';
		case 'Approved':
			return 'bg-emerald-50 text-emerald-700 border-emerald-200';
		case 'PartiallyApproved':
			return 'bg-indigo-50 text-indigo-700 border-indigo-200';
		case 'Rejected':
			return 'bg-gray-100 text-gray-700 border-gray-200';
		case 'Failed':
			return 'bg-red-50 text-red-700 border-red-200';
		case 'Omitted':
			return 'bg-slate-100 text-slate-700 border-slate-200';
		default:
			return 'bg-gray-100 text-gray-700 border-gray-200';
	}
}

function Badge({ value }: { value: string }) {
	return (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusTone(value)}`}>
			{capitalize(value)}
		</span>
	);
}

function RelatedStatusPill({ status }: { status: 'ready' | 'warning' | 'error' }) {
	const classes = status === 'error'
		? 'border-red-200 bg-red-50 text-red-700'
		: status === 'warning'
			? 'border-amber-200 bg-amber-50 text-amber-700'
			: 'border-emerald-200 bg-emerald-50 text-emerald-700';
	return (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${classes}`}>
			{capitalize(status)}
		</span>
	);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
			<p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
		</div>
	);
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
	return (
		<div className="rounded-lg border border-gray-200 bg-white p-3">
			<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
			<p className="mt-1 text-sm text-gray-900">{value === undefined || value === null || value === '' ? '—' : String(value)}</p>
		</div>
	);
}

function LineItemsTable({
	lines,
	quantityKey,
}: {
	lines: any[];
	quantityKey: 'expectedQuantity' | 'returnQuantity';
}) {
	if (!Array.isArray(lines) || lines.length === 0) {
		return <p className="text-sm text-gray-500">No line items were extracted for this record.</p>;
	}

	return (
		<div className="overflow-x-auto rounded-xl border border-gray-200">
			<table className="min-w-full divide-y divide-gray-200 text-sm">
				<thead className="bg-gray-50">
					<tr>
						<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">SKU</th>
						<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Variant</th>
						<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Batch</th>
						<th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-100 bg-white">
					{lines.map((line, index) => (
						<tr key={index}>
							<td className="px-4 py-3 text-gray-900">{line.skuCode ?? line.skuName ?? '—'}</td>
							<td className="px-4 py-3 text-gray-700">{line.variantCode ?? line.variantName ?? '—'}</td>
							<td className="px-4 py-3 text-gray-700">{line.batchNumber ?? '—'}</td>
							<td className="px-4 py-3 text-right font-medium text-gray-900">{formatQuantity(line[quantityKey], '—')}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function RecordDetail({ record }: { record: any | null }) {
	if (!record) {
		return (
			<div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
				Select a preview record to inspect its extracted fields and related database effects.
			</div>
		);
	}

	const warnings = asArray(record.warnings);
	const errors = asArray(record.errors);
	const relatedRecords = asRelatedRecords(record.relatedRecords);
	const payload = record.payload ?? {};
	const extracted = payload.extracted ?? {};
	const entityType = payload.entityType ?? record.recordType;

	return (
		<div className="space-y-4">
			<div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{capitalize(entityType)} Preview</p>
						<h3 className="mt-1 text-lg font-semibold text-gray-900">{record.summary || 'Imported record'}</h3>
					</div>
					<div className="flex items-center gap-2">
						<Badge value={record.recordStatus} />
						{record.isSelected ? (
							<span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
								Selected
							</span>
						) : (
							<span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
								Omitted
							</span>
						)}
					</div>
				</div>
				<div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
					<DetailField label="Source Index" value={record.sourceIndex + 1} />
					<DetailField label="Confidence" value={formatConfidence(record.confidence)} />
					<DetailField label="Result Entity" value={record.resultEntityType ? `${record.resultEntityType} · ${record.resultEntityId ?? ''}` : 'Not applied yet'} />
					<DetailField label="Applied At" value={record.appliedAt ? formatDateTime(record.appliedAt) : '—'} />
				</div>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
				<div className="flex items-center justify-between gap-3">
					<h4 className="text-sm font-semibold text-gray-900">Extracted Data</h4>
					<p className="text-xs text-gray-500">Mapped from the uploaded document before approval.</p>
				</div>
				<div className="mt-4 space-y-4">
					{entityType === 'supplier' && (
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
							<DetailField label="Name" value={extracted.name} />
							<DetailField label="Email" value={extracted.contactEmail} />
							<DetailField label="Phone" value={extracted.contactPhone} />
							<DetailField label="Type" value={extracted.type} />
							<DetailField label="Tax ID" value={extracted.taxId} />
							<DetailField label="Payment Terms" value={extracted.paymentTerms} />
							<DetailField label="Website" value={extracted.website} />
							<DetailField label="Address" value={extracted.address} />
							<DetailField label="Notes" value={extracted.notes} />
						</div>
					)}
					{entityType === 'product' && (
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
							<DetailField label="SKU Code" value={extracted.skuCode ?? payload.finalData?.skuCode} />
							<DetailField label="Name" value={extracted.name} />
							<DetailField label="Vendor" value={extracted.vendorName} />
							<DetailField label="Category" value={extracted.categoryName} />
							<DetailField label="Unit" value={extracted.unitOfMeasure ?? payload.finalData?.unitOfMeasure} />
							<DetailField label="Cost Price" value={extracted.costPrice} />
							<DetailField label="Selling Price" value={extracted.sellingPrice} />
							<DetailField label="Wholesale Price" value={extracted.wholesalePrice} />
							<DetailField label="Bulk Price" value={extracted.bulkPrice} />
							<DetailField label="Low Stock Threshold" value={extracted.lowStockThreshold} />
							<DetailField label="Manufacturing Date" value={extracted.defaultManufacturingDate} />
							<DetailField label="Expiry Date" value={extracted.defaultExpiryDate} />
							<DetailField label="Description" value={extracted.description} />
						</div>
					)}
					{entityType === 'inventory' && (
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
							<DetailField label="SKU" value={extracted.skuCode ?? extracted.skuName} />
							<DetailField label="Variant" value={extracted.variantCode ?? extracted.variantName} />
							<DetailField label="Batch" value={extracted.batchNumber} />
							<DetailField label="Quantity" value={formatQuantity(extracted.quantity, '—')} />
							<DetailField label="State" value={extracted.state ?? payload.finalData?.state} />
							<DetailField label="Branch" value={extracted.branchCode ?? extracted.branchName} />
							<DetailField label="Floor" value={extracted.floorCode ?? extracted.floorName} />
							<DetailField label="Shelf" value={extracted.shelfCode ?? extracted.shelfName} />
							<DetailField label="Box" value={extracted.boxCode ?? extracted.boxName} />
							<DetailField label="Terminal" value={extracted.terminalId} />
							<DetailField label="Notes" value={extracted.notes} />
						</div>
					)}
					{entityType === 'grn' && (
						<>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
								<DetailField label="Supplier" value={extracted.supplierName} />
								<DetailField label="Invoice Reference" value={extracted.invoiceReference} />
								<DetailField label="Supplier Invoice Date" value={extracted.supplierInvoiceDate} />
								<DetailField label="Expected Delivery" value={extracted.expectedDeliveryDate} />
								<DetailField label="Branch" value={extracted.branchCode ?? extracted.branchName} />
								<DetailField label="Floor" value={extracted.floorCode ?? extracted.floorName} />
								<DetailField label="Shelf" value={extracted.shelfCode ?? extracted.shelfName} />
								<DetailField label="Notes" value={extracted.notes} />
							</div>
							<div>
								<h5 className="mb-2 text-sm font-semibold text-gray-900">Line Items</h5>
								<LineItemsTable lines={extracted.lines ?? payload.lines ?? []} quantityKey="expectedQuantity" />
							</div>
						</>
					)}
					{entityType === 'prn' && (
						<>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
								<DetailField label="Supplier" value={extracted.supplierName} />
								<DetailField label="Return Reason" value={extracted.returnReason} />
								<DetailField label="Expected Pickup" value={extracted.expectedPickupDate} />
								<DetailField label="Branch" value={extracted.branchCode ?? extracted.branchName} />
								<DetailField label="Floor" value={extracted.floorCode ?? extracted.floorName} />
								<DetailField label="Shelf" value={extracted.shelfCode ?? extracted.shelfName} />
								<DetailField label="Notes" value={extracted.notes} />
							</div>
							<div>
								<h5 className="mb-2 text-sm font-semibold text-gray-900">Line Items</h5>
								<LineItemsTable lines={extracted.lines ?? payload.lines ?? []} quantityKey="returnQuantity" />
							</div>
						</>
					)}
				</div>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
				<div className="flex items-center justify-between gap-3">
					<h4 className="text-sm font-semibold text-gray-900">Related Records Affected</h4>
					<p className="text-xs text-gray-500">The downstream database entries this import will create, update, or link.</p>
				</div>
				<div className="mt-4 space-y-3">
					{relatedRecords.length === 0 ? (
						<p className="text-sm text-gray-500">No related records were calculated for this preview row.</p>
					) : (
						relatedRecords.map((item: any, index: number) => (
							<div key={`${item.table}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{capitalize(item.table)}</p>
										<p className="text-sm font-semibold text-gray-900">{item.label}</p>
									</div>
									<div className="flex items-center gap-2">
										<span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-gray-700">
											{capitalize(item.action)}
										</span>
										<RelatedStatusPill status={item.status} />
									</div>
								</div>
								{item.detail && <p className="mt-2 text-sm text-gray-600">{item.detail}</p>}
							</div>
						))
					)}
				</div>
			</div>

			{(warnings.length > 0 || errors.length > 0) && (
				<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
					<div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
						<h4 className="text-sm font-semibold text-amber-900">Warnings</h4>
						{warnings.length === 0 ? (
							<p className="mt-3 text-sm text-amber-800">No warnings on this preview record.</p>
						) : (
							<ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-900">
								{warnings.map((warning, index) => <li key={index}>{warning}</li>)}
							</ul>
						)}
					</div>
					<div className="rounded-xl border border-red-200 bg-red-50 p-5">
						<h4 className="text-sm font-semibold text-red-900">Errors</h4>
						{errors.length === 0 ? (
							<p className="mt-3 text-sm text-red-800">No blocking errors on this preview record.</p>
						) : (
							<ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-red-900">
								{errors.map((error, index) => <li key={index}>{error}</li>)}
							</ul>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export default function ImportsPage() {
	const [jobs, setJobs] = useState<any[]>([]);
	const [entityType, setEntityType] = useState('grn');
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isLoadingJobs, setIsLoadingJobs] = useState(true);
	const [currentJobId, setCurrentJobId] = useState<string>('');
	const [currentJob, setCurrentJob] = useState<any | null>(null);
	const [records, setRecords] = useState<any[]>([]);
	const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
	const [recordPage, setRecordPage] = useState(1);
	const [recordPageSize, setRecordPageSize] = useState(20);
	const [recordTotal, setRecordTotal] = useState(0);
	const [recordTotalPages, setRecordTotalPages] = useState(1);
	const [recordStatusFilter, setRecordStatusFilter] = useState('');
	const [searchInput, setSearchInput] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [isLoadingRecords, setIsLoadingRecords] = useState(false);
	const [isApplying, setIsApplying] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const loadJobs = async () => {
		setIsLoadingJobs(true);
		try {
			const response = await importsApi.list({ page: '1', pageSize: '12' });
			const items = response.data?.data?.items ?? [];
			setJobs(items);
			if (!currentJobId && items.length > 0) {
				setCurrentJobId(items[0].id);
			}
		} catch (error) {
			console.error('Failed to load import jobs', error);
		} finally {
			setIsLoadingJobs(false);
		}
	};

	const loadJob = async (jobId: string) => {
		try {
			const response = await importsApi.get(jobId);
			setCurrentJob(response.data?.data ?? null);
		} catch (error) {
			console.error('Failed to load import job', error);
		}
	};

	const loadRecords = async (jobId: string) => {
		setIsLoadingRecords(true);
		try {
			const params: Record<string, string> = {
				page: String(recordPage),
				pageSize: String(recordPageSize),
			};
			if (recordStatusFilter) params.status = recordStatusFilter;
			if (searchTerm) params.search = searchTerm;

			const response = await importsApi.listRecords(jobId, params);
			const payload = response.data?.data;
			const items = payload?.items ?? [];
			setRecords(items);
			setRecordTotal(payload?.total ?? 0);
			setRecordTotalPages(payload?.totalPages ?? 1);
		} catch (error) {
			console.error('Failed to load import preview records', error);
		} finally {
			setIsLoadingRecords(false);
		}
	};

	useEffect(() => {
		loadJobs();
	}, []);

	useEffect(() => {
		if (!currentJobId) {
			setCurrentJob(null);
			return;
		}
		loadJob(currentJobId);
	}, [currentJobId]);

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			setSearchTerm(searchInput.trim());
			setRecordPage(1);
		}, 250);
		return () => window.clearTimeout(timeout);
	}, [searchInput]);

	useEffect(() => {
		if (!currentJobId) return;
		if (currentJob?.status === 'Processing') return;
		loadRecords(currentJobId);
	}, [currentJobId, currentJob?.status, recordPage, recordPageSize, recordStatusFilter, searchTerm]);

	useEffect(() => {
		if (!currentJobId || currentJob?.status !== 'Processing') return;
		const interval = window.setInterval(() => {
			loadJob(currentJobId);
			loadJobs();
		}, 3000);
		return () => window.clearInterval(interval);
	}, [currentJobId, currentJob?.status]);

	useEffect(() => {
		if (records.length === 0) {
			setSelectedRecord(null);
			return;
		}
		if (!selectedRecord || !records.some((record) => record.id === selectedRecord.id)) {
			setSelectedRecord(records[0]);
		}
	}, [records, selectedRecord]);

	const currentWarnings = useMemo(() => asArray(currentJob?.warnings), [currentJob]);

	const handleUpload = async (event: FormEvent) => {
		event.preventDefault();
		if (!selectedFile) {
			alert('Choose a file to import first.');
			return;
		}

		setIsUploading(true);
		try {
			const formData = new FormData();
			formData.append('entityType', entityType);
			formData.append('file', selectedFile);
			const response = await importsApi.create(formData);
			const job = response.data?.data;
			setCurrentJobId(job.id);
			setCurrentJob(job);
			setRecordPage(1);
			setRecordStatusFilter('');
			setSearchInput('');
			setSearchTerm('');
			setSelectedFile(null);
			if (fileInputRef.current) fileInputRef.current.value = '';
			await loadJobs();
		} catch (error: any) {
			alert(error.response?.data?.error ?? 'Failed to start the import job.');
		} finally {
			setIsUploading(false);
		}
	};

	const refreshCurrentJob = async () => {
		if (!currentJobId) return;
		await Promise.all([loadJob(currentJobId), loadRecords(currentJobId), loadJobs()]);
	};

	const updateSelection = async (selected: boolean, recordIds?: string[]) => {
		if (!currentJobId) return;
		try {
			await importsApi.updateSelection(currentJobId, {
				selected,
				recordIds,
				search: recordIds ? undefined : searchTerm || undefined,
				status: recordIds ? undefined : recordStatusFilter || undefined,
			});
			await refreshCurrentJob();
		} catch (error: any) {
			alert(error.response?.data?.error ?? 'Failed to update selection.');
		}
	};

	const handleApprove = async () => {
		if (!currentJobId) return;
		setIsApplying(true);
		try {
			const response = await importsApi.approve(currentJobId);
			const result = response.data?.data;
			await refreshCurrentJob();
			alert(`Approved ${result?.approvedCount ?? 0} record(s). ${result?.failedCount ?? 0} record(s) failed.`);
		} catch (error: any) {
			alert(error.response?.data?.error ?? 'Failed to approve the selected records.');
		} finally {
			setIsApplying(false);
		}
	};

	const handleRejectSelected = async () => {
		if (!currentJobId) return;
		if (!window.confirm('Reject the currently selected preview records for this import job?')) return;
		setIsApplying(true);
		try {
			await importsApi.reject(currentJobId, { selectedOnly: true });
			await refreshCurrentJob();
		} catch (error: any) {
			alert(error.response?.data?.error ?? 'Failed to reject the selected records.');
		} finally {
			setIsApplying(false);
		}
	};

	const pendingPageIds = records.filter((record) => record.recordStatus === 'Pending').map((record) => record.id);

	const recordColumns = [
		{
			key: 'selected',
			header: 'Select',
			render: (row: any) => (
				<input
					type="checkbox"
					checked={Boolean(row.isSelected)}
					disabled={row.recordStatus !== 'Pending'}
					onChange={(event) => {
						event.stopPropagation();
						updateSelection(event.target.checked, [row.id]);
					}}
				/>
			),
		},
		{
			key: 'recordStatus',
			header: 'Status',
			render: (row: any) => <Badge value={row.recordStatus} />,
		},
		{
			key: 'summary',
			header: 'Summary',
			render: (row: any) => (
				<div className="flex flex-col">
					<span className="font-medium text-gray-900">{row.summary || 'Untitled import row'}</span>
					<span className="text-xs text-gray-500">{capitalize(row.recordType)}</span>
				</div>
			),
		},
		{
			key: 'confidence',
			header: 'Confidence',
			render: (row: any) => formatConfidence(row.confidence),
			align: 'right' as const,
		},
		{
			key: 'warnings',
			header: 'Warnings',
			render: (row: any) => asArray(row.warnings).length,
			align: 'right' as const,
		},
		{
			key: 'errors',
			header: 'Errors',
			render: (row: any) => asArray(row.errors).length,
			align: 'right' as const,
		},
	];

	return (
		<div className="flex flex-col gap-6">
			<div className="page-header">
				<div className="page-header-left">
					<h1 className="page-title">🧠 Import Review</h1>
					<p className="page-subtitle">Upload source documents, let Claude map them to the inventory database, then review every affected record before approval.</p>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
				<div className="space-y-6">
					<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
						<h2 className="text-lg font-semibold text-gray-900">New Import</h2>
						<p className="mt-1 text-sm text-gray-500">GRN and PRN imports are created as drafts on approval so you can keep existing submit/inspection flows unchanged.</p>
						<form className="mt-5 space-y-4" onSubmit={handleUpload}>
							<div className="form-group">
								<label className="form-label">Import Type</label>
								<select className="input-field" value={entityType} onChange={(event) => setEntityType(event.target.value)}>
									{ENTITY_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>{option.label}</option>
									))}
								</select>
							</div>
							<div className="form-group">
								<label className="form-label">Source File</label>
								<input
									ref={fileInputRef}
									className="input-field"
									type="file"
									accept=".csv,.xls,.xlsx,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt"
									onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
								/>
								<p className="text-xs text-gray-500">Supported: CSV, Excel, JSON, text, PDF, and image documents.</p>
							</div>
							<button className="btn-primary w-full" type="submit" disabled={isUploading}>
								{isUploading ? 'Uploading…' : 'Upload And Map'}
							</button>
						</form>
					</div>

					<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
						<div className="flex items-center justify-between gap-3">
							<div>
								<h2 className="text-lg font-semibold text-gray-900">Recent Jobs</h2>
								<p className="mt-1 text-sm text-gray-500">Jump between imports and resume review where you left off.</p>
							</div>
							{isLoadingJobs && <span className="text-xs text-gray-500">Refreshing…</span>}
						</div>
						<div className="mt-4 space-y-3">
							{jobs.length === 0 ? (
								<div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
									No import jobs yet.
								</div>
							) : (
								jobs.map((job) => (
									<button
										key={job.id}
										type="button"
										onClick={() => {
											setCurrentJobId(job.id);
											setRecordPage(1);
										}}
										className={`w-full rounded-xl border p-4 text-left transition-colors ${
											currentJobId === job.id
												? 'border-primary-400 bg-primary-50'
												: 'border-gray-200 bg-white hover:bg-gray-50'
										}`}
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{capitalize(job.entityType)}</p>
												<p className="mt-1 text-sm font-semibold text-gray-900">{job.filename}</p>
												<p className="mt-1 text-xs text-gray-500">{formatDateTime(job.createdAt)}</p>
											</div>
											<Badge value={job.status} />
										</div>
										<div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
											<span>{job.totalRecords ?? 0} total</span>
											<span>{job.selectedRecords ?? 0} selected</span>
											<span>{job.approvedRecords ?? 0} approved</span>
											<span>{job.rejectedRecords ?? 0} rejected</span>
										</div>
									</button>
								))
							)}
						</div>
					</div>
				</div>

				<div className="space-y-6">
					{currentJob ? (
						<>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
								<StatCard label="Status" value={capitalize(currentJob.status)} />
								<StatCard label="Total Records" value={currentJob.totalRecords ?? 0} />
								<StatCard label="Selected" value={currentJob.selectedRecords ?? 0} />
								<StatCard label="Approved" value={currentJob.approvedRecords ?? 0} />
								<StatCard label="Rejected" value={currentJob.rejectedRecords ?? 0} />
								<StatCard label="Failed" value={currentJob.failedCount ?? 0} />
							</div>

							<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{capitalize(currentJob.entityType)} Import</p>
										<h2 className="mt-1 text-xl font-semibold text-gray-900">{currentJob.filename}</h2>
										<p className="mt-2 text-sm text-gray-500">
											Created {formatDateTime(currentJob.createdAt)}
											{currentJob.metadata?.documentSummary ? ` · ${currentJob.metadata.documentSummary}` : ''}
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<Badge value={currentJob.status} />
										<button className="btn-secondary" type="button" onClick={refreshCurrentJob}>
											Refresh
										</button>
										<button
											className="btn-secondary"
											type="button"
											onClick={() => updateSelection(true)}
											disabled={currentJob.status === 'Processing'}
										>
											Select Filtered
										</button>
										<button
											className="btn-secondary"
											type="button"
											onClick={() => updateSelection(false)}
											disabled={currentJob.status === 'Processing'}
										>
											Deselect Filtered
										</button>
										<button
											className="btn-primary"
											type="button"
											onClick={handleApprove}
											disabled={isApplying || currentJob.status === 'Processing'}
										>
											{isApplying ? 'Applying…' : 'Approve Selected'}
										</button>
										<button
											className="btn-danger"
											type="button"
											onClick={handleRejectSelected}
											disabled={isApplying || currentJob.status === 'Processing' || (currentJob.selectedRecords ?? 0) === 0}
										>
											Reject Selected
										</button>
									</div>
								</div>

								{currentJob.errorMessage && (
									<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
										<strong>Import error:</strong> {currentJob.errorMessage}
									</div>
								)}

								{currentWarnings.length > 0 && (
									<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
										<p className="text-sm font-semibold text-amber-900">Import Warnings</p>
										<ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
											{currentWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
										</ul>
									</div>
								)}

								{currentJob.status === 'Processing' && (
									<div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
										Claude is still mapping this document. The page will keep polling until the preview is ready.
									</div>
								)}
							</div>

							<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
								<div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
									<div className="content-section-header">
										<div>
											<h2 className="text-base font-semibold text-gray-900">Preview Records</h2>
											<p className="mt-1 text-sm text-gray-500">Browse the mapped rows, select what to approve, and drill into each affected record.</p>
										</div>
									</div>
									<div className="filter-bar">
										<input
											className="filter-input-wide"
											type="search"
											placeholder="Search preview summaries…"
											value={searchInput}
											onChange={(event) => setSearchInput(event.target.value)}
										/>
										<select
											className="filter-select"
											value={recordStatusFilter}
											onChange={(event) => {
												setRecordStatusFilter(event.target.value);
												setRecordPage(1);
											}}
										>
											{RECORD_STATUS_OPTIONS.map((option) => (
												<option key={option.value} value={option.value}>{option.label}</option>
											))}
										</select>
										{pendingPageIds.length > 0 && (
											<>
												<button className="btn-secondary text-xs" type="button" onClick={() => updateSelection(true, pendingPageIds)}>
													Select Page
												</button>
												<button className="btn-secondary text-xs" type="button" onClick={() => updateSelection(false, pendingPageIds)}>
													Deselect Page
												</button>
											</>
										)}
									</div>
									<div className="px-0">
										<DataTable
											columns={recordColumns}
											data={records}
											isLoading={isLoadingRecords}
											emptyMessage="No preview records match the current filters."
											onRowClick={(row) => setSelectedRecord(row)}
										/>
									</div>
									{!isLoadingRecords && recordTotal > 0 && (
										<Pagination
											page={recordPage}
											totalPages={recordTotalPages}
											pageSize={recordPageSize}
											total={recordTotal}
											onPageChange={setRecordPage}
											onPageSizeChange={(value) => {
												setRecordPageSize(value);
												setRecordPage(1);
											}}
											pageSizeOptions={PAGE_SIZE_OPTIONS}
										/>
									)}
								</div>

								<RecordDetail record={selectedRecord} />
							</div>
						</>
					) : (
						<div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500 shadow-sm">
							Upload a source document or pick an existing import job to start reviewing the mapped records.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
