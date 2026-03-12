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

// Vendors
export const vendorsApi = {
  list: () => api.get('/vendors'),
  getProducts: (id: string) => api.get(`/vendors/${id}/products`),
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
