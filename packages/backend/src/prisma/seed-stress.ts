/**
 * Stress Test Seed
 *
 * Populates the database with:
 *   - 1 branch (Stress Test Branch)
 *   - 3 floors
 *   - 5 racks per floor = 15 racks total
 *   - 8 shelves per rack  = 120 shelves total
 *   - 10,000 SKUs
 *   - 10,000 inventory records (one per SKU, distributed across shelves)
 *
 * Run with:
 *   npm run prisma:seed-stress   (from packages/backend)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FLOORS = 3;
const RACKS_PER_FLOOR = 5;   // 15 racks total
const SHELVES_PER_RACK = 8;  // 120 shelves total
const TOTAL_SKUS = 10_000;
const BATCH_SIZE = 500;

async function main() {
	console.log('🚀 Starting stress test seed...');

	// ── Vendor ──────────────────────────────────────────────────────────────
	let vendor = await prisma.vendor.findFirst({ where: { name: 'Stress Test Vendor' } });
	if (!vendor) {
		vendor = await prisma.vendor.create({
			data: { name: 'Stress Test Vendor', contactEmail: 'stress@test.com' },
		});
		console.log('✅ Created stress test vendor');
	} else {
		console.log('⏭️  Stress test vendor already exists, skipping');
	}

	// ── Branch ──────────────────────────────────────────────────────────────
	let branch = await prisma.branch.findFirst({ where: { code: 'STRESS-01' } });
	if (!branch) {
		branch = await prisma.branch.create({
			data: { name: 'Stress Test Branch', code: 'STRESS-01', address: '1 Test Lane', isDefault: false },
		});
		console.log('✅ Created stress test branch');
	} else {
		console.log('⏭️  Stress test branch already exists, skipping');
	}

	// ── Floors ───────────────────────────────────────────────────────────────
	const floorIds: string[] = [];
	for (let f = 1; f <= FLOORS; f++) {
		const code = `ST-F${f}`;
		let floor = await prisma.floor.findFirst({ where: { branchId: branch.id, code } });
		if (!floor) {
			floor = await prisma.floor.create({
				data: { branchId: branch.id, name: `Stress Floor ${f}`, code },
			});
		}
		floorIds.push(floor.id);
	}
	console.log(`✅ Ensured ${FLOORS} floors`);

	// ── Racks ────────────────────────────────────────────────────────────────
	const rackIds: string[] = [];
	for (let f = 0; f < floorIds.length; f++) {
		for (let r = 1; r <= RACKS_PER_FLOOR; r++) {
			const code = `ST-F${f + 1}-R${String(r).padStart(2, '0')}`;
			let rack = await prisma.rack.findFirst({ where: { floorId: floorIds[f], code } });
			if (!rack) {
				rack = await prisma.rack.create({
					data: { floorId: floorIds[f], name: `Floor ${f + 1} Rack ${r}`, code },
				});
			}
			rackIds.push(rack.id);
		}
	}
	console.log(`✅ Ensured ${rackIds.length} racks (${RACKS_PER_FLOOR} per floor)`);

	// ── Shelves ──────────────────────────────────────────────────────────────
	const shelfIds: string[] = [];
	for (let ri = 0; ri < rackIds.length; ri++) {
		const floorIndex = Math.floor(ri / RACKS_PER_FLOOR);
		for (let s = 1; s <= SHELVES_PER_RACK; s++) {
			const rackNum = (ri % RACKS_PER_FLOOR) + 1;
			const code = `ST-F${floorIndex + 1}-R${String(rackNum).padStart(2, '0')}-S${s}`;
			let shelf = await prisma.shelf.findFirst({ where: { rackId: rackIds[ri], code } });
			if (!shelf) {
				shelf = await prisma.shelf.create({
					data: {
						floorId: floorIds[floorIndex],
						rackId: rackIds[ri],
						name: `Floor ${floorIndex + 1} Rack ${rackNum} Shelf ${s}`,
						code,
						height: 2.0,
						width: 1.2,
						length: 0.6,
					},
				});
			}
			shelfIds.push(shelf.id);
		}
	}
	console.log(`✅ Ensured ${shelfIds.length} shelves (${SHELVES_PER_RACK} per rack)`);

	// ── SKUs + Inventory Records ──────────────────────────────────────────────
	// Find how many stress SKUs already exist
	const existingCount = await prisma.sKU.count({ where: { skuCode: { startsWith: 'STRESS-' } } });
	const toCreate = TOTAL_SKUS - existingCount;

	if (toCreate <= 0) {
		console.log(`⏭️  ${existingCount} stress SKUs already exist, skipping SKU creation`);
	} else {
		console.log(`📦 Creating ${toCreate} SKUs and inventory records in batches of ${BATCH_SIZE}...`);

		let created = 0;
		while (created < toCreate) {
			const batchCount = Math.min(BATCH_SIZE, toCreate - created);
			const startIndex = existingCount + created;

			// Build SKU batch data
			const skuBatch = Array.from({ length: batchCount }, (_, i) => {
				const num = startIndex + i + 1;
				return {
					skuCode: `STRESS-${String(num).padStart(5, '0')}`,
					name: `Stress Product ${num}`,
					vendorId: vendor!.id,
					unitOfMeasure: 'unit',
				};
			});

			await prisma.sKU.createMany({ data: skuBatch, skipDuplicates: true });

			// Fetch the IDs of SKUs just created (needed for inventory records)
			const skus = await prisma.sKU.findMany({
				where: { skuCode: { in: skuBatch.map(s => s.skuCode) } },
				select: { id: true, skuCode: true },
			});

			// Build inventory records — distribute shelves round-robin
			const inventoryBatch = skus.map((sku, idx) => {
				const globalIdx = startIndex + idx;
				const shelfIdx = globalIdx % shelfIds.length;
				const shelfId = shelfIds[shelfIdx];
				const floorIndex = Math.min(
					Math.floor(shelfIdx / (RACKS_PER_FLOOR * SHELVES_PER_RACK)),
					floorIds.length - 1,
				);
				const floorId = floorIds[floorIndex];
				return {
					skuId: sku.id,
					floorId,
					shelfId,
					quantity: Math.floor(Math.random() * 200) + 1,
					state: 'Available',
				};
			});

			await prisma.inventoryRecord.createMany({ data: inventoryBatch, skipDuplicates: true });

			created += batchCount;
			process.stdout.write(`\r  Progress: ${existingCount + created}/${TOTAL_SKUS} SKUs`);
		}
		console.log('\n✅ SKUs and inventory records created');
	}

	console.log('\n🎉 Stress test seed complete!');
	console.log(`   Branch  : ${branch.name} (${branch.code})`);
	console.log(`   Floors  : ${FLOORS}`);
	console.log(`   Racks   : ${rackIds.length} (${RACKS_PER_FLOOR}/floor)`);
	console.log(`   Shelves : ${shelfIds.length} (${SHELVES_PER_RACK}/rack)`);
	console.log(`   SKUs    : ${TOTAL_SKUS}`);
	console.log(`   Records : ${TOTAL_SKUS} inventory records`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
