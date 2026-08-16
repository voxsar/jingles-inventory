import axios from 'axios';
import { branding } from '../config/branding';
import { clearDesktopAuthCache, redirectToLogin, resolveBackendUrl } from '../utils/runtime';

const api = axios.create({
  baseURL: resolveBackendUrl('/api'),
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(branding.tokenStorageKey);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(branding.tokenStorageKey);
      clearDesktopAuthCache();
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  unlock: (pin: string) => api.post('/auth/unlock', { pin }),
  refreshSyncToken: (password: string) => api.post('/auth/sync-token', { password }),
};

export const devicesApi = {
  list: () => api.get('/devices'),
  rename: (deviceId: string, name: string) =>
    api.patch(`/devices/${encodeURIComponent(deviceId)}/name`, { name }),
};

// Dashboard
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  refreshStats: () => api.post('/dashboard/refresh'),
};

// SKUs
export const skusApi = {
  list: (params?: Record<string, string>) =>
    api.get('/skus', { params }),
  get: (id: string) => api.get(`/skus/${id}`),
  create: (data: any) => api.post('/skus', data),
  update: (id: string, data: any) => api.put(`/skus/${id}`, data),
  delete: (id: string) => api.delete(`/skus/${id}`),
  // Duplicate consolidation
  getDuplicateGroups: (params?: Record<string, string>) => api.get('/skus/duplicates', { params }),
  getDuplicates: (id: string) => api.get(`/skus/${id}/duplicates`),
  mergeDuplicate: (id: string, sourceId: string) => api.post(`/skus/${id}/duplicates/${sourceId}/merge`),
  variantizeDuplicate: (id: string, sourceId: string) => api.post(`/skus/${id}/duplicates/${sourceId}/variantize`),
  createVariantFamily: (data: { masterSkuId: string; sourceSkuIds: string[] }) => api.post('/skus/variant-families', data),
  // Barcodes
  getBarcodes: (id: string) => api.get(`/skus/${id}/barcodes`),
  lookupBarcode: (barcode: string) => api.get('/skus/barcodes/lookup', { params: { barcode } }),
  addBarcode: (id: string, data: any) => api.post(`/skus/${id}/barcodes`, data),
  deleteBarcode: (id: string, bcId: string) => api.delete(`/skus/${id}/barcodes/${bcId}`),
  // Images
  getImages: (id: string, variantId?: string | null) =>
    api.get(`/skus/${id}/images`, { params: variantId ? { variantId } : undefined }),
  addImage: (id: string, data: any) => api.post(`/skus/${id}/images`, data),
  deleteImage: (id: string, imgId: string) => api.delete(`/skus/${id}/images/${imgId}`),
  // Tags
  getAllTags: () => api.get('/skus/tags/all'),
  createTag: (name: string, color?: string) => api.post('/skus/tags/create', { name, color }),
  addTag: (id: string, tagId: string) => api.post(`/skus/${id}/tags`, { tagId }),
  removeTag: (id: string, tagId: string) => api.delete(`/skus/${id}/tags/${tagId}`),
  // Inventory locations
  getInventoryLocations: (id: string) => api.get('/inventory', { params: { skuId: id, pageSize: '100' } }),
};

// Inventory
export const inventoryApi = {
  list: (params?: Record<string, string>) =>
    api.get('/inventory', { params }),
  create: (data: any) => api.post('/inventory', data),
  update: (id: string, data: any) => api.put(`/inventory/${id}`, data),
  delete: (id: string) => api.delete(`/inventory/${id}`),
  transition: (id: string, toState: string, reason?: string) =>
    api.post(`/inventory/${id}/transition`, { toState, reason }),
  adjust: (id: string, data: { quantityDelta: number; reasonCode: string; note?: string; requestId?: string }) =>
    api.post(`/inventory/${id}/adjust`, data),
  openBox: (data: any) => api.post('/inventory/box-open', data),
  events: (params?: Record<string, string>) =>
    api.get('/inventory/events', { params }),
};

