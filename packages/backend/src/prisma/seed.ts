import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────

function daysAgo(n: number): Date {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d;
}

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

// ── Static seed data ────────────────────────────────────────

type StatusSeedEntry = {
	entityType: string;
	value: string;
	label: string;
	color?: string;
	sortOrder: number;
	isDefault: boolean;
	specialKey?: string;
};

const STATUS_SEED_DATA: StatusSeedEntry[] = [
	// Inventory states
	{ entityType: 'inventory', value: 'UnopenedBox', label: 'Unopened Box', color: 'gray', sortOrder: 0, isDefault: true, specialKey: 'INVENTORY_UNOPENED_BOX' },
	{ entityType: 'inventory', value: 'Uninspected', label: 'Uninspected', color: 'warning', sortOrder: 1, isDefault: false, specialKey: 'INVENTORY_UNINSPECTED' },
	{ entityType: 'inventory', value: 'Inspected', label: 'Inspected', color: 'info', sortOrder: 2, isDefault: false, specialKey: 'INVENTORY_INSPECTED' },
	{ entityType: 'inventory', value: 'ShelfReady', label: 'Shelf Ready', color: 'success', sortOrder: 3, isDefault: false, specialKey: 'INVENTORY_SHELF_READY' },
	{ entityType: 'inventory', value: 'Damaged', label: 'Damaged', color: 'critical', sortOrder: 4, isDefault: false, specialKey: 'INVENTORY_DAMAGED' },
	{ entityType: 'inventory', value: 'Returned', label: 'Returned', color: 'warning', sortOrder: 5, isDefault: false, specialKey: 'INVENTORY_RETURNED' },
	{ entityType: 'inventory', value: 'Reserved', label: 'Reserved', color: 'info', sortOrder: 6, isDefault: false, specialKey: 'INVENTORY_RESERVED' },
	{ entityType: 'inventory', value: 'Sold', label: 'Sold', color: 'gray', sortOrder: 7, isDefault: false, specialKey: 'INVENTORY_SOLD' },

	// GRN statuses
	{ entityType: 'grn', value: 'Draft', label: 'Draft', color: 'gray', sortOrder: 0, isDefault: true, specialKey: 'GRN_DRAFT' },
	{ entityType: 'grn', value: 'Submitted', label: 'Submitted', color: 'info', sortOrder: 1, isDefault: false, specialKey: 'GRN_SUBMITTED' },
	{ entityType: 'grn', value: 'PartiallyInspected', label: 'Partially Inspected', color: 'warning', sortOrder: 2, isDefault: false, specialKey: 'GRN_PARTIALLY_INSPECTED' },
	{ entityType: 'grn', value: 'FullyInspected', label: 'Fully Inspected', color: 'success', sortOrder: 3, isDefault: false, specialKey: 'GRN_FULLY_INSPECTED' },
	{ entityType: 'grn', value: 'Closed', label: 'Closed', color: 'gray', sortOrder: 4, isDefault: false, specialKey: 'GRN_CLOSED' },

	// Stock transfer statuses
	{ entityType: 'stock_transfer', value: 'Draft', label: 'Draft', color: 'gray', sortOrder: 0, isDefault: true, specialKey: 'TRANSFER_DRAFT' },
	{ entityType: 'stock_transfer', value: 'Pending', label: 'Pending', color: 'warning', sortOrder: 1, isDefault: false, specialKey: 'TRANSFER_PENDING' },
	{ entityType: 'stock_transfer', value: 'Approved', label: 'Approved', color: 'info', sortOrder: 2, isDefault: false, specialKey: 'TRANSFER_APPROVED' },
	{ entityType: 'stock_transfer', value: 'InTransit', label: 'In Transit', color: 'info', sortOrder: 3, isDefault: false, specialKey: 'TRANSFER_IN_TRANSIT' },
	{ entityType: 'stock_transfer', value: 'Completed', label: 'Completed', color: 'success', sortOrder: 4, isDefault: false, specialKey: 'TRANSFER_COMPLETED' },
	{ entityType: 'stock_transfer', value: 'Cancelled', label: 'Cancelled', color: 'critical', sortOrder: 5, isDefault: false, specialKey: 'TRANSFER_CANCELLED' },

	// Damage classifications (GRN inspection)
	{ entityType: 'damage_classification', value: 'Minor', label: 'Minor', color: 'warning', sortOrder: 0, isDefault: false, specialKey: 'DAMAGE_MINOR' },
	{ entityType: 'damage_classification', value: 'Major', label: 'Major', color: 'critical', sortOrder: 1, isDefault: false, specialKey: 'DAMAGE_MAJOR' },
	{ entityType: 'damage_classification', value: 'Totaled', label: 'Totaled', color: 'critical', sortOrder: 2, isDefault: false, specialKey: 'DAMAGE_TOTALED' },

	// Vendor / supplier types
	{ entityType: 'vendor_type', value: 'Vendor', label: 'Vendor', color: undefined, sortOrder: 0, isDefault: false, specialKey: 'VENDOR_TYPE_VENDOR' },
	{ entityType: 'vendor_type', value: 'Supplier', label: 'Supplier', color: undefined, sortOrder: 1, isDefault: true, specialKey: 'VENDOR_TYPE_SUPPLIER' },
	{ entityType: 'vendor_type', value: 'Both', label: 'Both', color: undefined, sortOrder: 2, isDefault: false, specialKey: 'VENDOR_TYPE_BOTH' },
];

