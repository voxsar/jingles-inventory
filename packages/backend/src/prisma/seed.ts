import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
	upsertDefaultAttributes,
	upsertDefaultTags,
	upsertDefaultUnits,
} from './catalogDefaults';

const prisma = new PrismaClient();

// ── Seed data definitions ──────────────────────────────────────────────────

type StatusSeedEntry = {
	entityType: string;
	value: string;
	label: string;
	color?: string;
	sortOrder: number;
	isDefault: boolean;
	specialKey?: string;
};

type CategorySeed = {
	name: string;
	slug: string;
	description?: string;
	children?: CategorySeed[];
};

type SKUVariantDef = {
	code: string;
	name: string;
	attributes: Record<string, string>;
};

type SKUSeed = {
	skuCode: string;
	name: string;
	description: string;
	vendor: string;
	unit: string;
	categorySlug: string;
	conversionRules?: Record<string, number>;
	dimensions: { lengthCm: number; widthCm: number; heightCm: number };
	isFragile?: boolean;
	lowStockThreshold?: number;
	tags?: string[];
	variantAttributes?: string[];
	variants?: SKUVariantDef[];
	barcodes?: string[];
};

type BatchDef = {
	skuCode: string;
	variantCode?: string;
	sequence: number;
	batchNumber: string;
	vendor: string;
	costPrice: number;
	sellingPrice: number;
	wholesalePrice?: number;
	bulkPrice?: number;
	manufacturingDate?: Date;
	expiryDate?: Date;
	notes?: string;
};

type GRNLineDef = {
	skuCode: string;
	variantCode?: string;
	batchNumber: string;
	expectedQty: number;
	receivedQty: number;
	inventoryState: string;
	shelfCode: string;
	boxCode?: string;
	inspectApproved?: number;
	inspectRejected?: number;
	damageClass?: string;
};

type GRNSeed = {
	supplier: string;
	invoiceReference: string;
	status: string;
	deliveryDate: Date;
	floorCode: string;
	shelfCode: string;
	createdBy: string;
	lines: GRNLineDef[];
};

const STATUS_SEED_DATA: StatusSeedEntry[] = [
	{ entityType: 'inventory', value: 'UnopenedBox', label: 'Unopened Box', color: 'gray', sortOrder: 0, isDefault: true, specialKey: 'INVENTORY_UNOPENED_BOX' },
	{ entityType: 'inventory', value: 'Uninspected', label: 'Uninspected', color: 'warning', sortOrder: 1, isDefault: false, specialKey: 'INVENTORY_UNINSPECTED' },
	{ entityType: 'inventory', value: 'Inspected', label: 'Inspected', color: 'info', sortOrder: 2, isDefault: false, specialKey: 'INVENTORY_INSPECTED' },
	{ entityType: 'inventory', value: 'ShelfReady', label: 'Shelf Ready', color: 'success', sortOrder: 3, isDefault: false, specialKey: 'INVENTORY_SHELF_READY' },
	{ entityType: 'inventory', value: 'Damaged', label: 'Damaged', color: 'critical', sortOrder: 4, isDefault: false, specialKey: 'INVENTORY_DAMAGED' },
	{ entityType: 'inventory', value: 'Reserved', label: 'Reserved', color: 'info', sortOrder: 5, isDefault: false, specialKey: 'INVENTORY_RESERVED' },
	{ entityType: 'inventory', value: 'Sold', label: 'Sold', color: 'gray', sortOrder: 6, isDefault: false, specialKey: 'INVENTORY_SOLD' },

	{ entityType: 'grn', value: 'Draft', label: 'Draft', color: 'gray', sortOrder: 0, isDefault: true, specialKey: 'GRN_DRAFT' },
	{ entityType: 'grn', value: 'Submitted', label: 'Submitted', color: 'info', sortOrder: 1, isDefault: false, specialKey: 'GRN_SUBMITTED' },
	{ entityType: 'grn', value: 'PartiallyInspected', label: 'Partially Inspected', color: 'warning', sortOrder: 2, isDefault: false, specialKey: 'GRN_PARTIALLY_INSPECTED' },
	{ entityType: 'grn', value: 'FullyInspected', label: 'Fully Inspected', color: 'success', sortOrder: 3, isDefault: false, specialKey: 'GRN_FULLY_INSPECTED' },
	{ entityType: 'grn', value: 'Closed', label: 'Closed', color: 'gray', sortOrder: 4, isDefault: false, specialKey: 'GRN_CLOSED' },

	{ entityType: 'stock_transfer', value: 'Draft', label: 'Draft', color: 'gray', sortOrder: 0, isDefault: true, specialKey: 'TRANSFER_DRAFT' },
	{ entityType: 'stock_transfer', value: 'Pending', label: 'Pending', color: 'warning', sortOrder: 1, isDefault: false, specialKey: 'TRANSFER_PENDING' },
	{ entityType: 'stock_transfer', value: 'Approved', label: 'Approved', color: 'info', sortOrder: 2, isDefault: false, specialKey: 'TRANSFER_APPROVED' },
	{ entityType: 'stock_transfer', value: 'InTransit', label: 'In Transit', color: 'info', sortOrder: 3, isDefault: false, specialKey: 'TRANSFER_IN_TRANSIT' },
	{ entityType: 'stock_transfer', value: 'Completed', label: 'Completed', color: 'success', sortOrder: 4, isDefault: false, specialKey: 'TRANSFER_COMPLETED' },
	{ entityType: 'stock_transfer', value: 'Cancelled', label: 'Cancelled', color: 'critical', sortOrder: 5, isDefault: false, specialKey: 'TRANSFER_CANCELLED' },

	{ entityType: 'damage_classification', value: 'Minor', label: 'Minor', color: 'warning', sortOrder: 0, isDefault: false, specialKey: 'DAMAGE_MINOR' },
	{ entityType: 'damage_classification', value: 'Major', label: 'Major', color: 'critical', sortOrder: 1, isDefault: false, specialKey: 'DAMAGE_MAJOR' },
	{ entityType: 'damage_classification', value: 'Totaled', label: 'Totaled', color: 'critical', sortOrder: 2, isDefault: false, specialKey: 'DAMAGE_TOTALED' },

	{ entityType: 'vendor_type', value: 'Vendor', label: 'Vendor', sortOrder: 0, isDefault: false, specialKey: 'VENDOR_TYPE_VENDOR' },
	{ entityType: 'vendor_type', value: 'Supplier', label: 'Supplier', sortOrder: 1, isDefault: true, specialKey: 'VENDOR_TYPE_SUPPLIER' },
	{ entityType: 'vendor_type', value: 'Both', label: 'Both', sortOrder: 2, isDefault: false, specialKey: 'VENDOR_TYPE_BOTH' },
];