// GRNs
export const grnsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/grns', { params }),
  get: (id: string) => api.get(`/grns/${id}`),
  create: (data: any) => api.post('/grns', data),
  update: (id: string, data: any) => api.put(`/grns/${id}`, data),
  submit: (id: string, deliveryDate?: string) =>
    api.put(`/grns/${id}/submit`, { deliveryDate }),
  inspect: (id: string, data: any) => api.post(`/grns/${id}/inspect`, data),
  delete: (id: string) => api.delete(`/grns/${id}`),
};

// PRNs
export const prnsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/prns', { params }),
  get: (id: string) => api.get(`/prns/${id}`),
  create: (data: any) => api.post('/prns', data),
  update: (id: string, data: any) => api.put(`/prns/${id}`, data),
  submit: (id: string, pickupDate?: string) =>
    api.put(`/prns/${id}/submit`, { pickupDate }),
  pickup: (id: string) => api.put(`/prns/${id}/pickup`),
  delete: (id: string) => api.delete(`/prns/${id}`),
};

// AI Imports
export const importsApi = {
  list: (params?: Record<string, string>) => api.get('/imports', { params }),
  get: (id: string) => api.get(`/imports/${id}`),
  create: (formData: FormData) =>
    api.post('/imports', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  listRecords: (id: string, params?: Record<string, string>) =>
    api.get(`/imports/${id}/records`, { params }),
  updateSelection: (jobId: string, data: Record<string, any>) =>
    api.patch(`/imports/${jobId}/records/selection`, data),
  updateRecordSelection: (jobId: string, recordId: string, selected: boolean) =>
    api.patch(`/imports/${jobId}/records/selection`, { selected, recordIds: [recordId] }),
  bulkUpdateSelection: (jobId: string, data: Record<string, any>) =>
    api.patch(`/imports/${jobId}/records/selection`, data),
  approve: (jobId: string) => api.post(`/imports/${jobId}/approve`),
  reject: (jobId: string, data?: { recordIds?: string[]; selectedOnly?: boolean }) =>
    api.post(`/imports/${jobId}/reject`, data ?? {}),
};

// Locations
export const floorsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/floors', { params }),
  get: (id: string) => api.get(`/floors/${id}`),
  create: (data: any) => api.post('/floors', data),
  update: (id: string, data: any) => api.put(`/floors/${id}`, data),
  delete: (id: string) => api.delete(`/floors/${id}`),
};

// Racks
export const racksApi = {
  list: (params?: Record<string, string>) => api.get('/racks', { params }),
  get: (id: string) => api.get(`/racks/${id}`),
  create: (data: any) => api.post('/racks', data),
  update: (id: string, data: any) => api.put(`/racks/${id}`, data),
  delete: (id: string) => api.delete(`/racks/${id}`),
  /** Save 3-D position/rotation to DB */
  savePosition: (id: string, pos: { posX: number; posZ: number; rotY: number }) =>
    api.put(`/racks/${id}`, pos),
};

// Shelves
export const shelvesApi = {
  list: (params?: Record<string, string>) => api.get('/shelves', { params }),
  get: (id: string) => api.get(`/shelves/${id}`),
  create: (data: any) => api.post('/shelves', data),
  update: (id: string, data: any) => api.put(`/shelves/${id}`, data),
  delete: (id: string) => api.delete(`/shelves/${id}`),
};

// Boxes
export const boxesApi = {
  list: (params?: Record<string, string>) => api.get('/boxes', { params }),
  get: (id: string) => api.get(`/boxes/${id}`),
  create: (data: any) => api.post('/boxes', data),
  update: (id: string, data: any) => api.put(`/boxes/${id}`, data),
  delete: (id: string) => api.delete(`/boxes/${id}`),
  getBarcodes: (id: string) => api.get(`/boxes/${id}/barcodes`),
  addBarcode: (id: string, data: any) => api.post(`/boxes/${id}/barcodes`, data),
  deleteBarcode: (id: string, barcodeId: string) => api.delete(`/boxes/${id}/barcodes/${barcodeId}`),
  /** Save 3-D position and stack order to DB */
  savePosition: (id: string, pos: { posX?: number; posY?: number; posZ?: number; rotationAngle?: number; stackOrder?: number; parentBoxId?: string | null }) =>
    api.put(`/boxes/${id}`, pos),
};