type UnitSeedEntry = {
	name: string;
	abbreviation: string;
	type: string;
	baseUnit?: string;
	conversionFactor?: number;
	isSystem: boolean;
};

const UNIT_SEED_DATA: UnitSeedEntry[] = [
	// Count units (base)
	{ name: 'Piece', abbreviation: 'pc', type: 'Count', isSystem: true },
	{ name: 'Pair', abbreviation: 'pr', type: 'Count', baseUnit: 'Piece', conversionFactor: 2, isSystem: true },
	{ name: 'Pack', abbreviation: 'pk', type: 'Count', baseUnit: 'Piece', conversionFactor: 6, isSystem: true },
	{ name: 'Box', abbreviation: 'box', type: 'Count', baseUnit: 'Piece', conversionFactor: 12, isSystem: true },
	{ name: 'Set', abbreviation: 'set', type: 'Count', isSystem: true },
	{ name: 'Unit', abbreviation: 'unit', type: 'Count', isSystem: true },

	// Weight units (base: Gram)
	{ name: 'Gram', abbreviation: 'g', type: 'Weight', isSystem: true },
	{ name: 'Kilogram', abbreviation: 'kg', type: 'Weight', baseUnit: 'Gram', conversionFactor: 1000, isSystem: true },
	{ name: 'Milligram', abbreviation: 'mg', type: 'Weight', baseUnit: 'Gram', conversionFactor: 0.001, isSystem: true },
	{ name: 'Pound', abbreviation: 'lb', type: 'Weight', baseUnit: 'Gram', conversionFactor: 453.592, isSystem: true },
	{ name: 'Ounce', abbreviation: 'oz', type: 'Weight', baseUnit: 'Gram', conversionFactor: 28.3495, isSystem: true },

	// Volume units (base: Milliliter)
	{ name: 'Milliliter', abbreviation: 'ml', type: 'Volume', isSystem: true },
	{ name: 'Liter', abbreviation: 'L', type: 'Volume', baseUnit: 'Milliliter', conversionFactor: 1000, isSystem: true },
	{ name: 'Gallon', abbreviation: 'gal', type: 'Volume', baseUnit: 'Milliliter', conversionFactor: 3785.41, isSystem: true },
	{ name: 'Fluid Ounce', abbreviation: 'fl oz', type: 'Volume', baseUnit: 'Milliliter', conversionFactor: 29.5735, isSystem: true },
	{ name: 'Cup', abbreviation: 'cup', type: 'Volume', baseUnit: 'Milliliter', conversionFactor: 236.588, isSystem: true },
	{ name: 'Bottle', abbreviation: 'btl', type: 'Volume', isSystem: true },
	{ name: 'Jar', abbreviation: 'jar', type: 'Volume', isSystem: true },
	{ name: 'Bag', abbreviation: 'bag', type: 'Volume', isSystem: true },

	// Length units (base: Centimeter)
	{ name: 'Centimeter', abbreviation: 'cm', type: 'Length', isSystem: true },
	{ name: 'Meter', abbreviation: 'm', type: 'Length', baseUnit: 'Centimeter', conversionFactor: 100, isSystem: true },
	{ name: 'Millimeter', abbreviation: 'mm', type: 'Length', baseUnit: 'Centimeter', conversionFactor: 0.1, isSystem: true },
	{ name: 'Kilometer', abbreviation: 'km', type: 'Length', baseUnit: 'Centimeter', conversionFactor: 100000, isSystem: true },
	{ name: 'Inch', abbreviation: 'in', type: 'Length', baseUnit: 'Centimeter', conversionFactor: 2.54, isSystem: true },
	{ name: 'Foot', abbreviation: 'ft', type: 'Length', baseUnit: 'Centimeter', conversionFactor: 30.48, isSystem: true },

	// Area units (base: Square Meter)
	{ name: 'Square Meter', abbreviation: 'm²', type: 'Area', isSystem: true },
	{ name: 'Square Centimeter', abbreviation: 'cm²', type: 'Area', baseUnit: 'Square Meter', conversionFactor: 0.0001, isSystem: true },
	{ name: 'Square Foot', abbreviation: 'ft²', type: 'Area', baseUnit: 'Square Meter', conversionFactor: 0.092903, isSystem: true },
];

