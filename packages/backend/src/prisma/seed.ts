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
};

const STATUS_SEED_DATA: StatusSeedEntry[] = [
	// Inventory states
	{ entityType: 'inventory', value: 'UnopenedBox', label: 'Unopened Box', color: 'gray', sortOrder: 0, isDefault: true },
	{ entityType: 'inventory', value: 'Uninspected', label: 'Uninspected', color: 'warning', sortOrder: 1, isDefault: false },
	{ entityType: 'inventory', value: 'Inspected', label: 'Inspected', color: 'info', sortOrder: 2, isDefault: false },
	{ entityType: 'inventory', value: 'ShelfReady', label: 'Shelf Ready', color: 'success', sortOrder: 3, isDefault: false },
	{ entityType: 'inventory', value: 'Damaged', label: 'Damaged', color: 'critical', sortOrder: 4, isDefault: false },
	{ entityType: 'inventory', value: 'Returned', label: 'Returned', color: 'warning', sortOrder: 5, isDefault: false },
	{ entityType: 'inventory', value: 'Reserved', label: 'Reserved', color: 'info', sortOrder: 6, isDefault: false },
	{ entityType: 'inventory', value: 'Sold', label: 'Sold', color: 'gray', sortOrder: 7, isDefault: false },

	// GRN statuses
	{ entityType: 'grn', value: 'Draft', label: 'Draft', color: 'gray', sortOrder: 0, isDefault: true },
	{ entityType: 'grn', value: 'Submitted', label: 'Submitted', color: 'info', sortOrder: 1, isDefault: false },
	{ entityType: 'grn', value: 'PartiallyInspected', label: 'Partially Inspected', color: 'warning', sortOrder: 2, isDefault: false },
	{ entityType: 'grn', value: 'FullyInspected', label: 'Fully Inspected', color: 'success', sortOrder: 3, isDefault: false },
	{ entityType: 'grn', value: 'Closed', label: 'Closed', color: 'gray', sortOrder: 4, isDefault: false },

	// Stock transfer statuses
	{ entityType: 'stock_transfer', value: 'Draft', label: 'Draft', color: 'gray', sortOrder: 0, isDefault: true },
	{ entityType: 'stock_transfer', value: 'Pending', label: 'Pending', color: 'warning', sortOrder: 1, isDefault: false },
	{ entityType: 'stock_transfer', value: 'Approved', label: 'Approved', color: 'info', sortOrder: 2, isDefault: false },
	{ entityType: 'stock_transfer', value: 'InTransit', label: 'In Transit', color: 'info', sortOrder: 3, isDefault: false },
	{ entityType: 'stock_transfer', value: 'Completed', label: 'Completed', color: 'success', sortOrder: 4, isDefault: false },
	{ entityType: 'stock_transfer', value: 'Cancelled', label: 'Cancelled', color: 'critical', sortOrder: 5, isDefault: false },

	// Damage classifications (GRN inspection)
	{ entityType: 'damage_classification', value: 'Minor', label: 'Minor', color: 'warning', sortOrder: 0, isDefault: false },
	{ entityType: 'damage_classification', value: 'Major', label: 'Major', color: 'critical', sortOrder: 1, isDefault: false },
	{ entityType: 'damage_classification', value: 'Totaled', label: 'Totaled', color: 'critical', sortOrder: 2, isDefault: false },

	// Vendor / supplier types
	{ entityType: 'vendor_type', value: 'Vendor', label: 'Vendor', color: undefined, sortOrder: 0, isDefault: false },
	{ entityType: 'vendor_type', value: 'Supplier', label: 'Supplier', color: undefined, sortOrder: 1, isDefault: true },
	{ entityType: 'vendor_type', value: 'Both', label: 'Both', color: undefined, sortOrder: 2, isDefault: false },
];

async function main() {
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
	for (const entry of STATUS_SEED_DATA) {
		const existing = await prisma.statusOption.findUnique({
			where: { entityType_value: { entityType: entry.entityType, value: entry.value } },
		});
		if (!existing) {
			await prisma.statusOption.create({
				data: { ...entry, isSystem: true, isActive: true },
			});
			statusesCreated++;
		} else {
			statusesSkipped++;
		}
	}
	console.log(`Seed: status options — ${statusesCreated} created, ${statusesSkipped} already exist`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