const CATEGORY_SEED: CategorySeed[] = [
	{
		name: 'Electronics',
		slug: 'electronics',
		description: 'Smart devices and accessories',
		children: [
			{ name: 'Smart Home', slug: 'smart-home', children: [
				{ name: 'Controllers', slug: 'controllers' },
				{ name: 'Smart Lighting', slug: 'smart-lighting' },
				{ name: 'Sensors', slug: 'sensors' },
			] },
			{ name: 'Accessories', slug: 'accessories', children: [
				{ name: 'Cables', slug: 'cables' },
				{ name: 'Adapters', slug: 'adapters' },
			] },
		],
	},
	{
		name: 'Home & Kitchen',
		slug: 'home-kitchen',
		description: 'Kitchen tools and small appliances',
		children: [
			{ name: 'Coffee', slug: 'coffee' },
			{ name: 'Countertop', slug: 'countertop-appliances' },
		],
	},
];

const VENDOR_SEED = [
	{ name: 'Northwind Electronics', contactEmail: 'hello@northwind.example', contactPhone: '+971-4-555-1001', address: 'Dubai Production City', type: 'Supplier', paymentTerms: 'Net 30' },
	{ name: 'Blue Horizon Imports', contactEmail: 'orders@bluehorizon.example', contactPhone: '+971-2-555-2040', address: 'Abu Dhabi Industrial Zone', type: 'Supplier', paymentTerms: 'Net 45' },
	{ name: 'Harbor Trading Co.', contactEmail: 'sales@harbor.example', contactPhone: '+971-6-555-8820', address: 'Sharjah Free Zone', type: 'Both', paymentTerms: 'Net 30' },
];

const LOCATION_SEED = {
	branches: [
		{
			name: 'Dubai HQ Warehouse',
			code: 'DXB-HQ',
			address: 'Al Quoz Industrial Area 3, Dubai, UAE',
			phone: '+971-4-555-1000',
			email: 'hq@jingles.com',
			floors: [
				{ name: 'Ground', code: 'DXB-F1', floorNumber: 1, length: 60, width: 40 },
			],
		},
		{
			name: 'Abu Dhabi Depot',
			code: 'AUH-DEP',
			address: 'Mussafah Industrial Area, Abu Dhabi',
			phone: '+971-2-555-3000',
			email: 'auh@jingles.com',
			floors: [
				{ name: 'Main Floor', code: 'AUH-F1', floorNumber: 1, length: 40, width: 28 },
			],
		},
	],
};

const SKU_SEED: SKUSeed[] = [
	{
		skuCode: 'SKU-HUB-100',
		name: 'Orion Smart Hub',
		description: 'Central gateway for smart home routines and Zigbee devices.',
		vendor: 'Northwind Electronics',
		unit: 'Unit',
		categorySlug: 'controllers',
		conversionRules: { unitToBox: 5 },
		dimensions: { lengthCm: 12, widthCm: 12, heightCm: 4 },
		isFragile: true,
		lowStockThreshold: 5,
		tags: ['New Arrival', 'Premium'],
		variantAttributes: ['Color', 'Size'],
		variants: [
			{ code: 'SKU-HUB-100-BLK', name: 'Carbon Black / Standard', attributes: { Color: 'Carbon Black', Size: 'Standard' } },
			{ code: 'SKU-HUB-100-WHT', name: 'Arctic White / Compact', attributes: { Color: 'Arctic White', Size: 'Compact' } },
		],
		barcodes: ['8901234500012'],
	},
	{
		skuCode: 'SKU-LIGHT-200',
		name: 'Lumina RGB Lightstrip 5m',
		description: 'Addressable RGB lightstrip with Wi-Fi + Bluetooth control.',
		vendor: 'Blue Horizon Imports',
		unit: 'Pack',
		categorySlug: 'smart-lighting',
		conversionRules: { packToCase: 10 },
		dimensions: { lengthCm: 20, widthCm: 16, heightCm: 6 },
		isFragile: false,
		lowStockThreshold: 15,
		tags: ['Best Seller'],
		variantAttributes: ['Color'],
		variants: [
			{ code: 'SKU-LIGHT-200-NEON', name: 'Neon Spectrum', attributes: { Color: 'Midnight Blue' } },
			{ code: 'SKU-LIGHT-200-ICE', name: 'Ice White', attributes: { Color: 'Arctic White' } },
		],
		barcodes: ['8901234500029', '8901234500036'],
	},
	{
		skuCode: 'SKU-SENSOR-300',
		name: 'Aero Motion Sensor',
		description: 'Battery powered PIR sensor with tamper detection.',
		vendor: 'Northwind Electronics',
		unit: 'Piece',
		categorySlug: 'sensors',
		dimensions: { lengthCm: 10, widthCm: 8, heightCm: 5 },
		isFragile: false,
		lowStockThreshold: 10,
		tags: ['Fragile'],
		barcodes: ['8901234500043'],
	},
	{
		skuCode: 'SKU-COFFEE-400',
		name: 'BrewMaster Pour-over Kit',
		description: 'Glass dripper, gooseneck kettle, and reusable filters.',
		vendor: 'Harbor Trading Co.',
		unit: 'Set',
		categorySlug: 'coffee',
		conversionRules: { setToCase: 4 },
		dimensions: { lengthCm: 28, widthCm: 22, heightCm: 16 },
		isFragile: true,
		lowStockThreshold: 6,
		variantAttributes: ['Size'],
		variants: [
			{ code: 'SKU-COFFEE-400-STD', name: 'Standard Set', attributes: { Size: 'Standard' } },
			{ code: 'SKU-COFFEE-400-EXT', name: 'Extended Barista Set', attributes: { Size: 'Extended' } },
		],
		barcodes: ['8901234500050'],
	},
];

