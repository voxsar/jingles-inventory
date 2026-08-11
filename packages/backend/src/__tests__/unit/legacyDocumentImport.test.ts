import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

const getLegacyTableRows = vi.fn();

vi.mock('../../prisma/client', () => ({ default: prismaMock }));
vi.mock('../../services/posCloud', () => ({ getLegacyTableRows }));

const { importLegacyDocuments } = await import('../../modules/legacySync/legacyDocumentImport');

describe('legacy historical document import', () => {
	beforeEach(() => {
		resetPrismaMocks();
		getLegacyTableRows.mockReset();
		prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' } as any);
		prismaMock.legacyEntityLink.findMany.mockResolvedValue([
			{ sourceType: 'product', sourceId: '10', targetType: 'sku', targetId: 'sku-10' },
			{ sourceType: 'supplier', sourceId: '20', targetType: 'vendor', targetId: 'vendor-20' },
			{ sourceType: 'location', sourceId: '30', targetType: 'branch', targetId: 'branch-30' },
			{ sourceType: 'location', sourceId: '31', targetType: 'branch', targetId: 'branch-31' },
		] as any);
		prismaMock.floor.findMany.mockResolvedValue([
			{ id: 'floor-30', branchId: 'branch-30' },
			{ id: 'floor-31', branchId: 'branch-31' },
		] as any);
		prismaMock.gRN.create.mockResolvedValue({ id: 'grn-1' } as any);
		prismaMock.pRN.create.mockResolvedValue({ id: 'prn-1' } as any);
		prismaMock.stockTransfer.create.mockResolvedValue({ id: 'transfer-1' } as any);
		prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-1' } as any);
		prismaMock.legacyEntityLink.upsert.mockResolvedValue({} as any);
	});

	it('creates native GRN, PRN, transfer and adjustment history without applying stock', async () => {
		getLegacyTableRows.mockResolvedValue({
			purchaseheader: [
				{ PurchaseHeaderID: 1, DocumentID: 101, DocumentNo: 'GRN-1', SupplierID: 20, DeliveryLocationID: 30, Status: 1 },
				{ PurchaseHeaderID: 2, DocumentID: 102, DocumentNo: 'PRN-1', SupplierID: 20, DeliveryLocationID: 30, PurchaseTypeID: 2, Status: 1 },
			],
			purchasedetail: [
				{ PurchaseHeaderID: 1, ProductID: 10, Qty: 2, FreeQty: 1, PackSize: 2, CostPrice: 50 },
				{ PurchaseHeaderID: 2, ProductID: 10, Qty: 3, PackSize: 1 },
			],
			returntype: [{ ReturnTypeID: 2, ReturnTypeName: 'Damages' }],
			transfernoteheader: [{ TransferNoteHeaderID: 3, DocumentNo: 'TOG-1', LocationID: 30, ToLocationID: 31, Accepted: 1 }],
			transfernotedetail: [{ DocumentNo: 'TOG-1', LocationID: 30, ProductID: 10, Qty: 4, AcceptedQty: 4, PackSize: 1 }],
			adjustmentheader: [{ AdjustmentHeaderID: 4, DocumentNo: 'ADJ-1', AdjustmentMode: 1 }],
			adjustmentdetail: [{ AdjustmentDetailID: 5, AdjustmentHeaderID: 4, ProductID: 10, LocationID: 30, Qty: 7 }],
		});

		const result = await importLegacyDocuments('run-1');

		expect(result).toEqual({ grns: 1, prns: 1, transfers: 1, adjustments: 1, warnings: [] });
		expect(prismaMock.gRN.create).toHaveBeenCalledWith(expect.objectContaining({
			data: expect.objectContaining({
				status: 'Closed',
				lines: { create: [expect.objectContaining({ expectedQuantity: 6, receivedQuantity: 6 })] },
			}),
		}));
		expect(prismaMock.pRN.create).toHaveBeenCalledWith(expect.objectContaining({
			data: expect.objectContaining({ returnReason: 'Damages', status: 'PickedUp' }),
		}));
		expect(prismaMock.stockTransfer.create).toHaveBeenCalledWith(expect.objectContaining({
			data: expect.objectContaining({ status: 'Completed', fromBranchId: 'branch-30', toBranchId: 'branch-31' }),
		}));
		expect(prismaMock.inventoryEvent.create).toHaveBeenCalledWith(expect.objectContaining({
			data: expect.objectContaining({
				eventType: 'MANUAL_ADJUSTMENT',
				metadata: expect.objectContaining({ historicalOnly: true, stockApplied: false }),
			}),
		}));
		expect(prismaMock.inventoryRecord.create).not.toHaveBeenCalled();
		expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
	});

	it('is idempotent when document links already exist', async () => {
		prismaMock.legacyEntityLink.findMany.mockResolvedValue([
			{ sourceType: 'purchaseheader', sourceId: '1', targetType: 'grn', targetId: 'grn-existing' },
		] as any);
		prismaMock.floor.findMany.mockResolvedValue([] as any);
		getLegacyTableRows.mockResolvedValue({
			purchaseheader: [{ PurchaseHeaderID: 1, DocumentID: 101, SupplierID: 20 }],
			purchasedetail: [{ PurchaseHeaderID: 1, ProductID: 10, Qty: 1 }],
		});

		const result = await importLegacyDocuments('run-2');

		expect(result.grns).toBe(0);
		expect(prismaMock.gRN.create).not.toHaveBeenCalled();
	});
});
