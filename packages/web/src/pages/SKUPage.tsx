import { Fragment, useEffect, useRef, useState } from 'react';
import { skusApi, vendorsApi, categoriesApi, settingsApi, inventoryApi, attributesApi, variantsApi, batchesApi, floorsApi, shelvesApi, boxesApi, grnsApi } from '../api/client';
import { InventoryState } from '@jingles/shared/enums';
import { ALLOWED_TRANSITIONS } from '@jingles/shared/transitions';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import StateBadge from '../components/StateBadge';
import MediaUpload from '../components/MediaUpload';
import ImageGalleryManager from '../components/ImageGalleryManager';
import { branding } from '../config/branding';
import SearchableSelect from '../components/SearchableSelect';
import MultiSearchableSelect from '../components/MultiSearchableSelect';
import { UiBadge, UiText } from '../components/UiPrimitives';
import { buildHierarchicalCategoryOptionsFromFlat } from '../utils/categoryHelpers';
import { formatQuantity, parsePositiveQuantity, QUANTITY_INPUT_MIN, QUANTITY_INPUT_STEP } from '../utils/quantity';

const PAGE_SIZE = 20;
const defaultTransitionForm = { toState: '', reason: '' };
const defaultInventoryAssignmentForm = { variantId: '', floorId: '', shelfId: '', boxId: '', quantity: '1', state: InventoryState.Uninspected as string, batchId: '' };
const defaultQuickInventoryForm = { variantId: '', floorId: '', shelfId: '', boxId: '', quantity: '1', state: InventoryState.Uninspected as string, batchId: '' };
const defaultQuickGrnForm = { supplierId: '', variantId: '', floorId: '', shelfId: '', quantity: '1', invoiceReference: '', expectedDeliveryDate: new Date().toISOString().split('T')[0], createNewBatch: true, batchId: '', costPrice: '', sellingPrice: '' };

const defaultForm = {
	skuCode: '',
	name: '',
	description: '',
	categoryId: '',
	vendorIds: [] as string[],
	unitOfMeasure: '',
	unitOfMeasureId: '',
	isFragile: false,
	isActive: true,
	maxStackHeight: '',
	lowStockThreshold: '',
	costPrice: '',
	sellingPrice: '',
	wholesalePrice: '',
	bulkPrice: '',
	marginType: '' as 'fixed' | 'percentage' | '',
	marginValue: '',
	currency: 'LKR',
	defaultManufacturingDate: '',
	defaultExpiryDate: '',
	shelfLifeDays: '',
};

type ModalTab = 'details' | 'tags' | 'barcodes' | 'locations' | 'variants' | 'duplicates' | 'images' | 'pricing';
type PageTab = 'products' | 'duplicates';