const BATCH_SEED: BatchDef[] = [
	{ skuCode: 'SKU-HUB-100', variantCode: 'SKU-HUB-100-BLK', sequence: 1, batchNumber: 'HUB-BLK-001', vendor: 'Northwind Electronics', costPrice: 65, sellingPrice: 110, wholesalePrice: 95, manufacturingDate: new Date('2025-01-10'), expiryDate: new Date('2027-01-10') },
	{ skuCode: 'SKU-HUB-100', variantCode: 'SKU-HUB-100-WHT', sequence: 2, batchNumber: 'HUB-WHT-002', vendor: 'Northwind Electronics', costPrice: 62, sellingPrice: 108, wholesalePrice: 92, manufacturingDate: new Date('2025-02-15'), expiryDate: new Date('2027-02-15') },
	{ skuCode: 'SKU-LIGHT-200', variantCode: 'SKU-LIGHT-200-NEON', sequence: 1, batchNumber: 'LIGHT-NEON-001', vendor: 'Blue Horizon Imports', costPrice: 22, sellingPrice: 42, wholesalePrice: 35, manufacturingDate: new Date('2025-03-05') },
	{ skuCode: 'SKU-LIGHT-200', variantCode: 'SKU-LIGHT-200-ICE', sequence: 2, batchNumber: 'LIGHT-ICE-002', vendor: 'Blue Horizon Imports', costPrice: 21, sellingPrice: 40, wholesalePrice: 33, manufacturingDate: new Date('2025-03-15') },
	{ skuCode: 'SKU-SENSOR-300', sequence: 1, batchNumber: 'SENSOR-BASE-001', vendor: 'Northwind Electronics', costPrice: 12, sellingPrice: 25, manufacturingDate: new Date('2025-01-20') },
	{ skuCode: 'SKU-COFFEE-400', variantCode: 'SKU-COFFEE-400-STD', sequence: 1, batchNumber: 'BREW-STD-001', vendor: 'Harbor Trading Co.', costPrice: 35, sellingPrice: 60, wholesalePrice: 50, manufacturingDate: new Date('2025-02-01'), expiryDate: new Date('2026-08-01') },
	{ skuCode: 'SKU-COFFEE-400', variantCode: 'SKU-COFFEE-400-EXT', sequence: 2, batchNumber: 'BREW-EXT-002', vendor: 'Harbor Trading Co.', costPrice: 48, sellingPrice: 78, wholesalePrice: 65, manufacturingDate: new Date('2025-02-10'), expiryDate: new Date('2026-09-10') },
];

const GRN_SEED: GRNSeed[] = [
	{
		supplier: 'Northwind Electronics',
		invoiceReference: 'INV-NW-2025-001',
		status: 'FullyInspected',
		deliveryDate: new Date('2025-03-20T10:00:00Z'),
		floorCode: 'DXB-F1',
		shelfCode: 'DXB-R1-S1',
		createdBy: 'admin@theredsun.org',
		lines: [
			{ skuCode: 'SKU-HUB-100', variantCode: 'SKU-HUB-100-BLK', batchNumber: 'HUB-BLK-001', expectedQty: 30, receivedQty: 28, inventoryState: 'Inspected', shelfCode: 'DXB-R1-S1', inspectApproved: 27, inspectRejected: 1, damageClass: 'Minor' },
			{ skuCode: 'SKU-SENSOR-300', batchNumber: 'SENSOR-BASE-001', expectedQty: 40, receivedQty: 40, inventoryState: 'ShelfReady', shelfCode: 'DXB-R1-S2', boxCode: 'DXB-BOX-01', inspectApproved: 40 },
		],
	},
	{
		supplier: 'Blue Horizon Imports',
		invoiceReference: 'INV-BH-2025-014',
		status: 'Submitted',
		deliveryDate: new Date('2025-03-25T09:30:00Z'),
		floorCode: 'DXB-F1',
		shelfCode: 'DXB-R2-S1',
		createdBy: 'manager@jingles.com',
		lines: [
			{ skuCode: 'SKU-LIGHT-200', variantCode: 'SKU-LIGHT-200-NEON', batchNumber: 'LIGHT-NEON-001', expectedQty: 60, receivedQty: 60, inventoryState: 'Uninspected', shelfCode: 'DXB-R2-S1' },
			{ skuCode: 'SKU-LIGHT-200', variantCode: 'SKU-LIGHT-200-ICE', batchNumber: 'LIGHT-ICE-002', expectedQty: 40, receivedQty: 38, inventoryState: 'Uninspected', shelfCode: 'DXB-R2-S2', inspectApproved: 36, inspectRejected: 2, damageClass: 'Minor' },
		],
	},
	{
		supplier: 'Harbor Trading Co.',
		invoiceReference: 'INV-HAR-2025-004',
		status: 'PartiallyInspected',
		deliveryDate: new Date('2025-03-28T14:00:00Z'),
		floorCode: 'AUH-F1',
		shelfCode: 'AUH-R1-S1',
		createdBy: 'admin@theredsun.org',
		lines: [
			{ skuCode: 'SKU-COFFEE-400', variantCode: 'SKU-COFFEE-400-STD', batchNumber: 'BREW-STD-001', expectedQty: 24, receivedQty: 24, inventoryState: 'ShelfReady', shelfCode: 'AUH-R1-S1', inspectApproved: 23, inspectRejected: 1, damageClass: 'Minor' },
			{ skuCode: 'SKU-COFFEE-400', variantCode: 'SKU-COFFEE-400-EXT', batchNumber: 'BREW-EXT-002', expectedQty: 12, receivedQty: 10, inventoryState: 'UnopenedBox', shelfCode: 'AUH-R1-S2' },
		],
	},
];

