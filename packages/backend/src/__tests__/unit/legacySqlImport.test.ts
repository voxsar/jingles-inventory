import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
	buildLegacyInventorySnapshots,
	buildLegacySchemaAnalysis,
	getLegacyImportFileParseOptions,
	parseLegacySqlDump,
	parseLegacySqlDumpFile,
} from '../../modules/legacyMigration/legacySql';

describe('legacy SQL migration helpers', () => {
	it('parses table definitions and insert rows from a MySQL dump', () => {
		const sql = [
			'CREATE TABLE `supplier` (',
			'  `SupplierID` bigint NOT NULL,',
			'  `SupplierName` varchar(50) NOT NULL,',
			'  `Email` varchar(500) DEFAULT NULL,',
			'  `Address1` varchar(50) DEFAULT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'',
			'INSERT INTO `supplier` VALUES (1,\'Acme, Inc.\',\'sales@example.com\',NULL);',
		].join('\n');

		const dump = parseLegacySqlDump(sql);

		expect(dump.tables.supplier).toBeDefined();
		expect(dump.tables.supplier.columns.map((column) => column.name)).toEqual([
			'SupplierID',
			'SupplierName',
			'Email',
			'Address1',
		]);
		expect(dump.rowsByTable.supplier).toHaveLength(1);
		expect(dump.rowsByTable.supplier[0]).toMatchObject({
			SupplierID: 1,
			SupplierName: 'Acme, Inc.',
			Email: 'sales@example.com',
			Address1: null,
		});
	});

	it('identifies schema-only dumps and major missing domains', () => {
		const sql = [
			'CREATE TABLE `supplier` (',
			'  `SupplierID` bigint NOT NULL,',
			'  `SupplierName` varchar(50) NOT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'CREATE TABLE `postransaction` (',
			'  `PosTransactionID` bigint NOT NULL,',
			'  `Qty` decimal(18,3) NOT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'CREATE TABLE `adjustmentheader` (',
			'  `AdjustmentHeaderID` bigint NOT NULL,',
			'  `DocumentNo` varchar(50) DEFAULT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
		].join('\n');

		const dump = parseLegacySqlDump(sql);
		const analysis = buildLegacySchemaAnalysis(dump);

		expect(analysis.hasData).toBe(false);
		expect(analysis.notes.some((note) => note.includes('schema definitions only'))).toBe(true);
		expect(analysis.importableDomains.some((domain) => domain.key === 'vendors')).toBe(true);
		expect(analysis.importableDomains.some((domain) => domain.key === 'adjustments')).toBe(true);
		expect(analysis.missingDomains.some((gap) => gap.key === 'pos-sales')).toBe(true);
		expect(analysis.missingDomains.some((gap) => gap.key === 'fractional-qty')).toBe(true);
	});

	it('preserves fractional inventory snapshots by default and still supports skip or round overrides', () => {
		const sql = [
			'CREATE TABLE `stock` (',
			'  `StockID` bigint NOT NULL,',
			'  `LocationID` bigint NOT NULL,',
			'  `ProductID` bigint NOT NULL,',
			'  `ProductColorSizeID` bigint NOT NULL,',
			'  `Balance` decimal(18,3) NOT NULL,',
			'  `FreeQty` decimal(18,3) NOT NULL,',
			'  `CostPrice` decimal(18,3) NOT NULL,',
			'  `SellingPrice` decimal(18,3) NOT NULL,',
			'  `ExpiryDate` datetime(6) DEFAULT NULL,',
			'  `ReferenceNo` varchar(30) DEFAULT NULL,',
			'  `DocumentDate` datetime(6) NOT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'',
			'INSERT INTO `stock` VALUES (1,10,20,0,1.500,0.000,100.000,150.000,NULL,\'PO-001\',\'2026-05-08 00:00:00.000000\');',
			'INSERT INTO `stock` VALUES (2,10,20,1,3.000,1.000,100.000,150.000,NULL,\'PO-002\',\'2026-05-09 00:00:00.000000\');',
		].join('\n');

		const dump = parseLegacySqlDump(sql);
		const preserved = buildLegacyInventorySnapshots(dump);
		const skipped = buildLegacyInventorySnapshots(dump, { fractionalQuantityMode: 'skip' });
		const rounded = buildLegacyInventorySnapshots(dump, { fractionalQuantityMode: 'round' });

		expect(preserved.items).toHaveLength(2);
		expect(preserved.items.some((item) => item.quantity === 1.5)).toBe(true);
		expect(preserved.items.some((item) => item.quantity === 4)).toBe(true);
		expect(preserved.skippedCount).toBe(0);
		expect(preserved.warnings).toHaveLength(0);

		expect(skipped.items).toHaveLength(1);
		expect(skipped.items[0]).toMatchObject({
			source: 'stock',
			locationSourceId: '10',
			productSourceId: '20',
			quantity: 4,
		});
		expect(skipped.skippedCount).toBe(1);
		expect(skipped.warnings.some((warning) => warning.includes('fractional quantity 1.5'))).toBe(true);

		expect(rounded.items).toHaveLength(2);
		expect(rounded.items.some((item) => item.quantity === 2)).toBe(true);
		expect(rounded.skippedCount).toBe(0);
		expect(rounded.warnings.some((warning) => warning.includes('rounded to 2'))).toBe(true);
	});

	it('falls back to purchase-detail balances when direct snapshot tables have no positive stock', () => {
		const sql = [
			'CREATE TABLE `productdetail` (',
			'  `ProductDetailID` bigint NOT NULL,',
			'  `LocationID` bigint NOT NULL,',
			'  `ProductID` bigint NOT NULL,',
			'  `Qty` decimal(18,3) NOT NULL,',
			'  `CostPrice` decimal(18,3) NOT NULL,',
			'  `SellingPrice` decimal(18,3) NOT NULL,',
			'  `WholeSalePrice` decimal(18,3) NOT NULL,',
			'  `SpecialPrice` decimal(18,3) NOT NULL,',
			'  `BinLocation` varchar(50) DEFAULT NULL,',
			'  `CostCode` varchar(50) DEFAULT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'CREATE TABLE `purchasedetail` (',
			'  `PurchaseDetailID` bigint NOT NULL,',
			'  `PurchaseHeaderID` bigint NOT NULL,',
			'  `LocationID` bigint NOT NULL,',
			'  `DocumentNo` varchar(50) DEFAULT NULL,',
			'  `ReferenceNo` varchar(50) DEFAULT NULL,',
			'  `PurchaseDate` datetime(6) NOT NULL,',
			'  `SupplierID` bigint DEFAULT NULL,',
			'  `ProductID` bigint NOT NULL,',
			'  `CostPrice` decimal(18,3) NOT NULL,',
			'  `UnitPrice` decimal(18,3) NOT NULL,',
			'  `SellingPrice` decimal(18,3) NOT NULL,',
			'  `Qty` decimal(18,3) NOT NULL,',
			'  `Balance` decimal(18,3) NOT NULL,',
			'  `Status` int NOT NULL,',
			'  `ExpiryDate` datetime(6) DEFAULT NULL,',
			'  `CreatedDate` datetime(6) NOT NULL,',
			'  `FreeQty` decimal(18,3) NOT NULL,',
			'  `ProductColorSizeID` bigint DEFAULT NULL,',
			'  `FreeBalance` decimal(18,3) NOT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'',
			'INSERT INTO `productdetail` VALUES (1,10,20,0.000,100.000,150.000,140.000,0.000,NULL,NULL);',
			'INSERT INTO `purchasedetail` VALUES (5,99,10,\'GRN-001\',\'PO-001\',\'2026-05-08 00:00:00.000000\',7,20,100.000,140.000,150.000,3.000,2.250,1,NULL,\'2026-05-08 01:00:00.000000\',0.000,3,0.250);',
		].join('\n');

		const dump = parseLegacySqlDump(sql);
		const result = buildLegacyInventorySnapshots(dump);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]).toMatchObject({
			source: 'purchasedetail',
			locationSourceId: '10',
			productSourceId: '20',
			productColorSizeSourceId: '3',
			supplierSourceId: '7',
			quantity: 2.5,
			costPrice: 100,
			sellingPrice: 150,
		});
		expect(result.items[0].reference).toContain('PD5');
		expect(result.skippedCount).toBe(0);
		expect(result.warnings).toHaveLength(0);
	});

	it('streams large dumps without retaining unsupported table rows or blob-heavy product columns', async () => {
		const sql = [
			'CREATE TABLE `product` (',
			'  `ProductID` bigint NOT NULL,',
			'  `ProductCode` varchar(50) NOT NULL,',
			'  `ProductName` varchar(255) NOT NULL,',
			'  `BarCode` varchar(255) DEFAULT NULL,',
			'  `ImageBlob` longblob DEFAULT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'CREATE TABLE `invoiceheader` (',
			'  `InvoiceHeaderID` bigint NOT NULL,',
			'  `InvoiceNo` varchar(50) NOT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'',
			'INSERT INTO `product` VALUES (1,\'SKU-001\',\'Widget\',\'1234567890123\',_binary \'PNGDATA\');',
			'INSERT INTO `invoiceheader` VALUES (99,\'INV-001\');',
		].join('\n');

		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-sql-stream-'));
		const filePath = path.join(tempDir, 'stream-test.sql');
		fs.writeFileSync(filePath, sql);

		const dump = await parseLegacySqlDumpFile(filePath, getLegacyImportFileParseOptions());
		const analysis = buildLegacySchemaAnalysis(dump);

		expect(analysis.tablesWithData).toEqual(['invoiceheader', 'product']);
		expect(dump.rowsByTable.product).toHaveLength(1);
		expect(dump.rowsByTable.product[0]).toMatchObject({
			ProductID: 1,
			ProductCode: 'SKU-001',
			ProductName: 'Widget',
			BarCode: '1234567890123',
		});
		expect(dump.rowsByTable.product[0].ImageBlob).toBeUndefined();
		expect(dump.rowsByTable.invoiceheader).toBeUndefined();
	});

	it('streams retained rows even when INSERT statements appear before CREATE TABLE blocks', async () => {
		const sql = [
			'INSERT INTO `adjustmentdetail` VALUES (1,1,10,\'ADJ-001\',104,\'REF-1\',\'2026-05-08 00:00:00.000000\',2,20,\'Each\',1,100.000,150.000,3.000,300.000,450.000,1,\'2026-05-08 01:00:00.000000\',\'SALMAN\',99,NULL,0);',
			'CREATE TABLE `adjustmentdetail` (',
			'  `AdjustmentDetailID` bigint NOT NULL,',
			'  `RowNo` int NOT NULL,',
			'  `LocationID` bigint NOT NULL,',
			'  `DocumentNo` varchar(50) NOT NULL,',
			'  `DocumentID` bigint NOT NULL,',
			'  `ReferenceNo` varchar(50) DEFAULT NULL,',
			'  `DocumentDate` datetime(6) NOT NULL,',
			'  `SupplierID` bigint DEFAULT NULL,',
			'  `ProductID` bigint NOT NULL,',
			'  `Scale` varchar(5) DEFAULT NULL,',
			'  `PackSize` int NOT NULL,',
			'  `CostPrice` decimal(18,3) NOT NULL,',
			'  `SellingPrice` decimal(18,3) NOT NULL,',
			'  `Qty` decimal(18,3) NOT NULL,',
			'  `CostValue` decimal(18,3) NOT NULL,',
			'  `SellingValue` decimal(18,3) NOT NULL,',
			'  `Status` int NOT NULL,',
			'  `CreatedDate` datetime(6) NOT NULL,',
			'  `CreatedUser` varchar(50) DEFAULT NULL,',
			'  `AdjustmentHeaderID` bigint NOT NULL,',
			'  `ExpiryDate` datetime(6) DEFAULT NULL,',
			'  `ProductColorSizeID` bigint DEFAULT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
		].join('\n');

		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-sql-order-'));
		const filePath = path.join(tempDir, 'out-of-order.sql');
		fs.writeFileSync(filePath, sql);

		const dump = await parseLegacySqlDumpFile(filePath, getLegacyImportFileParseOptions());

		expect(dump.rowsByTable.adjustmentdetail).toHaveLength(1);
		expect(dump.rowsByTable.adjustmentdetail[0]).toMatchObject({
			AdjustmentDetailID: 1,
			LocationID: 10,
			DocumentNo: 'ADJ-001',
			ProductID: 20,
			Qty: 3,
			AdjustmentHeaderID: 99,
		});
	});

	it('rejects a SQL file that ends mid-statement', async () => {
		const sql = [
			'CREATE TABLE `product` (',
			'  `ProductID` bigint NOT NULL,',
			'  `ProductCode` varchar(50) NOT NULL',
			') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
			'INSERT INTO `product` VALUES (1,\'SKU-001\')',
		].join('\n');

		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-sql-partial-'));
		const filePath = path.join(tempDir, 'partial.sql');
		fs.writeFileSync(filePath, sql);

		await expect(parseLegacySqlDumpFile(filePath, getLegacyImportFileParseOptions()))
			.rejects
			.toThrow('Wait until the upload finishes');
	});
});
