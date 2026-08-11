import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

const getLegacyTableRows = vi.fn();

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../services/posCloud', () => ({
	ensurePosCloudSchema: vi.fn(),
	getLegacyTableRows,
}));

const { getGenericReport } = await import('../../modules/reports/reportService');

describe('legacy-backed reports', () => {
	beforeEach(() => {
		resetPrismaMocks();
		getLegacyTableRows.mockReset();
	});

	it('renders purchase orders from MaxSoft DocumentID 100 instead of reporting missing tables', async () => {
		getLegacyTableRows.mockResolvedValue({
			purchaseheader: [{ PurchaseHeaderID: 1, DocumentID: 100, DocumentNo: 'PO-1', PurchaseDate: '2026-08-01', SupplierID: 2, Status: 1 }],
			purchasedetail: [{ PurchaseDetailID: 3, PurchaseHeaderID: 1, DocumentID: 100, ProductID: 4, Qty: 2, FreeQty: 1, CostPrice: 50, NetAmount: 150 }],
			supplier: [{ SupplierID: 2, SupplierName: 'Main Supplier' }],
			product: [{ ProductID: 4, ProductCode: 'P-4', ProductName: 'Product Four' }],
		});

		const report = await getGenericReport('purchase-order', { page: 1, pageSize: 50 });

		expect(report).toEqual(expect.objectContaining({ total: 1, notice: undefined }));
		expect(report.items[0]).toEqual(expect.objectContaining({
			reference: 'PO-1', supplier: 'Main Supplier', skuCode: 'P-4', quantity: 3, amount: 150,
		}));
		expect(report.summary.sourceStatus).toBe('Legacy MaxSoft archive');
	});

	it('renders quotations from MaxSoft Invoice DocumentID 105', async () => {
		getLegacyTableRows.mockResolvedValue({
			invoiceheader: [{ InvoiceHeaderID: 10, DocumentID: 105, DocumentNo: 'Q-10', InvoiceDate: '2026-08-02', CustomerID: 11, Status: 0 }],
			invoicedetail: [{ InvoiceDetailID: 12, InvoiceHeaderID: 10, DocumentID: 105, ProductID: 13, Qty: 4, SellingPrice: 25 }],
			customer: [{ CustomerID: 11, CustomerName: 'Walk In' }],
			product: [{ ProductID: 13, ProductCode: 'P-13', ProductName: 'Quoted Product' }],
		});

		const report = await getGenericReport('quotation', { page: 1, pageSize: 50 });

		expect(report.total).toBe(1);
		expect(report.items[0]).toEqual(expect.objectContaining({
			reference: 'Q-10', customer: 'Walk In', productName: 'Quoted Product', quantity: 4, amount: 100,
		}));
	});
});