// Vendors / Suppliers
export const vendorsApi = {
  list: (params?: Record<string, string>) => api.get('/vendors', { params }),
  get: (id: string) => api.get(`/vendors/${id}`),
  create: (data: any) => api.post('/vendors', data),
  update: (id: string, data: any) => api.put(`/vendors/${id}`, data),
  getDuplicateGroups: (params?: Record<string, string>) => api.get('/vendors/duplicates', { params }),
  mergeDuplicate: (id: string, sourceId: string) => api.post(`/vendors/${id}/duplicates/${sourceId}/merge`),
  getProducts: (id: string) => api.get(`/vendors/${id}/products`),
  delete: (id: string) => api.delete(`/vendors/${id}`),
};

export const customersApi = {
  list: () => api.get('/pos/customers'),
  get: (id: string) => api.get(`/pos/customers/${encodeURIComponent(id)}`),
};

// Categories
export const categoriesApi = {
  list: (params?: Record<string, string>) => api.get('/categories', { params }),
  tree: () => api.get('/categories/tree'),
  get: (id: string) => api.get(`/categories/${id}`),
  create: (data: any) => api.post('/categories', data),
  update: (id: string, data: any) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// Settings (Units of Measure + Status Options)
export const settingsApi = {
	getInventoryControl: () => api.get('/settings/inventory-control'),
	zeroInventory: (confirmation: string) => api.post('/settings/inventory-control/zero', { confirmation }),
  getCommission: () => api.get('/settings/commission'),
  updateCommission: (data: { defaultRatePercent: number }) => api.put('/settings/commission', data),
  listUnits: (params?: Record<string, string>) => api.get('/settings/units', { params }),
  createUnit: (data: any) => api.post('/settings/units', data),
  updateUnit: (id: string, data: any) => api.put(`/settings/units/${id}`, data),
  deleteUnit: (id: string) => api.delete(`/settings/units/${id}`),
  listStatuses: (entityType?: string) => api.get('/settings/statuses', { params: entityType ? { entityType } : undefined }),
  createStatus: (data: any) => api.post('/settings/statuses', data),
  updateStatus: (id: string, data: any) => api.put(`/settings/statuses/${id}`, data),
  deleteStatus: (id: string) => api.delete(`/settings/statuses/${id}`),
  // Typesense Sync
  testTypesense: () => api.get('/settings/typesense/test'),
  syncTypesense: (entity?: string, recreate?: boolean) => 
    api.post('/settings/typesense/sync', { entity, recreate }),
  getTypesenseJobs: () => api.get('/settings/typesense/jobs'),
  getTypesenseJob: (jobId: string) => api.get(`/settings/typesense/jobs/${jobId}`),
};

export const runtimeApi = {
  getInfo: () => api.get('/runtime/info'),
};

// Attributes (Global Attribute System)
export const attributesApi = {
  list: () => api.get('/attributes'),
  create: (data: any) => api.post('/attributes', data),
  update: (id: string, data: any) => api.put(`/attributes/${id}`, data),
  delete: (id: string) => api.delete(`/attributes/${id}`),
  // Attribute Values
  listValues: (attributeId: string) => api.get(`/attributes/${attributeId}/values`),
  addValue: (attributeId: string, data: any) => api.post(`/attributes/${attributeId}/values`, data),
  updateValue: (attributeId: string, valueId: string, data: any) => api.put(`/attributes/${attributeId}/values/${valueId}`, data),
  deleteValue: (attributeId: string, valueId: string) => api.delete(`/attributes/${attributeId}/values/${valueId}`),
};

// SKU Variants
export const variantsApi = {
  list: (skuId: string) => api.get(`/skus/${skuId}/variants`),
  generate: (skuId: string, attributeSelections: any[]) =>
    api.post(`/skus/${skuId}/variants/generate`, { attributeSelections }),
  update: (skuId: string, variantId: string, data: any) =>
    api.put(`/skus/${skuId}/variants/${variantId}`, data),
  delete: (skuId: string, variantId: string) =>
    api.delete(`/skus/${skuId}/variants/${variantId}`),
  bulkUpdate: (skuId: string, variantIds: string[], isActive: boolean) =>
    api.put(`/skus/${skuId}/variants`, { variantIds, isActive }),
};

// Branches
export const branchesApi = {
  list: (params?: Record<string, string>) => api.get('/branches', { params }),
  get: (id: string) => api.get(`/branches/${id}`),
  create: (data: any) => api.post('/branches', data),
  update: (id: string, data: any) => api.put(`/branches/${id}`, data),
  delete: (id: string) => api.delete(`/branches/${id}`),
};

// Stock Transfers
export const stockTransfersApi = {
  list: (params?: Record<string, string>) => api.get('/stock-transfers', { params }),
  get: (id: string) => api.get(`/stock-transfers/${id}`),
  create: (data: any) => api.post('/stock-transfers', data),
  approve: (id: string) => api.put(`/stock-transfers/${id}/approve`),
  complete: (id: string) => api.put(`/stock-transfers/${id}/complete`),
  cancel: (id: string) => api.put(`/stock-transfers/${id}/cancel`),
};

// Reports
export const reportsApi = {
  inventoryValuation: (params?: Record<string, string>) =>
    api.get('/reports/inventory-valuation', { params }),
  floorPerformance: () => api.get('/reports/floor-performance'),
  salesSummary: (params?: Record<string, string>) =>
    api.get('/reports/sales-summary', { params }),
  grn: (params?: Record<string, string>) =>
    api.get('/reports/grn', { params }),
  prn: (params?: Record<string, string>) =>
    api.get('/reports/prn', { params }),
  stockAdjustment: (params?: Record<string, string>) =>
    api.get('/reports/stock-adjustment', { params }),
  stockBalance: (params?: Record<string, string>) =>
    api.get('/reports/stock-balance', { params }),
  stockMovement: (params?: Record<string, string>) =>
    api.get('/reports/stock-movement', { params }),
  tog: (params?: Record<string, string>) =>
    api.get('/reports/tog', { params }),
  catalog: (reportId: string, params?: Record<string, string>) =>
    api.get(`/reports/catalog/${reportId}`, { params }),
};

// Barcode
export const barcodeApi = {
  scan: (barcode: string, terminalId?: string) =>
    api.post('/barcode/scan', { barcode, terminalId }),
  listTemplates: () => api.get('/barcode/templates'),
  createTemplate: (data: any) => api.post('/barcode/templates', data),
  updateTemplate: (id: string, data: any) => api.put(`/barcode/templates/${id}`, data),
  generate: (data: { skuId: string; variantId?: string | null; forceNew?: boolean }) =>
    api.post('/barcode/generate', data),
  link: (data: { skuId: string; variantId?: string | null; barcode: string; barcodeType?: string; isDefault?: boolean; label?: string }) =>
    api.post('/barcode/link', data),
  listPrintJobs: (params?: Record<string, string>) => api.get('/barcode/prints', { params }),
  getPrintJob: (id: string) => api.get(`/barcode/prints/${id}`),
  createPrintJob: (data: any) => api.post('/barcode/prints', data),
  createPrintJobFromGrn: (grnId: string, data?: { templateId?: string | null }) =>
    api.post(`/barcode/prints/from-grn/${grnId}`, data ?? {}),
  markPrintJobPrinted: (id: string) => api.post(`/barcode/prints/${id}/mark-printed`),
  uploadTemplateLogo: (templateId: string, file: File) => {
    const form = new FormData();
    form.append('logo', file);
    return api.post(`/uploads/barcode-logo/${templateId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteTemplateLogo: (templateId: string) => api.delete(`/uploads/barcode-logo/${templateId}`),
};

// Space
export const spaceApi = {
  calculate: (shelfId: string) => api.get('/space/calculate', { params: { shelfId } }),
  stackingSuggestions: (skuId: string, floorId: string) =>
    api.get('/space/stacking-suggestions', { params: { skuId, floorId } }),
};

// OCR
export const ocrApi = {
  uploadInvoice: (file: File) => {
    const form = new FormData();
    form.append('invoice', file);
    return api.post('/ocr/invoice', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// Batches
export const batchesApi = {
  list: (params?: Record<string, string>) =>
    api.get('/batches', { params }),
  get: (id: string) => api.get(`/batches/${id}`),
  getByNumber: (batchNumber: string) => api.get(`/batches/by-number/${batchNumber}`),
  create: (data: any) => api.post('/batches', data),
  update: (id: string, data: any) => api.put(`/batches/${id}`, data),
  applyMargin: (id: string) => api.post(`/batches/${id}/apply-margin`),
  bulkUpdatePricing: (data: any) => api.post('/batches/bulk/update-pricing', data),
  bulkApplyMargin: (batchIds: string[]) => api.post('/batches/bulk/apply-margin', { batchIds }),
  // Pricing queries
  getPrice: (params: Record<string, string>) => api.get('/batches/pricing/get', { params }),
  getPricingSummary: (batchId: string) => api.get(`/batches/pricing/summary/${batchId}`),
  getAveragePrices: (params: Record<string, string>) => api.get('/batches/pricing/average', { params }),
};

// Pricing Overlays
export const pricingOverlaysApi = {
  list: (params?: Record<string, string>) =>
    api.get('/pricing-overlays', { params }),
  get: (id: string) => api.get(`/pricing-overlays/${id}`),
  create: (data: any) => api.post('/pricing-overlays', data),
  update: (id: string, data: any) => api.put(`/pricing-overlays/${id}`, data),
  delete: (id: string) => api.delete(`/pricing-overlays/${id}`),
  getConflicts: (id: string) => api.get(`/pricing-overlays/${id}/conflicts`),
  resolvePrice: (data: any) => api.post('/pricing-overlays/resolve-price', data),
};

// Tags
export const tagsApi = {
  list: (params?: Record<string, string>) => api.get('/tags', { params }),
  get: (id: string) => api.get(`/tags/${id}`),
  create: (data: any) => api.post('/tags', data),
  update: (id: string, data: any) => api.put(`/tags/${id}`, data),
  delete: (id: string) => api.delete(`/tags/${id}`),
};

// Users
export const usersApi = {
  list: (params?: Record<string, string>) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  updatePassword: (id: string, password: string) => api.put(`/users/${id}/password`, { password }),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// POS terminal (direct-connected checkout screen — see routes/posTerminal.ts)
export const posTerminalApi = {
  getActiveShift: (terminalId: string) => api.get('/pos-terminal/shifts/active', { params: { terminalId } }),
  openShift: (data: { terminalId: string; branchId?: string | null; openingFloat: number; openingDeclaration?: any; notes?: string }) =>
    api.post('/pos-terminal/shifts', data),
  closeShift: (id: string, data: { closingFloat: number; closingDeclaration?: any; notes?: string }) =>
    api.post(`/pos-terminal/shifts/${id}/close`, data),
  listHeldSales: (terminalId: string) => api.get('/pos-terminal/held-sales', { params: { terminalId } }),
  holdSale: (data: any) => api.post('/pos-terminal/held-sales', data),
  deleteHeldSale: (id: string) => api.delete(`/pos-terminal/held-sales/${id}`),
  getSale: (id: string) => api.get(`/pos-terminal/sales/${id}`),
  createSale: (data: any) => api.post('/pos-terminal/sales', data),
  returnSale: (id: string, data: any) => api.post(`/pos-terminal/sales/${id}/return`, data),
  paidInOut: (data: { shiftId: string; type: 'IN' | 'OUT'; amount: number; reason?: string }) =>
    api.post('/pos-terminal/paid-in-out', data),
  drawerKick: (data: { terminalId: string; shiftId?: string }) => api.post('/pos-terminal/drawer-kick', data),
  shiftSummary: (shiftId: string) => api.get('/pos-terminal/reports/shift-summary', { params: { shiftId } }),
};