const PRICING_OVERLAYS = [
	{
		name: 'Spring Smart Lighting Promo',
		description: '10% off all Lumina strips',
		type: 'percentage_discount',
		value: 10,
		appliesTo: { skuCodes: ['SKU-LIGHT-200'] },
		conditions: { branches: ['DXB-HQ'] },
		priority: 5,
		stackable: false,
		status: 'active',
		validFrom: new Date('2025-03-15'),
		validTo: new Date('2025-04-30'),
	},
];

// ── Utility helpers ─────────────────────────────────────────────────────────

function todayMinus(days: number): Date {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return d;
}

async function upsertStatuses() {
	for (const entry of STATUS_SEED_DATA) {
		await prisma.statusOption.upsert({
			where: { entityType_value: { entityType: entry.entityType, value: entry.value } },
			update: { label: entry.label, color: entry.color, sortOrder: entry.sortOrder, isDefault: entry.isDefault, specialKey: entry.specialKey, isSystem: true, isActive: true },
			create: { ...entry, isSystem: true, isActive: true },
		});
	}
	console.log('Seed: status options ready');
}

async function upsertUnits() {
	const unitMap = await upsertDefaultUnits(prisma);
	console.log('Seed: units of measure ready');
	return unitMap;
}

async function upsertTags() {
	const tagMap = await upsertDefaultTags(prisma);
	console.log('Seed: tags ready');
	return tagMap;
}

async function upsertAttributes() {
	const { attributeMap, valueMap } = await upsertDefaultAttributes(prisma);
	console.log('Seed: attributes ready');
	return { attributeMap, valueMap };
}

async function upsertCategories() {
	const categoryMap = new Map<string, string>();
	const process = async (node: CategorySeed, parentId: string | null = null) => {
		const category = await prisma.category.upsert({
			where: { slug: node.slug },
			update: { name: node.name, description: node.description ?? null, parentId },
			create: { name: node.name, slug: node.slug, description: node.description ?? null, parentId },
		});
		categoryMap.set(node.slug, category.id);
		if (node.children) {
			for (const child of node.children) {
				await process(child, category.id);
			}
		}
	};

	for (const root of CATEGORY_SEED) {
		await process(root, null);
	}
	console.log('Seed: categories ready');
	return categoryMap;
}

async function upsertVendorsAndUsers(vendorMap: Map<string, string>) {
	for (const vendor of VENDOR_SEED) {
		const created = await prisma.vendor.upsert({
			where: { name: vendor.name },
			update: { ...vendor, isActive: true },
			create: { ...vendor, isActive: true },
		});
		vendorMap.set(vendor.name, created.id);
	}
	console.log('Seed: vendors ready');

	// Users
	const users: Record<string, string> = {};
	const defaultUsers = [
		{ email: 'admin@theredsun.org', password: 'admin@theredsun.org', role: 'Admin' },
		{ email: 'manager@jingles.com', password: 'manager123', role: 'Manager' },
		{ email: 'inspector@jingles.com', password: 'inspector123', role: 'Inspector' },
		{ email: 'staff@jingles.com', password: 'staff123', role: 'Staff' },
		{ email: 'vendor@bluehorizon.com', password: 'vendor123', role: 'Vendor', vendor: 'Blue Horizon Imports' },
	];

	for (const userDef of defaultUsers) {
		let user = await prisma.user.findUnique({ where: { email: userDef.email } });
		if (!user) {
			const passwordHash = await bcrypt.hash(userDef.password, 10);
			user = await prisma.user.create({
				data: {
					email: userDef.email,
					passwordHash,
					role: userDef.role,
					vendorId: userDef.vendor ? vendorMap.get(userDef.vendor) ?? null : null,
				},
			});
		}
		users[userDef.email] = user.id;
	}
	console.log('Seed: users ready');
	return users;
}