export default function SKUPage() {
	const [skus, setSkus] = useState<any[]>([]);
	const [pageTab, setPageTab] = useState<PageTab>('products');
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(1);
	const [vendors, setVendors] = useState<any[]>([]);
	const [categories, setCategories] = useState<any[]>([]);
	const [units, setUnits] = useState<any[]>([]);
	const [allTags, setAllTags] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [form, setForm] = useState(defaultForm);
	const [formTags, setFormTags] = useState<string[]>([]);
	const [newTagInput, setNewTagInput] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [categoryFilter, setCategoryFilter] = useState('');
	const [vendorFilter, setVendorFilter] = useState('');
	const [unitFilter, setUnitFilter] = useState('');
	const [activeFilter, setActiveFilter] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(PAGE_SIZE);
	const [editingSku, setEditingSku] = useState<any>(null);
	const [editForm, setEditForm] = useState(defaultForm);
	const [editTags, setEditTags] = useState<string[]>([]);
	const [editNewTagInput, setEditNewTagInput] = useState('');
	const [modalTab, setModalTab] = useState<ModalTab>('details');
	const [isSaving, setIsSaving] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [barcodes, setBarcodes] = useState<any[]>([]);
	const [newBarcode, setNewBarcode] = useState({ barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' });
	const [inventoryLocations, setInventoryLocations] = useState<any[]>([]);
	const [locationsLoading, setLocationsLoading] = useState(false);
	const [isAssigningInventory, setIsAssigningInventory] = useState(false);
	const [assignmentForm, setAssignmentForm] = useState(defaultInventoryAssignmentForm);
	const [assignmentFloors, setAssignmentFloors] = useState<any[]>([]);
	const [assignmentShelves, setAssignmentShelves] = useState<any[]>([]);
	const [assignmentBoxes, setAssignmentBoxes] = useState<any[]>([]);
	const [assignmentVariants, setAssignmentVariants] = useState<any[]>([]);
	const [assignmentBatches, setAssignmentBatches] = useState<any[]>([]);
	const [transitioningInv, setTransitioningInv] = useState<string | null>(null);
	const [transitionRecord, setTransitionRecord] = useState<any>(null);
	const [transitionForm, setTransitionForm] = useState(defaultTransitionForm);
	const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Variants tab state
	const [skuVariants, setSkuVariants] = useState<any[]>([]);
	const [allAttributes, setAllAttributes] = useState<any[]>([]);
	const [variantsLoading, setVariantsLoading] = useState(false);
	const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string[]>>({});

	// Duplicates tab state
	const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);
	const [duplicatesLoading, setDuplicatesLoading] = useState(false);
	const [duplicateActionId, setDuplicateActionId] = useState<string | null>(null);

	// Images tab state
	const [skuImages, setSkuImages] = useState<any[]>([]);
	const [skuVideoUrl, setSkuVideoUrl] = useState<string | null>(null);
	const [imagesLoading, setImagesLoading] = useState(false);
	const [selectedImageVariantId, setSelectedImageVariantId] = useState('');

	// Pricing tab state
	const [batchPrices, setBatchPrices] = useState<any[]>([]);
	const [quantityTiers, setQuantityTiers] = useState<any[]>([]);
	const [newQtyTier, setNewQtyTier] = useState({ minQty: '', maxQty: '', price: '', currency: 'USD' });

	// Create form attributes state
	const [createFormSelectedAttrs, setCreateFormSelectedAttrs] = useState<Record<string, string[]>>({});

	// Product list expand/collapse state
	const [expandedSkuIds, setExpandedSkuIds] = useState<Set<string>>(new Set());
	const [variantsBySkuId, setVariantsBySkuId] = useState<Record<string, any[]>>({});
	const [variantsLoadingIds, setVariantsLoadingIds] = useState<Set<string>>(new Set());
	const fetchingSkuIds = useRef<Set<string>>(new Set());

	// Page-level duplicates
	const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
	const [duplicateGroupsLoading, setDuplicateGroupsLoading] = useState(false);
	const [duplicateGroupsLoaded, setDuplicateGroupsLoaded] = useState(false);

	// Quick stock / GRN actions
	const [quickInventorySku, setQuickInventorySku] = useState<any>(null);
	const [quickInventoryForm, setQuickInventoryForm] = useState(defaultQuickInventoryForm);
	const [quickGrnSku, setQuickGrnSku] = useState<any>(null);
	const [quickGrnForm, setQuickGrnForm] = useState(defaultQuickGrnForm);
	const [quickFloors, setQuickFloors] = useState<any[]>([]);
	const [quickShelves, setQuickShelves] = useState<any[]>([]);
	const [quickBoxes, setQuickBoxes] = useState<any[]>([]);
	const [quickVariants, setQuickVariants] = useState<any[]>([]);
	const [quickBatches, setQuickBatches] = useState<any[]>([]);
	const [quickSaving, setQuickSaving] = useState(false);

	const load = async () => {
		setIsLoading(true);
		try {
			const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
			if (debouncedSearch) params.search = debouncedSearch;
			if (categoryFilter) params.categoryId = categoryFilter;
			if (vendorFilter) params.vendorId = vendorFilter;
			if (unitFilter) params.unitOfMeasureId = unitFilter;
			if (activeFilter) params.isActive = activeFilter;
			const [skuRes, vendorRes, catRes, unitRes, tagRes] = await Promise.all([
				skusApi.list(params),
				vendorsApi.list(),
				categoriesApi.list(),
				settingsApi.listUnits(),
				skusApi.getAllTags(),
			]);
			setSkus(skuRes.data.data.items ?? []);
			setTotal(skuRes.data.data.total ?? 0);
			setTotalPages(skuRes.data.data.totalPages ?? 1);
			setVendors(vendorRes.data?.data?.items ?? vendorRes.data ?? []);
			setCategories(catRes.data.data ?? []);
			setUnits(unitRes.data.data ?? []);
			setAllTags(tagRes.data.data ?? []);
		} catch (err) {
			console.error('Failed to load SKUs', err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => { load(); }, [page, pageSize, debouncedSearch, categoryFilter, vendorFilter, unitFilter, activeFilter]);

	const loadDuplicateGroups = async () => {
		setDuplicateGroupsLoading(true);
		try {
			const res = await skusApi.getDuplicateGroups({ minScore: '72', limit: '1000' });
			setDuplicateGroups(res.data?.data?.items ?? []);
			setDuplicateGroupsLoaded(true);
		} catch {
			setDuplicateGroups([]);
			setDuplicateGroupsLoaded(true);
		} finally {
			setDuplicateGroupsLoading(false);
		}
	};

	useEffect(() => {
		if (pageTab === 'duplicates' && !duplicateGroupsLoaded) loadDuplicateGroups();
	}, [pageTab, duplicateGroupsLoaded]);

	const toggleSkuExpand = async (skuId: string, variantCount: number) => {
		if (variantCount === 0) return;
		setExpandedSkuIds((prev) => {
			const next = new Set(prev);
			if (next.has(skuId)) {
				next.delete(skuId);
			} else {
				next.add(skuId);
			}
			return next;
		});
		if (!variantsBySkuId[skuId] && !fetchingSkuIds.current.has(skuId)) {
			fetchingSkuIds.current.add(skuId);
			setVariantsLoadingIds((prev) => new Set(prev).add(skuId));
			try {
				const res = await variantsApi.list(skuId);
				setVariantsBySkuId((prev) => ({ ...prev, [skuId]: res.data?.data ?? [] }));
			} catch {
				setVariantsBySkuId((prev) => ({ ...prev, [skuId]: [] }));
			} finally {
				fetchingSkuIds.current.delete(skuId);
				setVariantsLoadingIds((prev) => { const next = new Set(prev); next.delete(skuId); return next; });
			}
		}
	};

	const handleSearchChange = (value: string) => {
		setSearchTerm(value);
		if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
		searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
	};

	const handleUnitChange = (unitId: string, setter: any) => {
		const unit = units.find((u: any) => u.id === unitId);
		setter((f: any) => ({ ...f, unitOfMeasureId: unitId, unitOfMeasure: unit?.name ?? '' }));
	};

	const resetCreateState = () => {
		setForm(defaultForm);
		setFormTags([]);
		setNewTagInput('');
		setCreateFormSelectedAttrs({});
	};

	const closeCreateForm = () => {
		setShowCreateForm(false);
		resetCreateState();
	};

	const applySkuToEditState = (sku: any, initialTab: ModalTab = 'details') => {
		const unit = units.find((u: any) => u.name === sku.unitOfMeasure || u.id === sku.unitOfMeasureId);
		const vendorIds = sku.skuVendors?.map((sv: any) => sv.vendorId) ?? (sku.vendorId ? [sku.vendorId] : []);

		setEditForm({
			skuCode: sku.skuCode, name: sku.name, description: sku.description ?? '',
			categoryId: sku.categoryId ?? '', vendorIds,
			unitOfMeasure: sku.unitOfMeasure ?? '', unitOfMeasureId: unit?.id ?? sku.unitOfMeasureId ?? '',
			isFragile: sku.isFragile ?? false, isActive: sku.isActive ?? true,
			maxStackHeight: sku.maxStackHeight != null ? String(sku.maxStackHeight) : '',
			lowStockThreshold: sku.lowStockThreshold != null ? String(sku.lowStockThreshold) : '',
			costPrice: sku.costPrice != null ? String(sku.costPrice) : '',
			sellingPrice: sku.sellingPrice != null ? String(sku.sellingPrice) : '',
			wholesalePrice: sku.wholesalePrice != null ? String(sku.wholesalePrice) : '',
			bulkPrice: sku.bulkPrice != null ? String(sku.bulkPrice) : '',
			marginType: sku.marginType ?? '',
			marginValue: sku.marginValue != null ? String(sku.marginValue) : '',
			currency: sku.currency ?? 'LKR',
			defaultManufacturingDate: sku.defaultManufacturingDate ? new Date(sku.defaultManufacturingDate).toISOString().split('T')[0] : '',
			defaultExpiryDate: sku.defaultExpiryDate ? new Date(sku.defaultExpiryDate).toISOString().split('T')[0] : '',
			shelfLifeDays: sku.shelfLifeDays != null ? String(sku.shelfLifeDays) : '',
		});
		setEditTags(sku.tags?.map((t: any) => t.tagId ?? t.tag?.id).filter(Boolean) ?? []);
		setEditingSku(sku);
		setModalTab(initialTab);
		setSaveSuccess(false);
		setBarcodes([]);
		setInventoryLocations([]);
		setAssignmentForm(defaultInventoryAssignmentForm);
		setAssignmentShelves([]);
		setAssignmentBoxes([]);
		setAssignmentBatches([]);
		setAssignmentVariants([]);
		setDuplicateCandidates([]);
		setDuplicateActionId(null);
		setSkuVariants(sku.variants ?? []);
		setSkuImages((sku.images ?? []).slice().sort((a: any, b: any) => a.sortOrder - b.sortOrder));
		setSkuVideoUrl(sku.videoUrl ?? null);
		setSelectedImageVariantId('');
	};

	const openCreateForm = async () => {
		setShowCreateForm(true);
		resetCreateState();
		// Load attributes and units if not already loaded
		const loadPromises = [];
		if (allAttributes.length === 0) {
			loadPromises.push(
				attributesApi.list().then((attrRes) => {
					setAllAttributes(attrRes.data?.data ?? []);
				}).catch(() => {
					setAllAttributes([]);
				})
			);
		}
		if (units.length === 0) {
			loadPromises.push(
				settingsApi.listUnits().then((unitRes) => {
					setUnits(unitRes.data.data ?? []);
				}).catch(() => {
					setUnits([]);
				})
			);
		}
		if (loadPromises.length > 0) {
			await Promise.all(loadPromises);
		}
	};

	const calculateVariantCount = (selections: Record<string, string[]>) => {
		const validSelections = Object.values(selections).filter((vals) => vals.length > 0);
		if (validSelections.length === 0) return 0;
		return validSelections.reduce((acc, vals) => acc * vals.length, 1);
	};

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const attributeSelections = Object.entries(createFormSelectedAttrs)
				.filter(([, vals]) => vals.length > 0)
				.map(([attributeId, valueIds]) => ({ attributeId, valueIds }));

			console.log('Create form attribute selections:', createFormSelectedAttrs);
			console.log('Formatted attribute selections:', attributeSelections);

			const payload = {
				...form,
				vendorIds: form.vendorIds,
				maxStackHeight: form.maxStackHeight ? parseFloat(form.maxStackHeight) : null,
				lowStockThreshold: form.lowStockThreshold ? parseInt(form.lowStockThreshold) : null,
				costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
				sellingPrice: form.sellingPrice ? parseFloat(form.sellingPrice) : null,
				wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice) : null,
				bulkPrice: form.bulkPrice ? parseFloat(form.bulkPrice) : null,
				marginType: form.marginType || null,
				marginValue: form.marginValue ? parseFloat(form.marginValue) : null,
				defaultManufacturingDate: form.defaultManufacturingDate || null,
				defaultExpiryDate: form.defaultExpiryDate || null,
				shelfLifeDays: form.shelfLifeDays ? parseInt(form.shelfLifeDays) : null,
				categoryId: form.categoryId || undefined,
				unitOfMeasureId: form.unitOfMeasureId || undefined,
				attributeSelections: attributeSelections.length > 0 ? attributeSelections : undefined,
			};

			console.log('Create payload:', payload);

			const res = await skusApi.create(payload);
			const newSku = res.data.data;

			console.log('Create response:', res.data);

			await Promise.all(formTags.map((tagId) => skusApi.addTag(newSku.id, tagId)));

			const variantCount = newSku?.variantCount ?? newSku?.variants?.length ?? 0;
			if (variantCount > 0) {
				alert(`✅ Product created with ${variantCount} variant${variantCount !== 1 ? 's' : ''}!`);
			}

			let createdSkuForEdit = newSku;
			try {
				const createdSkuRes = await skusApi.get(newSku.id);
				createdSkuForEdit = createdSkuRes.data?.data ?? newSku;
			} catch (refreshErr) {
				console.error('Failed to reload created SKU for editing:', refreshErr);
			}

			closeCreateForm();
			applySkuToEditState(createdSkuForEdit, 'images');
			await load();
		} catch (err: any) {
			console.error('Create SKU error:', err);
			alert(err.response?.data?.error ?? 'Failed to create SKU');
		}
	};

	const openEdit = (sku: any, initialTab: ModalTab = 'details') => {
		applySkuToEditState(sku, initialTab);
	};

	const handleSaveEdit = async () => {
		if (!editingSku) return;
		setIsSaving(true);
		try {
			const payload = {
				...editForm,
				vendorIds: editForm.vendorIds,
				maxStackHeight: editForm.maxStackHeight ? parseFloat(editForm.maxStackHeight) : null,
				lowStockThreshold: editForm.lowStockThreshold ? parseInt(editForm.lowStockThreshold) : null,
				categoryId: editForm.categoryId || undefined,
				unitOfMeasureId: editForm.unitOfMeasureId || undefined,
				costPrice: editForm.costPrice ? parseFloat(editForm.costPrice) : null,
				sellingPrice: editForm.sellingPrice ? parseFloat(editForm.sellingPrice) : null,
				wholesalePrice: editForm.wholesalePrice ? parseFloat(editForm.wholesalePrice) : null,
				bulkPrice: editForm.bulkPrice ? parseFloat(editForm.bulkPrice) : null,
				marginType: editForm.marginType || null,
				marginValue: editForm.marginValue ? parseFloat(editForm.marginValue) : null,
				defaultManufacturingDate: editForm.defaultManufacturingDate || null,
				defaultExpiryDate: editForm.defaultExpiryDate || null,
				shelfLifeDays: editForm.shelfLifeDays ? parseInt(editForm.shelfLifeDays) : null,
			};
			await skusApi.update(editingSku.id, payload);
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 2500);
			await load();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to save SKU');
		} finally {
			setIsSaving(false);
		}
	};

	const resolveOrCreateTag = async (name: string): Promise<string | null> => {
		const trimmed = name.trim();
		if (!trimmed) return null;
		const existing = allTags.find((t: any) => t.name.toLowerCase() === trimmed.toLowerCase());
		if (existing) return existing.id;
		const res = await skusApi.createTag(trimmed);
		const newTag = res.data.data;
		setAllTags((prev: any[]) => [...prev, newTag]);
		return newTag.id;
	};

	const addFormTag = async () => {
		const id = await resolveOrCreateTag(newTagInput);
		if (id && !formTags.includes(id)) setFormTags((p) => [...p, id]);
		setNewTagInput('');
	};

	const addEditTag = async (tagId: string) => {
		if (editTags.includes(tagId)) return;
		await skusApi.addTag(editingSku.id, tagId);
		setEditTags((p) => [...p, tagId]);
	};

	const addEditTagByName = async () => {
		const id = await resolveOrCreateTag(editNewTagInput);
		if (id) await addEditTag(id);
		setEditNewTagInput('');
	};

	const removeEditTag = async (tagId: string) => {
		await skusApi.removeTag(editingSku.id, tagId);
		setEditTags((p) => p.filter((t) => t !== tagId));
	};

	const loadBarcodes = async () => {
		if (!editingSku) return;
		const res = await skusApi.getBarcodes(editingSku.id);
		setBarcodes(res.data.data ?? []);
	};

	const handleAddBarcode = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await skusApi.addBarcode(editingSku.id, newBarcode);
			setNewBarcode({ barcode: '', barcodeType: 'EAN13', isDefault: false, label: '' });
			await loadBarcodes();
		} catch (err: any) { alert(err.response?.data?.error ?? 'Failed to add barcode'); }
	};

	const handleDeleteBarcode = async (bcId: string) => {
		if (!confirm('Remove this barcode?')) return;
		await skusApi.deleteBarcode(editingSku.id, bcId);
		await loadBarcodes();
	};

	const responseItems = (payload: any) => {
		const data = payload?.data?.data?.items ?? payload?.data?.data ?? payload?.data ?? [];
		return Array.isArray(data) ? data : [];
	};

	const getSkuVendorIds = (sku: any) =>
		sku?.skuVendors?.map((sv: any) => sv.vendorId ?? sv.vendor?.id).filter(Boolean)
		?? (sku?.vendorId ? [sku.vendorId] : []);

	const fetchQuickShelves = async (floorId: string) => {
		if (!floorId) {
			setQuickShelves([]);
			return;
		}
		try {
			const res = await shelvesApi.list({ floorId });
			setQuickShelves(responseItems(res));
		} catch {
			setQuickShelves([]);
		}
	};

	const fetchQuickBoxes = async (params: { shelfId?: string; floorId?: string }) => {
		if (!params.shelfId && !params.floorId) {
			setQuickBoxes([]);
			return;
		}
		try {
			const res = await boxesApi.list(params as Record<string, string>);
			setQuickBoxes(responseItems(res));
		} catch {
			setQuickBoxes([]);
		}
	};

	const fetchQuickBatches = async (skuId: string, variantId = '') => {
		if (!skuId) {
			setQuickBatches([]);
			return;
		}
		try {
			const params: Record<string, string> = { skuId, isActive: 'true' };
			if (variantId) params.variantId = variantId;
			const res = await batchesApi.list(params);
			setQuickBatches(responseItems(res));
		} catch {
			setQuickBatches([]);
		}
	};

	const loadQuickOptions = async (sku: any) => {
		const [floorRes, variantRes, batchRes] = await Promise.all([
			floorsApi.list(),
			variantsApi.list(sku.id),
			batchesApi.list({ skuId: sku.id, isActive: 'true' }),
		]);
		setQuickFloors(responseItems(floorRes));
		setQuickVariants(variantRes.data?.data ?? []);
		setQuickBatches(responseItems(batchRes));
		setQuickShelves([]);
		setQuickBoxes([]);
	};

	const openQuickInventory = async (sku: any) => {
		setQuickInventorySku(sku);
		setQuickInventoryForm(defaultQuickInventoryForm);
		try {
			await loadQuickOptions(sku);
		} catch {
			setQuickFloors([]);
			setQuickVariants([]);
			setQuickBatches([]);
		}
	};

	const openQuickGrn = async (sku: any) => {
		const vendorIds = getSkuVendorIds(sku);
		setQuickGrnSku(sku);
		setQuickGrnForm({
			...defaultQuickGrnForm,
			supplierId: vendorIds[0] ?? '',
			expectedDeliveryDate: new Date().toISOString().split('T')[0],
		});
		try {
			await loadQuickOptions(sku);
		} catch {
			setQuickFloors([]);
			setQuickVariants([]);
			setQuickBatches([]);
		}
	};

	const closeQuickInventory = () => {
		setQuickInventorySku(null);
		setQuickInventoryForm(defaultQuickInventoryForm);
		setQuickShelves([]);
		setQuickBoxes([]);
		setQuickBatches([]);
	};

	const closeQuickGrn = () => {
		setQuickGrnSku(null);
		setQuickGrnForm(defaultQuickGrnForm);
		setQuickShelves([]);
		setQuickBoxes([]);
		setQuickBatches([]);
	};

	const handleQuickInventorySubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!quickInventorySku) return;
		const quantity = parsePositiveQuantity(quickInventoryForm.quantity);
		if (quantity === undefined) { alert('Quantity must be greater than 0.'); return; }
		if (!quickInventoryForm.floorId) { alert('Select a floor before adding inventory.'); return; }
		setQuickSaving(true);
		try {
			await inventoryApi.create({
				skuId: quickInventorySku.id,
				variantId: quickInventoryForm.variantId || undefined,
				floorId: quickInventoryForm.floorId || undefined,
				shelfId: quickInventoryForm.shelfId || undefined,
				boxId: quickInventoryForm.boxId || undefined,
				quantity,
				state: quickInventoryForm.state,
				batchId: quickInventoryForm.batchId || undefined,
			});
			closeQuickInventory();
			await load();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to add inventory');
		} finally {
			setQuickSaving(false);
		}
	};

	const handleQuickGrnSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!quickGrnSku) return;
		const quantity = parseInt(quickGrnForm.quantity);
		if (!quickGrnForm.supplierId) { alert('Select a supplier.'); return; }
		if (Number.isNaN(quantity) || quantity < 1) { alert('Quantity must be at least 1.'); return; }
		setQuickSaving(true);
		try {
			await grnsApi.create({
				supplierId: quickGrnForm.supplierId,
				floorId: quickGrnForm.floorId || undefined,
				shelfId: quickGrnForm.shelfId || undefined,
				invoiceReference: quickGrnForm.invoiceReference || undefined,
				expectedDeliveryDate: quickGrnForm.expectedDeliveryDate || undefined,
				lines: [{
					skuId: quickGrnSku.id,
					variantId: quickGrnForm.variantId || undefined,
					expectedQuantity: quantity,
					batchId: quickGrnForm.createNewBatch ? undefined : (quickGrnForm.batchId || undefined),
					createNewBatch: quickGrnForm.createNewBatch,
					costPrice: quickGrnForm.costPrice ? parseFloat(quickGrnForm.costPrice) : undefined,
					sellingPrice: quickGrnForm.sellingPrice ? parseFloat(quickGrnForm.sellingPrice) : undefined,
				}],
			});
			closeQuickGrn();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to create GRN');
		} finally {
			setQuickSaving(false);
		}
	};

	const fetchAssignmentShelves = async (floorId: string) => {
		if (!floorId) {
			setAssignmentShelves([]);
			return;
		}
		try {
			const res = await shelvesApi.list({ floorId });
			setAssignmentShelves(responseItems(res));
		} catch {
			setAssignmentShelves([]);
		}
	};

	const fetchAssignmentBoxes = async (params: { shelfId?: string; floorId?: string }) => {
		if (!params.shelfId && !params.floorId) {
			setAssignmentBoxes([]);
			return;
		}
		try {
			const res = await boxesApi.list(params as Record<string, string>);
			setAssignmentBoxes(responseItems(res));
		} catch {
			setAssignmentBoxes([]);
		}
	};

	const fetchAssignmentBatches = async (variantId = assignmentForm.variantId) => {
		if (!editingSku) return;
		try {
			const params: Record<string, string> = { skuId: editingSku.id, isActive: 'true' };
			if (variantId) params.variantId = variantId;
			const res = await batchesApi.list(params);
			setAssignmentBatches(responseItems(res));
		} catch {
			setAssignmentBatches([]);
		}
	};

	const loadLocations = async () => {
		if (!editingSku) return;
		setLocationsLoading(true);
		try {
			const [inventoryRes, floorRes, variantRes, batchRes] = await Promise.all([
				skusApi.getInventoryLocations(editingSku.id),
				floorsApi.list(),
				variantsApi.list(editingSku.id),
				batchesApi.list({ skuId: editingSku.id, isActive: 'true' }),
			]);
			setInventoryLocations(inventoryRes.data?.data?.items ?? []);
			setAssignmentFloors(responseItems(floorRes));
			setAssignmentVariants(variantRes.data?.data ?? []);
			setAssignmentBatches(responseItems(batchRes));
		} catch { setInventoryLocations([]); }
		finally { setLocationsLoading(false); }
	};

	const handleAssignInventory = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingSku) return;
		const quantity = parsePositiveQuantity(assignmentForm.quantity);
		if (!assignmentForm.floorId) { alert('Select a floor before assigning inventory.'); return; }
		if (quantity === undefined) { alert('Quantity must be greater than 0.'); return; }
		setIsAssigningInventory(true);
		try {
			await inventoryApi.create({
				skuId: editingSku.id,
				variantId: assignmentForm.variantId || undefined,
				floorId: assignmentForm.floorId || undefined,
				shelfId: assignmentForm.shelfId || undefined,
				boxId: assignmentForm.boxId || undefined,
				quantity,
				state: assignmentForm.state,
				batchId: assignmentForm.batchId || undefined,
			});
			setAssignmentForm((current) => ({
				...defaultInventoryAssignmentForm,
				variantId: current.variantId,
				floorId: current.floorId,
				shelfId: current.shelfId,
				boxId: current.boxId,
				state: current.state,
			}));
			await loadLocations();
			await load();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to assign inventory');
		} finally {
			setIsAssigningInventory(false);
		}
	};

	const formatInventoryLocation = (record: any) => {
		const parts: string[] = [];
		if (record.floor) {
			parts.push(record.floor.branch?.name ? `${record.floor.branch.name} › ${record.floor.name}` : `${record.floor.name} (${record.floor.code})`);
		}
		if (record.shelf) parts.push(`${record.shelf.name} (${record.shelf.code})`);
		if (record.box) parts.push(`${record.box.name} (${record.box.code})`);
		return parts.length > 0 ? parts.join(' › ') : 'No Location';
	};

	const loadVariants = async () => {
		if (!editingSku) return;
		setVariantsLoading(true);
		try {
			const [varRes, attrRes] = await Promise.all([
				variantsApi.list(editingSku.id),
				attributesApi.list(),
			]);
			setSkuVariants(varRes.data?.data ?? []);
			setAllAttributes(attrRes.data?.data ?? []);
			// Pre-populate selected attrs from existing sku attributes
			const existingAttrs = editingSku.skuAttributes ?? [];
			const sel: Record<string, string[]> = {};
			existingAttrs.forEach((sa: any) => {
				sel[sa.attributeId] = sa.values?.map((v: any) => v.attributeValueId) ?? [];
			});
			setSelectedAttrs(sel);
		} catch { setSkuVariants([]); setAllAttributes([]); }
		finally { setVariantsLoading(false); }
	};

	const handleGenerateVariants = async () => {
		const attributeSelections = Object.entries(selectedAttrs)
			.filter(([, vals]) => vals.length > 0)
			.map(([attributeId, valueIds]) => ({ attributeId, valueIds }));
		if (attributeSelections.length === 0) { alert('Select at least one attribute with values.'); return; }
		try {
			const res = await variantsApi.generate(editingSku.id, attributeSelections);
			const meta = res.data?.meta;
			alert(`Generated ${meta?.created ?? 0} new variants. ${meta?.skipped ?? 0} already existed.`);
			await loadVariants();
		} catch (err: any) { alert(err.response?.data?.error ?? 'Failed to generate variants'); }
	};

	const handleToggleVariant = async (variantId: string, isActive: boolean) => {
		try {
			await variantsApi.update(editingSku.id, variantId, { isActive });
			await loadVariants();
		} catch (err: any) { alert(err.response?.data?.error ?? 'Failed to update variant'); }
	};

	const handleDeleteVariant = async (variantId: string, name: string) => {
		if (!confirm(`Delete variant "${name}"? This will fail if inventory records exist.`)) return;
		try {
			await variantsApi.delete(editingSku.id, variantId);
			await loadVariants();
		} catch (err: any) { alert(err.response?.data?.error ?? 'Failed to delete variant'); }
	};

	const refreshEditingSku = async () => {
		if (!editingSku) return;
		try {
			const skuRes = await skusApi.get(editingSku.id);
			setEditingSku(skuRes.data?.data ?? editingSku);
		} catch {
			// Keep the current modal state if the refresh fails.
		}
	};

	const loadDuplicates = async () => {
		if (!editingSku) return;
		setDuplicatesLoading(true);
		try {
			const res = await skusApi.getDuplicates(editingSku.id);
			setDuplicateCandidates(res.data?.data?.items ?? []);
		} catch {
			setDuplicateCandidates([]);
		} finally {
			setDuplicatesLoading(false);
		}
	};

	const handleMergeDuplicate = async (candidate: any) => {
		if (!editingSku) return;
		await handleMergeDuplicateFor(editingSku, candidate);
	};

	const handleVariantizeDuplicate = async (candidate: any) => {
		if (!editingSku) return;
		await handleVariantizeDuplicateFor(editingSku, candidate);
	};

	const handleMergeDuplicateFor = async (targetSku: any, candidate: any) => {
		if (!confirm(`Merge "${candidate.sku.name}" into "${targetSku.name}"? Inventory, batches, barcodes, images, tags, and history lines will move to the target product.`)) return;
		setDuplicateActionId(candidate.sku.id);
		try {
			const res = await skusApi.mergeDuplicate(targetSku.id, candidate.sku.id);
			const data = res.data?.data;
			alert(`Merged ${data?.mergedSkuCode ?? candidate.sku.skuCode}. Moved ${data?.movedInventoryRecords ?? 0} inventory record(s), ${data?.movedBatches ?? 0} batch(es), and ${data?.movedVariants ?? 0} variant(s).`);
			setExpandedSkuIds(new Set());
			setVariantsBySkuId({});
			await Promise.all([
				load(),
				editingSku?.id === targetSku.id ? loadDuplicates() : Promise.resolve(),
				editingSku?.id === targetSku.id ? refreshEditingSku() : Promise.resolve(),
				loadDuplicateGroups(),
			]);
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to merge duplicate');
		} finally {
			setDuplicateActionId(null);
		}
	};

	const handleVariantizeDuplicateFor = async (targetSku: any, candidate: any) => {
		if (!confirm(`Convert "${candidate.sku.name}" into a variant of "${targetSku.name}"? Its inventory and batches will move to the new variant.`)) return;
		setDuplicateActionId(candidate.sku.id);
		try {
			const res = await skusApi.variantizeDuplicate(targetSku.id, candidate.sku.id);
			const data = res.data?.data;
			alert(`Created variant ${data?.variantCode ?? candidate.sku.skuCode}. Moved ${data?.movedInventoryRecords ?? 0} inventory record(s) and ${data?.movedBatches ?? 0} batch(es).`);
			setExpandedSkuIds(new Set());
			setVariantsBySkuId({});
			await Promise.all([
				load(),
				editingSku?.id === targetSku.id ? loadDuplicates() : Promise.resolve(),
				editingSku?.id === targetSku.id ? loadVariants() : Promise.resolve(),
				editingSku?.id === targetSku.id ? refreshEditingSku() : Promise.resolve(),
				loadDuplicateGroups(),
			]);
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to variantize product');
		} finally {
			setDuplicateActionId(null);
		}
	};

	const loadImageVariants = async () => {
		if (!editingSku) return;
		try {
			const res = await variantsApi.list(editingSku.id);
			setSkuVariants(res.data?.data ?? []);
		} catch {
			setSkuVariants([]);
		}
	};

	const loadImages = async (variantId = selectedImageVariantId) => {
		if (!editingSku) return;
		setImagesLoading(true);
		try {
			const res = await skusApi.getImages(editingSku.id, variantId || null);
			setSkuImages(res.data?.data ?? []);
			// Also refresh video URL from latest SKU data
			const skuRes = await skusApi.get(editingSku.id);
			setSkuVideoUrl(skuRes.data?.data?.videoUrl ?? null);
		} catch { setSkuImages([]); }
		finally { setImagesLoading(false); }
	};

	const loadPricing = async () => {
		if (!editingSku) return;
		try {
			const [batchRes, skuRes] = await Promise.all([
				batchesApi.list({ skuId: editingSku.id }),
				skusApi.get(editingSku.id),
			]);
			const batches = batchRes.data?.data?.items ?? batchRes.data?.data ?? [];
			setBatchPrices(batches);
			const sku = skuRes.data?.data;
			setQuantityTiers(sku?.batchPricing ?? []);
		} catch {
			setBatchPrices([]);
			setQuantityTiers([]);
		}
	};

	const [editingBatchPrice, setEditingBatchPrice] = useState<{ id: string; costPrice: string; sellingPrice: string; wholesalePrice: string; bulkPrice: string } | null>(null);

	const handleEditBatchPrice = (batch: any) => {
		setEditingBatchPrice({
			id: batch.id,
			costPrice: batch.costPrice?.toString() ?? '',
			sellingPrice: batch.sellingPrice?.toString() ?? '',
			wholesalePrice: batch.wholesalePrice?.toString() ?? '',
			bulkPrice: batch.bulkPrice?.toString() ?? '',
		});
	};

	const handleSaveBatchPrice = async () => {
		if (!editingBatchPrice) return;
		try {
			await batchesApi.update(editingBatchPrice.id, {
				costPrice: editingBatchPrice.costPrice ? parseFloat(editingBatchPrice.costPrice) : null,
				sellingPrice: editingBatchPrice.sellingPrice ? parseFloat(editingBatchPrice.sellingPrice) : null,
				wholesalePrice: editingBatchPrice.wholesalePrice ? parseFloat(editingBatchPrice.wholesalePrice) : null,
				bulkPrice: editingBatchPrice.bulkPrice ? parseFloat(editingBatchPrice.bulkPrice) : null,
			});
			setEditingBatchPrice(null);
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 2000);
			await loadPricing();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to update batch pricing');
		}
	};

	const handleAddQtyTier = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newQtyTier.minQty || !newQtyTier.price) return;
		const updated = [...quantityTiers, {
			minQty: parseInt(newQtyTier.minQty),
			maxQty: newQtyTier.maxQty ? parseInt(newQtyTier.maxQty) : null,
			price: parseFloat(newQtyTier.price),
			currency: newQtyTier.currency,
		}];
		try {
			await skusApi.update(editingSku.id, { batchPricing: updated });
			setQuantityTiers(updated);
			setNewQtyTier({ minQty: '', maxQty: '', price: '', currency: 'USD' });
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 2000);
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to add quantity tier');
		}
	};

	const handleRemoveQtyTier = async (index: number) => {
		if (!confirm('Remove this quantity tier?')) return;
		const updated = quantityTiers.filter((_, i) => i !== index);
		try {
			await skusApi.update(editingSku.id, { batchPricing: updated });
			setQuantityTiers(updated);
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 2000);
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Failed to remove quantity tier');
		}
	};

	const handleTabChange = (tab: ModalTab) => {
		setModalTab(tab);
		if (tab === 'barcodes') loadBarcodes();
		if (tab === 'locations') loadLocations();
		if (tab === 'variants') loadVariants();
		if (tab === 'duplicates') loadDuplicates();
		if (tab === 'images') {
			loadImageVariants();
			loadImages(selectedImageVariantId);
		}
		if (tab === 'pricing') loadPricing();
	};

	const openTransitionModal = (record: any) => {
		const currentState = record.state as InventoryState;
		const allowedNext = ALLOWED_TRANSITIONS[currentState] ?? [];
		const firstNext = allowedNext.length > 0 ? allowedNext[0] : '';
		setTransitionRecord(record);
		setTransitionForm({ toState: firstNext, reason: '' });
	};

	const handleTransitionInvSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!transitionRecord || !transitionForm.toState) return;
		setTransitioningInv(transitionRecord.id);
		try {
			await inventoryApi.transition(transitionRecord.id, transitionForm.toState, transitionForm.reason || undefined);
			setTransitionRecord(null);
			setTransitionForm(defaultTransitionForm);
			await loadLocations();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Transition failed');
		} finally {
			setTransitioningInv(null);
		}
	};

	const getTagName = (id: string) => allTags.find((t: any) => t.id === id)?.name ?? id;
	const authToken = localStorage.getItem(branding.tokenStorageKey) ?? '';
	const selectedImageVariant = skuVariants.find((variant: any) => variant.id === selectedImageVariantId);
	const imageScopeLabel = selectedImageVariant
		? `variant ${selectedImageVariant.name ?? selectedImageVariant.variantCode}`
		: 'product';

	const skuTableHeaders = ['', 'SKU Code', 'Product Name', 'Category', 'Vendor', 'UoM', 'Tags', 'Low Stock', 'Fragile', 'Status', ''];

	return (
		<div className="flex flex-col gap-4">
			{/* Page header */}
			<div className="page-header">
				<div className="page-header-left">
					<h1 className="page-title">🏷️ Products (SKUs)</h1>
					<p className="page-subtitle">{total.toLocaleString()} products total</p>
				</div>
				<button className="btn-primary" onClick={openCreateForm}>+ New Product</button>
			</div>

			<div className="flex gap-2 border-b border-gray-200">
				<button
					type="button"
					onClick={() => setPageTab('products')}
					className={`px-4 py-2 text-sm font-medium border-b-2 ${pageTab === 'products' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
				>
					Products
				</button>
				<button
					type="button"
					onClick={() => setPageTab('duplicates')}
					className={`px-4 py-2 text-sm font-medium border-b-2 ${pageTab === 'duplicates' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
				>
					Duplicates
				</button>
			</div>

			{pageTab === 'products' && (
				<>
					<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
						🖼️ Creating a product now flows straight into the full editor, so you can upload images and video immediately after the first save.
					</div>
			{/* Table section */}
			<div className="content-section">
				{/* Filter bar */}
				<div className="filter-bar">
					<input
						type="search"
						className="filter-input-wide"
						placeholder="Search products…"
						value={searchTerm}
						onChange={(e) => handleSearchChange(e.target.value)}
					/>
					<div style={{ width: '180px' }}>
						<SearchableSelect
							options={[
								{ value: '', label: 'All Categories' },
								...buildHierarchicalCategoryOptionsFromFlat(categories)
							]}
							value={categoryFilter}
							onChange={(value) => { setCategoryFilter(value); setPage(1); }}
							placeholder="All Categories"
							isClearable={false}
						/>
					</div>
					<div style={{ width: '180px' }}>
						<SearchableSelect
							options={[
								{ value: '', label: 'All Vendors' },
								...vendors.map((v: any) => ({ value: v.id, label: v.name }))
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
								{ value: '', label: 'All Units' },
								...units.map((unit: any) => ({ value: unit.id, label: unit.name }))
							]}
							value={unitFilter}
							onChange={(value) => { setUnitFilter(value); setPage(1); }}
							placeholder="All Units"
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
					{(searchTerm || categoryFilter || vendorFilter || unitFilter || activeFilter) && (
						<button className="btn-secondary text-xs" onClick={() => { setSearchTerm(''); setDebouncedSearch(''); setCategoryFilter(''); setVendorFilter(''); setUnitFilter(''); setActiveFilter(''); setPage(1); }}>
							✕ Clear filters
						</button>
					)}
				</div>
				<div style={{ overflowX: 'auto' }}>
					<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', color: 'var(--ink)' }}>
						<thead>
							<tr style={{ background: 'var(--glass-pop)' }}>
								{skuTableHeaders.map((h, i) => (
									<th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{h}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{isLoading ? (
								Array.from({ length: 5 }).map((_, i) => (
									<tr key={i}>
										{skuTableHeaders.map((_, j) => (
											<td key={j} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
												<div style={{ height: '16px', background: 'var(--chip)', borderRadius: '4px', width: `${60 + (j * 13) % 40}%` }} />
											</td>
										))}
									</tr>
								))
							) : skus.length === 0 ? (
								<tr>
									<td colSpan={skuTableHeaders.length} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--ink-3)' }}>
										<div style={{ fontSize: '2rem', marginBottom: '8px' }}>🏷️</div>
										<span>No products found.</span>
									</td>
								</tr>
							) : (
								skus.map((sku: any, idx: number) => {
									const variantCount = sku._count?.variants ?? 0;
									const isExpanded = expandedSkuIds.has(sku.id);
									const isLoadingVariants = variantsLoadingIds.has(sku.id);
									const variants = variantsBySkuId[sku.id] ?? [];
									return (
										<Fragment key={sku.id}>
											<tr
												onClick={() => openEdit(sku)}
												style={{ cursor: 'pointer', background: idx % 2 === 1 ? 'var(--glass-pop)' : 'var(--bg-2)', borderBottom: isExpanded ? 'none' : '1px solid var(--line)', color: 'var(--ink)' }}
											>
												<td style={{ padding: '12px 8px 12px 16px', width: '32px' }}>
													{variantCount > 0 && (
														<button
															onClick={(e) => { e.stopPropagation(); toggleSkuExpand(sku.id, variantCount); }}
															style={{ background: 'transparent', border: '1px solid var(--line-strong)', borderRadius: '4px', cursor: 'pointer', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: 'var(--ink-2)', padding: 0 }}
															title={isExpanded ? 'Collapse variants' : `Expand ${variantCount} variant${variantCount !== 1 ? 's' : ''}`}
														>
															{isExpanded ? '−' : '+'}
														</button>
													)}
												</td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{sku.skuCode}</span></td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
													<span>{sku.name}</span>
													{variantCount > 0 && <span className="legacy-inline-pill" style={{ marginLeft: '8px' }}>{variantCount} variant{variantCount !== 1 ? 's' : ''}</span>}
												</td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{sku.category?.name ?? '—'}</td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{sku.skuVendors?.length > 0 ? sku.skuVendors.map((sv: any) => sv.vendor?.name).join(', ') : sku.vendor?.name}</td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{sku.unitOfMeasure}</td>
												<td style={{ padding: '12px 16px' }}>
													<div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
														{sku.tags?.slice(0, 3).map((t: any) => <UiBadge key={t.id} tone="info">{t.tag?.name ?? t.name}</UiBadge>)}
														{sku.tags?.length > 3 && <UiBadge>+{sku.tags.length - 3}</UiBadge>}
													</div>
												</td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{sku.lowStockThreshold != null ? <span style={{ color: '#f59e0b', fontWeight: 500 }}>≤{sku.lowStockThreshold}</span> : '—'}</td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{sku.isFragile ? <UiBadge tone="warning">⚠️ Fragile</UiBadge> : <UiText>No</UiText>}</td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{sku.isActive ? <UiBadge tone="success">● Active</UiBadge> : <UiBadge>○ Inactive</UiBadge>}</td>
												<td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
													<div className="flex gap-1">
														<button className="btn-sm text-xs" onClick={(e: any) => { e.stopPropagation(); openQuickInventory(sku); }}>Add Inventory</button>
														<button className="btn-sm text-xs" onClick={(e: any) => { e.stopPropagation(); openQuickGrn(sku); }}>Create GRN</button>
														<button className="btn-sm text-xs" onClick={(e: any) => { e.stopPropagation(); openEdit(sku); }}>Edit</button>
													</div>
												</td>
											</tr>
											{isExpanded && (
												isLoadingVariants ? (
													<tr key={`${sku.id}-loading`} style={{ background: idx % 2 === 1 ? 'var(--glass-pop)' : 'var(--bg-2)', borderBottom: '1px solid var(--line)', color: 'var(--ink)' }}>
														<td colSpan={skuTableHeaders.length} style={{ padding: '8px 16px 8px 48px', color: 'var(--ink-3)', fontSize: '13px' }}>Loading variants…</td>
													</tr>
												) : variants.map((variant: any, vi: number) => (
													<tr key={variant.id} style={{ background: idx % 2 === 1 ? 'rgba(var(--accent-glow), 0.08)' : 'var(--glass-pop)', borderBottom: vi === variants.length - 1 ? '1px solid var(--line)' : '1px solid rgba(var(--accent-glow), 0.08)', color: 'var(--ink)' }}>
														<td style={{ padding: '8px 8px 8px 16px' }} />
														<td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
															<span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: 'var(--ink-3)', borderLeft: '2px solid var(--line-strong)' }}>
																<span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{variant.variantCode}</span>
															</span>
														</td>
														<td style={{ padding: '8px 16px', whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>
															<span style={{ paddingLeft: '4px' }}>{variant.name || variant.attributeValues?.map((av: any) => av.attributeValue?.value).join(' / ')}</span>
														</td>
														<td colSpan={6} style={{ padding: '8px 16px', color: 'var(--ink-3)', fontSize: '12px' }}>
															{variant.attributeValues?.map((av: any) => (
																<span key={av.attributeId} style={{ marginRight: '8px' }}>
																	<span style={{ fontWeight: 500 }}>{av.attribute?.name}:</span> {av.attributeValue?.value}
																</span>
															))}
														</td>
														<td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>{variant.isActive ? <UiBadge tone="success">● Active</UiBadge> : <UiBadge>○ Inactive</UiBadge>}</td>
														<td />
													</tr>
												))
											)}
										</Fragment>
									);
								})
							)}
						</tbody>
					</table>
				</div>
				<Pagination page={page} totalPages={totalPages} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
			</div>
				</>
			)}

			{pageTab === 'duplicates' && (
				<div className="content-section">
					<div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
						<div>
							<p className="text-sm font-semibold text-gray-700">Duplicate and variant candidates</p>
							<p className="text-xs text-gray-500 mt-1">Review imported products that look like duplicates or standalone variants, then merge or variantize them into the chosen target product.</p>
						</div>
						<button className="btn-secondary text-sm" onClick={loadDuplicateGroups} disabled={duplicateGroupsLoading}>
							{duplicateGroupsLoading ? 'Scanning…' : 'Rescan'}
						</button>
					</div>
					{duplicateGroupsLoading ? (
						<p className="px-4 py-8 text-sm text-gray-400">Scanning products…</p>
					) : duplicateGroups.length === 0 ? (
						<div className="text-center py-10">
							<div className="text-4xl mb-2">🔎</div>
							<p className="text-sm text-gray-400">No likely duplicate groups found.</p>
						</div>
					) : (
						<div className="flex flex-col divide-y divide-gray-100">
							{duplicateGroups.map((group: any) => {
								const target = group.target;
								const vendorNames = target.skuVendors?.length > 0
									? target.skuVendors.map((sv: any) => sv.vendor?.name).filter(Boolean).join(', ')
									: target.vendor?.name;
								return (
									<div key={target.id} className="p-4">
										<div className="flex flex-wrap items-start justify-between gap-3 mb-3">
											<div>
												<div className="flex items-center gap-2">
													<span className="font-semibold text-gray-800">{target.name}</span>
													<span className="font-mono text-xs text-gray-500">{target.skuCode}</span>
												</div>
												<div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
													<span>{target.category?.name ?? 'No category'}</span>
													{vendorNames && <span>{vendorNames}</span>}
													<span>{target._count?.inventoryRecords ?? 0} inventory</span>
													<span>{target._count?.variants ?? 0} variants</span>
												</div>
											</div>
											<button className="btn-sm text-xs" onClick={() => openEdit(target)}>Open Target</button>
										</div>
										<table className="w-full text-sm border-collapse">
											<thead>
												<tr className="bg-gray-50">
													{['Candidate', 'Match', 'Counts', 'Variant Values', 'Actions'].map((header) => (
														<th key={header} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{header}</th>
													))}
												</tr>
											</thead>
											<tbody>
												{group.items.map((candidate: any) => {
													const sku = candidate.sku;
													const candidateVendorNames = sku.skuVendors?.length > 0
														? sku.skuVendors.map((sv: any) => sv.vendor?.name).filter(Boolean).join(', ')
														: sku.vendor?.name;
													const isWorking = duplicateActionId === sku.id;
													return (
														<tr key={sku.id} className="border-b border-gray-100 last:border-0 align-top">
															<td className="px-3 py-3">
																<div className="font-medium text-gray-800">{sku.name}</div>
																<div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
																	<span className="font-mono">{sku.skuCode}</span>
																	<span>{sku.category?.name ?? 'No category'}</span>
																	{candidateVendorNames && <span>{candidateVendorNames}</span>}
																</div>
															</td>
															<td className="px-3 py-3">
																<span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${candidate.relationship === 'variant' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
																	{candidate.relationship === 'variant' ? 'Variant' : 'Duplicate'}
																</span>
																<div className="text-xs text-gray-500 mt-1">{candidate.score}% match</div>
																<div className="text-xs text-gray-400">{candidate.reason}</div>
															</td>
															<td className="px-3 py-3 text-xs text-gray-500">
																<div>{sku._count?.inventoryRecords ?? 0} inventory</div>
																<div>{sku._count?.batches ?? 0} batches</div>
																<div>{sku._count?.variants ?? 0} variants</div>
															</td>
															<td className="px-3 py-3">
																<div className="flex flex-wrap gap-1">
																	{candidate.matchedVariantValues?.length > 0 ? candidate.matchedVariantValues.map((value: any) => (
																		<span key={`${sku.id}-${value.attributeValueId}`} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
																			{value.attributeName}: {value.label}
																		</span>
																	)) : <span className="text-xs text-gray-400">None detected</span>}
																</div>
															</td>
															<td className="px-3 py-3">
																<div className="flex flex-wrap gap-2">
																	<button className="btn-sm text-xs" disabled={isWorking || (sku._count?.variants ?? 0) > 0} onClick={() => handleVariantizeDuplicateFor(target, candidate)}>
																		{isWorking ? 'Working…' : 'Variantize'}
																	</button>
																	<button className="btn-sm text-red-600 text-xs" disabled={isWorking} onClick={() => handleMergeDuplicateFor(target, candidate)}>
																		Merge
																	</button>
																</div>
															</td>
														</tr>
													);
												})}
											</tbody>
										</table>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{quickInventorySku && (
				<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeQuickInventory()}>
					<div className="modal-panel-md">
						<div className="modal-header">
							<div>
								<h2 className="modal-title">Add Inventory</h2>
								<p className="text-xs text-gray-400 font-mono">{quickInventorySku.skuCode} — {quickInventorySku.name}</p>
							</div>
							<button className="modal-close" onClick={closeQuickInventory}>✕</button>
						</div>
						<form onSubmit={handleQuickInventorySubmit}>
							<div className="modal-body form-stack">
								{quickVariants.length > 0 && (
									<div className="form-group">
										<label className="form-label">Variant</label>
										<SearchableSelect
											options={[{ value: '', label: '— Base Product —' }, ...quickVariants.map((variant: any) => ({ value: variant.id, label: `${variant.name || variant.variantCode} (${variant.variantCode})` }))]}
											value={quickInventoryForm.variantId}
											onChange={(value) => {
												setQuickInventoryForm((form) => ({ ...form, variantId: value, batchId: '' }));
												fetchQuickBatches(quickInventorySku.id, value);
											}}
											placeholder="Base Product"
											isClearable={false}
										/>
									</div>
								)}
								<div className="form-grid-2">
									<div className="form-group">
										<label className="form-label">Quantity *</label>
										<input className="input-field" type="number" min={QUANTITY_INPUT_MIN} step={QUANTITY_INPUT_STEP} required value={quickInventoryForm.quantity} onChange={(e) => setQuickInventoryForm((form) => ({ ...form, quantity: e.target.value }))} />
									</div>
									<div className="form-group">
										<label className="form-label">State</label>
										<SearchableSelect
											options={Object.values(InventoryState).map((state) => ({ value: state, label: state }))}
											value={quickInventoryForm.state}
											onChange={(value) => setQuickInventoryForm((form) => ({ ...form, state: value }))}
											placeholder="Select State"
											isClearable={false}
										/>
									</div>
								</div>
								<div className="form-group">
									<label className="form-label">Floor *</label>
									<SearchableSelect
										options={[{ value: '', label: '— Select Floor —' }, ...quickFloors.map((floor: any) => ({ value: floor.id, label: floor.branch?.name ? `${floor.branch.name} › ${floor.name}` : `${floor.name} (${floor.code})` }))]}
										value={quickInventoryForm.floorId}
										onChange={(value) => {
											setQuickInventoryForm((form) => ({ ...form, floorId: value, shelfId: '', boxId: '' }));
											fetchQuickShelves(value);
											if (value) fetchQuickBoxes({ floorId: value });
											else setQuickBoxes([]);
										}}
										placeholder="Select Floor"
										isClearable={false}
									/>
								</div>
								{quickInventoryForm.floorId && (
									<div className="form-group">
										<label className="form-label">Shelf</label>
										<SearchableSelect
											options={[{ value: '', label: '— No Shelf —' }, ...quickShelves.map((shelf: any) => ({ value: shelf.id, label: `${shelf.name} (${shelf.code})${shelf.rack ? ` · ${shelf.rack.name}` : ''}` }))]}
											value={quickInventoryForm.shelfId}
											onChange={(value) => {
												setQuickInventoryForm((form) => ({ ...form, shelfId: value, boxId: '' }));
												if (value) fetchQuickBoxes({ shelfId: value });
												else fetchQuickBoxes({ floorId: quickInventoryForm.floorId });
											}}
											placeholder="No Shelf"
											isClearable={false}
										/>
									</div>
								)}
								{quickInventoryForm.floorId && quickBoxes.length > 0 && (
									<div className="form-group">
										<label className="form-label">Box</label>
										<SearchableSelect
											options={[{ value: '', label: '— No Box —' }, ...quickBoxes.map((box: any) => ({ value: box.id, label: `${box.name} (${box.code})` }))]}
											value={quickInventoryForm.boxId}
											onChange={(value) => setQuickInventoryForm((form) => ({ ...form, boxId: value }))}
											placeholder="No Box"
											isClearable={false}
										/>
									</div>
								)}
								<div className="form-group">
									<label className="form-label">Batch</label>
									<SearchableSelect
										options={[{ value: '', label: '— No Batch —' }, ...quickBatches.map((batch: any) => ({ value: batch.id, label: `${batch.batchNumber}${batch.expiryDate ? ` · Exp ${new Date(batch.expiryDate).toLocaleDateString()}` : ''}` }))]}
										value={quickInventoryForm.batchId}
										onChange={(value) => setQuickInventoryForm((form) => ({ ...form, batchId: value }))}
										placeholder="No Batch"
										isClearable={false}
									/>
								</div>
							</div>
							<div className="modal-footer">
								<button type="button" className="btn-secondary" onClick={closeQuickInventory}>Cancel</button>
								<button type="submit" className="btn-primary" disabled={quickSaving}>{quickSaving ? 'Saving…' : 'Add Inventory'}</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{quickGrnSku && (
				<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeQuickGrn()}>
					<div className="modal-panel-md">
						<div className="modal-header">
							<div>
								<h2 className="modal-title">Create GRN</h2>
								<p className="text-xs text-gray-400 font-mono">{quickGrnSku.skuCode} — {quickGrnSku.name}</p>
							</div>
							<button className="modal-close" onClick={closeQuickGrn}>✕</button>
						</div>
						<form onSubmit={handleQuickGrnSubmit}>
							<div className="modal-body form-stack">
								<div className="form-group">
									<label className="form-label">Supplier *</label>
									<SearchableSelect
										options={[{ value: '', label: '— Select Supplier —' }, ...vendors.map((vendor: any) => ({ value: vendor.id, label: vendor.name }))]}
										value={quickGrnForm.supplierId}
										onChange={(value) => setQuickGrnForm((form) => ({ ...form, supplierId: value }))}
										placeholder="Select Supplier"
										isClearable={false}
									/>
								</div>
								{quickVariants.length > 0 && (
									<div className="form-group">
										<label className="form-label">Variant</label>
										<SearchableSelect
											options={[{ value: '', label: '— Base Product —' }, ...quickVariants.map((variant: any) => ({ value: variant.id, label: `${variant.name || variant.variantCode} (${variant.variantCode})` }))]}
											value={quickGrnForm.variantId}
											onChange={(value) => {
												setQuickGrnForm((form) => ({ ...form, variantId: value, batchId: '' }));
												fetchQuickBatches(quickGrnSku.id, value);
											}}
											placeholder="Base Product"
											isClearable={false}
										/>
									</div>
								)}
								<div className="form-grid-2">
									<div className="form-group">
										<label className="form-label">Expected Quantity *</label>
										<input className="input-field" type="number" min="1" required value={quickGrnForm.quantity} onChange={(e) => setQuickGrnForm((form) => ({ ...form, quantity: e.target.value }))} />
									</div>
									<div className="form-group">
										<label className="form-label">Expected Delivery</label>
										<input className="input-field" type="date" value={quickGrnForm.expectedDeliveryDate} onChange={(e) => setQuickGrnForm((form) => ({ ...form, expectedDeliveryDate: e.target.value }))} />
									</div>
								</div>
								<div className="form-grid-2">
									<div className="form-group">
										<label className="form-label">Floor</label>
										<SearchableSelect
											options={[{ value: '', label: '— No Floor —' }, ...quickFloors.map((floor: any) => ({ value: floor.id, label: floor.branch?.name ? `${floor.branch.name} › ${floor.name}` : `${floor.name} (${floor.code})` }))]}
											value={quickGrnForm.floorId}
											onChange={(value) => {
												setQuickGrnForm((form) => ({ ...form, floorId: value, shelfId: '' }));
												fetchQuickShelves(value);
											}}
											placeholder="No Floor"
											isClearable={false}
										/>
									</div>
									{quickGrnForm.floorId && (
										<div className="form-group">
											<label className="form-label">Shelf</label>
											<SearchableSelect
												options={[{ value: '', label: '— No Shelf —' }, ...quickShelves.map((shelf: any) => ({ value: shelf.id, label: `${shelf.name} (${shelf.code})${shelf.rack ? ` · ${shelf.rack.name}` : ''}` }))]}
												value={quickGrnForm.shelfId}
												onChange={(value) => setQuickGrnForm((form) => ({ ...form, shelfId: value }))}
												placeholder="No Shelf"
												isClearable={false}
											/>
										</div>
									)}
								</div>
								<div className="form-grid-2">
									<div className="form-group">
										<label className="form-label">Invoice Reference</label>
										<input className="input-field" value={quickGrnForm.invoiceReference} onChange={(e) => setQuickGrnForm((form) => ({ ...form, invoiceReference: e.target.value }))} />
									</div>
									<div className="form-group">
										<label className="form-label">Batch Mode</label>
										<label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 mt-2">
											<input type="checkbox" checked={quickGrnForm.createNewBatch} onChange={(e) => setQuickGrnForm((form) => ({ ...form, createNewBatch: e.target.checked, batchId: '' }))} />
											Create new batch
										</label>
									</div>
								</div>
								{!quickGrnForm.createNewBatch && (
									<div className="form-group">
										<label className="form-label">Existing Batch</label>
										<SearchableSelect
											options={[{ value: '', label: '— No Batch —' }, ...quickBatches.map((batch: any) => ({ value: batch.id, label: `${batch.batchNumber}${batch.expiryDate ? ` · Exp ${new Date(batch.expiryDate).toLocaleDateString()}` : ''}` }))]}
											value={quickGrnForm.batchId}
											onChange={(value) => setQuickGrnForm((form) => ({ ...form, batchId: value }))}
											placeholder="No Batch"
											isClearable={false}
										/>
									</div>
								)}
								{quickGrnForm.createNewBatch && (
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">Cost Price</label>
											<input className="input-field" type="number" step="0.01" value={quickGrnForm.costPrice} onChange={(e) => setQuickGrnForm((form) => ({ ...form, costPrice: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Selling Price</label>
											<input className="input-field" type="number" step="0.01" value={quickGrnForm.sellingPrice} onChange={(e) => setQuickGrnForm((form) => ({ ...form, sellingPrice: e.target.value }))} />
										</div>
									</div>
								)}
							</div>
							<div className="modal-footer">
								<button type="button" className="btn-secondary" onClick={closeQuickGrn}>Cancel</button>
								<button type="submit" className="btn-primary" disabled={quickSaving}>{quickSaving ? 'Saving…' : 'Create GRN'}</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Create Product Modal */}
			{showCreateForm && (
				<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeCreateForm()}>
					<div className="modal-panel-lg">
						<div className="modal-header">
							<h2 className="modal-title">➕ Create New Product</h2>
							<button className="modal-close" onClick={closeCreateForm}>✕</button>
						</div>
						<form onSubmit={handleCreate}>
							<div className="modal-body form-stack">
								<div className="form-grid-2">
									<div className="form-group">
										<label className="form-label">SKU Code *</label>
										<input className="input-field" type="text" value={form.skuCode} required placeholder="e.g. WDG-001" onChange={(e) => setForm((f) => ({ ...f, skuCode: e.target.value }))} />
									</div>
									<div className="form-group">
										<label className="form-label">Product Name *</label>
										<input className="input-field" type="text" value={form.name} required onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
									</div>
								</div>
								<div className="form-grid-2">
									<div className="form-group">
										<label className="form-label">Category</label>
										<SearchableSelect
											options={[
												{ value: '', label: '— No Category —' },
												...buildHierarchicalCategoryOptionsFromFlat(categories)
											]}
											value={form.categoryId}
											onChange={(value) => setForm((f) => ({ ...f, categoryId: value }))}
											placeholder="No Category"
											isClearable={false}
										/>
									</div>
									<div className="form-group">
										<label className="form-label">Vendors *</label>
										<MultiSearchableSelect
											options={vendors.map((v: any) => ({ value: v.id, label: v.name }))}
											value={form.vendorIds}
											onChange={(values) => setForm((f) => ({ ...f, vendorIds: values }))}
											placeholder="Select vendors"
										/>
									</div>
								</div>
								<div className="form-grid-3">
									<div className="form-group">
										<label className="form-label">Unit of Measure *</label>
										{units.length > 0 ? (
											<SearchableSelect
												options={[
													{ value: '', label: '— Select Unit —' },
													...units.map((u: any) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }))
												]}
												value={form.unitOfMeasureId}
												onChange={(value) => handleUnitChange(value, setForm)}
												placeholder="Select Unit"
												isClearable={false}
											/>
										) : (
											<input className="input-field" type="text" value={form.unitOfMeasure} required placeholder="e.g. Piece" onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} />
										)}
									</div>
									<div className="form-group">
										<label className="form-label">Low Stock Alert</label>
										<input className="input-field" type="number" value={form.lowStockThreshold} placeholder="Alert when qty ≤ value" onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} />
									</div>
									<div className="form-group">
										<label className="form-label">Max Stack Height (cm)</label>
										<input className="input-field" type="number" value={form.maxStackHeight} placeholder="Maximum stack height" onChange={(e) => setForm((f) => ({ ...f, maxStackHeight: e.target.value }))} />
									</div>
								</div>
								<div className="form-group">
									<label className="form-label">Description</label>
									<input className="input-field" type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
								</div>
								{/* Pricing Section */}
								<div className="border-t border-gray-200 pt-4 mt-4">
									<p className="form-label mb-3">💰 Default Pricing</p>
									<p className="text-xs text-gray-500 mb-4">These prices are used as defaults when creating GRNs and when no batch-specific pricing exists.</p>
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">Cost Price</label>
											<input className="input-field" type="number" step="0.01" value={form.costPrice} placeholder="0.00" onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Selling Price</label>
											<input className="input-field" type="number" step="0.01" value={form.sellingPrice} placeholder="0.00" onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Wholesale Price</label>
											<input className="input-field" type="number" step="0.01" value={form.wholesalePrice} placeholder="0.00" onChange={(e) => setForm((f) => ({ ...f, wholesalePrice: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Bulk Price</label>
											<input className="input-field" type="number" step="0.01" value={form.bulkPrice} placeholder="0.00" onChange={(e) => setForm((f) => ({ ...f, bulkPrice: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Margin Type</label>
											<select className="input-field" value={form.marginType} onChange={(e) => setForm((f) => ({ ...f, marginType: e.target.value as 'fixed' | 'percentage' | '' }))}>
												<option value="">— No Margin —</option>
												<option value="fixed">Fixed Amount</option>
												<option value="percentage">Percentage</option>
											</select>
										</div>
										<div className="form-group">
											<label className="form-label">Margin Value</label>
											<input className="input-field" type="number" step="0.01" value={form.marginValue} placeholder={form.marginType === 'percentage' ? '0.00%' : '0.00'} onChange={(e) => setForm((f) => ({ ...f, marginValue: e.target.value }))} disabled={!form.marginType} />
										</div>
										<div className="form-group">
											<label className="form-label">Currency</label>
											<input className="input-field" type="text" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
										</div>
									</div>
								</div>
								{/* Date & Shelf Life Section */}
								<div className="border-t border-gray-200 pt-4 mt-4">
									<p className="form-label mb-3">📅 Manufacture & Expiry Dates</p>
									<p className="text-xs text-gray-500 mb-4">Set default dates for product batches. Expiry date will auto-calculate if shelf life is provided.</p>
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">Default Manufacturing Date</label>
											<input className="input-field" type="date" value={form.defaultManufacturingDate} onChange={(e) => {
												setForm((f) => {
													const newForm = { ...f, defaultManufacturingDate: e.target.value };
													// Auto-calculate expiry if shelf life is set
													if (e.target.value && f.shelfLifeDays) {
														const mfgDate = new Date(e.target.value);
														const expiryDate = new Date(mfgDate);
														expiryDate.setDate(expiryDate.getDate() + parseInt(f.shelfLifeDays));
														newForm.defaultExpiryDate = expiryDate.toISOString().split('T')[0];
													}
													return newForm;
												});
											}} />
										</div>
										<div className="form-group">
											<label className="form-label">Default Expiry Date</label>
											<input className="input-field" type="date" value={form.defaultExpiryDate} onChange={(e) => setForm((f) => ({ ...f, defaultExpiryDate: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Shelf Life (days)</label>
											<input className="input-field" type="number" value={form.shelfLifeDays} placeholder="e.g., 365" onChange={(e) => {
												setForm((f) => {
													const newForm = { ...f, shelfLifeDays: e.target.value };
													// Auto-calculate expiry if manufacturing date is set
													if (f.defaultManufacturingDate && e.target.value) {
														const mfgDate = new Date(f.defaultManufacturingDate);
														const expiryDate = new Date(mfgDate);
														expiryDate.setDate(expiryDate.getDate() + parseInt(e.target.value));
														newForm.defaultExpiryDate = expiryDate.toISOString().split('T')[0];
													}
													return newForm;
												});
											}} />
											<p className="text-xs text-gray-400 mt-1">Auto-calculates expiry when manufacture date is set</p>
										</div>
									</div>
								</div>
								<div>
									<p className="form-label mb-2">Tags</p>
									<div className="flex flex-wrap gap-2 mb-2">
										{formTags.map((id) => (
											<span key={id} className="inline-flex items-center gap-1">
												<UiBadge tone="info">{getTagName(id)}</UiBadge>
												<button type="button" onClick={() => setFormTags((p) => p.filter((t) => t !== id))} className="modal-close text-sm">✕</button>
											</span>
										))}
									</div>
									<div className="flex gap-2">
										<input type="text" className="input-field flex-1" placeholder="Add or create tag…" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFormTag(); } }} list="create-tag-opts" />
										<datalist id="create-tag-opts">{allTags.map((t: any) => <option key={t.id} value={t.name} />)}</datalist>
										<button type="button" className="btn-secondary" onClick={addFormTag}>Add Tag</button>
									</div>
								</div>
								{/* Attribute Selection (WooCommerce-style) */}
								<div className="border-t border-gray-200 pt-4">
									<div className="flex items-center justify-between mb-3">
										<div>
											<p className="form-label mb-1">🧩 Product Attributes & Variants</p>
											<p className="text-xs text-gray-500">Select attributes and values to generate variants automatically</p>
										</div>
										{calculateVariantCount(createFormSelectedAttrs) > 0 && (
											<span className="text-sm font-semibold text-primary-600 bg-primary-50 px-3 py-1 rounded-full">
												{calculateVariantCount(createFormSelectedAttrs)} variant{calculateVariantCount(createFormSelectedAttrs) !== 1 ? 's' : ''} will be created
											</span>
										)}
									</div>
									{allAttributes.length === 0 ? (
										<p className="text-sm text-gray-400 py-2">No attributes defined. Go to Settings to create attributes first.</p>
									) : (
										<div className="space-y-3">
											{allAttributes.map((attr: any) => (
												<div key={attr.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
													<div className="flex items-center gap-2 mb-2">
														<input
															type="checkbox"
															id={`create-attr-${attr.id}`}
															checked={(createFormSelectedAttrs[attr.id]?.length ?? 0) > 0}
															onChange={(e) => {
																if (!e.target.checked) {
																	setCreateFormSelectedAttrs((prev) => {
																		const next = { ...prev };
																		delete next[attr.id];
																		return next;
																	});
																} else {
																	setCreateFormSelectedAttrs((prev) => ({ ...prev, [attr.id]: [] }));
																}
															}}
															className="cursor-pointer"
														/>
														<label htmlFor={`create-attr-${attr.id}`} className="font-medium text-sm text-gray-700 cursor-pointer">
															{attr.name}
														</label>
														<span className="text-xs text-gray-400">({attr.values?.length ?? 0} values)</span>
													</div>
													{createFormSelectedAttrs[attr.id] !== undefined && (
														<div className="ml-6 mt-2 space-y-1">
															{attr.values?.length === 0 ? (
																<p className="text-xs text-gray-400">No values defined for this attribute</p>
															) : (
																<div className="flex flex-wrap gap-2">
																	{attr.values?.map((val: any) => (
																		<label
																			key={val.id}
																			className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${createFormSelectedAttrs[attr.id]?.includes(val.id)
																				? 'bg-primary-50 border-primary-300 text-primary-700 font-medium'
																				: 'bg-white border-gray-300 text-gray-600 hover:border-primary-300'
																				}`}
																		>
																			<input
																				type="checkbox"
																				checked={createFormSelectedAttrs[attr.id]?.includes(val.id) ?? false}
																				onChange={(e) => {
																					setCreateFormSelectedAttrs((prev) => {
																						const current = prev[attr.id] ?? [];
																						if (e.target.checked) {
																							return { ...prev, [attr.id]: [...current, val.id] };
																						} else {
																							return { ...prev, [attr.id]: current.filter((v) => v !== val.id) };
																						}
																					});
																				}}
																				className="cursor-pointer"
																			/>
																			{attr.type === 'color' && val.representedValue && (
																				<span
																					className="inline-block w-3 h-3 rounded-full border border-gray-300"
																					style={{ background: val.representedValue }}
																				/>
																			)}
																			{val.displayName}
																		</label>
																	))}
																</div>
															)}
														</div>
													)}
												</div>
											))}
										</div>
									)}
								</div>
								<div className="flex items-center gap-6">
									<label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
										<input type="checkbox" checked={form.isFragile} onChange={(e) => setForm((f) => ({ ...f, isFragile: e.target.checked }))} />
										⚠️ Fragile
									</label>
									<label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
										<input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
										Active
									</label>
								</div>
							</div>
							<div className="modal-footer">
								<button type="button" className="btn-secondary" onClick={closeCreateForm}>Cancel</button>
								<button type="submit" className="btn-primary">Create Product & Continue</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Edit SKU Modal */}
			{editingSku && (
				<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingSku(null)}>
					<div className="modal-panel-lg">
						<div className="modal-header">
							<div>
								<h2 className="modal-title">{editingSku.name}</h2>
								<span className="text-xs text-gray-400 font-mono">{editingSku.skuCode}</span>
							</div>
							<div className="flex items-center gap-3">
								{saveSuccess && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
								<button className="modal-close" onClick={() => setEditingSku(null)}>✕</button>
							</div>
						</div>
						{/* Tab nav */}
						<div className="flex gap-1 px-6 pt-3 pb-0 border-b border-gray-200 bg-white">
							{(['details', 'tags', 'barcodes', 'locations', 'variants', 'duplicates', 'images', 'pricing'] as ModalTab[]).map((tab) => (
								<button
									key={tab}
									type="button"
									onClick={() => handleTabChange(tab)}
									className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${modalTab === tab
										? 'bg-white border-gray-200 text-primary-700 -mb-px z-10'
										: 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'
										}`}
								>
									{tab === 'details' && '📝 '}
									{tab === 'tags' && '🏷️ '}
									{tab === 'barcodes' && '📊 '}
									{tab === 'locations' && '📍 '}
									{tab === 'variants' && '🧩 '}
									{tab === 'duplicates' && '🔁 '}
									{tab === 'images' && '🖼️ '}
									{tab === 'pricing' && '💲 '}
									{tab.charAt(0).toUpperCase() + tab.slice(1)}
								</button>
							))}
						</div>
						<div className="modal-body">
							{modalTab === 'details' && (
								<div className="form-stack">
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">SKU Code</label>
											<input className="input-field" type="text" value={editForm.skuCode} onChange={(e) => setEditForm((f) => ({ ...f, skuCode: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Product Name</label>
											<input className="input-field" type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
										</div>
									</div>
									<div className="form-grid-2">
										<div className="form-group">
											<label className="form-label">Category</label>
											<SearchableSelect
												options={[
													{ value: '', label: '— No Category —' },
													...buildHierarchicalCategoryOptionsFromFlat(categories)
												]}
												value={editForm.categoryId}
												onChange={(value) => setEditForm((f) => ({ ...f, categoryId: value }))}
												placeholder="No Category"
												isClearable={false}
											/>
										</div>
										<div className="form-group">
											<label className="form-label">Vendors</label>
											<MultiSearchableSelect
												options={vendors.map((v: any) => ({ value: v.id, label: v.name }))}
												value={editForm.vendorIds}
												onChange={(values) => setEditForm((f) => ({ ...f, vendorIds: values }))}
												placeholder="Select vendors"
											/>
										</div>
									</div>
									<div className="form-grid-3">
										<div className="form-group">
											<label className="form-label">Unit of Measure</label>
											{units.length > 0 ? (
												<SearchableSelect
													options={[
														{ value: '', label: '— Select —' },
														...units.map((u: any) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }))
													]}
													value={editForm.unitOfMeasureId}
													onChange={(value) => handleUnitChange(value, setEditForm)}
													placeholder="Select Unit"
													isClearable={false}
												/>
											) : (
												<input className="input-field" type="text" value={editForm.unitOfMeasure} onChange={(e) => setEditForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} />
											)}
										</div>
										<div className="form-group">
											<label className="form-label">Low Stock Threshold</label>
											<input className="input-field" type="number" value={editForm.lowStockThreshold} onChange={(e) => setEditForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} />
										</div>
										<div className="form-group">
											<label className="form-label">Max Stack Height (cm)</label>
											<input className="input-field" type="number" value={editForm.maxStackHeight} onChange={(e) => setEditForm((f) => ({ ...f, maxStackHeight: e.target.value }))} />
										</div>
									</div>
									<div className="form-group">
										<label className="form-label">Description</label>
										<input className="input-field" type="text" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
									</div>
									{/* Pricing Section */}
									<div className="border-t border-gray-200 pt-4 mt-4">
										<p className="form-label mb-3">💰 Default Pricing</p>
										<p className="text-xs text-gray-500 mb-4">These prices are used as defaults when creating GRNs and when no batch-specific pricing exists.</p>
										<div className="form-grid-2">
											<div className="form-group">
												<label className="form-label">Cost Price</label>
												<input className="input-field" type="number" step="0.01" value={editForm.costPrice} placeholder="0.00" onChange={(e) => setEditForm((f) => ({ ...f, costPrice: e.target.value }))} />
											</div>
											<div className="form-group">
												<label className="form-label">Selling Price</label>
												<input className="input-field" type="number" step="0.01" value={editForm.sellingPrice} placeholder="0.00" onChange={(e) => setEditForm((f) => ({ ...f, sellingPrice: e.target.value }))} />
											</div>
											<div className="form-group">
												<label className="form-label">Wholesale Price</label>
												<input className="input-field" type="number" step="0.01" value={editForm.wholesalePrice} placeholder="0.00" onChange={(e) => setEditForm((f) => ({ ...f, wholesalePrice: e.target.value }))} />
											</div>
											<div className="form-group">
												<label className="form-label">Bulk Price</label>
												<input className="input-field" type="number" step="0.01" value={editForm.bulkPrice} placeholder="0.00" onChange={(e) => setEditForm((f) => ({ ...f, bulkPrice: e.target.value }))} />
											</div>
											<div className="form-group">
												<label className="form-label">Margin Type</label>
												<select className="input-field" value={editForm.marginType} onChange={(e) => setEditForm((f) => ({ ...f, marginType: e.target.value as 'fixed' | 'percentage' | '' }))}>
													<option value="">— No Margin —</option>
													<option value="fixed">Fixed Amount</option>
													<option value="percentage">Percentage</option>
												</select>
											</div>
											<div className="form-group">
												<label className="form-label">Margin Value</label>
												<input className="input-field" type="number" step="0.01" value={editForm.marginValue} placeholder={editForm.marginType === 'percentage' ? '0.00%' : '0.00'} onChange={(e) => setEditForm((f) => ({ ...f, marginValue: e.target.value }))} disabled={!editForm.marginType} />
											</div>
											<div className="form-group">
												<label className="form-label">Currency</label>
												<input className="input-field" type="text" value={editForm.currency} onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value }))} />
											</div>
										</div>
									</div>
									{/* Date & Shelf Life Section */}
									<div className="border-t border-gray-200 pt-4 mt-4">
										<p className="form-label mb-3">📅 Manufacture & Expiry Dates</p>
										<p className="text-xs text-gray-500 mb-4">Set default dates for product batches. Expiry date will auto-calculate if shelf life is provided.</p>
										<div className="form-grid-2">
											<div className="form-group">
												<label className="form-label">Default Manufacturing Date</label>
												<input className="input-field" type="date" value={editForm.defaultManufacturingDate} onChange={(e) => {
													setEditForm((f) => {
														const newForm = { ...f, defaultManufacturingDate: e.target.value };
														// Auto-calculate expiry if shelf life is set
														if (e.target.value && f.shelfLifeDays) {
															const mfgDate = new Date(e.target.value);
															const expiryDate = new Date(mfgDate);
															expiryDate.setDate(expiryDate.getDate() + parseInt(f.shelfLifeDays));
															newForm.defaultExpiryDate = expiryDate.toISOString().split('T')[0];
														}
														return newForm;
													});
												}} />
											</div>
											<div className="form-group">
												<label className="form-label">Default Expiry Date</label>
												<input className="input-field" type="date" value={editForm.defaultExpiryDate} onChange={(e) => setEditForm((f) => ({ ...f, defaultExpiryDate: e.target.value }))} />
											</div>
											<div className="form-group">
												<label className="form-label">Shelf Life (days)</label>
												<input className="input-field" type="number" value={editForm.shelfLifeDays} placeholder="e.g., 365" onChange={(e) => {
													setEditForm((f) => {
														const newForm = { ...f, shelfLifeDays: e.target.value };
														// Auto-calculate expiry if manufacturing date is set
														if (f.defaultManufacturingDate && e.target.value) {
															const mfgDate = new Date(f.defaultManufacturingDate);
															const expiryDate = new Date(mfgDate);
															expiryDate.setDate(expiryDate.getDate() + parseInt(e.target.value));
															newForm.defaultExpiryDate = expiryDate.toISOString().split('T')[0];
														}
														return newForm;
													});
												}} />
												<p className="text-xs text-gray-400 mt-1">Auto-calculates expiry when manufacture date is set</p>
											</div>
										</div>
									</div>
									<div className="flex items-center gap-6">
										<label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
											<input type="checkbox" checked={editForm.isFragile} onChange={(e) => setEditForm((f) => ({ ...f, isFragile: e.target.checked }))} />
											⚠️ Fragile
										</label>
										<label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
											<input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))} />
											Active
										</label>
									</div>
								</div>
							)}
							{modalTab === 'tags' && (
								<div className="form-stack">
									<p className="text-sm text-gray-500">Assign tags for filtering and organization.</p>
									<div className="flex flex-wrap gap-2 min-h-[36px]">
										{editTags.length === 0 ? <span className="text-sm text-gray-400">No tags assigned</span>
											: editTags.map((id) => (
												<span key={id} className="inline-flex items-center gap-1">
													<UiBadge tone="info">{getTagName(id)}</UiBadge>
													<button onClick={() => removeEditTag(id)} className="modal-close text-sm">✕</button>
												</span>
											))}
									</div>
									<div className="border-t border-gray-100 pt-4 flex gap-2">
										<input type="text" className="input-field flex-1" placeholder="Type tag name…" value={editNewTagInput} onChange={(e) => setEditNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditTagByName(); } }} list="edit-tag-opts" />
										<datalist id="edit-tag-opts">{allTags.filter((t: any) => !editTags.includes(t.id)).map((t: any) => <option key={t.id} value={t.name} />)}</datalist>
										<button type="button" className="btn-primary" onClick={addEditTagByName}>+ Add</button>
									</div>
									<p className="text-xs text-gray-400">New tags are created automatically.</p>
									<div className="border-t border-gray-100 pt-4">
										<p className="text-sm font-medium text-gray-700 mb-2">Available Tags</p>
										<div className="flex flex-wrap gap-2">
											{allTags.length === 0 ? <span className="text-sm text-gray-400">No tags yet.</span>
												: allTags.map((t: any) => (
													<button key={t.id} onClick={() => addEditTag(t.id)} disabled={editTags.includes(t.id)} style={{ fontSize: '13px', padding: '4px 12px', borderRadius: '9999px', border: '1px solid', borderColor: editTags.includes(t.id) ? '#b5c4ff' : '#c9cccf', background: editTags.includes(t.id) ? '#e8efff' : 'white', color: editTags.includes(t.id) ? '#3b5bdb' : '#6d7175', cursor: editTags.includes(t.id) ? 'default' : 'pointer' }}>
														{editTags.includes(t.id) ? '✓ ' : '+ '}{t.name}
													</button>
												))}
										</div>
									</div>
								</div>
							)}
							{modalTab === 'barcodes' && (
								<div className="form-stack">
									{barcodes.length === 0 ? <p className="text-sm text-gray-400">No barcodes assigned.</p>
										: barcodes.map((bc: any) => (
											<div key={bc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
												<div className="flex items-center gap-3">
													<span className="font-mono text-sm">{bc.barcode}</span>
													<UiBadge>{bc.barcodeType}</UiBadge>
													{bc.isDefault && <UiBadge tone="info">Default</UiBadge>}
													{bc.label && <span className="text-xs text-gray-500">({bc.label})</span>}
												</div>
												<button type="button" className="btn-sm text-red-600" onClick={() => handleDeleteBarcode(bc.id)}>Remove</button>
											</div>
										))}
									<form onSubmit={handleAddBarcode} className="border-t border-gray-100 pt-4 form-stack">
										<p className="text-sm font-semibold text-gray-700">Add Barcode</p>
										<div className="form-group">
											<label className="form-label">Barcode value *</label>
											<input className="input-field" type="text" value={newBarcode.barcode} required onChange={(e) => setNewBarcode((b) => ({ ...b, barcode: e.target.value }))} />
										</div>
										<div className="form-grid-2">
											<div className="form-group">
												<label className="form-label">Type</label>
												<SearchableSelect
													options={['EAN13', 'UPC', 'QRCode', 'Code128', 'Code39', 'Custom'].map((t) => ({ value: t, label: t }))}
													value={newBarcode.barcodeType}
													onChange={(value) => setNewBarcode((b) => ({ ...b, barcodeType: value }))}
													placeholder="Select barcode type"
													isClearable={false}
												/>
											</div>
											<div className="form-group">
												<label className="form-label">Label (optional)</label>
												<input className="input-field" type="text" value={newBarcode.label} onChange={(e) => setNewBarcode((b) => ({ ...b, label: e.target.value }))} />
											</div>
										</div>
										<label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
											<input type="checkbox" checked={newBarcode.isDefault} onChange={(e) => setNewBarcode((b) => ({ ...b, isDefault: e.target.checked }))} />
											Set as Default
										</label>
										<button type="submit" className="btn-primary self-start">Add Barcode</button>
									</form>
								</div>
							)}
							{modalTab === 'locations' && (
								<div className="flex flex-col gap-5">
									<form onSubmit={handleAssignInventory} className="border border-gray-200 rounded-lg p-4 bg-gray-50 form-stack">
										<div className="flex items-start justify-between gap-3">
											<div>
												<p className="text-sm font-semibold text-gray-700">Assign stock to a location</p>
												<p className="text-xs text-gray-500 mt-1">Create an inventory record for this product on a floor, shelf, or box.</p>
											</div>
										</div>
										<div className="form-grid-2">
											{assignmentVariants.length > 0 && (
												<div className="form-group">
													<label className="form-label">Variant</label>
													<SearchableSelect
														options={[
															{ value: '', label: '— Base Product —' },
															...assignmentVariants.map((variant: any) => ({ value: variant.id, label: `${variant.name || variant.variantCode} (${variant.variantCode})` }))
														]}
														value={assignmentForm.variantId}
														onChange={(value) => {
															setAssignmentForm((form) => ({ ...form, variantId: value, batchId: '' }));
															fetchAssignmentBatches(value);
														}}
														placeholder="Base Product"
														isClearable={false}
													/>
												</div>
											)}
											<div className="form-group">
												<label className="form-label">Quantity *</label>
												<input
													className="input-field"
													type="number"
													min={QUANTITY_INPUT_MIN}
													step={QUANTITY_INPUT_STEP}
													required
													value={assignmentForm.quantity}
													onChange={(e) => setAssignmentForm((form) => ({ ...form, quantity: e.target.value }))}
												/>
											</div>
											<div className="form-group">
												<label className="form-label">State</label>
												<SearchableSelect
													options={Object.values(InventoryState).map((state) => ({ value: state, label: state }))}
													value={assignmentForm.state}
													onChange={(value) => setAssignmentForm((form) => ({ ...form, state: value }))}
													placeholder="Select State"
													isClearable={false}
												/>
											</div>
											<div className="form-group">
												<label className="form-label">Floor *</label>
												<SearchableSelect
													options={[
														{ value: '', label: '— Select Floor —' },
														...assignmentFloors.map((floor: any) => ({
															value: floor.id,
															label: floor.branch?.name ? `${floor.branch.name} › ${floor.name}` : `${floor.name} (${floor.code})`
														}))
													]}
													value={assignmentForm.floorId}
													onChange={(value) => {
														setAssignmentForm((form) => ({ ...form, floorId: value, shelfId: '', boxId: '' }));
														fetchAssignmentShelves(value);
														if (value) fetchAssignmentBoxes({ floorId: value });
														else setAssignmentBoxes([]);
													}}
													placeholder="Select Floor"
													isClearable={false}
												/>
											</div>
											{assignmentForm.floorId && (
												<div className="form-group">
													<label className="form-label">Shelf</label>
													<SearchableSelect
														options={[
															{ value: '', label: '— No Shelf —' },
															...assignmentShelves.map((shelf: any) => ({
																value: shelf.id,
																label: `${shelf.name} (${shelf.code})${shelf.rack ? ` · ${shelf.rack.name}` : ''}`
															}))
														]}
														value={assignmentForm.shelfId}
														onChange={(value) => {
															setAssignmentForm((form) => ({ ...form, shelfId: value, boxId: '' }));
															if (value) fetchAssignmentBoxes({ shelfId: value });
															else fetchAssignmentBoxes({ floorId: assignmentForm.floorId });
														}}
														placeholder="No Shelf"
														isClearable={false}
													/>
												</div>
											)}
											{assignmentForm.floorId && assignmentBoxes.length > 0 && (
												<div className="form-group">
													<label className="form-label">Box</label>
													<SearchableSelect
														options={[
															{ value: '', label: '— No Box —' },
															...assignmentBoxes.map((box: any) => ({ value: box.id, label: `${box.name} (${box.code})` }))
														]}
														value={assignmentForm.boxId}
														onChange={(value) => setAssignmentForm((form) => ({ ...form, boxId: value }))}
														placeholder="No Box"
														isClearable={false}
													/>
												</div>
											)}
											<div className="form-group">
												<label className="form-label">Batch</label>
												<SearchableSelect
													options={[
														{ value: '', label: '— No Batch —' },
														...assignmentBatches.map((batch: any) => ({
															value: batch.id,
															label: `${batch.batchNumber}${batch.expiryDate ? ` · Exp ${new Date(batch.expiryDate).toLocaleDateString()}` : ''}`
														}))
													]}
													value={assignmentForm.batchId}
													onChange={(value) => setAssignmentForm((form) => ({ ...form, batchId: value }))}
													placeholder="No Batch"
													isClearable={false}
												/>
											</div>
										</div>
										{assignmentFloors.length === 0 && (
											<p className="text-xs text-amber-600">No active floors are available. Create floors, shelves, and boxes from Locations first.</p>
										)}
										<button type="submit" className="btn-primary self-start" disabled={isAssigningInventory || assignmentFloors.length === 0}>
											{isAssigningInventory ? 'Saving…' : 'Assign Stock'}
										</button>
									</form>

									<div>
										<p className="text-sm text-gray-500 mb-4">Current inventory by location for this product. Click Transition to change state.</p>
										{locationsLoading ? (
											<p className="text-sm text-gray-400">Loading…</p>
										) : inventoryLocations.length === 0 ? (
											<div className="text-center py-8">
												<div className="text-4xl mb-2">📭</div>
												<p className="text-sm text-gray-400">No inventory records found</p>
											</div>
										) : (
											<div className="flex flex-col gap-3">
												{Object.entries(
													inventoryLocations.reduce((acc: any, record: any) => {
														const locationName = formatInventoryLocation(record);
														if (!acc[locationName]) acc[locationName] = { locationName, records: [] };
														acc[locationName].records.push(record);
														return acc;
													}, {})
												).map(([locKey, val]: [string, any]) => {
													const totalQty = val.records.reduce((sum: number, record: any) => sum + (record.quantity || 0), 0);
													const isLowStock = editingSku?.lowStockThreshold != null && totalQty <= editingSku.lowStockThreshold;
													return (
														<div key={locKey} className="border border-gray-200 rounded-lg overflow-hidden">
															<div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
																<span className="font-medium text-sm">📍 {val.locationName}</span>
																<div className="flex items-center gap-2">
																	{isLowStock && <UiBadge tone="warning">⚠️ Low Stock</UiBadge>}
																	<UiBadge tone="info">{formatQuantity(totalQty)} units</UiBadge>
																</div>
															</div>
															{val.records.map((record: any) => (
																<div key={record.id} className="flex items-center justify-between px-4 py-2 text-sm border-b border-gray-100 last:border-0">
																	<div className="flex items-center gap-3">
																		<UiBadge>{record.state}</UiBadge>
																		{record.variant && <span className="text-xs text-indigo-600">Variant: {record.variant.name ?? record.variant.variantCode}</span>}
																		{record.batch && <span className="text-xs text-gray-500">Batch: {record.batch.batchNumber}</span>}
																	</div>
																	<div className="flex items-center gap-3">
																		<span className="font-medium">{formatQuantity(record.quantity)} {editingSku?.unitOfMeasure}</span>
																		<button
																			className="btn-sm"
																			disabled={transitioningInv === record.id}
																			onClick={() => openTransitionModal(record)}
																		>
																			{transitioningInv === record.id ? '…' : 'Transition'}
																		</button>
																	</div>
																</div>
															))}
														</div>
													);
												})}
											</div>
										)}
									</div>
								</div>
							)}
							{modalTab === 'variants' && (
								<div className="flex flex-col gap-4">
									{variantsLoading ? (
										<p className="text-sm text-gray-400">Loading…</p>
									) : (
										<>
											{/* Attribute selector */}
											{allAttributes.length > 0 && (
												<div className="border border-gray-200 rounded-lg p-4">
													<p className="text-sm font-semibold text-gray-700 mb-3">Generate Variants from Attributes</p>
													<div className="flex flex-col gap-3">
														{allAttributes.map((attr: any) => (
															<div key={attr.id}>
																<p className="text-xs font-medium text-gray-600 mb-1">{attr.name}</p>
																<div className="flex flex-wrap gap-2">
																	{(attr.values ?? []).map((val: any) => {
																		const checked = (selectedAttrs[attr.id] ?? []).includes(val.id);
																		return (
																			<label key={val.id} className="flex items-center gap-1 cursor-pointer text-sm">
																				<input
																					type="checkbox"
																					checked={checked}
																					onChange={(e) => {
																						setSelectedAttrs(prev => {
																							const cur = prev[attr.id] ?? [];
																							return {
																								...prev,
																								[attr.id]: e.target.checked
																									? [...cur, val.id]
																									: cur.filter((id: string) => id !== val.id),
																							};
																						});
																					}}
																				/>
																				{attr.type === 'color' ? (<span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full border border-gray-300" style={{ background: val.representedValue }} />{val.displayName}</span>) : val.displayName}
																			</label>
																		);
																	})}
																</div>
															</div>
														))}
													</div>
													<button className="btn-primary mt-3" onClick={handleGenerateVariants}>⚡ Generate Variants</button>
												</div>
											)}
											{allAttributes.length === 0 && (
												<p className="text-sm text-gray-400">No global attributes defined. Go to Settings → Product Attributes to create some.</p>
											)}
											{/* Variants list */}
											{skuVariants.length === 0 ? (
												<div className="text-center py-6 text-gray-400">No variants yet. Select attributes above and click Generate.</div>
											) : (
												<table className="w-full text-sm border-collapse">
													<thead>
														<tr className="bg-gray-50">
															{['Code', 'Variant', 'Attributes', 'Active', ''].map(h => (
																<th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{h}</th>
															))}
														</tr>
													</thead>
													<tbody>
														{skuVariants.map((v: any) => (
															<tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
																<td className="px-3 py-2 font-mono text-xs text-gray-600">{v.variantCode}</td>
																<td className="px-3 py-2 font-medium">{v.name}</td>
																<td className="px-3 py-2">
																	<div className="flex flex-wrap gap-1">
																		{(v.attributeValues ?? []).map((av: any) => (
																			<span key={av.attributeValueId} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
																				{av.attribute?.type === 'color' && av.attributeValue?.representedValue && (
																					<span
																						className="inline-block w-3 h-3 rounded-full border border-indigo-200 flex-shrink-0"
																						style={{ background: av.attributeValue.representedValue }}
																					/>
																				)}
																				{av.attribute?.name}: {av.attributeValue?.displayName}
																			</span>
																		))}
																	</div>
																</td>
																<td className="px-3 py-2">
																	<input type="checkbox" checked={v.isActive} onChange={(e) => handleToggleVariant(v.id, e.target.checked)} />
																</td>
																<td className="px-3 py-2">
																	<button className="btn-sm text-red-600 text-xs" onClick={() => handleDeleteVariant(v.id, v.name)}>Delete</button>
																</td>
															</tr>
														))}
													</tbody>
												</table>
											)}
										</>
									)}
								</div>
							)}
							{modalTab === 'duplicates' && (
								<div className="flex flex-col gap-4">
									<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
										Products imported as standalone SKUs can be merged into this product or converted into variants while preserving inventory, batches, barcodes, images, vendors, tags, GRN/PRN lines, and stock transfer lines.
									</div>
									{duplicatesLoading ? (
										<p className="text-sm text-gray-400">Scanning for similar products…</p>
									) : duplicateCandidates.length === 0 ? (
										<div className="text-center py-8">
											<div className="text-4xl mb-2">🔎</div>
											<p className="text-sm text-gray-400">No likely duplicates found for this product.</p>
										</div>
									) : (
										<table className="w-full text-sm border-collapse">
											<thead>
												<tr className="bg-gray-50">
													{['Product', 'Match', 'Counts', 'Variant Values', ''].map(h => (
														<th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{h}</th>
													))}
												</tr>
											</thead>
											<tbody>
												{duplicateCandidates.map((candidate: any) => {
													const sku = candidate.sku;
													const isWorking = duplicateActionId === sku.id;
													const vendorNames = sku.skuVendors?.length > 0
														? sku.skuVendors.map((sv: any) => sv.vendor?.name).filter(Boolean).join(', ')
														: sku.vendor?.name;
													return (
														<tr key={sku.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
															<td className="px-3 py-3">
																<div className="font-medium text-gray-800">{sku.name}</div>
																<div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
																	<span className="font-mono">{sku.skuCode}</span>
																	<span>{sku.category?.name ?? 'No category'}</span>
																	{vendorNames && <span>{vendorNames}</span>}
																</div>
															</td>
															<td className="px-3 py-3">
																<div className="flex flex-col gap-1">
																	<span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${candidate.relationship === 'variant' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
																		{candidate.relationship === 'variant' ? 'Variant candidate' : 'Duplicate candidate'}
																	</span>
																	<span className="text-xs text-gray-500">{candidate.score}% match</span>
																	<span className="text-xs text-gray-400">{candidate.reason}</span>
																</div>
															</td>
															<td className="px-3 py-3 text-xs text-gray-500">
																<div>{sku._count?.inventoryRecords ?? 0} inventory</div>
																<div>{sku._count?.batches ?? 0} batches</div>
																<div>{sku._count?.variants ?? 0} variants</div>
															</td>
															<td className="px-3 py-3">
																<div className="flex flex-wrap gap-1">
																	{candidate.matchedVariantValues?.length > 0 ? (
																		candidate.matchedVariantValues.map((value: any) => (
																			<span key={`${sku.id}-${value.attributeValueId}`} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
																				{value.attributeType === 'color' && value.representedValue && (
																					<span className="inline-block w-3 h-3 rounded-full border border-indigo-200" style={{ background: value.representedValue }} />
																				)}
																				{value.attributeName}: {value.label}
																			</span>
																		))
																	) : (
																		<span className="text-xs text-gray-400">No attribute values detected</span>
																	)}
																</div>
															</td>
															<td className="px-3 py-3">
																<div className="flex flex-col gap-2 items-start">
																	<button
																		type="button"
																		className="btn-sm text-xs"
																		disabled={isWorking || (sku._count?.variants ?? 0) > 0}
																		onClick={() => handleVariantizeDuplicate(candidate)}
																		title={(sku._count?.variants ?? 0) > 0 ? 'Products that already have variants must be merged instead.' : 'Convert this product into a variant of the current product'}
																	>
																		{isWorking ? 'Working…' : 'Variantize'}
																	</button>
																	<button
																		type="button"
																		className="btn-sm text-red-600 text-xs"
																		disabled={isWorking}
																		onClick={() => handleMergeDuplicate(candidate)}
																		title="Merge this duplicate into the current product"
																	>
																		Merge
																	</button>
																</div>
															</td>
														</tr>
													);
												})}
											</tbody>
										</table>
									)}
								</div>
							)}
							{modalTab === 'images' && (
								<div className="flex flex-col gap-6">
									<div className="border border-gray-200 rounded-lg p-4">
										<p className="text-sm font-semibold text-gray-700 mb-2">Media Scope</p>
										<div className="max-w-md">
											<SearchableSelect
												options={[
													{ value: '', label: 'Product media' },
													...skuVariants.map((variant: any) => ({
														value: variant.id,
														label: `${variant.name ?? variant.variantCode} (${variant.variantCode})`,
													})),
												]}
												value={selectedImageVariantId}
												onChange={(value) => {
													setSelectedImageVariantId(value);
													loadImages(value);
												}}
												placeholder="Product media"
												isClearable={false}
											/>
										</div>
										<p className="text-xs text-gray-500 mt-2">
											Product media is used by default. Select a variant to manage images only for that variant.
										</p>
									</div>
									<div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
										<p className="text-sm font-semibold text-gray-700 mb-2">
											Upload {selectedImageVariantId ? 'Variant Images' : 'Product Images / Video'}
										</p>
										<MediaUpload
											skuId={editingSku.id}
											variantId={selectedImageVariantId || null}
											onUploadComplete={() => loadImages(selectedImageVariantId)}
											apiBaseUrl=""
											authToken={authToken}
											allowVideo={!selectedImageVariantId}
											scopeLabel={imageScopeLabel}
										/>
									</div>
									<div className="border border-gray-200 rounded-lg p-4">
										<p className="text-sm font-semibold text-gray-700 mb-3">
											{selectedImageVariantId ? 'Variant Gallery' : 'Product Gallery'}
										</p>
										{imagesLoading ? (
											<p className="text-sm text-gray-400">Loading images…</p>
										) : (
											<ImageGalleryManager
												skuId={editingSku.id}
												images={skuImages}
												videoUrl={skuVideoUrl}
												apiBaseUrl=""
												authToken={authToken}
												onUpdate={() => loadImages(selectedImageVariantId)}
												showVideo={!selectedImageVariantId}
												imageHeading={selectedImageVariantId ? 'Variant Images' : 'Product Images'}
											/>
										)}
									</div>
								</div>
							)}
							{modalTab === 'pricing' && (
								<div className="flex flex-col gap-6">
									{/* Batch Records Pricing */}
									<div className="border border-gray-200 rounded-lg p-4">
										<p className="text-sm font-semibold text-gray-700 mb-3">Batch Pricing</p>
										{batchPrices.length === 0 ? (
											<p className="text-sm text-gray-400 mb-3">No batches found for this product. Create batches via GRN receipts.</p>
										) : (
											<table className="w-full text-sm border-collapse mb-3">
												<thead>
													<tr className="bg-gray-50">
														{['Batch #', 'Variant', 'Cost Price', 'Selling Price', 'Wholesale', 'Bulk Price', ''].map(h => (
															<th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{h}</th>
														))}
													</tr>
												</thead>
												<tbody>
													{batchPrices.map((bp: any) => {
														const isEditing = editingBatchPrice?.id === bp.id;
														const ep = editingBatchPrice;
														return (
														<tr key={bp.id} className="border-b border-gray-100 hover:bg-gray-50">
															<td className="px-3 py-2 font-mono text-xs">{bp.batchNumber}</td>
															<td className="px-3 py-2 text-xs text-gray-500">{bp.variant?.name ?? bp.variant?.variantCode ?? '—'}</td>
															{isEditing && ep ? (
																<>
																	<td className="px-3 py-2"><input className="input-field text-xs" style={{ width: '80px' }} type="number" step="0.01" value={ep.costPrice} onChange={e => setEditingBatchPrice(p => p ? { ...p, costPrice: e.target.value } : p)} /></td>
																	<td className="px-3 py-2"><input className="input-field text-xs" style={{ width: '80px' }} type="number" step="0.01" value={ep.sellingPrice} onChange={e => setEditingBatchPrice(p => p ? { ...p, sellingPrice: e.target.value } : p)} /></td>
																	<td className="px-3 py-2"><input className="input-field text-xs" style={{ width: '80px' }} type="number" step="0.01" value={ep.wholesalePrice} onChange={e => setEditingBatchPrice(p => p ? { ...p, wholesalePrice: e.target.value } : p)} /></td>
																	<td className="px-3 py-2"><input className="input-field text-xs" style={{ width: '80px' }} type="number" step="0.01" value={ep.bulkPrice} onChange={e => setEditingBatchPrice(p => p ? { ...p, bulkPrice: e.target.value } : p)} /></td>
																	<td className="px-3 py-2 flex gap-1">
																		<button className="btn-sm text-xs" onClick={handleSaveBatchPrice}>Save</button>
																		<button className="btn-sm text-xs text-gray-500" onClick={() => setEditingBatchPrice(null)}>Cancel</button>
																	</td>
																</>
															) : (
																<>
																	<td className="px-3 py-2">{bp.costPrice ?? '—'}</td>
																	<td className="px-3 py-2">{bp.sellingPrice ?? '—'}</td>
																	<td className="px-3 py-2">{bp.wholesalePrice ?? '—'}</td>
																	<td className="px-3 py-2">{bp.bulkPrice ?? '—'}</td>
																	<td className="px-3 py-2">
																		<button className="btn-sm text-xs" onClick={() => handleEditBatchPrice(bp)}>Edit</button>
																	</td>
																</>
															)}
														</tr>
														);
													})}
												</tbody>
											</table>
										)}
									</div>
									{/* Quantity Tier Pricing */}
									<div className="border border-gray-200 rounded-lg p-4">
										<p className="text-sm font-semibold text-gray-700 mb-3">Quantity Tier Pricing</p>
										{quantityTiers.length === 0 ? (
											<p className="text-sm text-gray-400 mb-3">No quantity tiers set.</p>
										) : (
											<table className="w-full text-sm border-collapse mb-3">
												<thead>
													<tr className="bg-gray-50">
														{['Min Qty', 'Max Qty', 'Price', 'Currency', ''].map(h => (
															<th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">{h}</th>
														))}
													</tr>
												</thead>
												<tbody>
													{quantityTiers.map((tier: any, i: number) => (
														<tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
															<td className="px-3 py-2">{tier.minQty}</td>
															<td className="px-3 py-2">{tier.maxQty ?? '∞'}</td>
															<td className="px-3 py-2">{tier.price}</td>
															<td className="px-3 py-2">{tier.currency}</td>
															<td className="px-3 py-2">
																<button className="btn-sm text-red-600 text-xs" onClick={() => handleRemoveQtyTier(i)}>Remove</button>
															</td>
														</tr>
													))}
												</tbody>
											</table>
										)}
										<form onSubmit={handleAddQtyTier} className="flex flex-wrap gap-2 items-end">
											<div className="flex flex-col gap-1">
												<label className="text-xs text-gray-500">Min Qty *</label>
												<input className="input-field text-sm" type="number" min="0" placeholder="0" value={newQtyTier.minQty} onChange={e => setNewQtyTier(p => ({ ...p, minQty: e.target.value }))} />
											</div>
											<div className="flex flex-col gap-1">
												<label className="text-xs text-gray-500">Max Qty</label>
												<input className="input-field text-sm" type="number" min="0" placeholder="Leave blank for unlimited" value={newQtyTier.maxQty} onChange={e => setNewQtyTier(p => ({ ...p, maxQty: e.target.value }))} />
											</div>
											<div className="flex flex-col gap-1">
												<label className="text-xs text-gray-500">Price *</label>
												<input className="input-field text-sm" type="number" step="0.01" placeholder="0.00" value={newQtyTier.price} onChange={e => setNewQtyTier(p => ({ ...p, price: e.target.value }))} />
											</div>
											<div className="flex flex-col gap-1">
												<label className="text-xs text-gray-500">Currency</label>
												<input className="input-field text-sm" placeholder="USD" value={newQtyTier.currency} onChange={e => setNewQtyTier(p => ({ ...p, currency: e.target.value }))} />
											</div>
											<button type="submit" className="btn-primary text-sm">+ Add</button>
										</form>
									</div>
								</div>
							)}
						</div>
						<div className="modal-footer">
							<button type="button" className="btn-secondary" onClick={() => setEditingSku(null)}>Close</button>
							{modalTab === 'details' && (
								<button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={isSaving}>
									{isSaving ? '⏳ Saving…' : '💾 Save Changes'}
								</button>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Transition Modal */}
			{transitionRecord && (() => {
				const currentState = transitionRecord.state as InventoryState;
				const allowedNext = (ALLOWED_TRANSITIONS[currentState] ?? []) as InventoryState[];
				const allStates = Object.values(InventoryState);
				return (
					<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setTransitionRecord(null)}>
						<div className="modal-panel-md">
							<div className="modal-header">
								<h2 className="modal-title">🔄 State Transition</h2>
								<button className="modal-close" onClick={() => setTransitionRecord(null)}>✕</button>
							</div>
							<form onSubmit={handleTransitionInvSubmit}>
								<div className="modal-body form-stack">
									<div className="form-group">
										<label className="form-label">Current State</label>
										<StateBadge state={transitionRecord.state} />
									</div>
									<div className="form-group">
										<label className="form-label">Transition To *</label>
										<SearchableSelect
											options={[
												{ value: '', label: '— Select new state —' },
												...allowedNext.map(s => ({ value: s, label: `✅ ${s}` })),
												...allStates
													.filter(s => s !== currentState && !allowedNext.includes(s as InventoryState))
													.map(s => ({ value: s, label: `⚠️ ${s} (Override)` }))
											]}
											value={transitionForm.toState}
											onChange={(value) => setTransitionForm(f => ({ ...f, toState: value }))}
											placeholder="Select new state"
											isClearable={false}
										/>
										{allowedNext.length === 0 && (
											<p className="text-xs text-amber-600 mt-1">⚠️ No valid transitions from "{currentState}". Override requires Manager or Admin role.</p>
										)}
									</div>
									<div className="form-group">
										<label className="form-label">Reason</label>
										<input
											className="input-field"
											type="text"
											placeholder="Optional reason for this transition"
											value={transitionForm.reason}
											onChange={(e) => setTransitionForm(f => ({ ...f, reason: e.target.value }))}
										/>
									</div>
								</div>
								<div className="modal-footer">
									<button type="button" className="btn-secondary" onClick={() => setTransitionRecord(null)}>Cancel</button>
									<button type="submit" className="btn-primary" disabled={!transitionForm.toState || transitioningInv === transitionRecord.id}>
										{transitioningInv === transitionRecord.id ? '⏳ Transitioning…' : '🔄 Apply Transition'}
									</button>
								</div>
							</form>
						</div>
					</div>
				);
			})()}
		</div>
	);
}
