import { useEffect, useMemo, useState } from 'react';
import { branchesApi, floorsApi, reportsApi, skusApi, vendorsApi } from '../api/client';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import { UiBadge } from '../components/UiPrimitives';
import { formatQuantity } from '../utils/quantity';

type ReportId =
	| 'purchase-order'
	| 'grn'
	| 'prn'
	| 'tog'
	| 'tog-product-wise'
	| 'stockAdjustment'
	| 'quotation'
	| 'sales-return'
	| 'stockBalance'
	| 'stock-valuation'
	| 'stockMovement'
	| 'profit-loss'
	| 'price-change'
	| 'reorder-level'
	| 'expiry-date'
	| 'creditors-debtors'
	| 'pos-sales'
	| 'paid-in-out'
	| 'product-exchange'
	| 'credit-card-sales'
	| 'issued-receipts'
	| 'sales-summary-dimension'
	| 'slow-movement-sales'
	| 'top-sales'
	| 'salesmen-commission'
	| 'advanced-receipts'
	| 'valuation'
	| 'floor';

type ReportGroup = 'Inventory' | 'Stock' | 'Management' | 'Sales';

type ReportDefinition = {
	id: ReportId;
	label: string;
	group: ReportGroup;
	description: string;
	source: 'legacy' | 'catalog';
	periodFilter?: boolean;
	groupFilter?: boolean;
	statusFilter?: boolean;
	daysFilter?: boolean;
};

type FilterState = {
	fromDate: string;
	toDate: string;
	search: string;
	supplierId: string;
	branchId: string;
	floorId: string;
	skuId: string;
	status: string;
	eventType: string;
	groupBy: string;
	daysToExpiry: string;
	pageSize: string;
};

type ExportColumn = {
	key: string;
	header: string;
	value: (row: any) => any;
	render?: (row: any) => React.ReactNode;
	align?: 'left' | 'right' | 'center';
	sortable?: boolean;
};

const REPORTS: ReportDefinition[] = [
	{ id: 'purchase-order', label: 'Purchase order note report', group: 'Inventory', description: 'Purchase orders by supplier, status, product, and date range.', source: 'catalog', periodFilter: true, statusFilter: true },
	{ id: 'grn', label: 'GRN note report', group: 'Inventory', description: 'Goods received notes with supplier, line, quantity, and cost totals.', source: 'legacy', periodFilter: true, statusFilter: true },
	{ id: 'prn', label: 'Purchase return note report', group: 'Inventory', description: 'Supplier return notes with picked-up quantities and return value.', source: 'legacy', periodFilter: true, statusFilter: true },
	{ id: 'tog', label: 'Transfer of good note report', group: 'Inventory', description: 'Transfer notes by origin, destination, status, and requested date.', source: 'legacy', periodFilter: true, statusFilter: true },
	{ id: 'tog-product-wise', label: 'Product-wise TOG in/out report', group: 'Inventory', description: 'Transfer note lines split by product with TOG in/out quantities.', source: 'catalog', periodFilter: true, statusFilter: true },
	{ id: 'stockAdjustment', label: 'Stock adjustment note report', group: 'Inventory', description: 'Manual stock adjustments and damage records.', source: 'legacy', periodFilter: true },
	{ id: 'quotation', label: 'Quotation report', group: 'Inventory', description: 'Quotation activity by product, supplier, status, and date range.', source: 'catalog', periodFilter: true, statusFilter: true },
	{ id: 'sales-return', label: 'Sales return note report', group: 'Inventory', description: 'Sales return events with product, receipt, and quantity details.', source: 'catalog', periodFilter: true },
	{ id: 'stockBalance', label: 'Stock balance report', group: 'Stock', description: 'Current stock by product, state, branch, floor, shelf, box, and batch.', source: 'legacy', statusFilter: true },
	{ id: 'stock-valuation', label: 'Stock valuation report', group: 'Stock', description: 'Current stock values at cost and selling price.', source: 'catalog', statusFilter: true },
	{ id: 'stockMovement', label: 'Stock movement report', group: 'Stock', description: 'Inventory movement events by type, product, location, and date range.', source: 'legacy', periodFilter: true },
	{ id: 'profit-loss', label: 'Product-wise profit and loss', group: 'Management', description: 'Product sales revenue, cost, gross profit, and margin.', source: 'catalog', periodFilter: true, groupFilter: true },
	{ id: 'price-change', label: 'GRN-wise price change report', group: 'Management', description: 'GRN line pricing by supplier, batch, and product.', source: 'catalog', periodFilter: true },
	{ id: 'reorder-level', label: 'Re-order level report', group: 'Management', description: 'Products at or below their configured low-stock threshold.', source: 'catalog' },
	{ id: 'expiry-date', label: 'Expiry date report', group: 'Management', description: 'Batch expiry, days remaining, and expiring stock value.', source: 'catalog', daysFilter: true },
	{ id: 'creditors-debtors', label: 'Creditors and debtors report', group: 'Management', description: 'Supplier credit versus purchase-return settlement values.', source: 'catalog', periodFilter: true },
	{ id: 'pos-sales', label: 'POS sales report', group: 'Sales', description: 'POS sales events by unit, product, receipt, branch, and date range.', source: 'catalog', periodFilter: true },
	{ id: 'paid-in-out', label: 'Paid in and out report', group: 'Sales', description: 'Cash paid-in and paid-out activity by POS unit and period.', source: 'catalog', periodFilter: true },
	{ id: 'product-exchange', label: 'Product exchange report', group: 'Sales', description: 'Product exchange activity traced from sales and inventory events.', source: 'catalog', periodFilter: true },
	{ id: 'credit-card-sales', label: 'Credit card-wise sales report', group: 'Sales', description: 'Card sales grouped by card type, POS unit, and receipt.', source: 'catalog', periodFilter: true },
	{ id: 'issued-receipts', label: 'Issued POS receipts report', group: 'Sales', description: 'Issued POS receipt references with transaction values.', source: 'catalog', periodFilter: true },
	{ id: 'sales-summary-dimension', label: 'Sales summary by product/category', group: 'Sales', description: 'Sales summary by product, department, or category.', source: 'catalog', periodFilter: true, groupFilter: true },
	{ id: 'slow-movement-sales', label: 'Slow movement sales report', group: 'Sales', description: 'Lowest-selling products, departments, or categories.', source: 'catalog', periodFilter: true, groupFilter: true },
	{ id: 'top-sales', label: 'Top sales report', group: 'Sales', description: 'Highest-selling products, departments, or categories.', source: 'catalog', periodFilter: true, groupFilter: true },
	{ id: 'salesmen-commission', label: 'Salesmen commission report', group: 'Sales', description: 'Commission report by salesman for daily, monthly, or yearly periods.', source: 'catalog', periodFilter: true },
	{ id: 'advanced-receipts', label: 'Advanced receipt reports', group: 'Sales', description: 'Advanced receipts by all, pending, and recalled status.', source: 'catalog', periodFilter: true, statusFilter: true },
];