// ── Main seed function ─────────────────────────────────────

async function main() {
	// ── 1. Units of Measure ─────────────────────────────────
	let unitsCreated = 0;
	let unitsSkipped = 0;
	for (const unitEntry of UNIT_SEED_DATA) {
		const existing = await prisma.unitOfMeasureModel.findUnique({ where: { name: unitEntry.name } });
		if (!existing) {
			await prisma.unitOfMeasureModel.create({
				data: {
					name: unitEntry.name,
					abbreviation: unitEntry.abbreviation,
					type: unitEntry.type,
					baseUnit: unitEntry.baseUnit || null,
					conversionFactor: unitEntry.conversionFactor || null,
					isSystem: unitEntry.isSystem,
					isActive: true,
				},
			});
			unitsCreated++;
		} else {
			unitsSkipped++;
		}
	}
	console.log(`Seed: units of measure — ${unitsCreated} created, ${unitsSkipped} already exist`);

	// ── 2. Status Options ────────────────────────────────────
	let statusesCreated = 0;
	let statusesSkipped = 0;
	let statusesUpdated = 0;
	for (const entry of STATUS_SEED_DATA) {
		const existing = await prisma.statusOption.findUnique({
			where: { entityType_value: { entityType: entry.entityType, value: entry.value } },
		});
		if (!existing) {
			await prisma.statusOption.create({
				data: { ...entry, isSystem: true, isActive: true },
			});
			statusesCreated++;
		} else if (entry.specialKey && existing.specialKey !== entry.specialKey) {
			await prisma.statusOption.update({
				where: { id: existing.id },
				data: { specialKey: entry.specialKey },
			});
			statusesUpdated++;
		} else {
			statusesSkipped++;
		}
	}
	console.log(`Seed: status options — ${statusesCreated} created, ${statusesUpdated} updated, ${statusesSkipped} already exist`);

	// ── 3. Users ─────────────────────────────────────────────
	const adminEmail = 'admin@theredsun.org';
	let adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
	if (!adminUser) {
		const passwordHash = await bcrypt.hash('admin@theredsun.org', 10);
		adminUser = await prisma.user.create({ data: { email: adminEmail, passwordHash, role: 'Admin' } });
		console.log('Seed: created admin user');
	} else {
		console.log('Seed: admin user already exists, skipping');
	}

	const managerEmail = 'manager@jingles.com';
	let managerUser = await prisma.user.findUnique({ where: { email: managerEmail } });
	if (!managerUser) {
		const passwordHash = await bcrypt.hash('manager123', 10);
		managerUser = await prisma.user.create({ data: { email: managerEmail, passwordHash, role: 'Manager' } });
		console.log('Seed: created manager user');
	}

	const inspectorEmail = 'inspector@jingles.com';
	let inspectorUser = await prisma.user.findUnique({ where: { email: inspectorEmail } });
	if (!inspectorUser) {
		const passwordHash = await bcrypt.hash('inspector123', 10);
		inspectorUser = await prisma.user.create({ data: { email: inspectorEmail, passwordHash, role: 'Inspector' } });
		console.log('Seed: created inspector user');
	}

	const staffEmail = 'staff@jingles.com';
	let staffUser = await prisma.user.findUnique({ where: { email: staffEmail } });
	if (!staffUser) {
		const passwordHash = await bcrypt.hash('staff123', 10);
		staffUser = await prisma.user.create({ data: { email: staffEmail, passwordHash, role: 'Staff' } });
		console.log('Seed: created staff user');
	}

	// ── 4. Vendors ───────────────────────────────────────────
	const vendorDefs = [
		{ name: 'TechCore Supplies', contactEmail: 'orders@techcore.com', contactPhone: '+1-800-555-0101', type: 'Supplier', paymentTerms: 'Net 30', address: '12 Industrial Ave, Dubai' },
		{ name: 'Global Audio Imports', contactEmail: 'supply@globalaudio.ae', contactPhone: '+971-4-555-0202', type: 'Supplier', paymentTerms: 'Net 45', address: '7 Trade Centre Rd, Abu Dhabi' },
		{ name: 'SmartHome Direct', contactEmail: 'wholesale@smarthome.io', contactPhone: '+1-800-555-0303', type: 'Both', paymentTerms: 'Net 30', address: '99 Commerce Blvd, Sharjah' },
	];

	const vendors: { id: string }[] = [];
	for (const def of vendorDefs) {
		let v = await prisma.vendor.findFirst({ where: { name: def.name } });
		if (!v) {
			v = await prisma.vendor.create({ data: { ...def, isActive: true } });
			console.log(`Seed: created vendor "${def.name}"`);
		}
		vendors.push(v);
	}

	// ── 5. Categories ────────────────────────────────────────
	const categoryDefs = [
		{ name: 'Electronics', slug: 'electronics', description: 'Consumer electronics and accessories' },
		{ name: 'Audio', slug: 'audio', description: 'Speakers, headphones, and audio equipment', parentSlug: 'electronics' },
		{ name: 'Smart Home', slug: 'smart-home', description: 'Smart home devices and hubs', parentSlug: 'electronics' },
		{ name: 'Cables & Accessories', slug: 'cables-accessories', description: 'Cables, adapters, and peripherals', parentSlug: 'electronics' },
	];

	const categoryMap: Record<string, string> = {};
	// First pass: top-level
	for (const def of categoryDefs.filter(c => !c.parentSlug)) {
		let cat = await prisma.category.findUnique({ where: { slug: def.slug } });
		if (!cat) {
			cat = await prisma.category.create({ data: { name: def.name, slug: def.slug, description: def.description } });
		}
		categoryMap[def.slug] = cat.id;
	}
	// Second pass: children
	for (const def of categoryDefs.filter(c => c.parentSlug)) {
		let cat = await prisma.category.findUnique({ where: { slug: def.slug } });
		if (!cat) {
			cat = await prisma.category.create({
				data: { name: def.name, slug: def.slug, description: def.description, parentId: categoryMap[def.parentSlug!] },
			});
		}
		categoryMap[def.slug] = cat.id;
	}
	console.log('Seed: categories ready');

	// ── 6. SKUs ──────────────────────────────────────────────
	const skuDefs = [
		{
			skuCode: 'SKU-SPKR-001', name: 'Bluetooth Speaker Pro X1',
			vendorIdx: 1, unitOfMeasure: 'unit', categorySlug: 'audio',
			dimensions: { lengthCm: 15, widthCm: 8, heightCm: 8 }, isFragile: false,
			conversionRules: { unitToBox: 6 }, lowStockThreshold: 10,
		},
		{
			skuCode: 'SKU-HDPH-002', name: 'Noise-Cancelling Headphones NC500',
			vendorIdx: 1, unitOfMeasure: 'unit', categorySlug: 'audio',
			dimensions: { lengthCm: 22, widthCm: 18, heightCm: 9 }, isFragile: true,
			conversionRules: { unitToBox: 4 }, lowStockThreshold: 5,
		},
		{
			skuCode: 'SKU-HUB-003', name: 'Smart Home Hub v3',
			vendorIdx: 2, unitOfMeasure: 'unit', categorySlug: 'smart-home',
			dimensions: { lengthCm: 12, widthCm: 12, heightCm: 3 }, isFragile: true,
			conversionRules: { unitToBox: 10 }, lowStockThreshold: 8,
		},
		{
			skuCode: 'SKU-BULB-004', name: 'Smart LED Bulb RGBW 10W',
			vendorIdx: 2, unitOfMeasure: 'unit', categorySlug: 'smart-home',
			dimensions: { lengthCm: 6, widthCm: 6, heightCm: 12 }, isFragile: true,
			conversionRules: { unitToBox: 24 }, lowStockThreshold: 20,
		},
		{
			skuCode: 'SKU-CBL-005', name: 'USB-C to USB-C Cable 2m',
			vendorIdx: 2, unitOfMeasure: 'pc', categorySlug: 'cables-accessories',
			dimensions: { lengthCm: 20, widthCm: 2, heightCm: 2 }, isFragile: false,
			conversionRules: { pcToBox: 50 }, lowStockThreshold: 50,
		},
		{
			skuCode: 'SKU-ADPT-006', name: 'HDMI to DisplayPort Adapter 4K',
			vendorIdx: 2, unitOfMeasure: 'pc', categorySlug: 'cables-accessories',
			dimensions: { lengthCm: 10, widthCm: 4, heightCm: 2 }, isFragile: false,
			conversionRules: { pcToBox: 20 }, lowStockThreshold: 15,
		},
	];

	const skus: { id: string; skuCode: string }[] = [];
	for (const def of skuDefs) {
		let sku = await prisma.sKU.findUnique({ where: { skuCode: def.skuCode } });
		if (!sku) {
			sku = await prisma.sKU.create({
				data: {
					skuCode: def.skuCode,
					name: def.name,
					vendorId: vendors[def.vendorIdx].id,
					unitOfMeasure: def.unitOfMeasure,
					categoryId: categoryMap[def.categorySlug] ?? null,
					dimensions: def.dimensions,
					isFragile: def.isFragile,
					conversionRules: def.conversionRules,
					lowStockThreshold: def.lowStockThreshold,
					isActive: true,
				},
			});
			console.log(`Seed: created SKU "${def.skuCode}"`);
		}
		skus.push({ id: sku.id, skuCode: sku.skuCode });
	}

	// ── 7. Branch + Floor + Rack + Shelf ────────────────────
	let branch = await prisma.branch.findUnique({ where: { code: 'HQ-DXB' } });
	if (!branch) {
		branch = await prisma.branch.create({
			data: {
				name: 'Dubai HQ Warehouse',
				code: 'HQ-DXB',
				address: 'Al Quoz Industrial Area 3, Dubai, UAE',
				phone: '+971-4-555-1000',
				email: 'warehouse@jingles.com',
				isDefault: true,
			},
		});
		console.log('Seed: created branch');
	}

	let floor = await prisma.floor.findFirst({ where: { branchId: branch.id, code: 'FL-01' } });
	if (!floor) {
		floor = await prisma.floor.create({
			data: {
				branchId: branch.id,
				name: 'Ground Floor',
				code: 'FL-01',
				floorNumber: 1,
				length: 60,
				width: 40,
				notes: 'Main receiving and storage floor',
			},
		});
		console.log('Seed: created floor');
	}

	let rack = await prisma.rack.findFirst({ where: { floorId: floor.id, code: 'RK-A1' } });
	if (!rack) {
		rack = await prisma.rack.create({
			data: {
				floorId: floor.id,
				name: 'Rack A1',
				code: 'RK-A1',
				notes: 'Primary electronics storage rack',
				posX: 5, posZ: 5, rotY: 0,
				widthCm: 120, heightCm: 220, depthCm: 60,
			},
		});
	}

	const shelfDefs = [
		{ name: 'Shelf A1-1', code: 'SH-A1-1', height: 0.5, width: 1.2, length: 0.6 },
		{ name: 'Shelf A1-2', code: 'SH-A1-2', height: 0.5, width: 1.2, length: 0.6 },
		{ name: 'Shelf A1-3', code: 'SH-A1-3', height: 0.5, width: 1.2, length: 0.6 },
	];

	const shelves: { id: string }[] = [];
	for (const sd of shelfDefs) {
		let shelf = await prisma.shelf.findFirst({ where: { floorId: floor.id, code: sd.code } });
		if (!shelf) {
			shelf = await prisma.shelf.create({
				data: { ...sd, floorId: floor.id, rackId: rack.id },
			});
		}
		shelves.push({ id: shelf.id });
	}
	console.log('Seed: rack and shelves ready');

	// ── 8. GRNs with lines → inventory records ───────────────
	// Each GRN represents a real supplier delivery. Every inventory record
	// is created only as a result of a GRN line being received.

	type GRNDef = {
		vendorIdx: number;
		invoiceReference: string;
		deliveryDate: Date;
		status: string; // GRN status
		lines: {
			skuIdx: number;
			expectedQty: number;
			receivedQty: number;
			inventoryState: string;
			shelfIdx: number;
			inspectApproved?: number;
			inspectRejected?: number;
			damageClass?: string;
		}[];
	};

	const grnDefs: GRNDef[] = [
		// GRN-001 — fully received & inspected, closed
		{
			vendorIdx: 0,
			invoiceReference: 'INV-TC-2024-0891',
			deliveryDate: daysAgo(45),
			status: 'Closed',
			lines: [
				{ skuIdx: 0, expectedQty: 30, receivedQty: 30, inventoryState: 'ShelfReady', shelfIdx: 0, inspectApproved: 28, inspectRejected: 2, damageClass: 'Minor' },
				{ skuIdx: 1, expectedQty: 20, receivedQty: 20, inventoryState: 'ShelfReady', shelfIdx: 1, inspectApproved: 20, inspectRejected: 0 },
			],
		},
		// GRN-002 — fully inspected, not yet closed
		{
			vendorIdx: 1,
			invoiceReference: 'INV-GA-2024-1140',
			deliveryDate: daysAgo(30),
			status: 'FullyInspected',
			lines: [
				{ skuIdx: 2, expectedQty: 50, receivedQty: 50, inventoryState: 'Inspected', shelfIdx: 2, inspectApproved: 47, inspectRejected: 3, damageClass: 'Minor' },
				{ skuIdx: 3, expectedQty: 100, receivedQty: 98, inventoryState: 'Inspected', shelfIdx: 0, inspectApproved: 98, inspectRejected: 0 },
			],
		},
		// GRN-003 — partially inspected (some boxes still unopened)
		{
			vendorIdx: 2,
			invoiceReference: 'INV-SH-2025-0042',
			deliveryDate: daysAgo(14),
			status: 'PartiallyInspected',
			lines: [
				{ skuIdx: 4, expectedQty: 200, receivedQty: 200, inventoryState: 'ShelfReady', shelfIdx: 1, inspectApproved: 120, inspectRejected: 0 },
				{ skuIdx: 5, expectedQty: 60, receivedQty: 60, inventoryState: 'UnopenedBox', shelfIdx: 2 },
			],
		},
		// GRN-004 — submitted but not yet inspected (very recent delivery)
		{
			vendorIdx: 0,
			invoiceReference: 'INV-TC-2025-0210',
			deliveryDate: daysAgo(3),
			status: 'Submitted',
			lines: [
				{ skuIdx: 0, expectedQty: 15, receivedQty: 15, inventoryState: 'Uninspected', shelfIdx: 0 },
				{ skuIdx: 1, expectedQty: 10, receivedQty: 10, inventoryState: 'Uninspected', shelfIdx: 1 },
			],
		},
		// GRN-005 — draft (delivery not yet arrived)
		{
			vendorIdx: 1,
			invoiceReference: 'INV-GA-2025-0387',
			deliveryDate: daysAgo(0),
			status: 'Draft',
			lines: [
				{ skuIdx: 2, expectedQty: 25, receivedQty: 0, inventoryState: 'UnopenedBox', shelfIdx: 2 },
				{ skuIdx: 3, expectedQty: 80, receivedQty: 0, inventoryState: 'UnopenedBox', shelfIdx: 0 },
			],
		},
	];

	let grnsCreated = 0;
	let inventoryCreated = 0;

	for (let gIdx = 0; gIdx < grnDefs.length; gIdx++) {
		const grnDef = grnDefs[gIdx];
		const grnRefCode = `GRN-${String(gIdx + 1).padStart(3, '0')}`;

		// Check if already seeded by invoice reference
		const existingGrn = await prisma.gRN.findFirst({ where: { invoiceReference: grnDef.invoiceReference } });
		if (existingGrn) {
			console.log(`Seed: GRN "${grnRefCode}" already exists, skipping`);
			continue;
		}

		const grn = await prisma.gRN.create({
			data: {
				supplierId: vendors[grnDef.vendorIdx].id,
				floorId: floor.id,
				shelfId: shelves[0].id,
				invoiceReference: grnDef.invoiceReference,
				supplierInvoiceDate: grnDef.deliveryDate,
				expectedDeliveryDate: grnDef.deliveryDate,
				deliveryDate: grnDef.status !== 'Draft' ? grnDef.deliveryDate : null,
				status: grnDef.status,
				notes: `Seeded delivery — ${grnRefCode}`,
				createdBy: adminUser.id,
				createdAt: grnDef.deliveryDate,
			},
		});
		grnsCreated++;

		for (const lineDef of grnDef.lines) {
			const sku = skus[lineDef.skuIdx];
			const shelf = shelves[lineDef.shelfIdx];

			// Create GRN line
			const grnLine = await prisma.gRNLine.create({
				data: {
					grnId: grn.id,
					skuId: sku.id,
					expectedQuantity: lineDef.expectedQty,
					receivedQuantity: lineDef.receivedQty,
					notes: null,
				},
			});

			// Create inspection record if any inspection occurred
			if (lineDef.inspectApproved !== undefined && lineDef.receivedQty > 0) {
				await prisma.inspectionRecord.create({
					data: {
						grnLineId: grnLine.id,
						approvedQuantity: lineDef.inspectApproved,
						rejectedQuantity: lineDef.inspectRejected ?? 0,
						damageClassification: lineDef.damageClass ?? null,
						inspectorUserId: inspectorUser!.id,
						timestamp: new Date(grnDef.deliveryDate.getTime() + 24 * 60 * 60 * 1000),
						remarks: lineDef.inspectRejected ? `${lineDef.inspectRejected} units rejected on arrival` : null,
					},
				});
			}

			// Only create inventory records for items that were actually received
			// (Draft GRNs with 0 receivedQty get no inventory records)
			if (lineDef.receivedQty > 0) {
				// Create the InventoryEvent first (GRN_CREATED)
				const invEvent = await prisma.inventoryEvent.create({
					data: {
						eventType: 'GRN_CREATED',
						parentEntityId: grn.id,
						quantityDelta: lineDef.receivedQty,
						beforeQuantity: 0,
						afterQuantity: lineDef.receivedQty,
						userId: adminUser.id,
						timestamp: grnDef.deliveryDate,
						metadata: {
							grnId: grn.id,
							grnLineId: grnLine.id,
							invoiceReference: grnDef.invoiceReference,
						},
					},
				});

				// Create the inventory record linked to this GRN event
				await prisma.inventoryRecord.create({
					data: {
						skuId: sku.id,
						floorId: floor.id,
						shelfId: shelf.id,
						quantity: lineDef.receivedQty,
						state: lineDef.inventoryState,
						sourceEventId: invEvent.id,
						userId: adminUser.id,
						createdAt: grnDef.deliveryDate,
					},
				});
				inventoryCreated++;

				// If some were damaged/rejected, create a separate Damaged inventory record
				if (lineDef.inspectRejected && lineDef.inspectRejected > 0) {
					const damageEvent = await prisma.inventoryEvent.create({
						data: {
							eventType: 'DAMAGE_RECORDED',
							parentEntityId: grn.id,
							quantityDelta: -lineDef.inspectRejected,
							beforeQuantity: lineDef.receivedQty,
							afterQuantity: lineDef.receivedQty - lineDef.inspectRejected,
							userId: inspectorUser!.id,
							timestamp: new Date(grnDef.deliveryDate.getTime() + 24 * 60 * 60 * 1000),
							metadata: {
								grnLineId: grnLine.id,
								damageClassification: lineDef.damageClass,
							},
						},
					});

					await prisma.inventoryRecord.create({
						data: {
							skuId: sku.id,
							floorId: floor.id,
							shelfId: shelf.id,
							quantity: lineDef.inspectRejected,
							state: 'Damaged',
							sourceEventId: damageEvent.id,
							userId: inspectorUser!.id,
							createdAt: new Date(grnDef.deliveryDate.getTime() + 24 * 60 * 60 * 1000),
						},
					});
					inventoryCreated++;
				}
			}
		}

		console.log(`Seed: created GRN "${grnRefCode}" (${grnDef.status}) with ${grnDef.lines.length} lines`);
	}

	console.log(`Seed: ${grnsCreated} GRNs created, ${inventoryCreated} inventory records created`);
	console.log('Seed: complete ✓');
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
