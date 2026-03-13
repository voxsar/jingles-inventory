import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jingles_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('jingles_token');
      window.location.href = '/login';
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
};

// SKUs
export const skusApi = {
  list: (params?: Record<string, string>) =>
    api.get('/skus', { params }),
  get: (id: string) => api.get(`/skus/${id}`),
  create: (data: any) => api.post('/skus', data),
  update: (id: string, data: any) => api.put(`/skus/${id}`, data),
  // Barcodes
  getBarcodes: (id: string) => api.get(`/skus/${id}/barcodes`),
  addBarcode: (id: string, data: any) => api.post(`/skus/${id}/barcodes`, data),
  deleteBarcode: (id: string, bcId: string) => api.delete(`/skus/${id}/barcodes/${bcId}`),
  // Images
  getImages: (id: string) => api.get(`/skus/${id}/images`),
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
  transition: (id: string, toState: string, reason?: string) =>
    api.post(`/inventory/${id}/transition`, { toState, reason }),
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
};

// Locations
export const locationsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/locations', { params }),
  create: (data: any) => api.post('/locations', data),
  update: (id: string, data: any) => api.put(`/locations/${id}`, data),
};

// Vendors / Suppliers
export const vendorsApi = {
  list: (params?: Record<string, string>) => api.get('/vendors', { params }),
  get: (id: string) => api.get(`/vendors/${id}`),
  create: (data: any) => api.post('/vendors', data),
  update: (id: string, data: any) => api.put(`/vendors/${id}`, data),
  getProducts: (id: string) => api.get(`/vendors/${id}/products`),
};

// Categories
export const categoriesApi = {
  list: () => api.get('/categories'),
  tree: () => api.get('/categories/tree'),
  get: (id: string) => api.get(`/categories/${id}`),
  create: (data: any) => api.post('/categories', data),
  update: (id: string, data: any) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// Settings (Units of Measure)
export const settingsApi = {
  listUnits: () => api.get('/settings/units'),
  createUnit: (data: any) => api.post('/settings/units', data),
  updateUnit: (id: string, data: any) => api.put(`/settings/units/${id}`, data),
  deleteUnit: (id: string) => api.delete(`/settings/units/${id}`),
};

// Branches
export const branchesApi = {
  list: () => api.get('/branches'),
  get: (id: string) => api.get(`/branches/${id}`),
  create: (data: any) => api.post('/branches', data),
  update: (id: string, data: any) => api.put(`/branches/${id}`, data),
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
};

// Barcode
export const barcodeApi = {
  scan: (barcode: string, terminalId?: string) =>
    api.post('/barcode/scan', { barcode, terminalId }),
};

// Space
export const spaceApi = {
  calculate: (floor: string) => api.get('/space/calculate', { params: { floor } }),
  stackingSuggestions: (skuId: string, locationId: string) =>
    api.get('/space/stacking-suggestions', { params: { skuId, locationId } }),
};

// OCR
export const ocrApi = {
  uploadInvoice: (file: File) => {
    const form = new FormData();
    form.append('invoice', file);
    return api.post('/ocr/invoice', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// Sync
export const syncApi = {
  push: (clientId: string, operations: any[]) =>
    api.post('/sync/push', { clientId, operations }),
  pull: (clientId: string, since?: string) =>
    api.get('/sync/pull', { params: { clientId, since } }),
};