const GROUPS: ReportGroup[] = ['Inventory', 'Stock', 'Management', 'Sales'];

const initialFilters: FilterState = {
	fromDate: '',
	toDate: '',
	search: '',
	supplierId: '',
	branchId: '',
	floorId: '',
	skuId: '',
	status: '',
	eventType: '',
	groupBy: 'product',
	daysToExpiry: '90',
	pageSize: '50',
};

const currency = (value: any) => {
	const number = Number(value ?? 0);
	if (!Number.isFinite(number)) return '0.00';
	return number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const quantity = (value: any) => formatQuantity(value, '0');

const dateOnly = (value: any) => {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return date.toLocaleDateString();
};

const dateTime = (value: any) => {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return date.toLocaleString();
};

const pathValue = (row: any, path: string) => path.split('.').reduce((acc, key) => acc?.[key], row);

const firstValue = (row: any, paths: string[], fallback = '') => {
	for (const path of paths) {
		const value = pathValue(row, path);
		if (value !== undefined && value !== null && value !== '') return value;
	}
	return fallback;
};

const lineQuantity = (row: any, field: string) => (row.lines ?? []).reduce((sum: number, line: any) => sum + Number(line[field] ?? 0), 0);

const lineCost = (row: any, quantityField: string) => (row.lines ?? []).reduce((sum: number, line: any) => {
	const unitCost = Number(line.costPrice ?? line.batch?.costPrice ?? line.sku?.costPrice ?? 0);
	return sum + unitCost * Number(line[quantityField] ?? 0);
}, 0);

const badge = (value: any) => value ? <UiBadge>{String(value)}</UiBadge> : '';

const textColumn = (key: string, header: string, paths: string[]): ExportColumn => ({
	key,
	header,
	value: (row) => firstValue(row, paths),
	sortable: true,
});

const numberColumn = (key: string, header: string, getter: (row: any) => any): ExportColumn => ({
	key,
	header,
	value: getter,
	render: (row) => quantity(getter(row)),
	align: 'right',
	sortable: true,
});

const moneyColumn = (key: string, header: string, getter: (row: any) => any): ExportColumn => ({
	key,
	header,
	value: getter,
	render: (row) => currency(getter(row)),
	align: 'right',
	sortable: true,
});

const commonSalesColumns: ExportColumn[] = [
	{ key: 'date', header: 'Date', value: (row) => firstValue(row, ['date', 'timestamp']), render: (row) => dateTime(firstValue(row, ['date', 'timestamp'])), sortable: true },
	textColumn('reference', 'Reference', ['reference', 'receiptNumber', 'id']),
	textColumn('receiptNumber', 'Receipt', ['receiptNumber']),
	textColumn('unit', 'POS Unit', ['unit', 'terminalId']),
	textColumn('skuCode', 'SKU', ['skuCode']),
	textColumn('productName', 'Product', ['productName']),
	textColumn('category', 'Category', ['category']),
	textColumn('branch', 'Branch', ['branch']),
	numberColumn('quantity', 'Qty', (row) => row.quantity),
	moneyColumn('revenue', 'Revenue', (row) => row.revenue),
	moneyColumn('grossProfit', 'Gross Profit', (row) => row.grossProfit),
	textColumn('paymentMethod', 'Payment', ['paymentMethod']),
	textColumn('salesman', 'Salesman', ['salesman']),
];

const aggregateColumns: ExportColumn[] = [
	textColumn('group', 'Group', ['group']),
	textColumn('skuCode', 'SKU', ['skuCode']),
	textColumn('productName', 'Product', ['productName']),
	textColumn('category', 'Category', ['category']),
	numberColumn('quantity', 'Qty Sold', (row) => row.quantity),
	numberColumn('transactionCount', 'Transactions', (row) => row.transactionCount),
	moneyColumn('revenue', 'Revenue', (row) => row.revenue),
	moneyColumn('grossProfit', 'Gross Profit', (row) => row.grossProfit),
];

const getColumns = (reportId: ReportId): ExportColumn[] => {
	switch (reportId) {
		case 'grn':
			return [
				textColumn('invoiceReference', 'Invoice Ref', ['invoiceReference', 'id']),
				textColumn('supplier', 'Supplier', ['supplier.name']),
				{ key: 'status', header: 'Status', value: (row) => row.status, render: (row) => badge(row.status), sortable: true },
				{ key: 'deliveryDate', header: 'Delivery Date', value: (row) => row.deliveryDate, render: (row) => dateOnly(row.deliveryDate), sortable: true },
				numberColumn('lineCount', 'Lines', (row) => row.lines?.length ?? 0),
				numberColumn('expectedQty', 'Expected Qty', (row) => lineQuantity(row, 'expectedQuantity')),
				numberColumn('receivedQty', 'Received Qty', (row) => lineQuantity(row, 'receivedQuantity')),
				moneyColumn('costValue', 'Cost Value', (row) => lineCost(row, 'receivedQuantity')),
				{ key: 'createdAt', header: 'Created', value: (row) => row.createdAt, render: (row) => dateOnly(row.createdAt), sortable: true },
			];
		case 'prn':
			return [
				textColumn('returnReason', 'Return Reason', ['returnReason', 'id']),
				textColumn('supplier', 'Supplier', ['supplier.name']),
				{ key: 'status', header: 'Status', value: (row) => row.status, render: (row) => badge(row.status), sortable: true },
				{ key: 'expectedPickupDate', header: 'Pickup Date', value: (row) => row.expectedPickupDate, render: (row) => dateOnly(row.expectedPickupDate), sortable: true },
				numberColumn('lineCount', 'Lines', (row) => row.lines?.length ?? 0),
				numberColumn('returnQty', 'Return Qty', (row) => lineQuantity(row, 'returnQuantity')),
				numberColumn('pickedUpQty', 'Picked Qty', (row) => lineQuantity(row, 'pickedUpQuantity')),
				moneyColumn('costValue', 'Cost Value', (row) => lineCost(row, 'returnQuantity')),
				{ key: 'createdAt', header: 'Created', value: (row) => row.createdAt, render: (row) => dateOnly(row.createdAt), sortable: true },
			];
		case 'stockAdjustment':
			return [
				{ key: 'eventType', header: 'Event Type', value: (row) => row.eventType, render: (row) => badge(row.eventType), sortable: true },
				numberColumn('quantityDelta', 'Qty Change', (row) => row.quantityDelta),
				numberColumn('beforeQuantity', 'Before', (row) => row.beforeQuantity),
				numberColumn('afterQuantity', 'After', (row) => row.afterQuantity),
				textColumn('reasonCode', 'Reason', ['reasonCode']),
				textColumn('user', 'User', ['user.email']),
				{ key: 'timestamp', header: 'Date', value: (row) => row.timestamp, render: (row) => dateTime(row.timestamp), sortable: true },
			];
		case 'stockBalance':
			return [
				textColumn('skuCode', 'SKU', ['sku.skuCode', 'skuCode']),
				textColumn('productName', 'Product', ['sku.name', 'productName']),
				textColumn('category', 'Category', ['sku.category.name', 'category']),
				numberColumn('quantity', 'Quantity', (row) => row.quantity),
				{ key: 'state', header: 'State', value: (row) => row.state, render: (row) => badge(row.state), sortable: true },
				textColumn('branch', 'Branch', ['floor.branch.name', 'branch']),
				textColumn('floor', 'Floor', ['floor.name']),
				textColumn('shelf', 'Shelf', ['shelf.name']),
				textColumn('batch', 'Batch', ['batch.batchNumber']),
			];
		case 'stock-valuation':
			return [
				textColumn('skuCode', 'SKU', ['skuCode', 'sku.skuCode']),
				textColumn('productName', 'Product', ['productName', 'sku.name']),
				textColumn('category', 'Category', ['category', 'sku.category.name']),
				textColumn('vendor', 'Vendor', ['vendor', 'sku.vendor.name']),
				numberColumn('quantity', 'Quantity', (row) => row.quantity),
				moneyColumn('costPrice', 'Cost Price', (row) => row.costPrice),
				moneyColumn('sellingPrice', 'Selling Price', (row) => row.sellingPrice),
				moneyColumn('costValue', 'Cost Value', (row) => row.costValue),
				moneyColumn('sellingValue', 'Selling Value', (row) => row.sellingValue),
				moneyColumn('potentialMargin', 'Potential Margin', (row) => row.potentialMargin),
			];
		case 'stockMovement':
			return [
				{ key: 'eventType', header: 'Event Type', value: (row) => row.eventType, render: (row) => badge(row.eventType), sortable: true },
				numberColumn('quantityDelta', 'Qty Change', (row) => row.quantityDelta),
				textColumn('reasonCode', 'Reason', ['reasonCode']),
				textColumn('reference', 'Reference', ['parentEntityId']),
				textColumn('user', 'User', ['user.email']),
				{ key: 'timestamp', header: 'Date', value: (row) => row.timestamp, render: (row) => dateTime(row.timestamp), sortable: true },
			];
		case 'tog':
			return [
				textColumn('referenceNumber', 'Reference', ['referenceNumber']),
				textColumn('fromBranch', 'From Branch', ['fromBranch.name']),
				textColumn('toBranch', 'To Branch', ['toBranch.name']),
				{ key: 'status', header: 'Status', value: (row) => row.status, render: (row) => badge(row.status), sortable: true },
				numberColumn('lineCount', 'Lines', (row) => row.lines?.length ?? 0),
				numberColumn('requestedQty', 'Requested Qty', (row) => lineQuantity(row, 'requestedQty')),
				numberColumn('transferredQty', 'Transferred Qty', (row) => lineQuantity(row, 'transferredQty')),
				{ key: 'requestedAt', header: 'Requested', value: (row) => row.requestedAt, render: (row) => dateOnly(row.requestedAt), sortable: true },
			];
		case 'tog-product-wise':
			return [
				textColumn('referenceNumber', 'Reference', ['referenceNumber']),
				{ key: 'date', header: 'Date', value: (row) => row.date, render: (row) => dateOnly(row.date), sortable: true },
				textColumn('fromBranch', 'From Branch', ['fromBranch']),
				textColumn('toBranch', 'To Branch', ['toBranch']),
				textColumn('skuCode', 'SKU', ['skuCode']),
				textColumn('productName', 'Product', ['productName']),
				textColumn('batchNumber', 'Batch', ['batchNumber']),
				numberColumn('requestedQty', 'Requested Qty', (row) => row.requestedQty),
				numberColumn('togOut', 'TOG Out', (row) => row.togOut),
				numberColumn('togIn', 'TOG In', (row) => row.togIn),
				{ key: 'status', header: 'Status', value: (row) => row.status, render: (row) => badge(row.status), sortable: true },
			];
		case 'valuation':
			return [
				textColumn('skuCode', 'SKU', ['skuCode']),
				textColumn('name', 'Product', ['name']),
				textColumn('vendor', 'Vendor', ['vendor.name']),
				numberColumn('totalQuantity', 'Total Qty', (row) => row.totalQuantity),
				{ key: 'byState', header: 'By State', value: (row) => JSON.stringify(row.byState ?? {}) },
			];
		case 'floor':
			return [
				textColumn('floorName', 'Floor', ['floorName', 'floor']),
				textColumn('floorCode', 'Code', ['floorCode']),
				numberColumn('totalQuantity', 'Total Items', (row) => row.totalQuantity),
				numberColumn('skuCount', 'Unique SKUs', (row) => row.skuCount),
				{ key: 'stateBreakdown', header: 'State Breakdown', value: (row) => JSON.stringify(row.stateBreakdown ?? {}) },
			];
		case 'price-change':
			return [
				{ key: 'date', header: 'Date', value: (row) => row.date, render: (row) => dateOnly(row.date), sortable: true },
				textColumn('grnReference', 'GRN Ref', ['grnReference']),
				textColumn('supplier', 'Supplier', ['supplier']),
				textColumn('skuCode', 'SKU', ['skuCode']),
				textColumn('productName', 'Product', ['productName']),
				textColumn('batchNumber', 'Batch', ['batchNumber']),
				numberColumn('quantity', 'Qty', (row) => row.quantity),
				moneyColumn('costPrice', 'Cost Price', (row) => row.costPrice),
				moneyColumn('sellingPrice', 'Selling Price', (row) => row.sellingPrice),
				moneyColumn('wholesalePrice', 'Wholesale', (row) => row.wholesalePrice),
				moneyColumn('bulkPrice', 'Bulk', (row) => row.bulkPrice),
			];
		case 'reorder-level':
			return [
				textColumn('skuCode', 'SKU', ['skuCode']),
				textColumn('productName', 'Product', ['productName']),
				textColumn('category', 'Category', ['category']),
				textColumn('vendor', 'Vendor', ['vendor']),
				numberColumn('currentQuantity', 'Current Qty', (row) => row.currentQuantity),
				numberColumn('reorderLevel', 'Re-order Level', (row) => row.reorderLevel),
				numberColumn('shortfall', 'Shortfall', (row) => row.shortfall),
				{ key: 'status', header: 'Status', value: (row) => row.status, render: (row) => badge(row.status), sortable: true },
			];
		case 'expiry-date':
			return [
				textColumn('batchNumber', 'Batch', ['batchNumber']),
				textColumn('skuCode', 'SKU', ['skuCode']),
				textColumn('productName', 'Product', ['productName']),
				textColumn('vendor', 'Vendor', ['vendor']),
				{ key: 'manufacturingDate', header: 'MFG Date', value: (row) => row.manufacturingDate, render: (row) => dateOnly(row.manufacturingDate), sortable: true },
				{ key: 'expiryDate', header: 'Expiry Date', value: (row) => row.expiryDate, render: (row) => dateOnly(row.expiryDate), sortable: true },
				numberColumn('daysRemaining', 'Days Left', (row) => row.daysRemaining),
				numberColumn('quantity', 'Quantity', (row) => row.quantity),
				moneyColumn('costValue', 'Cost Value', (row) => row.costValue),
				{ key: 'status', header: 'Status', value: (row) => row.status, render: (row) => badge(row.status), sortable: true },
			];
		case 'creditors-debtors':
			return [
				textColumn('supplier', 'Supplier', ['supplier']),
				textColumn('paymentTerms', 'Payment Terms', ['paymentTerms']),
				numberColumn('grnCount', 'GRNs', (row) => row.grnCount),
				numberColumn('prnCount', 'PRNs', (row) => row.prnCount),
				moneyColumn('creditAmount', 'Credit', (row) => row.creditAmount),
				moneyColumn('settlementAmount', 'Settlement', (row) => row.settlementAmount),
				moneyColumn('outstandingAmount', 'Outstanding', (row) => row.outstandingAmount),
			];
		case 'sales-summary-dimension':
		case 'slow-movement-sales':
		case 'top-sales':
			return aggregateColumns;
		case 'profit-loss':
			return [
				...commonSalesColumns.slice(0, 9),
				moneyColumn('unitCost', 'Unit Cost', (row) => row.unitCost),
				moneyColumn('unitPrice', 'Unit Price', (row) => row.unitPrice),
				moneyColumn('cost', 'Cost', (row) => row.cost),
				moneyColumn('revenue', 'Revenue', (row) => row.revenue),
				moneyColumn('grossProfit', 'Gross Profit', (row) => row.grossProfit),
				{ key: 'marginPercent', header: 'Margin %', value: (row) => row.marginPercent, render: (row) => `${currency(row.marginPercent)}%`, align: 'right' },
			];
		case 'pos-sales':
		case 'sales-return':
		case 'product-exchange':
		case 'credit-card-sales':
		case 'issued-receipts':
			return commonSalesColumns;
		case 'paid-in-out':
			return [
				{ key: 'date', header: 'Date', value: (row) => row.date, render: (row) => dateTime(row.date), sortable: true },
				textColumn('reference', 'Reference', ['reference']),
				{ key: 'direction', header: 'Direction', value: (row) => row.direction, render: (row) => badge(row.direction), sortable: true },
				textColumn('unit', 'POS Unit', ['unit', 'terminalId']),
				textColumn('reason', 'Reason', ['reason']),
				textColumn('description', 'Description', ['description']),
				moneyColumn('amount', 'Amount', (row) => row.amount),
				textColumn('user', 'User', ['user.email']),
			];
		case 'salesmen-commission':
			return [
				textColumn('salesman', 'Salesman', ['salesman']),
				numberColumn('transactionCount', 'Transactions', (row) => row.transactionCount),
				numberColumn('quantity', 'Qty Sold', (row) => row.quantity),
				moneyColumn('revenue', 'Revenue', (row) => row.revenue),
				moneyColumn('grossProfit', 'Gross Profit', (row) => row.grossProfit),
				moneyColumn('commissionableAmount', 'Commissionable', (row) => row.commissionableAmount),
				{ key: 'effectiveCommissionRate', header: 'Rate %', value: (row) => row.effectiveCommissionRate, render: (row) => `${currency(row.effectiveCommissionRate)}%`, align: 'right', sortable: true },
				moneyColumn('commissionAmount', 'Commission', (row) => row.commissionAmount),
			];
		case 'advanced-receipts':
			return [
				{ key: 'date', header: 'Date', value: (row) => row.date, render: (row) => dateTime(row.date), sortable: true },
				textColumn('reference', 'Reference', ['reference']),
				textColumn('receiptNumber', 'Receipt', ['receiptNumber']),
				{ key: 'status', header: 'Status', value: (row) => row.status, render: (row) => badge(row.status), sortable: true },
				textColumn('customer', 'Customer', ['customer']),
				textColumn('unit', 'POS Unit', ['unit', 'terminalId']),
				moneyColumn('amount', 'Advance Amount', (row) => row.amount),
				moneyColumn('balanceAmount', 'Balance', (row) => row.balanceAmount),
				textColumn('user', 'User', ['user.email']),
			];
		default:
			return [
				textColumn('reference', 'Reference', ['reference', 'id']),
				textColumn('status', 'Status', ['status']),
				textColumn('supplier', 'Supplier', ['supplier', 'supplier.name']),
				textColumn('skuCode', 'SKU', ['skuCode', 'sku.skuCode']),
				textColumn('productName', 'Product', ['productName', 'sku.name']),
				numberColumn('quantity', 'Quantity', (row) => row.quantity),
				moneyColumn('amount', 'Amount', (row) => row.amount ?? row.revenue ?? row.creditAmount),
				{ key: 'date', header: 'Date', value: (row) => firstValue(row, ['date', 'createdAt', 'timestamp']), render: (row) => dateOnly(firstValue(row, ['date', 'createdAt', 'timestamp'])), sortable: true },
			];
	}
};

const cellText = (value: any) => {
	if (value === undefined || value === null) return '';
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
};

const escapeHtml = (value: any) => cellText(value)
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;');

const downloadBlob = (content: string, fileName: string, type: string) => {
	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
};

export default function ReportsPage() {
	const [activeReportId, setActiveReportId] = useState<ReportId>('grn');
	const [filters, setFilters] = useState<FilterState>(initialFilters);
	const [data, setData] = useState<any[]>([]);
	const [summary, setSummary] = useState<Record<string, any> | null>(null);
	const [notice, setNotice] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(1);
	const [vendors, setVendors] = useState<any[]>([]);
	const [branches, setBranches] = useState<any[]>([]);
	const [floors, setFloors] = useState<any[]>([]);
	const [skus, setSkus] = useState<any[]>([]);

	const activeReport = REPORTS.find((report) => report.id === activeReportId) ?? REPORTS[0];
	const columns = useMemo(() => getColumns(activeReportId), [activeReportId]);
	const tableColumns = useMemo(() => columns.map((column) => ({
		key: column.key,
		header: column.header,
		sortable: column.sortable,
		align: column.align,
		render: (row: any) => column.render ? column.render(row) : cellText(column.value(row)),
	})), [columns]);

	const groupedReports = useMemo(() => GROUPS.map((group) => ({
		group,
		reports: REPORTS.filter((report) => report.group === group),
	})), []);

	const updateFilter = (key: keyof FilterState, value: string) => {
		setFilters((current) => ({ ...current, [key]: value }));
	};

	const buildParams = (reportPage = page, pageSizeOverride = filters.pageSize) => {
		const params: Record<string, string> = { page: String(reportPage), pageSize: pageSizeOverride || '50' };
		const fromDate = filters.fromDate ? `${filters.fromDate}T00:00:00.000` : '';
		const toDate = filters.toDate ? `${filters.toDate}T23:59:59.999` : '';
		if (fromDate) params.fromDate = fromDate;
		if (toDate) params.toDate = toDate;
		if (filters.search) params.search = filters.search;
		if (filters.supplierId) {
			params.supplierId = filters.supplierId;
			params.vendorId = filters.supplierId;
		}
		if (filters.branchId) params.branchId = filters.branchId;
		if (filters.floorId) params.floorId = filters.floorId;
		if (filters.skuId) params.skuId = filters.skuId;
		if (filters.status) {
			params.status = filters.status;
			params.state = filters.status;
		}
		if (filters.eventType) params.eventType = filters.eventType;
		if (filters.groupBy) params.groupBy = filters.groupBy;
		if (filters.daysToExpiry) params.daysToExpiry = filters.daysToExpiry;
		return params;
	};

	const loadReport = async (reportPage = page, pageSizeOverride = filters.pageSize) => {
		setIsLoading(true);
		setData([]);
		setSummary(null);
		setNotice('');
		try {
			const params = buildParams(reportPage, pageSizeOverride);
			let res;
			if (activeReportId === 'valuation') res = await reportsApi.inventoryValuation(params);
			else if (activeReportId === 'floor') res = await reportsApi.floorPerformance();
			else if (activeReportId === 'grn') res = await reportsApi.grn(params);
			else if (activeReportId === 'prn') res = await reportsApi.prn(params);
			else if (activeReportId === 'stockAdjustment') res = await reportsApi.stockAdjustment(params);
			else if (activeReportId === 'stockBalance') res = await reportsApi.stockBalance(params);
			else if (activeReportId === 'stockMovement') res = await reportsApi.stockMovement(params);
			else if (activeReportId === 'tog') res = await reportsApi.tog(params);
			else res = await reportsApi.catalog(activeReportId, params);

			const reportData = res.data?.data ?? res.data ?? {};
			if (reportData.items) {
				setData(Array.isArray(reportData.items) ? reportData.items : []);
				setSummary(reportData.summary ?? null);
				setNotice(reportData.notice ?? '');
				setTotal(reportData.total ?? reportData.items.length ?? 0);
				setTotalPages(reportData.totalPages ?? Math.max(1, Math.ceil((reportData.total ?? reportData.items.length ?? 0) / Number(pageSizeOverride || 50))));
			} else {
				const rows = Array.isArray(reportData) ? reportData : [reportData];
				setData(rows);
				setSummary(null);
				setTotal(rows.length);
				setTotalPages(1);
			}
		} catch (err) {
			console.error(err);
			setNotice('Failed to load this report. Check the backend logs for details.');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => { loadReport(); }, [activeReportId, page]);

	useEffect(() => {
		Promise.all([
			vendorsApi.list({ pageSize: '500' }),
			branchesApi.list({ pageSize: '500' }),
			floorsApi.list({ pageSize: '500' }),
			skusApi.list({ pageSize: '500', isActive: 'true' }),
		]).then(([vendorRes, branchRes, floorRes, skuRes]) => {
			setVendors(vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? []);
			setBranches(branchRes.data?.data?.items ?? branchRes.data?.data ?? branchRes.data ?? []);
			setFloors(floorRes.data?.data?.items ?? floorRes.data?.data ?? floorRes.data ?? []);
			setSkus(skuRes.data?.data?.items ?? skuRes.data?.data ?? skuRes.data ?? []);
		}).catch((err) => {
			console.error('Failed to load report filters', err);
		});
	}, []);

	const exportRows = () => data.map((row) => columns.map((column) => cellText(column.value(row))));
	const exportFileName = `${activeReport.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'report'}`;

	const exportCsv = () => {
		const rows = [columns.map((column) => column.header), ...exportRows()];
		const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
		downloadBlob(csv, `${exportFileName}.csv`, 'text/csv;charset=utf-8');
	};

	const exportExcel = () => {
		const header = columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('');
		const body = data.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`).join('');
		const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
		downloadBlob(html, `${exportFileName}.xls`, 'application/vnd.ms-excel;charset=utf-8');
	};

	const openPdfView = () => {
		const header = columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('');
		const body = data.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`).join('');
		const summaryRows = summary
			? Object.entries(summary).map(([key, value]) => `<div><strong>${escapeHtml(key.replace(/([A-Z])/g, ' $1').trim())}:</strong> ${escapeHtml(value)}</div>`).join('')
			: '';
		const printWindow = window.open('', '_blank');
		if (!printWindow) return;
		printWindow.document.write(`
			<html>
				<head>
					<title>${escapeHtml(activeReport.label)}</title>
					<style>
						body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
						h1 { font-size: 22px; margin: 0 0 6px; }
						p { margin: 0 0 16px; color: #4b5563; }
						.summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0; font-size: 12px; }
						table { width: 100%; border-collapse: collapse; font-size: 11px; }
						th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
						th { background: #f3f4f6; }
					</style>
				</head>
				<body>
					<h1>${escapeHtml(activeReport.label)}</h1>
					<p>${escapeHtml(activeReport.description)}</p>
					<div class="summary">${summaryRows}</div>
					<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
				</body>
			</html>
		`);
		printWindow.document.close();
		printWindow.focus();
		setTimeout(() => printWindow.print(), 250);
	};

	const resetFilters = () => {
		setFilters(initialFilters);
		setPage(1);
	};

	const runReport = () => {
		setPage(1);
		loadReport(1);
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="page-header mb-0">
				<div className="page-header-left">
					<h1 className="page-title">Reports</h1>
					<p className="page-subtitle">Inventory, stock, management, and sales reports with date filters and CSV, Excel, and PDF views.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button type="button" className="btn-secondary" onClick={openPdfView} disabled={isLoading}>PDF View</button>
					<button type="button" className="btn-secondary" onClick={exportCsv} disabled={isLoading}>Export CSV</button>
					<button type="button" className="btn-primary" onClick={exportExcel} disabled={isLoading}>Export Excel</button>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
				<aside className="content-section mb-0 overflow-hidden">
					<div className="content-section-header">
						<h2 className="section-title mb-0">Report Library</h2>
					</div>
					<div className="max-h-[720px] overflow-y-auto p-3">
						{groupedReports.map(({ group, reports }) => (
							<div key={group} className="mb-4 last:mb-0">
								<div className="px-2 pb-2 text-xs font-semibold uppercase text-gray-500">{group}</div>
								<div className="flex flex-col gap-1">
									{reports.map((report) => (
										<button
											type="button"
											key={report.id}
											onClick={() => { setActiveReportId(report.id); setPage(1); }}
											className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${activeReportId === report.id ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
										>
											<span className="block font-medium">{report.label}</span>
											<span className={`block text-xs ${activeReportId === report.id ? 'text-primary-50' : 'text-gray-500'}`}>{report.description}</span>
										</button>
									))}
								</div>
							</div>
						))}
					</div>
				</aside>

				<section className="flex min-w-0 flex-col gap-4">
					<div className="content-section mb-0">
						<div className="content-section-header">
							<div>
								<h2 className="section-title mb-1">{activeReport.label}</h2>
								<p className="text-sm text-gray-500">{activeReport.description}</p>
							</div>
							<div className="flex gap-2">
								<button type="button" className="btn-secondary" onClick={resetFilters}>Reset</button>
								<button type="button" className="btn-primary" onClick={runReport} disabled={isLoading}>Run Report</button>
							</div>
						</div>
						<div className="grid grid-cols-1 gap-3 border-b border-gray-100 bg-gray-50/60 p-4 md:grid-cols-2 xl:grid-cols-4">
							<label className="form-group">
								<span className="form-label">From date</span>
								<input type="date" className="input-field" value={filters.fromDate} onChange={(e) => updateFilter('fromDate', e.target.value)} />
							</label>
							<label className="form-group">
								<span className="form-label">To date</span>
								<input type="date" className="input-field" value={filters.toDate} onChange={(e) => updateFilter('toDate', e.target.value)} />
							</label>
							<label className="form-group">
								<span className="form-label">Search</span>
								<input className="input-field" placeholder="Reference, product, receipt" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} />
							</label>
							<label className="form-group">
								<span className="form-label">Supplier / vendor</span>
								<select className="input-field" value={filters.supplierId} onChange={(e) => updateFilter('supplierId', e.target.value)}>
									<option value="">All suppliers</option>
									{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
								</select>
							</label>
							<label className="form-group">
								<span className="form-label">Branch</span>
								<select className="input-field" value={filters.branchId} onChange={(e) => updateFilter('branchId', e.target.value)}>
									<option value="">All branches</option>
									{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
								</select>
							</label>
							<label className="form-group">
								<span className="form-label">Floor</span>
								<select className="input-field" value={filters.floorId} onChange={(e) => updateFilter('floorId', e.target.value)}>
									<option value="">All floors</option>
									{floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.branch?.name ? `${floor.branch.name} - ${floor.name}` : floor.name}</option>)}
								</select>
							</label>
							<label className="form-group">
								<span className="form-label">Product</span>
								<select className="input-field" value={filters.skuId} onChange={(e) => updateFilter('skuId', e.target.value)}>
									<option value="">All products</option>
									{skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode} - {sku.name}</option>)}
								</select>
							</label>
							<label className="form-group">
								<span className="form-label">Status / state</span>
								<input className="input-field" placeholder="Draft, Closed, ShelfReady" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} />
							</label>
							<label className="form-group">
								<span className="form-label">Event type</span>
								<input className="input-field" placeholder="SALE_DEDUCTED" value={filters.eventType} onChange={(e) => updateFilter('eventType', e.target.value)} />
							</label>
							<label className="form-group">
								<span className="form-label">Group by</span>
								<select className="input-field" value={filters.groupBy} onChange={(e) => updateFilter('groupBy', e.target.value)}>
									<option value="product">Product</option>
									<option value="department">Department</option>
									<option value="category">Category</option>
								</select>
							</label>
							<label className="form-group">
								<span className="form-label">Expiry window</span>
								<input type="number" min="1" className="input-field" value={filters.daysToExpiry} onChange={(e) => updateFilter('daysToExpiry', e.target.value)} />
							</label>
							<label className="form-group">
								<span className="form-label">Rows</span>
								<select className="input-field" value={filters.pageSize} onChange={(e) => { updateFilter('pageSize', e.target.value); setPage(1); }}>
									<option value="25">25</option>
									<option value="50">50</option>
									<option value="100">100</option>
									<option value="250">250</option>
								</select>
							</label>
						</div>
					</div>

					{notice && (
						<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
							{notice}
						</div>
					)}

					{summary && (
						<div className="content-section mb-0 p-4">
							<h3 className="section-title">Summary</h3>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
								{Object.entries(summary).map(([key, value]) => (
									<div key={key} className="rounded-lg border border-gray-200 bg-white p-3">
										<div className="text-xs font-medium uppercase text-gray-500">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
										<div className="mt-1 break-words text-lg font-semibold text-gray-900">
											{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : cellText(value)}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					<div className="content-section mb-0 overflow-hidden">
						<DataTable columns={tableColumns as any} data={data} isLoading={isLoading} emptyMessage="No rows found for this report and filter set" />
						{!isLoading && data.length > 0 && (
							<Pagination
								page={page}
								totalPages={totalPages}
								pageSize={Number(filters.pageSize || 50)}
								total={total}
								onPageChange={setPage}
								onPageSizeChange={(size) => { updateFilter('pageSize', String(size)); setPage(1); loadReport(1, String(size)); }}
								pageSizeOptions={[25, 50, 100, 250]}
							/>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