async function seedLocations() {
	const branchMap = new Map<string, string>();
	const floorMap = new Map<string, string>();
	const shelfMap = new Map<string, string>();
	const boxMap = new Map<string, string>();

	for (const branch of LOCATION_SEED.branches) {
		const createdBranch = await prisma.branch.upsert({
			where: { code: branch.code },
			update: { name: branch.name, address: branch.address, phone: branch.phone, email: branch.email, isActive: true },
			create: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone, email: branch.email, isDefault: branch.code === 'DXB-HQ', isActive: true },
		});
		branchMap.set(branch.code, createdBranch.id);

		for (const floor of branch.floors) {
			const createdFloor = await prisma.floor.upsert({
				where: { branchId_code: { branchId: createdBranch.id, code: floor.code } },
				update: { name: floor.name, floorNumber: floor.floorNumber, length: floor.length ?? null, width: floor.width ?? null, isActive: true },
				create: { branchId: createdBranch.id, name: floor.name, code: floor.code, floorNumber: floor.floorNumber, length: floor.length ?? null, width: floor.width ?? null },
			});
			floorMap.set(floor.code, createdFloor.id);

			// Racks & shelves for each floor
			const racks = [
				{ name: 'Rack 1', code: `${floor.code.replace('F', 'R')}1`, floorId: createdFloor.id, posX: 5, posZ: 5 },
				{ name: 'Rack 2', code: `${floor.code.replace('F', 'R')}2`, floorId: createdFloor.id, posX: 15, posZ: 5 },
			];

			for (const rackDef of racks) {
				const rack = await prisma.rack.upsert({
					where: { floorId_code: { floorId: rackDef.floorId, code: rackDef.code } },
					update: { name: rackDef.name, posX: rackDef.posX, posZ: rackDef.posZ, widthCm: 120, heightCm: 220, depthCm: 60 },
					create: { ...rackDef, notes: 'Seeded rack', rotY: 0, widthCm: 120, heightCm: 220, depthCm: 60 },
				});

				const shelves = [
					{ name: `${rack.code}-Shelf-1`, code: `${rack.code}-S1`, height: 0.45, width: 1.2, length: 0.6 },
					{ name: `${rack.code}-Shelf-2`, code: `${rack.code}-S2`, height: 0.45, width: 1.2, length: 0.6 },
				];

				for (const shelfDef of shelves) {
					const shelf = await prisma.shelf.upsert({
						where: { floorId_code: { floorId: rack.floorId, code: shelfDef.code } },
						update: { name: shelfDef.name, rackId: rack.id, height: shelfDef.height, width: shelfDef.width, length: shelfDef.length, isActive: true },
						create: { ...shelfDef, floorId: rack.floorId, rackId: rack.id, hasFreezer: false, hasLock: false },
					});
					shelfMap.set(shelf.code, shelf.id);

					const box = await prisma.storageBox.upsert({
						where: { code: `${shelf.code}-BOX` },
						update: { shelfId: shelf.id, floorId: rack.floorId, height: 0.4, width: 0.6, length: 0.6, isActive: true },
						create: {
							name: `${shelf.code} Box`,
							code: `${shelf.code}-BOX`,
							shelfId: shelf.id,
							floorId: rack.floorId,
							height: 0.4,
							width: 0.6,
							length: 0.6,
							stackOrder: 0,
						},
					});
					boxMap.set(box.code, box.id);

					await prisma.boxBarcode.upsert({
						where: { barcode: `BC-${box.code}` },
						update: { boxId: box.id, isDefault: true },
						create: { boxId: box.id, barcode: `BC-${box.code}`, isDefault: true, label: 'Seeded box barcode' },
					});
				}
			}
		}
	}

	console.log('Seed: locations ready');
	return { branchMap, floorMap, shelfMap, boxMap };
}

