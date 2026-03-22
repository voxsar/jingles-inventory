/**
 * Stress Test Seed
 *
 * Populates the database with:
 *   - 8 realistic vendors (Samsung, Apple, Nike, Adidas, Nestlé, P&G, Unilever, Sony)
 *   - 8 product categories (Electronics, Clothing, Food & Beverages, etc.)
 *   - Size and Color attributes
 *   - 1 branch (Stress Test Branch)
 *   - 5 floors, 10 racks per floor, 15 shelves per rack = 750 shelves total
 *   - 200,000 SKUs with realistic brand × product-type names
 *   - 40% of SKUs (80,000) have size + colour variants (3 colours × 3 sizes = 9 variants each)
 *   - 200,000 inventory records distributed across shelves
 *
 * Run with:
 *   npm run prisma:seed-stress   (from packages/backend)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Warehouse constants ───────────────────────────────────────────────────────
const FLOORS           = 5;
const RACKS_PER_FLOOR  = 10;   // 50 racks total
const SHELVES_PER_RACK = 15;   // 750 shelves total

// ── SKU / variant constants ───────────────────────────────────────────────────
const TOTAL_SKUS     = 200_000;
const VARIANT_RATIO  = 0.4;    // 40 % of SKUs get colour/size variants
const BATCH_SIZE     = 500;

// ── Inventory states (cycling through realistic states) ───────────────────────
const INVENTORY_STATES = [
	'ShelfReady',
	'Inspected',
	'UnopenedBox',
	'Uninspected',
	'Reserved',
	'ShelfReady',
	'ShelfReady',
	'Inspected',
];

// ── Vendor data ───────────────────────────────────────────────────────────────
const VENDOR_DATA = [
	{ name: 'Samsung Electronics',  contactEmail: 'orders@samsung-wholesale.com',  type: 'Supplier' },
	{ name: 'Apple Inc.',            contactEmail: 'supply@apple-trade.com',         type: 'Supplier' },
	{ name: 'Nike Inc.',             contactEmail: 'orders@nike-wholesale.com',       type: 'Vendor'   },
	{ name: 'Adidas AG',             contactEmail: 'trade@adidas-supply.com',         type: 'Vendor'   },
	{ name: "Nestlé S.A.",           contactEmail: 'orders@nestle-trade.com',         type: 'Supplier' },
	{ name: 'Procter & Gamble',      contactEmail: 'supply@pg-wholesale.com',         type: 'Supplier' },
	{ name: 'Unilever PLC',          contactEmail: 'orders@unilever-trade.com',       type: 'Supplier' },
	{ name: 'Sony Corporation',      contactEmail: 'trade@sony-supply.com',           type: 'Supplier' },
];

// ── Category data ─────────────────────────────────────────────────────────────
const CATEGORY_DATA = [
	{ name: 'Electronics',          slug: 'electronics',          description: 'Consumer electronics and gadgets'           },
	{ name: 'Clothing & Apparel',   slug: 'clothing-apparel',     description: 'Fashion and clothing items'                 },
	{ name: 'Food & Beverages',     slug: 'food-beverages',       description: 'Packaged food and drinks'                   },
	{ name: 'Home & Kitchen',       slug: 'home-kitchen',         description: 'Home appliances and kitchenware'            },
	{ name: 'Sports & Outdoors',    slug: 'sports-outdoors',      description: 'Sports equipment and outdoor gear'          },
	{ name: 'Beauty & Personal Care', slug: 'beauty-personal-care', description: 'Beauty and grooming products'             },
	{ name: 'Toys & Games',         slug: 'toys-games',           description: 'Toys and entertainment for all ages'        },
	{ name: 'Automotive',           slug: 'automotive',           description: 'Car accessories and maintenance products'   },
];

// ── Product templates (brand × type per category) ────────────────────────────
interface ProductTemplate {
	categorySlug: string;
	vendorName: string;   // maps to a vendor in VENDOR_DATA
	brands: string[];
	types: string[];
	unit: string;
	hasVariants: boolean;
}

const PRODUCT_TEMPLATES: ProductTemplate[] = [
	{
		categorySlug: 'electronics',
		vendorName: 'Samsung Electronics',
		brands: [
			'Samsung', 'Apple', 'Sony', 'LG', 'Philips', 'Panasonic', 'JBL', 'Bose',
			'Xiaomi', 'Lenovo', 'HP', 'Dell', 'Asus', 'Acer', 'Logitech', 'Razer',
			'MSI', 'Huawei', 'OnePlus', 'TCL',
		],
		types: [
			'4K Smart TV', 'OLED TV', 'Gaming Laptop', 'Ultrabook', 'Chromebook',
			'Smartphone', 'Tablet', 'Wireless Earbuds', 'Over-Ear Headphones',
			'Bluetooth Speaker', 'Soundbar', 'Smartwatch', 'Fitness Tracker',
			'Wireless Charger', 'Action Camera', 'DSLR Camera', 'Mirrorless Camera',
			'Webcam', 'Portable SSD', 'USB Hub', 'Gaming Console', 'Portable Battery Pack',
			'Smart Home Hub', 'Robot Vacuum', 'Air Purifier',
		],
		unit: 'unit',
		hasVariants: false,
	},
	{
		categorySlug: 'clothing-apparel',
		vendorName: 'Nike Inc.',
		brands: [
			"Nike", "Adidas", "Puma", "Reebok", "Levi's", "H&M", "Zara", "Uniqlo",
			"Gap", "Tommy Hilfiger", "Calvin Klein", "Ralph Lauren", "Under Armour",
			"New Balance", "The North Face", "Columbia", "Patagonia", "Carhartt",
			"Champion", "Lacoste",
		],
		types: [
			'Classic T-Shirt', 'Polo Shirt', 'Button-Down Shirt', 'Graphic Tee',
			'Long-Sleeve Shirt', 'Slim Fit Jeans', 'Relaxed Fit Jeans', 'Cargo Pants',
			'Chino Trousers', 'Jogger Pants', 'Athletic Shorts', 'Board Shorts',
			'Zip-Up Hoodie', 'Pullover Hoodie', 'Fleece Jacket', 'Windbreaker',
			'Puffer Jacket', 'Denim Jacket', 'Bomber Jacket', 'Parka Coat',
			'Running Shoes', 'Basketball Shoes', 'Training Shoes', 'Casual Sneakers',
			'Hiking Boots',
		],
		unit: 'piece',
		hasVariants: true,
	},
	{
		categorySlug: 'food-beverages',
		vendorName: "Nestlé S.A.",
		brands: [
			"Nestlé", "Kellogg's", 'PepsiCo', 'Coca-Cola', 'Kraft Heinz',
			'General Mills', 'Danone', 'Mondelez', "Campbell's", 'Heinz',
			'Del Monte', 'Dole', 'Ocean Spray', 'Tropicana', 'Quaker',
		],
		types: [
			'Ground Coffee', 'Instant Coffee', 'Green Tea', 'Black Tea', 'Herbal Tea',
			'Orange Juice', 'Apple Juice', 'Mixed Berry Juice', 'Energy Drink',
			'Sparkling Water', 'Granola Bar', 'Protein Bar', 'Mixed Nuts', 'Trail Mix',
			'Whole Grain Cereal', 'Oatmeal', 'Pasta', 'Rice', 'Quinoa', 'Tomato Sauce',
			'Olive Oil', 'Soy Sauce', 'Honey', 'Peanut Butter', 'Almond Butter',
		],
		unit: 'box',
		hasVariants: false,
	},
	{
		categorySlug: 'home-kitchen',
		vendorName: 'Sony Corporation',
		brands: [
			'KitchenAid', 'Cuisinart', 'Instant Pot', 'Ninja', 'Breville',
			"De'Longhi", 'OXO', 'Lodge', 'All-Clad', 'Calphalon', 'Pyrex',
			'Rubbermaid', 'Vitamix', 'Dyson', 'iRobot', 'Philips',
			'Black+Decker', 'Hamilton Beach', 'Whirlpool', 'Zojirushi',
		],
		types: [
			'Stand Mixer', 'Hand Blender', 'Food Processor', 'Coffee Maker',
			'Espresso Machine', 'Air Fryer', 'Pressure Cooker', 'Slow Cooker',
			'Rice Cooker', 'Toaster Oven', 'Electric Kettle', 'Juicer',
			'Cast Iron Skillet', 'Non-Stick Pan', 'Stainless Steel Pot Set',
			'Knife Block Set', 'Bamboo Cutting Board', 'Mixing Bowl Set',
			'Storage Container Set', 'Baking Sheet Pan', 'Measuring Cup Set',
			'Silicone Spatula Set', 'Dish Rack', 'Compost Bin', 'Pot Rack',
		],
		unit: 'unit',
		hasVariants: false,
	},
	{
		categorySlug: 'sports-outdoors',
		vendorName: 'Adidas AG',
		brands: [
			'Nike', 'Adidas', 'Under Armour', 'Wilson', 'Callaway', 'TaylorMade',
			'Titleist', 'Yeti', 'Hydro Flask', 'CamelBak', 'Osprey', 'Black Diamond',
			'Marmot', 'Salomon', 'Garmin', 'Fitbit', 'Polar', 'Speedo', 'Rogue',
			'Schwinn',
		],
		types: [
			'Trail Running Shoes', 'Road Running Shoes', 'Basketball',
			'Soccer Ball', 'Tennis Racket', 'Golf Club Set', 'Golf Bag',
			'Yoga Mat', 'Resistance Band Set', 'Adjustable Dumbbell Set',
			'Barbell', 'Pull-Up Bar', 'Jump Rope', 'Cycling Helmet',
			'Bike Lock', 'Hiking Backpack', 'Sleeping Bag', 'Camping Tent',
			'Trekking Poles', 'Insulated Water Bottle', 'Gym Duffel Bag',
			'GPS Sports Watch', 'Swim Goggles', 'Swim Training Cap', 'Foam Roller',
		],
		unit: 'unit',
		hasVariants: true,
	},
	{
		categorySlug: 'beauty-personal-care',
		vendorName: 'Procter & Gamble',
		brands: [
			"L'Oréal", 'Dove', 'Neutrogena', 'Cetaphil', 'Olay', 'Nivea',
			'Garnier', 'Pantene', 'Head & Shoulders', 'Herbal Essences',
			'TRESemmé', 'Maybelline', 'Revlon', 'Clinique', 'Estée Lauder',
			'Lancôme', 'Gillette', 'Oral-B', 'Colgate', 'Aveeno',
		],
		types: [
			'Moisturising Shampoo', 'Volumising Shampoo', 'Deep Conditioner',
			'Leave-In Conditioner', 'Hydrating Face Wash', 'Exfoliating Face Scrub',
			'Daily Facial Moisturiser', 'Sunscreen SPF 50', 'Vitamin C Face Serum',
			'Retinol Night Cream', 'Eye Cream', 'Nourishing Body Lotion',
			'Rich Body Butter', 'Refreshing Body Wash', 'Roll-On Deodorant',
			'Eau de Parfum', 'BB Cream Foundation', 'Full-Coverage Concealer',
			'Volumising Mascara', 'Liquid Eyeliner', 'Matte Lipstick',
			'Lip Gloss', 'Setting Powder', 'Electric Toothbrush', 'Whitening Toothpaste',
		],
		unit: 'bottle',
		hasVariants: false,
	},
	{
		categorySlug: 'toys-games',
		vendorName: 'Unilever PLC',
		brands: [
			'LEGO', 'Hasbro', 'Mattel', 'Fisher-Price', 'Playmobil', 'Ravensburger',
			'Funko', 'Hot Wheels', 'Nerf', 'Play-Doh', 'Crayola', 'Melissa & Doug',
			'Bandai', 'Nintendo', 'Spin Master',
		],
		types: [
			'Classic Building Blocks Set', 'Advanced Technic Set', 'Collectible Action Figure',
			'Strategy Board Game', 'Family Card Game', '1000-Piece Jigsaw Puzzle',
			'Remote Control Car', 'Fashion Doll', 'Toy Train Set',
			'Kids Learning Tablet', 'Chemistry Science Kit', 'Watercolour Art Set',
			'Kinetic Sand Kit', 'Play Kitchen Set', 'Outdoor Swing Set',
			'Kids Bicycle', 'Kick Scooter', 'Skateboard', 'Foam Dart Blaster',
			'Magic Tricks Kit',
		],
		unit: 'unit',
		hasVariants: false,
	},
	{
		categorySlug: 'automotive',
		vendorName: 'Sony Corporation',
		brands: [
			'Bosch', '3M', "Meguiar's", 'Armor All', 'Chemical Guys', 'Michelin',
			'Bridgestone', 'Goodyear', 'ACDelco', 'NGK', 'Pennzoil', 'Mobil 1',
			'Castrol', 'WD-40', 'Turtle Wax',
		],
		types: [
			'Full Synthetic Motor Oil 5W-30', 'High Mileage Oil 10W-40',
			'Premium Car Wax', 'Tire Shine Spray', 'Interior Cleaner Spray',
			'Foaming Car Shampoo', 'Windshield Washer Fluid', 'DOT 4 Brake Fluid',
			'Engine Coolant Concentrate', 'Engine Air Filter', 'Premium Oil Filter',
			'Iridium Spark Plug', 'Beam Wiper Blade', 'Portable Jump Starter',
			'Smart Battery Charger', 'Tire Inflator Pump', 'Cordless Car Vacuum',
			'Dash Camera', 'Universal Seat Cover Set', 'All-Weather Floor Mats',
		],
		unit: 'unit',
		hasVariants: false,
	},
];

// ── Variant options ───────────────────────────────────────────────────────────
// 3 colours × 3 sizes = 9 variants per variant SKU
const VARIANT_COLOURS = ['Black', 'Navy Blue', 'Forest Green'];
const VARIANT_SIZES   = ['S', 'M', 'L'];

// ── Edition suffixes — appended when the same brand+type combo repeats ────────
// After these 30 are exhausted, "Series N" is used.
const EDITION_SUFFIXES = [
	'Pro', 'Plus', 'Ultra', 'Max', 'Elite', 'Premium', 'Lite', 'Mini', 'Eco',
	'Smart', 'Advanced', 'Classic', 'Essential', 'Signature', 'Limited Edition',
	'Studio', 'Sport', 'Active', 'Air', 'Flex', 'Boost', 'Go', 'One', 'X',
	'SE', 'FE', 'Neo', 'Core', 'Edge', 'Ace',
];

// ── Pre-build flat combo list (populated in main after DB entities are created) ─
interface Combo {
	name: string;       // full display name (brand + type)
	brand: string;
	type: string;
	vendorId: string;
	categoryId: string;
	unit: string;
	hasVariants: boolean;
}

function buildCombos(
	vendorMap: Map<string, string>,
	categoryMap: Map<string, string>,
): Combo[] {
	const combos: Combo[] = [];
	for (const tmpl of PRODUCT_TEMPLATES) {
		const vendorId   = vendorMap.get(tmpl.vendorName);
		const categoryId = categoryMap.get(tmpl.categorySlug);
		if (!vendorId)   throw new Error(`Vendor not found in map: ${tmpl.vendorName}`);
		if (!categoryId) throw new Error(`Category not found in map: ${tmpl.categorySlug}`);
		for (const brand of tmpl.brands) {
			for (const type of tmpl.types) {
				combos.push({
					name: `${brand} ${type}`,
					brand,
					type,
					vendorId,
					categoryId,
					unit: tmpl.unit,
					hasVariants: tmpl.hasVariants,
				});
			}
		}
	}
	return combos;
}

function getSkuName(combo: Combo, edition: number): string {
	if (edition === 0) return combo.name;
	if (edition <= EDITION_SUFFIXES.length) {
		return `${combo.name} ${EDITION_SUFFIXES[edition - 1]}`;
	}
	const seriesNum = edition - EDITION_SUFFIXES.length + 1;
	return `${combo.name} Series ${seriesNum}`;
}

async function main() {
	console.log('🚀 Starting stress test seed (200,000 realistic products)...');

	// ── Vendors ──────────────────────────────────────────────────────────────
	const vendorMap = new Map<string, string>(); // name → id
	for (const vd of VENDOR_DATA) {
		let vendor = await prisma.vendor.findFirst({ where: { name: vd.name } });
		if (!vendor) {
			vendor = await prisma.vendor.create({ data: { name: vd.name, contactEmail: vd.contactEmail, type: vd.type } });
		}
		vendorMap.set(vd.name, vendor.id);
	}
	console.log(`✅ Ensured ${VENDOR_DATA.length} vendors`);

	// ── Categories ───────────────────────────────────────────────────────────
	const categoryMap = new Map<string, string>(); // slug → id
	for (const cd of CATEGORY_DATA) {
		let category = await prisma.category.findUnique({ where: { slug: cd.slug } });
		if (!category) {
			category = await prisma.category.create({ data: { name: cd.name, slug: cd.slug, description: cd.description } });
		}
		categoryMap.set(cd.slug, category.id);
	}
	console.log(`✅ Ensured ${CATEGORY_DATA.length} categories`);

	// ── Attributes: Colour + Size ─────────────────────────────────────────────
	let colourAttr = await prisma.attribute.findUnique({ where: { name: 'Colour' } });
	if (!colourAttr) {
		colourAttr = await prisma.attribute.create({ data: { name: 'Colour', type: 'color', sortOrder: 0 } });
	}
	for (let i = 0; i < VARIANT_COLOURS.length; i++) {
		const colour = VARIANT_COLOURS[i];
		const existing = await prisma.attributeValue.findUnique({
			where: { attributeId_representedValue: { attributeId: colourAttr.id, representedValue: colour } },
		});
		if (!existing) {
			await prisma.attributeValue.create({
				data: { attributeId: colourAttr.id, displayName: colour, representedValue: colour, sortOrder: i },
			});
		}
	}

	let sizeAttr = await prisma.attribute.findUnique({ where: { name: 'Size' } });
	if (!sizeAttr) {
		sizeAttr = await prisma.attribute.create({ data: { name: 'Size', type: 'dropdown', sortOrder: 1 } });
	}
	for (let i = 0; i < VARIANT_SIZES.length; i++) {
		const size = VARIANT_SIZES[i];
		const existing = await prisma.attributeValue.findUnique({
			where: { attributeId_representedValue: { attributeId: sizeAttr.id, representedValue: size } },
		});
		if (!existing) {
			await prisma.attributeValue.create({
				data: { attributeId: sizeAttr.id, displayName: size, representedValue: size, sortOrder: i },
			});
		}
	}
	console.log('✅ Ensured Colour and Size attributes');

	// ── Branch ───────────────────────────────────────────────────────────────
	let branch = await prisma.branch.findFirst({ where: { code: 'STRESS-01' } });
	if (!branch) {
		branch = await prisma.branch.create({
			data: { name: 'Stress Test Branch', code: 'STRESS-01', address: '1 Warehouse Road', isDefault: false },
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
				data: { branchId: branch.id, name: `Warehouse Floor ${f}`, code },
			});
		}
		floorIds.push(floor.id);
	}
	console.log(`✅ Ensured ${FLOORS} floors`);

	// ── Racks ─────────────────────────────────────────────────────────────────
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
			const code = `ST-F${floorIndex + 1}-R${String(rackNum).padStart(2, '0')}-S${String(s).padStart(2, '0')}`;
			let shelf = await prisma.shelf.findFirst({ where: { rackId: rackIds[ri], code } });
			if (!shelf) {
				shelf = await prisma.shelf.create({
					data: {
						floorId: floorIds[floorIndex],
						rackId:  rackIds[ri],
						name:    `Floor ${floorIndex + 1} Rack ${rackNum} Shelf ${s}`,
						code,
						height: 2.4,
						width:  1.5,
						length: 0.8,
					},
				});
			}
			shelfIds.push(shelf.id);
		}
	}
	console.log(`✅ Ensured ${shelfIds.length} shelves (${SHELVES_PER_RACK} per rack)`);

	// ── Build product combo list ──────────────────────────────────────────────
	const combos = buildCombos(vendorMap, categoryMap);
	console.log(`📋 Built ${combos.length} unique brand×product-type combinations`);

	// ── SKUs + Variants + Inventory Records ───────────────────────────────────
	const existingCount = await prisma.sKU.count({ where: { skuCode: { startsWith: 'PROD-' } } });
	const toCreate = TOTAL_SKUS - existingCount;

	if (toCreate <= 0) {
		console.log(`⏭️  ${existingCount} product SKUs already exist, skipping SKU creation`);
	} else {
		const variantThreshold = Math.floor(TOTAL_SKUS * VARIANT_RATIO); // first 80,000 get variants
		console.log(`📦 Creating ${toCreate} SKUs in batches of ${BATCH_SIZE}...`);

		let created = 0;
		while (created < toCreate) {
			const batchCount  = Math.min(BATCH_SIZE, toCreate - created);
			const startIndex  = existingCount + created; // 0-based global index of first item in batch

			// Build per-SKU metadata for this batch
			const batchMeta = Array.from({ length: batchCount }, (_, i) => {
				const globalIndex = startIndex + i;
				const comboIdx    = globalIndex % combos.length;
				const edition     = Math.floor(globalIndex / combos.length);
				const combo       = combos[comboIdx];
				return {
					skuCode:      `PROD-${String(globalIndex + 1).padStart(6, '0')}`,
					name:         getSkuName(combo, edition),
					vendorId:     combo.vendorId,
					categoryId:   combo.categoryId,
					unitOfMeasure: combo.unit,
					hasVariants:  globalIndex < variantThreshold,
				};
			});

			// Insert SKUs (hasVariants is not a DB column — omit it)
			const skuBatch = batchMeta.map(({ hasVariants: _, ...skuData }) => skuData);
			await prisma.sKU.createMany({ data: skuBatch, skipDuplicates: true });

			// Fetch the DB rows we just created
			const skus: Array<{ id: string; skuCode: string; name: string }> = await prisma.sKU.findMany({
				where:  { skuCode: { in: skuBatch.map(s => s.skuCode) } },
				select: { id: true, skuCode: true, name: true },
			});
			const skuByCode = new Map(skus.map(s => [s.skuCode, s]));

			// ── Variants ───────────────────────────────────────────────────
			const variantRows: Array<{ skuId: string; variantCode: string; name: string }> = [];
			for (const meta of batchMeta) {
				if (!meta.hasVariants) continue;
				const sku = skuByCode.get(meta.skuCode);
				if (!sku) continue;
				for (const colour of VARIANT_COLOURS) {
					for (const size of VARIANT_SIZES) {
						const tag = `${colour.replace(/\s/g, '')}-${size}`;
						variantRows.push({
							skuId:       sku.id,
							variantCode: `${meta.skuCode}-${tag}`,
							name:        `${sku.name} - ${colour} / ${size}`,
						});
					}
				}
			}
			if (variantRows.length > 0) {
				await prisma.sKUVariant.createMany({ data: variantRows, skipDuplicates: true });
			}

			// ── Inventory records (one per SKU) ────────────────────────────
			const inventoryBatch = skus.map((sku, idx) => {
				const globalIdx = startIndex + idx;
				const shelfIdx  = globalIdx % shelfIds.length;
				const floorIdx  = Math.min(
					Math.floor(shelfIdx / (RACKS_PER_FLOOR * SHELVES_PER_RACK)),
					floorIds.length - 1,
				);
				return {
					skuId:    sku.id,
					floorId:  floorIds[floorIdx],
					shelfId:  shelfIds[shelfIdx],
					quantity: Math.floor(Math.random() * 200) + 1,
					state:    INVENTORY_STATES[globalIdx % INVENTORY_STATES.length],
				};
			});
			await prisma.inventoryRecord.createMany({ data: inventoryBatch, skipDuplicates: true });

			created += batchCount;
			process.stdout.write(
				`\r  Progress: ${existingCount + created}/${TOTAL_SKUS} SKUs  ` +
				`(${variantRows.length} variants this batch)`,
			);
		}
		console.log('\n✅ SKUs, variants, and inventory records created');
	}

	const totalVariantSkus = Math.floor(TOTAL_SKUS * VARIANT_RATIO);
	const totalVariants    = totalVariantSkus * VARIANT_COLOURS.length * VARIANT_SIZES.length;

	console.log('\n🎉 Stress test seed complete!');
	console.log(`   Branch   : ${branch.name} (${branch.code})`);
	console.log(`   Vendors  : ${VENDOR_DATA.length}`);
	console.log(`   Categories: ${CATEGORY_DATA.length}`);
	console.log(`   Floors   : ${FLOORS}`);
	console.log(`   Racks    : ${rackIds.length} (${RACKS_PER_FLOOR}/floor)`);
	console.log(`   Shelves  : ${shelfIds.length} (${SHELVES_PER_RACK}/rack)`);
	console.log(`   SKUs     : ${TOTAL_SKUS.toLocaleString()}`);
	console.log(`   Variants : ~${totalVariants.toLocaleString()} (${(VARIANT_RATIO * 100).toFixed(0)}% of SKUs × ${VARIANT_COLOURS.length} colours × ${VARIANT_SIZES.length} sizes)`);
	console.log(`   Inv. Records: ${TOTAL_SKUS.toLocaleString()}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
