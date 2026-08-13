import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, attributesApi } from '../api/client';
import SearchableSelect from '../components/SearchableSelect';
import { isDesktopRuntime } from '../utils/runtime';
import { useAuthStore } from '../store/authStore';

const UNIT_TYPES = ['Weight', 'Volume', 'Length', 'Count', 'Area', 'Other'];
const ATTRIBUTE_TYPES = ['dropdown', 'text', 'numeric', 'boolean', 'color'];

const ENTITY_TYPES = [
	{ key: 'inventory', label: 'Inventory States', shortLabel: 'Inventory', icon: '📦', description: 'States for inventory records' },
	{ key: 'grn', label: 'GRN Statuses', shortLabel: 'GRN', icon: '📋', description: 'Statuses for Goods Received Notes' },
	{ key: 'damage_classification', label: 'Damage Classifications', shortLabel: 'Damage', icon: '⚠️', description: 'Damage classifications for GRN inspections' },
	{ key: 'product', label: 'Product Statuses', shortLabel: 'Product', icon: '🎵', description: 'Statuses for products/SKUs' },
	{ key: 'location', label: 'Location Statuses', shortLabel: 'Location', icon: '📍', description: 'Statuses for warehouse locations' },
	{ key: 'branch', label: 'Branch Statuses', shortLabel: 'Branch', icon: '🏪', description: 'Statuses for branches' },
	{ key: 'supplier', label: 'Supplier Statuses', shortLabel: 'Supplier', icon: '🏭', description: 'Statuses for suppliers/vendors' },
	{ key: 'vendor_type', label: 'Vendor Types', shortLabel: 'Vendor Type', icon: '🏷️', description: 'Classification types for vendors/suppliers' },
	{ key: 'stock_transfer', label: 'Transfer Statuses', shortLabel: 'Transfer', icon: '🔄', description: 'Statuses for stock transfers' },
];

// Special keys define application behaviours tied to specific statuses
// Admins can reassign which status in DB triggers each behaviour
const SPECIAL_KEYS_BY_ENTITY: Record<string, { key: string; label: string; description: string }[]> = {
	inventory: [
		{ key: 'INVENTORY_UNOPENED_BOX', label: 'Unopened Box', description: 'Items still sealed in original packaging; triggers box-open workflow' },
		{ key: 'INVENTORY_UNINSPECTED', label: 'Uninspected', description: 'Default state after box is opened — awaiting QC inspection' },
		{ key: 'INVENTORY_INSPECTED', label: 'Inspected', description: 'QC inspection completed' },
		{ key: 'INVENTORY_SHELF_READY', label: 'Shelf Ready', description: 'Ready to be placed on shelf; can trigger box-open workflow' },
		{ key: 'INVENTORY_DAMAGED', label: 'Damaged', description: 'Item marked as damaged during inspection' },
		{ key: 'INVENTORY_RETURNED', label: 'Returned', description: 'Returned from customer or sale' },
		{ key: 'INVENTORY_RESERVED', label: 'Reserved', description: 'Reserved/held for a sale or order' },
		{ key: 'INVENTORY_SOLD', label: 'Sold', description: 'Deducted from stock upon sale' },
	],
	grn: [
		{ key: 'GRN_DRAFT', label: 'Draft', description: 'GRN being prepared; can still be edited' },
		{ key: 'GRN_SUBMITTED', label: 'Submitted', description: 'GRN submitted for inspection; editing locked' },
		{ key: 'GRN_PARTIALLY_INSPECTED', label: 'Partially Inspected', description: 'Some lines inspected; GRN still open' },
		{ key: 'GRN_FULLY_INSPECTED', label: 'Fully Inspected', description: 'All lines inspected' },
		{ key: 'GRN_CLOSED', label: 'Closed', description: 'GRN finalised and closed' },
	],
	stock_transfer: [
		{ key: 'TRANSFER_DRAFT', label: 'Draft', description: 'Transfer being prepared' },
		{ key: 'TRANSFER_PENDING', label: 'Pending', description: 'Awaiting manager approval' },
		{ key: 'TRANSFER_APPROVED', label: 'Approved', description: 'Approved; ready to ship' },
		{ key: 'TRANSFER_IN_TRANSIT', label: 'In Transit', description: 'Stock in transit between locations' },
		{ key: 'TRANSFER_COMPLETED', label: 'Completed', description: 'Transfer completed; stock received' },
		{ key: 'TRANSFER_CANCELLED', label: 'Cancelled', description: 'Transfer cancelled' },
	],
	damage_classification: [
		{ key: 'DAMAGE_MINOR', label: 'Minor Damage', description: 'Minor cosmetic damage; item still usable' },
		{ key: 'DAMAGE_MAJOR', label: 'Major Damage', description: 'Significant damage affecting usability' },
		{ key: 'DAMAGE_TOTALED', label: 'Totaled', description: 'Item completely destroyed; write-off' },
	],
	vendor_type: [
		{ key: 'VENDOR_TYPE_VENDOR', label: 'Vendor', description: 'Sells goods to the business' },
		{ key: 'VENDOR_TYPE_SUPPLIER', label: 'Supplier', description: 'Supplies raw materials or wholesale goods' },
		{ key: 'VENDOR_TYPE_BOTH', label: 'Both', description: 'Functions as both vendor and supplier' },
	],
};

const defaultUnitForm = { name: '', abbreviation: '', type: 'Count', baseUnit: '', conversionFactor: '' };
const defaultStatusForm = { entityType: 'inventory', value: '', label: '', color: '#6366f1', sortOrder: '0', isDefault: false, specialKey: '' };
const defaultAttrForm = { name: '', type: 'dropdown', sortOrder: '0' };
const defaultAttrValueForm = { displayName: '', representedValue: '', sortOrder: '0' };

type Section = 'home' | 'units' | 'statuses' | 'status-detail' | 'attributes' | 'typesense' | 'inventory-control';

type InventoryControlStatus = {
	legacyQuantitySyncEnabled: boolean;
	zeroedAt: string | null;
	recordsZeroed: number;
	unitsZeroed: number;
	currentNonZeroRecords: number;
	currentQuantity: number;
};