async function seedSkus(options: {
	unitMap: Map<string, string>;
	vendorMap: Map<string, string>;
	categoryMap: Map<string, string>;
	tagMap: Map<string, string>;
	attributeMap: Map<string, string>;
	valueMap: Map<string, Map<string, string>>;
}) {
	const skuMap = new Map<string, string>();
	const variantMap = new Map<string, string>();

	for (const skuDef of SKU_SEED) {
		const sku = await prisma.sKU.upsert({
			where: { skuCode: skuDef.skuCode },
			update: {
				name: skuDef.name,
				description: skuDef.description,
				vendorId: options.vendorMap.get(skuDef.vendor)!,
				categoryId: options.categoryMap.get(skuDef.categorySlug) ?? null,
				unitOfMeasureId: options.unitMap.get(skuDef.unit) ?? null,
				unitOfMeasure: skuDef.unit,
				conversionRules: skuDef.conversionRules ?? Prisma.JsonNull,
				dimensions: skuDef.dimensions,
				isFragile: skuDef.isFragile ?? false,
				lowStockThreshold: skuDef.lowStockThreshold ?? null,
				isActive: true,
			},
			create: {
				skuCode: skuDef.skuCode,
				name: skuDef.name,
				description: skuDef.description,
				vendorId: options.vendorMap.get(skuDef.vendor)!,
				categoryId: options.categoryMap.get(skuDef.categorySlug) ?? null,
				unitOfMeasureId: options.unitMap.get(skuDef.unit) ?? null,
				unitOfMeasure: skuDef.unit,
				conversionRules: skuDef.conversionRules ?? Prisma.JsonNull,
				dimensions: skuDef.dimensions,
				isFragile: skuDef.isFragile ?? false,
				lowStockThreshold: skuDef.lowStockThreshold ?? null,
				isActive: true,
			},
		});
		skuMap.set(sku.skuCode, sku.id);

		// Secondary vendor for shared supply
		if (skuDef.vendor === 'Northwind Electronics' && options.vendorMap.get('Blue Horizon Imports')) {
			await prisma.sKUVendor.upsert({
				where: { skuId_vendorId: { skuId: sku.id, vendorId: options.vendorMap.get('Blue Horizon Imports')! } },
				update: {},
				create: { skuId: sku.id, vendorId: options.vendorMap.get('Blue Horizon Imports')! },
			});
		}

		if (skuDef.tags?.length) {
			for (const tagName of skuDef.tags) {
				const tagId = options.tagMap.get(tagName);
				if (!tagId) continue;
				await prisma.sKUTag.upsert({
					where: { skuId_tagId: { skuId: sku.id, tagId } },
					update: {},
					create: { skuId: sku.id, tagId },
				});
			}
		}

		if (skuDef.variantAttributes?.length) {
			for (const attrName of skuDef.variantAttributes) {
				const attributeId = options.attributeMap.get(attrName);
				if (!attributeId) continue;
				const skuAttr = await prisma.sKUAttribute.upsert({
					where: { skuId_attributeId: { skuId: sku.id, attributeId } },
					update: {},
					create: { skuId: sku.id, attributeId },
				});

				const possibleValues = options.valueMap.get(attrName);
				if (possibleValues) {
					for (const valueId of possibleValues.values()) {
						const exists = await prisma.sKUAttributeValue.findUnique({
							where: { skuAttributeId_attributeValueId: { skuAttributeId: skuAttr.id, attributeValueId: valueId } },
						});
						if (!exists) {
							await prisma.sKUAttributeValue.create({ data: { skuAttributeId: skuAttr.id, attributeValueId: valueId } });
						}
					}
				}
			}
		}

		if (skuDef.barcodes) {
			for (const [index, barcode] of skuDef.barcodes.entries()) {
				await prisma.productBarcode.upsert({
					where: { barcode },
					update: { skuId: sku.id, isDefault: index === 0 },
					create: { skuId: sku.id, barcode, isDefault: index === 0, label: `${skuDef.name} barcode ${index + 1}` },
				});
			}
		}

		const seededImage = await prisma.productImage.findFirst({
			where: { skuId: sku.id, variantId: null, sortOrder: 0 },
			select: { id: true },
		});
		if (seededImage) {
			await prisma.productImage.update({
				where: { id: seededImage.id },
				data: { url: `https://picsum.photos/seed/${skuDef.skuCode}/640/480`, altText: skuDef.name, isPrimary: true },
			});
		} else {
			await prisma.productImage.create({
				data: { skuId: sku.id, url: `https://picsum.photos/seed/${skuDef.skuCode}/640/480`, altText: skuDef.name, isPrimary: true, sortOrder: 0 },
			});
		}

		if (skuDef.variants?.length) {
			for (const variantDef of skuDef.variants) {
				const variant = await prisma.sKUVariant.upsert({
					where: { variantCode: variantDef.code },
					update: { name: variantDef.name, isActive: true, skuId: sku.id },
					create: { skuId: sku.id, variantCode: variantDef.code, name: variantDef.name, isActive: true },
				});
				variantMap.set(variantDef.code, variant.id);

				for (const [attrName, valueDisplay] of Object.entries(variantDef.attributes)) {
					const attributeId = options.attributeMap.get(attrName);
					const valueId = options.valueMap.get(attrName)?.get(valueDisplay);
					if (!attributeId || !valueId) continue;
					const exists = await prisma.sKUVariantValue.findUnique({
						where: { variantId_attributeId: { variantId: variant.id, attributeId } },
					});
					if (!exists) {
						await prisma.sKUVariantValue.create({ data: { variantId: variant.id, attributeId, attributeValueId: valueId } });
					}
				}
			}
		}
	}

	console.log('Seed: products ready');
	return { skuMap, variantMap };
}

async function seedBatches(batchDefs: BatchDef[], skuMap: Map<string, string>, variantMap: Map<string, string>, vendorMap: Map<string, string>) {
	const batchMap = new Map<string, string>();
	for (const batch of batchDefs) {
		const skuId = skuMap.get(batch.skuCode);
		if (!skuId) continue;
		const variantId = batch.variantCode ? variantMap.get(batch.variantCode) ?? null : null;
		const vendorId = vendorMap.get(batch.vendor) ?? null;

		const created = await prisma.batch.upsert({
			where: { batchNumber: batch.batchNumber },
			update: {
				skuId,
				variantId,
				vendorId,
				sequenceNumber: batch.sequence,
				costPrice: batch.costPrice,
				sellingPrice: batch.sellingPrice,
				wholesalePrice: batch.wholesalePrice ?? null,
				bulkPrice: batch.bulkPrice ?? null,
				currency: 'AED',
				marginType: null,
				marginValue: null,
				expiryDate: batch.expiryDate ?? null,
				manufacturingDate: batch.manufacturingDate ?? null,
				notes: batch.notes ?? null,
				isActive: true,
			},
			create: {
				batchNumber: batch.batchNumber,
				skuId,
				variantId,
				sequenceNumber: batch.sequence,
				costPrice: batch.costPrice,
				sellingPrice: batch.sellingPrice,
				wholesalePrice: batch.wholesalePrice ?? null,
				bulkPrice: batch.bulkPrice ?? null,
				currency: 'AED',
				marginType: null,
				marginValue: null,
				vendorId,
				expiryDate: batch.expiryDate ?? null,
				manufacturingDate: batch.manufacturingDate ?? null,
				notes: batch.notes ?? null,
			},
		});

		batchMap.set(batch.batchNumber, created.id);
	}
	console.log('Seed: batches ready');
	return batchMap;
}

