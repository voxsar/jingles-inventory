/**
 * Voucher API Client
 * 
 * Frontend API client for voucher management
 */

import axios from 'axios';
import type {
	IVoucherCode,
	IVoucherBatch,
	IVoucherRedemption,
	IVoucherRestriction,
	IVoucherValidationContext,
	IVoucherValidationResult,
} from '@jingles/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const api = axios.create({
	baseURL: API_BASE,
	headers: {
		'Content-Type': 'application/json',
	},
});

// Attach auth token to all requests
api.interceptors.request.use((config) => {
	const token = localStorage.getItem('token');
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

// ── Voucher Code Management ────────────────────────────────────

export const voucherApi = {
	// Create single voucher code
	createCode: (data: {
		skuId: string;
		variantId?: string;
		value: number;
		currency?: string;
		expiresAt?: string;
		customerId?: string;
		orderId?: string;
		purchaseReference?: string;
		notes?: string;
		prefix?: string;
	}) => api.post('/api/vouchers/codes', data),

	// Create bulk batch
	createBatch: (data: {
		skuId: string;
		variantId?: string;
		batchName: string;
		prefix?: string;
		quantity: number;
		defaultValue: number;
		expiryDays?: number;
		defaultExpiresAt?: string;
	}) => api.post('/api/vouchers/batches', data),

	// List voucher codes
	listCodes: (params?: {
		skuId?: string;
		variantId?: string;
		batchId?: string;
		status?: string;
		page?: number;
		pageSize?: number;
	}) => api.get('/api/vouchers/codes', { params }),

	// Get voucher code details
	getCode: (code: string) => api.get(`/api/vouchers/codes/${code}`),

	// List voucher batches
	listBatches: (params?: {
		skuId?: string;
		status?: string;
		page?: number;
		pageSize?: number;
	}) => api.get('/api/vouchers/batches', { params }),

	// ── Validation & Redemption ────────────────────────────────

	// Validate voucher
	validate: (context: IVoucherValidationContext) =>
		api.post<{ success: boolean; data: IVoucherValidationResult }>(
			'/api/vouchers/validate',
			context
		),

	// Redeem voucher
	redeem: (data: {
		voucherCode: string;
		redeemedAmount: number;
		orderId?: string;
		invoiceNumber?: string;
		branchId?: string;
		appliedToItems?: any[];
		notes?: string;
	}) => api.post('/api/vouchers/redeem', data),

	// Get voucher balance
	getBalance: (code: string) => api.get(`/api/vouchers/balance/${code}`),

	// Get redemption history
	getRedemptions: (code: string) =>
		api.get<{ success: boolean; data: IVoucherRedemption[] }>(
			`/api/vouchers/redemptions/${code}`
		),

	// ── Restrictions ────────────────────────────────────────────

	// Create/update restriction
	createRestriction: (data: {
		skuId: string;
		restrictionType: string;
		targetCategoryIds?: string[];
		targetSkuIds?: string[];
		targetVariantIds?: string[];
		cannotCombineWithDiscounts?: boolean;
		cannotCombineWithOtherVouchers?: boolean;
		minPurchaseAmount?: number;
		maxDiscountAmount?: number;
		priority?: number;
	}) => api.post('/api/vouchers/restrictions', data),

	// Get restrictions for a voucher SKU
	getRestrictions: (skuId: string) =>
		api.get<{ success: boolean; data: IVoucherRestriction[] }>(
			`/api/vouchers/restrictions/${skuId}`
		),

	// Delete restriction
	deleteRestriction: (restrictionId: string) =>
		api.delete(`/api/vouchers/restrictions/${restrictionId}`),

	// ── Management ──────────────────────────────────────────────

	// Cancel voucher
	cancelCode: (code: string, reason?: string) =>
		api.put(`/api/vouchers/codes/${code}/cancel`, { reason }),

	// Extend voucher expiry
	extendExpiry: (code: string, newExpiryDate: string) =>
		api.put(`/api/vouchers/codes/${code}/extend`, { newExpiryDate }),
};

export default voucherApi;
