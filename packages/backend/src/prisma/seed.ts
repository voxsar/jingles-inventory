import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

	// Weight units (base:  Gram)
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

async function main() {
	// System units
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

	const adminEmail = 'admin@theredsun.org';
	const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
	if (!existing) {
		const passwordHash = await bcrypt.hash('admin@theredsun.org', 10);
		await prisma.user.create({ data: { email: adminEmail, passwordHash, role: 'Admin' } });
		console.log('Seed: created admin user');
	} else {
		console.log('Seed: admin user already exists, skipping');
	}

	// Manager user
	const managerEmail = 'manager@jingles.com';
	const existingManager = await prisma.user.findUnique({ where: { email: managerEmail } });
	if (!existingManager) {
		const passwordHash = await bcrypt.hash('manager123', 10);
		await prisma.user.create({ data: { email: managerEmail, passwordHash, role: 'Manager' } });
		console.log('Seed: created manager user');
	}

	// Sample vendor
	let vendor = await prisma.vendor.findFirst({ where: { name: 'Sample Vendor' } });
	if (!vendor) {
		vendor = await prisma.vendor.create({
			data: { name: 'Sample Vendor', contactEmail: 'vendor@sample.com' },
		});
		console.log('Seed: created sample vendor');
	}

	// Sample SKU
	const existingSku = await prisma.sKU.findUnique({ where: { skuCode: 'SKU-001' } });
	if (!existingSku) {
		await prisma.sKU.create({
			data: {
				skuCode: 'SKU-001',
				name: 'Sample Product',
				vendorId: vendor.id,
				unitOfMeasure: 'box',
				conversionRules: { boxToPiece: 12 },
			},
		});
		console.log('Seed: created sample SKU');
	}

	// System status options (inventory, grn, stock_transfer)
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
			// Update existing entries to add special keys
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
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