async function seedGrns(grnDefs: GRNSeed[], maps: { vendorMap: Map<string, string>; floorMap: Map<string, string>; shelfMap: Map<string, string>; boxMap: Map<string, string>; skuMap: Map<string, string>; variantMap: Map<string, string>; batchMap: Map<string, string>; users: Record<string, string>; }) {
	let grnCount = 0;
	let inventoryRecords = 0;
	for (const grnDef of grnDefs) {
		const supplierId = maps.vendorMap.get(grnDef.supplier);
		const floorId = maps.floorMap.get(grnDef.floorCode) ?? null;
		const shelfId = maps.shelfMap.get(grnDef.shelfCode) ?? null;
		if (!supplierId) continue;

		const existing = await prisma.gRN.findFirst({ where: { invoiceReference: grnDef.invoiceReference } });
		if (existing) continue;

		const grn = await prisma.gRN.create({
			data: {
				supplierId,
				floorId,
				shelfId,
				invoiceReference: grnDef.invoiceReference,
				supplierInvoiceDate: grnDef.deliveryDate,
				expectedDeliveryDate: grnDef.deliveryDate,
				deliveryDate: grnDef.deliveryDate,
				status: grnDef.status,
				notes: 'Seeded GRN',
				createdBy: maps.users[grnDef.createdBy],
				createdAt: grnDef.deliveryDate,
			},
		});
		grnCount++;

		for (const line of grnDef.lines) {
			const skuId = maps.skuMap.get(line.skuCode);
			const variantId = line.variantCode ? maps.variantMap.get(line.variantCode) ?? null : null;
			const batchId = maps.batchMap.get(line.batchNumber) ?? null;
			const lineShelfId = maps.shelfMap.get(line.shelfCode) ?? shelfId;
			const lineBoxId = line.boxCode ? maps.boxMap.get(line.boxCode) ?? null : null;
			if (!skuId) continue;

			const grnLine = await prisma.gRNLine.create({
				data: {
					grnId: grn.id,
					skuId,
					variantId,
					batchId,
					expectedQuantity: line.expectedQty,
					receivedQuantity: line.receivedQty,
					costPrice: undefined,
					sellingPrice: undefined,
					wholesalePrice: undefined,
					bulkPrice: undefined,
					notes: null,
				},
			});

			if (line.inspectApproved !== undefined) {
				await prisma.inspectionRecord.create({
					data: {
						grnLineId: grnLine.id,
						approvedQuantity: line.inspectApproved,
						rejectedQuantity: line.inspectRejected ?? 0,
						damageClassification: line.damageClass ?? null,
						inspectorUserId: maps.users['inspector@jingles.com'] ?? maps.users['manager@jingles.com'],
						timestamp: new Date(grnDef.deliveryDate.getTime() + 3600_000),
						remarks: line.inspectRejected ? `${line.inspectRejected} units flagged during inspection` : null,
					},
				});
			}

			if (line.receivedQty > 0) {
				const event = await prisma.inventoryEvent.create({
					data: {
						eventType: 'GRN_RECEIVED',
						parentEntityId: grn.id,
						quantityDelta: line.receivedQty,
						beforeQuantity: 0,
						afterQuantity: line.receivedQty,
						reasonCode: null,
						userId: grn.createdBy,
						timestamp: grnDef.deliveryDate,
						metadata: { grnLineId: grnLine.id, invoiceReference: grnDef.invoiceReference },
					},
				});

				await prisma.inventoryRecord.create({
					data: {
						skuId,
						variantId,
						batchId,
						floorId,
						shelfId: lineShelfId,
						boxId: lineBoxId,
						quantity: line.receivedQty,
						state: line.inventoryState,
						sourceEventId: event.id,
						userId: grn.createdBy,
						createdAt: grnDef.deliveryDate,
					},
				});
				inventoryRecords++;

				if (line.inspectRejected && line.inspectRejected > 0) {
					const damageEvent = await prisma.inventoryEvent.create({
						data: {
							eventType: 'DAMAGE_RECORDED',
							parentEntityId: grn.id,
							quantityDelta: -line.inspectRejected,
							beforeQuantity: line.receivedQty,
							afterQuantity: line.receivedQty - line.inspectRejected,
							reasonCode: 'DAMAGE_ON_ARRIVAL',
							userId: maps.users['inspector@jingles.com'],
							timestamp: new Date(grnDef.deliveryDate.getTime() + 2 * 3600_000),
							metadata: { grnLineId: grnLine.id, damageClassification: line.damageClass },
						},
					});

					await prisma.inventoryRecord.create({
						data: {
							skuId,
							variantId,
							batchId,
							floorId,
							shelfId: lineShelfId,
							boxId: lineBoxId,
							quantity: line.inspectRejected,
							state: 'Damaged',
							sourceEventId: damageEvent.id,
							userId: maps.users['inspector@jingles.com'],
							createdAt: new Date(grnDef.deliveryDate.getTime() + 2 * 3600_000),
						},
					});
					inventoryRecords++;
				}
			}
		}
	}
	console.log(`Seed: ${grnCount} GRNs created, ${inventoryRecords} inventory records created`);
}