export default function SettingsPage() {
	const navigate = useNavigate();
	const user = useAuthStore((state) => state.user);
	const [section, setSection] = useState<Section>('home');
	const [statusEntityType, setStatusEntityType] = useState<string>('inventory');

	// Units state
	const [units, setUnits] = useState<any[]>([]);
	const [unitsLoading, setUnitsLoading] = useState(false);
	const [showUnitForm, setShowUnitForm] = useState(false);
	const [editingUnit, setEditingUnit] = useState<any>(null);
	const [unitForm, setUnitForm] = useState(defaultUnitForm);

	// Statuses state
	const [statuses, setStatuses] = useState<any[]>([]);
	const [statusesLoading, setStatusesLoading] = useState(false);
	const [showStatusForm, setShowStatusForm] = useState(false);
	const [editingStatus, setEditingStatus] = useState<any>(null);
	const [statusForm, setStatusForm] = useState(defaultStatusForm);

	// Attributes state
	const [attributes, setAttributes] = useState<any[]>([]);
	const [attrsLoading, setAttrsLoading] = useState(false);
	const [showAttrForm, setShowAttrForm] = useState(false);
	const [editingAttr, setEditingAttr] = useState<any>(null);
	const [attrForm, setAttrForm] = useState(defaultAttrForm);
	const [managingValuesAttrId, setManagingValuesAttrId] = useState<string | null>(null);
	const [showValueForm, setShowValueForm] = useState(false);
	const [attrValueForm, setAttrValueForm] = useState(defaultAttrValueForm);
	// editing an existing attribute value
	const [editingValue, setEditingValue] = useState<{ attrId: string; value: any } | null>(null);
	const [editValueForm, setEditValueForm] = useState(defaultAttrValueForm);

	// All statuses (for the card-grid counts)
	const [allStatuses, setAllStatuses] = useState<any[]>([]);
	const [allStatusesLoading, setAllStatusesLoading] = useState(false);

	// Typesense state
	const [typesenseSyncing, setTypesenseSyncing] = useState(false);
	const [typesenseStatus, setTypesenseStatus] = useState<string>('');
	const [typesenseConnectionOk, setTypesenseConnectionOk] = useState<boolean | null>(null);
	const [activeJobId, setActiveJobId] = useState<string | null>(null);
	const [pollInterval, setPollInterval] = useState<number | null>(null);
	const [inventoryControl, setInventoryControl] = useState<InventoryControlStatus | null>(null);
	const [inventoryControlLoading, setInventoryControlLoading] = useState(false);
	const [zeroConfirmation, setZeroConfirmation] = useState('');
	const [zeroingInventory, setZeroingInventory] = useState(false);
	const [zeroResult, setZeroResult] = useState<string>('');

	const loadInventoryControl = async () => {
		setInventoryControlLoading(true);
		try {
			const response = await settingsApi.getInventoryControl();
			setInventoryControl(response.data.data);
		} catch (err: any) {
			setZeroResult(err.response?.data?.error ?? 'Failed to load inventory control status');
		} finally {
			setInventoryControlLoading(false);
		}
	};

	const openInventoryControl = () => {
		setSection('inventory-control');
		setZeroConfirmation('');
		setZeroResult('');
		void loadInventoryControl();
	};

	const handleZeroInventory = async () => {
		if (zeroConfirmation !== 'ZERO INVENTORY') return;
		if (!window.confirm('This will set every inventory quantity to zero and permanently stop MaxSoft from changing stock quantities. Continue?')) return;
		setZeroingInventory(true);
		setZeroResult('');
		try {
			const response = await settingsApi.zeroInventory(zeroConfirmation);
			const result = response.data.data;
			setZeroResult(`Inventory zeroed: ${result.recordsZeroed.toLocaleString()} records and ${result.unitsZeroed.toLocaleString()} units were reset.`);
			setZeroConfirmation('');
			await loadInventoryControl();
		} catch (err: any) {
			setZeroResult(err.response?.data?.error ?? 'Failed to zero inventory');
		} finally {
			setZeroingInventory(false);
		}
	};

	// ── Units ─────────────────────────────────────────────────

	const loadUnits = async () => {
		setUnitsLoading(true);
		try {
			const res = await settingsApi.listUnits();
			setUnits(res.data.data ?? []);
		} catch (err) {
			console.error('Failed to load units', err);
		} finally {
			setUnitsLoading(false);
		}
	};

	const openCreateUnit = () => {
		setEditingUnit(null);
		setUnitForm(defaultUnitForm);
		setShowUnitForm(true);
	};

	const openEditUnit = (unit: any) => {
		setEditingUnit(unit);
		setUnitForm({
			name: unit.name,
			abbreviation: unit.abbreviation,
			type: unit.type,
			baseUnit: unit.baseUnit ?? '',
			conversionFactor: unit.conversionFactor != null ? String(unit.conversionFactor) : '',
		});
		setShowUnitForm(true);
	};

	const handleUnitSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const payload = {
			...unitForm,
			conversionFactor: unitForm.conversionFactor ? parseFloat(unitForm.conversionFactor) : null,
			baseUnit: unitForm.baseUnit || null,
		};
		try {
			if (editingUnit) {
				await settingsApi.updateUnit(editingUnit.id, payload);
			} else {
				await settingsApi.createUnit(payload);
			}
			setShowUnitForm(false);
			setEditingUnit(null);
			setUnitForm(defaultUnitForm);
			await loadUnits();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to save unit');
		}
	};

	const handleDeleteUnit = async (unit: any) => {
		if (!confirm(`Delete unit "${unit.name}"?`)) return;
		try {
			await settingsApi.deleteUnit(unit.id);
			await loadUnits();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to delete unit');
		}
	};

	const groupedUnits = UNIT_TYPES.reduce<Record<string, any[]>>((acc, t) => {
		acc[t] = units.filter(u => u.type === t);
		return acc;
	}, {});

	// ── Statuses ──────────────────────────────────────────────

	const loadStatuses = async (entityType: string) => {
		setStatusesLoading(true);
		try {
			const res = await settingsApi.listStatuses(entityType);
			setStatuses(res.data.data ?? []);
		} catch (err) {
			console.error('Failed to load statuses', err);
		} finally {
			setStatusesLoading(false);
		}
	};

	const openCreateStatus = () => {
		setEditingStatus(null);
		setStatusForm({ ...defaultStatusForm, entityType: statusEntityType });
		setShowStatusForm(true);
	};

	const openEditStatus = (status: any) => {
		setEditingStatus(status);
		setStatusForm({
			entityType: status.entityType,
			value: status.value,
			label: status.label,
			color: status.color ?? '#6366f1',
			sortOrder: String(status.sortOrder),
			isDefault: status.isDefault,
			specialKey: status.specialKey ?? '',
		});
		setShowStatusForm(true);
	};

	const handleStatusSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const payload = {
			...statusForm,
			sortOrder: parseInt(statusForm.sortOrder) || 0,
			specialKey: statusForm.specialKey.trim() || null,
		};
		try {
			if (editingStatus) {
				await settingsApi.updateStatus(editingStatus.id, payload);
			} else {
				await settingsApi.createStatus(payload);
			}
			setShowStatusForm(false);
			setEditingStatus(null);
			setStatusForm({ ...defaultStatusForm, entityType: statusEntityType });
			await loadStatuses(statusEntityType);
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to save status');
		}
	};

	const handleDeleteStatus = async (status: any) => {
		if (!confirm(`Delete status "${status.label}"?`)) return;
		try {
			await settingsApi.deleteStatus(status.id);
			await loadStatuses(statusEntityType);
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to delete status');
		}
	};

	// ── Attributes ────────────────────────────────────────────

	const loadAttributes = async () => {
		setAttrsLoading(true);
		try {
			const res = await attributesApi.list();
			setAttributes(res.data.data ?? []);
		} catch { /* ignore */ }
		finally { setAttrsLoading(false); }
	};

	const handleAttrSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const payload = { ...attrForm, sortOrder: parseInt(attrForm.sortOrder) || 0 };
		try {
			if (editingAttr) {
				await attributesApi.update(editingAttr.id, payload);
			} else {
				await attributesApi.create(payload);
			}
			setShowAttrForm(false);
			setEditingAttr(null);
			setAttrForm(defaultAttrForm);
			await loadAttributes();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to save attribute');
		}
	};

	const handleDeleteAttr = async (attr: any) => {
		if (!confirm(`Delete attribute "${attr.name}"? This will fail if assigned to products.`)) return;
		try {
			await attributesApi.delete(attr.id);
			await loadAttributes();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to delete attribute');
		}
	};

	const handleAddValue = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!managingValuesAttrId) return;
		const payload = {
			displayName: attrValueForm.displayName,
			representedValue: attrValueForm.representedValue,
			sortOrder: parseInt(attrValueForm.sortOrder) || 0,
		};
		try {
			await attributesApi.addValue(managingValuesAttrId, payload);
			setShowValueForm(false);
			setAttrValueForm(defaultAttrValueForm);
			await loadAttributes();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to add value');
		}
	};

	const handleDeleteValue = async (attributeId: string, valueId: string, displayName: string) => {
		if (!confirm(`Delete value "${displayName}"?`)) return;
		try {
			await attributesApi.deleteValue(attributeId, valueId);
			await loadAttributes();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to delete value');
		}
	};

	const openEditValue = (attrId: string, val: any) => {
		setEditingValue({ attrId, value: val });
		setEditValueForm({ displayName: val.displayName, representedValue: val.representedValue, sortOrder: String(val.sortOrder ?? 0) });
		setShowValueForm(false);
	};

	const openAddValueForm = () => {
		setEditingValue(null);
		setShowValueForm(true);
		setAttrValueForm(defaultAttrValueForm);
	};

	const closeValuesModal = () => {
		setManagingValuesAttrId(null);
		setShowValueForm(false);
		setEditingValue(null);
		setAttrValueForm(defaultAttrValueForm);
		setEditValueForm(defaultAttrValueForm);
	};

	const handleUpdateValue = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingValue) return;
		const payload = {
			displayName: editValueForm.displayName,
			representedValue: editValueForm.representedValue,
			sortOrder: parseInt(editValueForm.sortOrder) || 0,
		};
		try {
			await attributesApi.updateValue(editingValue.attrId, editingValue.value.id, payload);
			setEditingValue(null);
			setEditValueForm(defaultAttrValueForm);
			await loadAttributes();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to update value');
		}
	};

	// ── All-statuses (card-grid counts) ───────────────────────

	const loadAllStatuses = async () => {
		setAllStatusesLoading(true);
		try {
			const res = await settingsApi.listStatuses();
			setAllStatuses(res.data.data ?? []);
		} catch (err) {
			console.error('Failed to load statuses', err);
		} finally {
			setAllStatusesLoading(false);
		}
	};

	// ── Typesense Sync ────────────────────────────────────────

	const testTypesenseConnection = async () => {
		try {
			await settingsApi.testTypesense();
			setTypesenseConnectionOk(true);
			setTypesenseStatus('✅ Connection successful');
		} catch (err: any) {
			setTypesenseConnectionOk(false);
			setTypesenseStatus('❌ Connection failed: ' + (err.response?.data?.error || err.message));
		}
	};

	const handleSyncTypesense = async (entity?: string, recreate?: boolean) => {
		setTypesenseSyncing(true);
		setTypesenseStatus(`Starting sync for ${entity || 'all data'}...`);
		try {
			// Start the async job
			const res = await settingsApi.syncTypesense(entity, recreate);
			const jobId = res.data.data.jobId;
			setActiveJobId(jobId);
			setTypesenseStatus('⏳ Sync job started, checking status...');
			
			// Poll for job status
			const interval = setInterval(async () => {
				try {
					const statusRes = await settingsApi.getTypesenseJob(jobId);
					const job = statusRes.data.data;
					
					if (job.status === 'running') {
						setTypesenseStatus(`⏳ ${job.progress || 'Processing...'}`);
					} else if (job.status === 'completed') {
						clearInterval(interval);
						setPollInterval(null);
						setTypesenseSyncing(false);
						setActiveJobId(null);
						
						let message = '✅ Sync completed: ';
						if (job.result) {
							if (entity) {
								message += `${job.result.synced || 0} records synced`;
							} else {
								message += `SKUs: ${job.result.skus || 0}, Inventory: ${job.result.inventory || 0}, Vendors: ${job.result.vendors || 0}`;
							}
						}
						setTypesenseStatus(message);
					} else if (job.status === 'failed') {
						clearInterval(interval);
						setPollInterval(null);
						setTypesenseSyncing(false);
						setActiveJobId(null);
						setTypesenseStatus('❌ Sync failed: ' + (job.error || 'Unknown error'));
					}
				} catch (err: any) {
					console.error('Failed to check job status', err);
				}
			}, 2000); // Poll every 2 seconds
			
			setPollInterval(interval);
		} catch (err: any) {
			setTypesenseSyncing(false);
			setTypesenseStatus('❌ Failed to start sync: ' + (err.response?.data?.error || err.message));
		}
	};

	// Cleanup polling on unmount
	useEffect(() => {
		return () => {
			if (pollInterval) {
				clearInterval(pollInterval);
			}
		};
	}, [pollInterval]);

	// ── Effects ───────────────────────────────────────────────

	useEffect(() => {
		if (section === 'units') loadUnits();
		if (section === 'statuses') loadAllStatuses();
		if (section === 'status-detail') loadStatuses(statusEntityType);
		if (section === 'attributes') loadAttributes();
		if (section === 'typesense') testTypesenseConnection();
	}, [section]);

	useEffect(() => {
		if (section === 'status-detail') loadStatuses(statusEntityType);
	}, [statusEntityType]);

	// ── Render ────────────────────────────────────────────────

	if (section === 'attributes') {
		return (
			<div className="flex flex-col gap-4">
				<div className="page-header">
					<div className="page-header-left">
						<h1 className="page-title">🧩 Product Attributes</h1>
						<p className="page-subtitle">Define global attributes and allowed values used to generate SKU variants</p>
					</div>
					<div className="flex gap-2">
						<button className="btn-secondary" onClick={() => setSection('home')}>← Settings</button>
						<button className="btn-primary" onClick={() => { setEditingAttr(null); setAttrForm(defaultAttrForm); setShowAttrForm(true); }}>+ Add Attribute</button>
					</div>
				</div>

				{showAttrForm && (
					<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAttrForm(false)}>
						<div className="modal-panel-md">
							<div className="modal-header">
								<h2 className="modal-title">{editingAttr ? '✏️ Edit Attribute' : '➕ New Attribute'}</h2>
								<button className="modal-close" onClick={() => setShowAttrForm(false)}>✕</button>
							</div>
							<form onSubmit={handleAttrSubmit}>
								<div className="modal-body form-stack">
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">Name *</label>
											<input className="input-field" type="text" required placeholder="e.g. Size, Color, Flavor" value={attrForm.name} onChange={(e) => setAttrForm(f => ({ ...f, name: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Type *</label>
											<SearchableSelect
												options={ATTRIBUTE_TYPES.map(t => ({ value: t, label: t }))}
												value={attrForm.type}
												onChange={(value) => setAttrForm(f => ({ ...f, type: value }))}
												placeholder="Select Type"
												isClearable={false}
											/>
										</div>
									</div>
									<div className="form-group">
										<label className="form-label">Sort Order</label>
										<input className="input-field" type="number" min="0" value={attrForm.sortOrder} onChange={(e) => setAttrForm(f => ({ ...f, sortOrder: e.target.value }))} />
									</div>
								</div>
								<div className="modal-footer">
									<button type="button" className="btn-secondary" onClick={() => setShowAttrForm(false)}>Cancel</button>
									<button type="submit" className="btn-primary">💾 Save Attribute</button>
								</div>
							</form>
						</div>
					</div>
				)}

				<div className="content-section">
					{attrsLoading ? (
						<div className="px-6 py-8 text-center text-gray-500">Loading…</div>
					) : attributes.length === 0 ? (
						<div className="px-6 py-12 text-center">
							<div className="text-4xl mb-3">🧩</div>
							<p className="text-gray-500">No attributes yet. Create your first attribute to start generating variants.</p>
						</div>
					) : (
						<div className="divide-y divide-gray-100">
							{attributes.map((attr: any) => (
								<div key={attr.id} className="flex items-center justify-between px-6 py-4">
									<div className="flex items-center gap-3">
										<div>
											<span className="font-semibold text-gray-800">{attr.name}</span>
											<span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{attr.type}</span>
										</div>
										{attr.type === 'color' && (attr.values ?? []).length > 0 && (
											<div className="flex items-center gap-1 ml-1">
												{(attr.values ?? []).slice(0, 6).map((val: any) => (
													<span
														key={val.id}
														className="inline-block w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
														style={{ background: val.representedValue }}
														title={val.displayName}
													/>
												))}
												{(attr.values ?? []).length > 6 && (
													<span className="text-xs text-gray-400">+{(attr.values ?? []).length - 6}</span>
												)}
											</div>
										)}
									</div>
									<div className="flex items-center gap-2">
										<button
											className="btn-sm text-indigo-600 font-medium"
											onClick={() => { setManagingValuesAttrId(attr.id); setShowValueForm(false); setEditingValue(null); }}
										>
											🏷️ Values ({attr.values?.length ?? 0})
										</button>
										<button className="btn-sm" onClick={() => { setEditingAttr(attr); setAttrForm({ name: attr.name, type: attr.type, sortOrder: String(attr.sortOrder ?? 0) }); setShowAttrForm(true); }}>Edit</button>
										<button className="btn-sm text-red-600" onClick={() => handleDeleteAttr(attr)}>Delete</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Values management modal */}
				{managingValuesAttrId && (() => {
					const attr = attributes.find((a: any) => a.id === managingValuesAttrId);
					if (!attr) return null;
					return (
						<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeValuesModal()}>
							<div className="modal-panel-md" style={{ maxWidth: '560px' }}>
								<div className="modal-header">
									<div className="flex items-center gap-2">
										<h2 className="modal-title">🏷️ {attr.name} Values</h2>
										<span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{attr.type}</span>
									</div>
									<button className="modal-close" onClick={closeValuesModal}>✕</button>
								</div>
								<div className="modal-body">
									{(attr.values ?? []).length === 0 && !showValueForm && (
										<div className="text-center py-6 text-gray-400 text-sm">No values yet. Add the first value below.</div>
									)}
									<div className="flex flex-col gap-1 mb-3">
										{(attr.values ?? []).map((val: any) => (
											<div key={val.id}>
												{editingValue?.value.id === val.id ? (
													<form onSubmit={handleUpdateValue} className="flex gap-2 py-2 border-b border-gray-100 items-center">
														<div className="flex-1">
															<input
																className="input-field w-full"
																type="text"
																required
																placeholder="Display name"
																value={editValueForm.displayName}
																onChange={(e) => setEditValueForm(f => ({ ...f, displayName: e.target.value }))}
															/>
														</div>
														<div className="flex-1">
															{attr.type === 'color' ? (
																<div className="flex gap-1">
																	<input
																		type="color"
																		className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
																		value={editValueForm.representedValue || '#000000'}
																		onChange={(e) => setEditValueForm(f => ({ ...f, representedValue: e.target.value }))}
																	/>
																	<input
																		className="input-field flex-1"
																		type="text"
																		required
																		placeholder="#hex"
																		value={editValueForm.representedValue}
																		onChange={(e) => setEditValueForm(f => ({ ...f, representedValue: e.target.value }))}
																	/>
																</div>
															) : (
																<input
																	className="input-field w-full"
																	type="text"
																	required
																	placeholder="Value"
																	value={editValueForm.representedValue}
																	onChange={(e) => setEditValueForm(f => ({ ...f, representedValue: e.target.value }))}
																/>
															)}
														</div>
														<input className="input-field" style={{ width: '72px' }} type="number" min="0" placeholder="Order" value={editValueForm.sortOrder} onChange={(e) => setEditValueForm(f => ({ ...f, sortOrder: e.target.value }))} />
														<button type="submit" className="btn-primary text-sm">💾</button>
														<button type="button" className="btn-secondary text-sm" onClick={() => setEditingValue(null)}>✕</button>
													</form>
												) : (
													<div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
														<div className="flex items-center gap-2">
															{attr.type === 'color' && (
																<span
																	className="inline-block w-6 h-6 rounded-full border border-gray-300 flex-shrink-0"
																	style={{ background: val.representedValue }}
																/>
															)}
															<span className="text-sm font-medium text-gray-800">{val.displayName}</span>
															<span className="text-xs text-gray-400 font-mono">{val.representedValue}</span>
														</div>
														<div className="flex gap-2">
															<button className="btn-sm text-xs" onClick={() => openEditValue(attr.id, val)}>Edit</button>
															<button className="btn-sm text-red-500 text-xs" onClick={() => handleDeleteValue(attr.id, val.id, val.displayName)}>Remove</button>
														</div>
													</div>
												)}
											</div>
										))}
									</div>

									{showValueForm ? (
										<form onSubmit={handleAddValue} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
											<p className="text-xs font-semibold text-gray-600 mb-2">New Value</p>
											<div className="flex gap-2">
												<div className="flex-1">
													<input
														className="input-field w-full"
														type="text"
														required
														placeholder={attr.type === 'color' ? 'e.g. Crimson Red' : 'Display name'}
														value={attrValueForm.displayName}
														onChange={(e) => setAttrValueForm(f => ({ ...f, displayName: e.target.value }))}
													/>
												</div>
												<div className="flex-1">
													{attr.type === 'color' ? (
														<div className="flex gap-1">
															<input
																type="color"
																className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
																value={attrValueForm.representedValue || '#000000'}
																onChange={(e) => setAttrValueForm(f => ({ ...f, representedValue: e.target.value }))}
															/>
															<input
																className="input-field flex-1"
																type="text"
																required
																placeholder="#hex"
																value={attrValueForm.representedValue}
																onChange={(e) => setAttrValueForm(f => ({ ...f, representedValue: e.target.value }))}
															/>
														</div>
													) : (
														<input
															className="input-field w-full"
															type="text"
															required
															placeholder={attr.type === 'numeric' ? 'e.g. 12' : attr.type === 'boolean' ? 'true / false' : 'e.g. S, M, L'}
															value={attrValueForm.representedValue}
															onChange={(e) => setAttrValueForm(f => ({ ...f, representedValue: e.target.value }))}
														/>
													)}
												</div>
												<input className="input-field" style={{ width: '72px' }} type="number" min="0" placeholder="Order" value={attrValueForm.sortOrder} onChange={(e) => setAttrValueForm(f => ({ ...f, sortOrder: e.target.value }))} />
												<button type="submit" className="btn-primary text-sm">Add</button>
												<button type="button" className="btn-secondary text-sm" onClick={() => setShowValueForm(false)}>✕</button>
											</div>
										</form>
									) : (
										<button className="btn-sm self-start" onClick={openAddValueForm}>+ Add Value</button>
									)}
								</div>
								<div className="modal-footer">
									<button className="btn-secondary" onClick={closeValuesModal}>Close</button>
								</div>
							</div>
						</div>
					);
				})()}
			</div>
		);
	}

	if (section === 'units') {
		return (
			<div className="flex flex-col gap-4">
				<div className="page-header">
					<div className="page-header-left">
						<h1 className="page-title">📏 Units of Measure</h1>
						<p className="page-subtitle">Define custom units. System units cannot be modified.</p>
					</div>
					<div className="flex gap-2">
						<button className="btn-secondary" onClick={() => setSection('home')}>← Settings</button>
						<button className="btn-primary" onClick={openCreateUnit}>+ Add Unit</button>
					</div>
				</div>

				{showUnitForm && (
					<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowUnitForm(false)}>
						<div className="modal-panel-md">
							<div className="modal-header">
								<h2 className="modal-title">{editingUnit ? '✏️ Edit Unit' : '➕ New Unit of Measure'}</h2>
								<button className="modal-close" onClick={() => setShowUnitForm(false)}>✕</button>
							</div>
							<form onSubmit={handleUnitSubmit}>
								<div className="modal-body form-stack">
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">Name *</label>
											<input className="input-field" type="text" required placeholder="e.g. Kilogram" value={unitForm.name} onChange={(e) => setUnitForm(f => ({ ...f, name: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Abbreviation *</label>
											<input className="input-field" type="text" required placeholder="e.g. kg" value={unitForm.abbreviation} onChange={(e) => setUnitForm(f => ({ ...f, abbreviation: e.target.value }))} />
										</div>
									</div>
									<div className="form-grid-3">
										<div className="form-group">
											<label className="form-label">Type *</label>
											<SearchableSelect
												options={UNIT_TYPES.map(t => ({ value: t, label: t }))}
												value={unitForm.type}
												onChange={(value) => setUnitForm(f => ({ ...f, type: value }))}
												placeholder="Select Type"
												isClearable={false}
											/>
										</div>
										<div className="form-group">
											<label className="form-label">Base Unit</label>
											<input className="input-field" type="text" placeholder="e.g. gram" value={unitForm.baseUnit} onChange={(e) => setUnitForm(f => ({ ...f, baseUnit: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Conversion Factor</label>
											<input className="input-field" type="number" placeholder="e.g. 1000" value={unitForm.conversionFactor} onChange={(e) => setUnitForm(f => ({ ...f, conversionFactor: e.target.value }))} />
										</div>
									</div>
								</div>
								<div className="modal-footer">
									<button type="button" className="btn-secondary" onClick={() => setShowUnitForm(false)}>Cancel</button>
									<button type="submit" className="btn-primary">{editingUnit ? '💾 Update Unit' : '➕ Create Unit'}</button>
								</div>
							</form>
						</div>
					</div>
				)}

				<div className="content-section">
					{unitsLoading ? (
						<div className="px-6 py-8 text-center text-gray-500">Loading...</div>
					) : (
						<div className="flex flex-col gap-4 p-4">
							{UNIT_TYPES.map(type => {
								const items = groupedUnits[type];
								if (!items || items.length === 0) return null;
								return (
									<div key={type}>
										<h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-2">{type}</h3>
										<div className="table-scroll-region overflow-x-auto">
											<table className="w-full border-collapse text-sm">
												<thead>
													<tr className="bg-gray-50">
														<th className="table-sticky-cell table-sticky-cell--header bg-gray-50 px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">Actions</th>
														{['Name', 'Abbreviation', 'Base Unit', 'Conversion Factor', 'Status'].map(h => (
															<th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{h}</th>
														))}
													</tr>
												</thead>
												<tbody>
													{items.map((unit: any) => (
														<tr key={unit.id} className="group border-b border-gray-100 hover:bg-gray-50">
															<td className="table-sticky-cell px-4 py-2 bg-white group-hover:bg-gray-50">
																{!unit.isSystem && (
																	<div className="flex gap-2">
																		<button className="btn-sm" onClick={() => openEditUnit(unit)}>Edit</button>
																		<button className="btn-sm text-red-600" onClick={() => handleDeleteUnit(unit)}>Delete</button>
																	</div>
																)}
															</td>
															<td className="px-4 py-2 font-medium">{unit.name}</td>
															<td className="px-4 py-2 text-gray-500">{unit.abbreviation}</td>
															<td className="px-4 py-2 text-gray-500">{unit.baseUnit ?? '—'}</td>
															<td className="px-4 py-2 text-gray-500">{unit.conversionFactor ?? '—'}</td>
															<td className="px-4 py-2">
																{unit.isSystem
																	? <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">System</span>
																	: unit.isActive
																		? <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
																		: <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Inactive</span>}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</div>
								);
							})}
							{units.length === 0 && (
								<div className="px-4 py-8 text-center text-gray-400">No units configured. Click "+ Add Unit" to get started.</div>
							)}
						</div>
					)}
				</div>
			</div>
		);
	}

	if (section === 'statuses') {
		return (
			<div className="flex flex-col gap-4">
				<div className="page-header">
					<div className="page-header-left">
						<h1 className="page-title">🏷️ Status Management</h1>
						<p className="page-subtitle">Select an entity type to manage its status options</p>
					</div>
					<button className="btn-secondary" onClick={() => setSection('home')}>← Settings</button>
				</div>

				{allStatusesLoading ? (
					<div className="px-6 py-8 text-center text-gray-500">Loading…</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{ENTITY_TYPES.map(et => {
							const count = allStatuses.filter((s: any) => s.entityType === et.key).length;
							return (
								<button
									key={et.key}
									className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer"
									onClick={() => { setStatusEntityType(et.key); setSection('status-detail'); }}
								>
									<div className="flex items-start gap-4">
										<div className="text-4xl">{et.icon}</div>
										<div>
											<h2 className="font-semibold text-gray-800 text-lg">{et.label}</h2>
											<p className="text-sm text-gray-500 mt-1">{et.description}</p>
											<span className="inline-block mt-2 text-xs text-gray-400">{count} status{count !== 1 ? 'es' : ''} configured</span>
											<span className="block mt-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full w-fit">Manage →</span>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		);
	}

	if (section === 'status-detail') {
		const entityInfo = ENTITY_TYPES.find(e => e.key === statusEntityType);
		return (
			<div className="flex flex-col gap-4">
				<div className="page-header">
					<div className="page-header-left">
						<h1 className="page-title">{entityInfo?.icon} {entityInfo?.label}</h1>
						<p className="page-subtitle">{entityInfo?.description}</p>
					</div>
					<div className="flex gap-2">
						<button className="btn-secondary" onClick={() => setSection('statuses')}>← Statuses</button>
						<button className="btn-primary" onClick={openCreateStatus}>+ Add Status</button>
					</div>
				</div>

				{showStatusForm && (
					<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowStatusForm(false)}>
						<div className="modal-panel-md">
							<div className="modal-header">
								<h2 className="modal-title">{editingStatus ? '✏️ Edit Status' : '➕ New Status Option'}</h2>
								<button className="modal-close" onClick={() => setShowStatusForm(false)}>✕</button>
							</div>
							<form onSubmit={handleStatusSubmit}>
								<div className="modal-body form-stack">
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">Value (code) *</label>
											<input className="input-field font-mono" type="text" required placeholder="e.g. InStock" value={statusForm.value} disabled={!!editingStatus} onChange={(e) => setStatusForm(f => ({ ...f, value: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Label (display) *</label>
											<input className="input-field" type="text" required placeholder="e.g. In Stock" value={statusForm.label} onChange={(e) => setStatusForm(f => ({ ...f, label: e.target.value }))} />
										</div>
									</div>
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">Color</label>
											<div className="flex gap-2 items-center">
												<input type="color" className="h-9 w-16 rounded border border-gray-300 cursor-pointer" value={statusForm.color} onChange={(e) => setStatusForm(f => ({ ...f, color: e.target.value }))} />
												<input className="input-field flex-1" type="text" placeholder="#6366f1" value={statusForm.color} onChange={(e) => setStatusForm(f => ({ ...f, color: e.target.value }))} />
											</div>
										</div>
										<div className="form-group">
											<label className="form-label">Sort Order</label>
											<input className="input-field" type="number" min="0" value={statusForm.sortOrder} onChange={(e) => setStatusForm(f => ({ ...f, sortOrder: e.target.value }))} />
										</div>
									</div>
									{(SPECIAL_KEYS_BY_ENTITY[statusForm.entityType] ?? []).length > 0 && (
										<div className="form-group">
											<label className="form-label">
												Application Behaviour
												<span className="ml-1 text-xs text-gray-400 font-normal">(assign a special role to this status)</span>
											</label>
											<SearchableSelect
												options={[
													{ value: '', label: '— No special behaviour —' },
													...(SPECIAL_KEYS_BY_ENTITY[statusForm.entityType] ?? []).map(sk => {
														const takenBy = statuses.find((s: any) => s.specialKey === sk.key && s.id !== editingStatus?.id);
														return {
															value: sk.key,
															label: `${sk.label}${takenBy ? ` (used by "${takenBy.label}")` : ''}`
														};
													})
												]}
												value={statusForm.specialKey}
												onChange={(value) => setStatusForm(f => ({ ...f, specialKey: value }))}
												placeholder="No special behaviour"
												isClearable={false}
											/>
											{statusForm.specialKey && (
												<p className="text-xs text-indigo-600 mt-1">
													ℹ️ {(SPECIAL_KEYS_BY_ENTITY[statusForm.entityType] ?? []).find(sk => sk.key === statusForm.specialKey)?.description}
												</p>
											)}
										</div>
									)}
									<label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
										<input type="checkbox" checked={statusForm.isDefault} onChange={(e) => setStatusForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
										Set as default status for this type
									</label>
								</div>
								<div className="modal-footer">
									<button type="button" className="btn-secondary" onClick={() => setShowStatusForm(false)}>Cancel</button>
									<button type="submit" className="btn-primary">{editingStatus ? '💾 Update Status' : '➕ Create Status'}</button>
								</div>
							</form>
						</div>
					</div>
				)}

				<div className="content-section">
					{statusesLoading ? (
						<div className="px-6 py-8 text-center text-gray-500">Loading...</div>
					) : (
						<div className="table-scroll-region overflow-x-auto">
							<table className="w-full border-collapse text-sm">
								<thead>
									<tr className="bg-gray-50">
										<th className="table-sticky-cell table-sticky-cell--header bg-gray-50 px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">Actions</th>
										{['Color', 'Value', 'Label', 'Behaviour', 'Order', 'Default', 'System'].map(h => (
											<th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{h}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{statuses.map((status: any) => (
										<tr key={status.id} className="group border-b border-gray-100 hover:bg-gray-50">
											<td className="table-sticky-cell px-4 py-2 bg-white group-hover:bg-gray-50">
												<div className="flex gap-2">
													<button className="btn-sm" onClick={() => openEditStatus(status)}>Edit</button>
													<button className="btn-sm text-red-600" onClick={() => handleDeleteStatus(status)}>Delete</button>
												</div>
											</td>
											<td className="px-4 py-2">
												<span className="inline-block w-5 h-5 rounded-full border border-gray-200" style={{ background: status.color ?? '#6366f1' }} />
											</td>
											<td className="px-4 py-2 font-mono text-xs text-gray-600">{status.value}</td>
											<td className="px-4 py-2 font-medium">{status.label}</td>
											<td className="px-4 py-2">
												{status.specialKey ? (
													<span className="text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
														{status.specialKey}
													</span>
												) : (
													<span className="text-xs text-gray-400">—</span>
												)}
											</td>
											<td className="px-4 py-2 text-gray-500">{status.sortOrder}</td>
											<td className="px-4 py-2">{status.isDefault && <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Default</span>}</td>
											<td className="px-4 py-2">{status.isSystem && <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">System</span>}</td>
										</tr>
									))}
									{statuses.length === 0 && (
										<tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No status options configured for this type. Click "+ Add Status" to add one.</td></tr>
									)}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		);
	}

	if (section === 'inventory-control') {
		return (
			<div className="flex flex-col gap-4">
				<div className="page-header">
					<div className="page-header-left">
						<h1 className="page-title">Inventory Control</h1>
						<p className="page-subtitle">Reset the stock baseline and protect it from legacy quantity snapshots.</p>
					</div>
					<button className="btn-secondary" onClick={() => setSection('home')}>← Settings</button>
				</div>

				<div className="content-section p-6 space-y-6">
					{inventoryControlLoading && <p className="text-sm text-gray-500">Loading inventory status…</p>}
					{inventoryControl && (
						<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
							<div className="rounded-lg border border-gray-200 p-4">
								<div className="text-xs text-gray-500">Current quantity</div>
								<div className="text-2xl font-semibold mt-1">{inventoryControl.currentQuantity.toLocaleString()}</div>
								<div className="text-xs text-gray-500 mt-1">{inventoryControl.currentNonZeroRecords.toLocaleString()} non-zero records</div>
							</div>
							<div className="rounded-lg border border-gray-200 p-4">
								<div className="text-xs text-gray-500">MaxSoft quantities</div>
								<div className={`text-lg font-semibold mt-1 ${inventoryControl.legacyQuantitySyncEnabled ? 'text-amber-700' : 'text-green-700'}`}>
									{inventoryControl.legacyQuantitySyncEnabled ? 'Still enabled' : 'Permanently blocked'}
								</div>
								<div className="text-xs text-gray-500 mt-1">Catalog and historical data still synchronize</div>
							</div>
							<div className="rounded-lg border border-gray-200 p-4">
								<div className="text-xs text-gray-500">Last zeroed</div>
								<div className="text-sm font-medium mt-2">{inventoryControl.zeroedAt ? new Date(inventoryControl.zeroedAt).toLocaleString() : 'Never'}</div>
								{inventoryControl.zeroedAt && <div className="text-xs text-gray-500 mt-1">{inventoryControl.recordsZeroed.toLocaleString()} records reset</div>}
							</div>
						</div>
					)}

					<div className="rounded-lg border border-red-200 bg-red-50 p-5">
						<h2 className="text-lg font-semibold text-red-900">Zero all inventory</h2>
						<p className="text-sm text-red-800 mt-2">
							Every inventory record will be set to zero. Open GRNs and product records are not deleted. Afterward, only native transactions such as GRNs, PRNs, transfers, sales, returns, and manual adjustments can change stock.
						</p>
						<p className="text-sm font-medium text-red-900 mt-4">Type <span className="font-mono">ZERO INVENTORY</span> to confirm.</p>
						<input
							className="form-input mt-2 max-w-md"
							value={zeroConfirmation}
							onChange={(event) => setZeroConfirmation(event.target.value)}
							placeholder="ZERO INVENTORY"
							autoComplete="off"
						/>
						<div className="mt-3">
							<button
								className="btn-primary !bg-red-600 hover:!bg-red-700"
								disabled={zeroConfirmation !== 'ZERO INVENTORY' || zeroingInventory}
								onClick={handleZeroInventory}
							>
								{zeroingInventory ? 'Zeroing inventory…' : 'Zero Inventory'}
							</button>
						</div>
						{zeroResult && <p className="text-sm mt-3 text-gray-800">{zeroResult}</p>}
					</div>
				</div>
			</div>
		);
	}

	if (section === 'typesense') {
		return (
			<div className="flex flex-col gap-4">
				<div className="page-header">
					<div className="page-header-left">
						<h1 className="page-title">🔍 Typesense Index Export</h1>
						<p className="page-subtitle">Export catalog data to external Typesense collections</p>
					</div>
					<div className="flex gap-2">
						<button className="btn-secondary" onClick={() => setSection('home')}>← Settings</button>
					</div>
				</div>

				<div className="content-section">
					<div className="p-6 space-y-6">
						<div>
							<h2 className="text-lg font-semibold text-gray-800 mb-2">Connection Status</h2>
							<p className="text-sm text-gray-500 mb-4">Test connection to Typesense server</p>
							<button
								className="btn-primary"
								onClick={testTypesenseConnection}
								disabled={typesenseSyncing}
							>
								Test Connection
							</button>
							{typesenseConnectionOk !== null && (
								<div className={`mt-3 p-3 rounded-md ${typesenseConnectionOk ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
									{typesenseConnectionOk ? '✅ Connected successfully' : '❌ Connection failed'}
								</div>
							)}
						</div>

						<hr className="border-gray-200" />

						<div>
							<h2 className="text-lg font-semibold text-gray-800 mb-2">Sync Data</h2>
							<p className="text-sm text-gray-500 mb-4">
								Synchronize catalog data to external Typesense collections. Use "Sync All" to sync everything, or choose individual collections.
							</p>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<button
									className="btn-primary flex items-center justify-center gap-2"
									onClick={() => handleSyncTypesense()}
									disabled={typesenseSyncing}
								>
									<span>🔄</span>
									<span>Sync All</span>
								</button>
								<button
									className="btn-secondary flex items-center justify-center gap-2"
									onClick={() => handleSyncTypesense(undefined, true)}
									disabled={typesenseSyncing}
								>
									<span>♻️</span>
									<span>Recreate & Sync All</span>
								</button>
								<button
									className="btn-secondary flex items-center justify-center gap-2"
									onClick={() => handleSyncTypesense('skus')}
									disabled={typesenseSyncing}
								>
									<span>📦</span>
									<span>Sync SKUs Only</span>
								</button>
								<button
									className="btn-secondary flex items-center justify-center gap-2"
									onClick={() => handleSyncTypesense('inventory')}
									disabled={typesenseSyncing}
								>
									<span>📊</span>
									<span>Sync Inventory Only</span>
								</button>
								<button
									className="btn-secondary flex items-center justify-center gap-2"
									onClick={() => handleSyncTypesense('vendors')}
									disabled={typesenseSyncing}
								>
									<span>🏭</span>
									<span>Sync Vendors Only</span>
								</button>
							</div>

							{typesenseStatus && (
								<div className="mt-4 p-4 rounded-md bg-blue-50 text-blue-900">
									<p className="text-sm">{typesenseStatus}</p>
								</div>
							)}

							{typesenseSyncing && (
								<div className="mt-4 flex items-center gap-3">
									<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
									<span className="text-sm text-gray-600">Syncing in progress...</span>
								</div>
							)}
						</div>

						<hr className="border-gray-200" />

						<div>
							<h2 className="text-lg font-semibold text-gray-800 mb-2">About</h2>
							<div className="text-sm text-gray-600 space-y-2">
								<p><strong>Server:</strong> typesense.artslabcreatives.com</p>
								<p><strong>Collections:</strong> skus, inventory, vendors</p>
								<p><strong>In-app search:</strong> Inventory currently uses database search, not Typesense queries.</p>
								<p className="text-xs text-gray-500 mt-3">
									Note: "Recreate & Sync All" will delete existing collections and recreate them from scratch.
									Use this if you've made schema changes or want a fresh sync.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Home – card grid
	return (
		<div className="flex flex-col gap-4">
			<div className="page-header">
				<div className="page-header-left">
					<h1 className="page-title">⚙️ Settings</h1>
					<p className="page-subtitle">System configuration</p>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{user?.role === 'Admin' && (
					<button
						className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer border border-red-100"
						onClick={openInventoryControl}
					>
						<div className="flex items-start gap-4">
							<div className="text-4xl">⏱️</div>
							<div>
								<h2 className="font-semibold text-gray-800 text-lg">Inventory Control</h2>
								<p className="text-sm text-gray-500 mt-1">Zero the stock baseline and permanently prevent MaxSoft snapshots from restoring old quantities.</p>
								<span className="inline-block mt-3 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Admin only →</span>
							</div>
						</div>
					</button>
				)}
				{isDesktopRuntime() && (
					<button
						className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer"
						onClick={() => navigate('/desktop-sync')}
					>
						<div className="flex items-start gap-4">
							<div className="text-4xl">🖥️</div>
							<div>
								<h2 className="font-semibold text-gray-800 text-lg">Desktop Runtime</h2>
								<p className="text-sm text-gray-500 mt-1">Open sync controls, application logs, and desktop versus cloud build tracking.</p>
								<div className="flex flex-wrap gap-1 mt-2">
									<span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Sync</span>
									<span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Logs</span>
									<span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Versions</span>
								</div>
								<span className="inline-block mt-3 text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">Open →</span>
							</div>
						</div>
					</button>
				)}

				{/* Units of Measure card */}
				<button
					className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer"
					onClick={() => setSection('units')}
				>
					<div className="flex items-start gap-4">
						<div className="text-4xl">📏</div>
						<div>
							<h2 className="font-semibold text-gray-800 text-lg">Units of Measure</h2>
							<p className="text-sm text-gray-500 mt-1">Define and manage custom measurement units for products (weight, volume, length, etc.)</p>
							<span className="inline-block mt-3 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Manage →</span>
						</div>
					</div>
				</button>

				{/* Statuses card */}
				<button
					className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer"
					onClick={() => setSection('statuses')}
				>
					<div className="flex items-start gap-4">
						<div className="text-4xl">🏷️</div>
						<div>
							<h2 className="font-semibold text-gray-800 text-lg">Status Management</h2>
							<p className="text-sm text-gray-500 mt-1">Configure status options for inventory, products, GRNs, branches, suppliers, and transfers</p>
							<div className="flex flex-wrap gap-1 mt-2">
								{ENTITY_TYPES.slice(0, 4).map(et => (
									<span key={et.key} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{et.icon} {et.shortLabel}</span>
								))}
								<span className="text-xs text-gray-400">+{ENTITY_TYPES.length - 4} more</span>
							</div>
							<span className="inline-block mt-3 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Manage →</span>
						</div>
					</div>
				</button>

				{/* Attributes card */}
				<button
					className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer"
					onClick={() => setSection('attributes')}
				>
					<div className="flex items-start gap-4">
						<div className="text-4xl">🧩</div>
						<div>
							<h2 className="font-semibold text-gray-800 text-lg">Product Attributes</h2>
							<p className="text-sm text-gray-500 mt-1">Define global attributes (Size, Color, Flavor, etc.) and their allowed values for generating SKU variants</p>
							<div className="flex flex-wrap gap-1 mt-2">
								{ATTRIBUTE_TYPES.map(t => (
									<span key={t} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{t}</span>
								))}
							</div>
							<span className="inline-block mt-3 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Manage →</span>
						</div>
					</div>
				</button>

				{/* Typesense Sync card */}
				<button
					className="content-section p-6 text-left hover:shadow-md transition-shadow cursor-pointer"
					onClick={() => setSection('typesense')}
				>
					<div className="flex items-start gap-4">
						<div className="text-4xl">🔍</div>
						<div>
							<h2 className="font-semibold text-gray-800 text-lg">Typesense Index Export</h2>
							<p className="text-sm text-gray-500 mt-1">Sync SKUs, inventory, and vendors to external Typesense collections</p>
							<span className="inline-block mt-3 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Manage →</span>
						</div>
					</div>
				</button>
			</div>
		</div>
	);
}
