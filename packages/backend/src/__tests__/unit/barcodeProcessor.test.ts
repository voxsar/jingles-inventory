import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';

// Mock prisma client before importing modules that use it
vi.mock('../../prisma/client', () => ({ default: prismaMock }));

const { lookupBarcode, processScan } = await import('../../modules/barcode/barcodeProcessor');

describe('lookupBarcode', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	it('returns found=false when no SKU matches the barcode', async () => {
		prismaMock.sKU.findFirst.mockResolvedValue(null);

		const result = await lookupBarcode('UNKNOWN-001');

		expect(result.found).toBe(false);
		expect(result.error).toContain('UNKNOWN-001');
		expect(result.sku).toBeUndefined();
		expect(result.inventoryRecords).toBeUndefined();
	});

	it('returns found=true with SKU and inventory records on a match', async () => {
		const mockSku = {
			id: 'sku-001',
			skuCode: 'WGT-001',
			name: 'Widget A',
			vendor: { id: 'vendor-001', name: 'Acme' },
		};
		const mockRecords = [
			{ id: 'inv-001', quantity: 10, floor: { id: 'f1', name: 'Floor A' }, user: { email: 'staff@test.com' } },
		];

		prismaMock.sKU.findFirst.mockResolvedValue(mockSku as any);
		prismaMock.inventoryRecord.findMany.mockResolvedValue(mockRecords as any);

		const result = await lookupBarcode('WGT-001');

		expect(result.found).toBe(true);
		expect(result.sku).toEqual(mockSku);
		expect(result.inventoryRecords).toEqual(mockRecords);
		expect(result.error).toBeUndefined();
	});

	it('returns found=true with empty inventory records when SKU has no stock', async () => {
		const mockSku = { id: 'sku-002', skuCode: 'OUT-STOCK', name: 'No Stock Item', vendor: null };

		prismaMock.sKU.findFirst.mockResolvedValue(mockSku as any);
		prismaMock.inventoryRecord.findMany.mockResolvedValue([]);

		const result = await lookupBarcode('OUT-STOCK');

		expect(result.found).toBe(true);
		expect(result.inventoryRecords).toHaveLength(0);
	});

	it('queries SKU by exact skuCode match', async () => {
		prismaMock.sKU.findFirst.mockResolvedValue(null);

		await lookupBarcode('BARCODE-123');

		expect(prismaMock.sKU.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					isActive: true,
				}),
			})
		);
	});

	it('queries inventory records filtered to positive quantities', async () => {
		const mockSku = { id: 'sku-003', skuCode: 'SKU-003', name: 'Test', vendor: null };
		prismaMock.sKU.findFirst.mockResolvedValue(mockSku as any);
		prismaMock.inventoryRecord.findMany.mockResolvedValue([]);

		await lookupBarcode('SKU-003');

		expect(prismaMock.inventoryRecord.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					skuId: 'sku-003',
					quantity: { gt: 0 },
				}),
			})
		);
	});
});

describe('processScan', () => {
	beforeEach(() => {
		resetPrismaMocks();
	});

	it('records a scan event and returns lookup result with scanRecorded=true', async () => {
		const mockSku = { id: 'sku-001', skuCode: 'WGT-001', name: 'Widget', vendor: null };
		prismaMock.sKU.findFirst.mockResolvedValue(mockSku as any);
		prismaMock.inventoryRecord.findMany.mockResolvedValue([]);
		prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-001' } as any);

		const result = await processScan('WGT-001', 'user-001', 'terminal-01');

		expect(result.found).toBe(true);
		expect(result.scanRecorded).toBe(true);
		expect(prismaMock.inventoryEvent.create).toHaveBeenCalledOnce();
	});

	it('records event even when barcode is not found', async () => {
		prismaMock.sKU.findFirst.mockResolvedValue(null);
		prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-002' } as any);

		const result = await processScan('MISSING-BARCODE', 'user-001');

		expect(result.found).toBe(false);
		expect(result.scanRecorded).toBe(true);
		expect(prismaMock.inventoryEvent.create).toHaveBeenCalledOnce();
	});

	it('stores barcode and found status in event metadata', async () => {
		prismaMock.sKU.findFirst.mockResolvedValue(null);
		prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'event-003' } as any);

		await processScan('SCAN-ME', 'user-001', 'terminal-02');

		expect(prismaMock.inventoryEvent.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					userId: 'user-001',
					terminalId: 'terminal-02',
					metadata: expect.objectContaining({ barcode: 'SCAN-ME', found: false }),
				}),
			})
		);
	});

	it('includes sku and inventoryRecords in the result when found', async () => {
		const mockSku = { id: 'sku-x', skuCode: 'FOUND-SKU', name: 'Found', vendor: null };
		const mockRecords = [{ id: 'inv-x', quantity: 5 }];
		prismaMock.sKU.findFirst.mockResolvedValue(mockSku as any);
		prismaMock.inventoryRecord.findMany.mockResolvedValue(mockRecords as any);
		prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'e' } as any);

		const result = await processScan('FOUND-SKU', 'user-002');

		expect(result.sku).toEqual(mockSku);
		expect(result.inventoryRecords).toEqual(mockRecords);
	});

	it('works without a terminalId', async () => {
		prismaMock.sKU.findFirst.mockResolvedValue(null);
		prismaMock.inventoryEvent.create.mockResolvedValue({ id: 'e' } as any);

		const result = await processScan('ANY', 'user-003');

		expect(result.scanRecorded).toBe(true);
		expect(prismaMock.inventoryEvent.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ terminalId: undefined }),
			})
		);
	});
});