async function seedStockTransfers(params: {
	branchMap: Map<string, string>;
	floorMap: Map<string, string>;
	skuMap: Map<string, string>;
	variantMap: Map<string, string>;
	batchMap: Map<string, string>;
	users: Record<string, string>;
}) {
	const transfer = await prisma.stockTransfer.upsert({
		where: { referenceNumber: 'ST-2025-001' },
		update: {
			fromBranchId: params.branchMap.get('DXB-HQ') ?? null,
			toBranchId: params.branchMap.get('AUH-DEP') ?? null,
			fromFloorId: params.floorMap.get('DXB-F1') ?? null,
			toFloorId: params.floorMap.get('AUH-F1') ?? null,
			status: 'Approved',
			notes: 'Seeded transfer to balance stock',
			requestedBy: params.users['manager@jingles.com'],
			approvedBy: params.users['admin@theredsun.org'],
			requestedAt: todayMinus(5),
			approvedAt: todayMinus(4),
			completedAt: todayMinus(2),
		},
		create: {
			referenceNumber: 'ST-2025-001',
			fromBranchId: params.branchMap.get('DXB-HQ') ?? null,
			toBranchId: params.branchMap.get('AUH-DEP') ?? null,
			fromFloorId: params.floorMap.get('DXB-F1') ?? null,
			toFloorId: params.floorMap.get('AUH-F1') ?? null,
			status: 'Approved',
			notes: 'Seeded transfer to balance stock',
			requestedBy: params.users['manager@jingles.com'],
			approvedBy: params.users['admin@theredsun.org'],
			requestedAt: todayMinus(5),
			approvedAt: todayMinus(4),
			completedAt: todayMinus(2),
		},
	});

	const lines = [
		{ skuCode: 'SKU-LIGHT-200', variantCode: 'SKU-LIGHT-200-NEON', batchNumber: 'LIGHT-NEON-001', requestedQty: 15, transferredQty: 14 },
		{ skuCode: 'SKU-SENSOR-300', batchNumber: 'SENSOR-BASE-001', requestedQty: 10, transferredQty: 10 },
	];

	for (const line of lines) {
		const skuId = params.skuMap.get(line.skuCode);
		if (!skuId) continue;
		const variantId = line.variantCode ? params.variantMap.get(line.variantCode) ?? null : null;
		const batchId = params.batchMap.get(line.batchNumber) ?? null;
		const existing = await prisma.stockTransferLine.findFirst({
			where: { transferId: transfer.id, skuId, variantId, batchId },
		});
		if (existing) {
			await prisma.stockTransferLine.update({
				where: { id: existing.id },
				data: { requestedQty: line.requestedQty, transferredQty: line.transferredQty },
			});
		} else {
			await prisma.stockTransferLine.create({
				data: { transferId: transfer.id, skuId, variantId, batchId, requestedQty: line.requestedQty, transferredQty: line.transferredQty },
			});
		}
	}

	await prisma.inventoryEvent.create({
		data: {
			eventType: 'STOCK_TRANSFER_COMPLETED',
			parentEntityId: transfer.id,
			quantityDelta: -24,
			beforeQuantity: null,
			afterQuantity: null,
			reasonCode: 'TRANSFER_OUT',
			userId: transfer.approvedBy,
			timestamp: todayMinus(2),
			metadata: { referenceNumber: transfer.referenceNumber },
		},
	});

	console.log('Seed: stock transfer ready');
}

async function seedPricingOverlays() {
	for (const overlay of PRICING_OVERLAYS) {
		await prisma.pricingOverlay.upsert({
			where: { name: overlay.name },
			update: overlay,
			create: overlay,
		});
	}
	console.log('Seed: pricing overlays ready');
}

async function seedAuxiliaryRecords(users: Record<string, string>) {
	await prisma.syncQueue.create({
		data: {
			clientId: 'offline-terminal-01',
			operation: 'INVENTORY_UPSERT',
			payload: { skuCode: 'SKU-HUB-100', quantity: 3, state: 'Reserved' },
			status: 'Pending',
			conflictFlag: false,
		},
	});

	await prisma.auditLog.create({
		data: {
			userId: users['admin@theredsun.org'],
			action: 'SEED_DATA',
			entityType: 'SeedRun',
			entityId: 'seed-2025',
			changes: { message: 'Seed data created for demo and QA' },
			ipAddress: '127.0.0.1',
		},
	});

	console.log('Seed: auxiliary records ready');
}

async function seedDashboardStats() {
	const totals = await prisma.inventoryRecord.groupBy({
		by: ['state'],
		_sum: { quantity: true },
	});

	const totalItems = totals.reduce((sum, t) => sum + (t._sum.quantity ?? 0), 0);
	const shelfReadyItems = totals.find(t => t.state === 'ShelfReady')?._sum.quantity ?? 0;
	const damagedItems = totals.find(t => t.state === 'Damaged')?._sum.quantity ?? 0;

	await prisma.dashboardStats.upsert({
		where: { id: 'seed-dashboard' },
		update: {
			totalItems,
			shelfReadyItems,
			damagedItems,
			openGRNs: await prisma.gRN.count({ where: { status: { in: ['Draft', 'Submitted', 'PartiallyInspected'] } } }),
			inventoryByState: totals.reduce((acc, t) => ({ ...acc, [t.state]: t._sum.quantity ?? 0 }), {} as Record<string, number>),
			lastUpdated: new Date(),
		},
		create: {
			id: 'seed-dashboard',
			totalItems,
			shelfReadyItems,
			damagedItems,
			openGRNs: await prisma.gRN.count({ where: { status: { in: ['Draft', 'Submitted', 'PartiallyInspected'] } } }),
			inventoryByState: totals.reduce((acc, t) => ({ ...acc, [t.state]: t._sum.quantity ?? 0 }), {} as Record<string, number>),
			lastUpdated: new Date(),
		},
	});
	console.log('Seed: dashboard stats ready');
}

async function main() {
	await upsertStatuses();
	const unitMap = await upsertUnits();
	const tagMap = await upsertTags();
	const { attributeMap, valueMap } = await upsertAttributes();
	const categoryMap = await upsertCategories();

	const vendorMap = new Map<string, string>();
	const users = await upsertVendorsAndUsers(vendorMap);

	const locations = await seedLocations();
	const { skuMap, variantMap } = await seedSkus({ unitMap, vendorMap, categoryMap, tagMap, attributeMap, valueMap });
	const batchMap = await seedBatches(BATCH_SEED, skuMap, variantMap, vendorMap);

	await seedGrns(GRN_SEED, { vendorMap, floorMap: locations.floorMap, shelfMap: locations.shelfMap, boxMap: locations.boxMap, skuMap, variantMap, batchMap, users });
	await seedStockTransfers({ branchMap: locations.branchMap, floorMap: locations.floorMap, skuMap, variantMap, batchMap, users });
	await seedPricingOverlays();
	await seedAuxiliaryRecords(users);
	await seedDashboardStats();

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
