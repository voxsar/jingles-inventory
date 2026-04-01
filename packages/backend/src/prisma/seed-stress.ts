/**
 * Stress Test Seed
 *
 * Populates the database with:
 *   - 62 realistic vendors across all industries
 *   - 10 top-level categories (L1), each with ~3-4 subcategories (L2),
 *     each with ~3 sub-subcategories (L3) — ~150 categories total
 *   - Colour (6 values) and Size (6 values) attributes
 *   - 1 branch (Stress Test Branch)
 *   - 5 floors, 10 racks per floor, 15 shelves per rack = 750 shelves total
 *   - 200,000 SKUs with realistic brand × product-type names
 *   - 40% of SKUs have variants, spread across three types:
 *       • colour-only   – 6 colour variants per SKU
 *       • size-only     – 6 size variants per SKU
 *       • colour + size – multi-attribute: 3 colours × 3 sizes = 9 variants per SKU
 *   - SKUVariantValue rows linking every variant to its attribute value(s)
 *   - 200,000 inventory records distributed across shelves
 *
 * Run with:
 *   npm run prisma:seed-stress   (from packages/backend)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Warehouse constants ───────────────────────────────────────────────────────
const FLOORS = 5;
const RACKS_PER_FLOOR = 10;
const SHELVES_PER_RACK = 15;   // 750 shelves total

// ── SKU constants ─────────────────────────────────────────────────────────────
const TOTAL_SKUS = 200_000;
const BATCH_SIZE = 500;

// ── Inventory states ──────────────────────────────────────────────────────────
const INVENTORY_STATES = [
	'ShelfReady', 'Inspected', 'UnopenedBox', 'Uninspected', 'Reserved',
	'ShelfReady', 'ShelfReady', 'Inspected',
];

// ── Variant attribute values ──────────────────────────────────────────────────
// Colour-only and multi-attr (colour+size) use all 6 colours for single-attr,
// but only the first 3 for the colour dimension of multi-attr combos.
const ALL_COLOURS = ['Black', 'White', 'Navy Blue', 'Forest Green', 'Burgundy', 'Charcoal Grey'];
const MULTI_COLOURS = ['Black', 'Navy Blue', 'Forest Green'];   // 3 colours for colour×size
const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const MULTI_SIZES = ['S', 'M', 'L'];                           // 3 sizes for colour×size

// ── Edition suffixes ──────────────────────────────────────────────────────────
const EDITION_SUFFIXES = [
	'Pro', 'Plus', 'Ultra', 'Max', 'Elite', 'Premium', 'Lite', 'Mini', 'Eco',
	'Smart', 'Advanced', 'Classic', 'Essential', 'Signature', 'Limited Edition',
	'Studio', 'Sport', 'Active', 'Air', 'Flex', 'Boost', 'Go', 'One', 'X',
	'SE', 'FE', 'Neo', 'Core', 'Edge', 'Ace',
];

// ── Tag definitions ──────────────────────────────────────────────────────────
const TAG_DATA: Array<{ name: string; color: string }> = [
	{ name: 'New Arrival', color: '#22c55e' },
	{ name: 'Best Seller', color: '#f59e0b' },
	{ name: 'Clearance', color: '#ef4444' },
	{ name: 'Premium', color: '#8b5cf6' },
	{ name: 'Eco-Friendly', color: '#10b981' },
	{ name: 'Limited Stock', color: '#ec4899' },
	{ name: 'Bulk Only', color: '#6366f1' },
	{ name: 'Fragile', color: '#f97316' },
	{ name: 'Heavy Item', color: '#78716c' },
	{ name: 'Perishable', color: '#dc2626' },
	{ name: 'Seasonal', color: '#0ea5e9' },
	{ name: 'Imported', color: '#64748b' },
	{ name: 'Warranty Included', color: '#14b8a6' },
	{ name: 'Oversized', color: '#a855f7' },
	{ name: 'High Demand', color: '#eab308' },
	{ name: 'Discontinued', color: '#9ca3af' },
	{ name: 'Pre-Order', color: '#3b82f6' },
	{ name: 'Bundle Deal', color: '#d946ef' },
	{ name: 'Staff Pick', color: '#06b6d4' },
	{ name: 'Top Rated', color: '#84cc16' },
];

// ── Unit conversion rules ────────────────────────────────────────────────────
const UNIT_CONVERSIONS: Record<string, object> = {
	unit: { unitToBox: 6 },
	piece: { pcToBox: 12 },
	pc: { pcToBox: 12 },
	pair: { pairToBox: 6 },
	pack: { packToCase: 4 },
	box: { boxToPallet: 24 },
	set: { setToCase: 4 },
	bottle: { bottleToCase: 12 },
	jar: { jarToCase: 12 },
	bag: { bagToCase: 6 },
	kg: { kgToSack: 25 },
	litre: { litreToCase: 6 },
	kit: { kitToCase: 4 },
};

// ── Variant types ─────────────────────────────────────────────────────────────
type VariantType = 'none' | 'colour' | 'size' | 'colour-size';

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DIMENSIONS  (L3 category slug → realistic packaged box size in cm)
// Dimensions represent the outer carton/packaging, not the raw product.
// These ensure products fit on realistically-sized warehouse shelves.
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_DIMENSIONS: Record<string, { lengthCm: number; widthCm: number; heightCm: number; isFragile: boolean }> = {
	// Electronics ─────────────────────────────────────────────────────────────
	'smartphones': { lengthCm: 18, widthCm: 10, heightCm: 3, isFragile: true },
	'tablets': { lengthCm: 28, widthCm: 20, heightCm: 3, isFragile: true },
	'phone-accessories': { lengthCm: 16, widthCm: 12, heightCm: 4, isFragile: false },
	'laptops': { lengthCm: 40, widthCm: 28, heightCm: 5, isFragile: true },
	'desktops': { lengthCm: 48, widthCm: 42, heightCm: 22, isFragile: true },
	'computer-peripherals': { lengthCm: 46, widthCm: 22, heightCm: 8, isFragile: false },
	'headphones-earbuds': { lengthCm: 24, widthCm: 20, heightCm: 12, isFragile: true },
	'speakers-soundbars': { lengthCm: 32, widthCm: 14, heightCm: 14, isFragile: true },
	'tvs-displays': { lengthCm: 140, widthCm: 85, heightCm: 12, isFragile: true },
	'digital-cameras': { lengthCm: 16, widthCm: 14, heightCm: 10, isFragile: true },
	'action-cameras': { lengthCm: 10, widthCm: 8, heightCm: 6, isFragile: true },
	'drones': { lengthCm: 34, widthCm: 32, heightCm: 12, isFragile: true },
	// Clothing ────────────────────────────────────────────────────────────────
	'mens-tops': { lengthCm: 32, widthCm: 25, heightCm: 4, isFragile: false },
	'mens-bottoms': { lengthCm: 36, widthCm: 28, heightCm: 5, isFragile: false },
	'mens-outerwear': { lengthCm: 46, widthCm: 36, heightCm: 7, isFragile: false },
	'womens-tops': { lengthCm: 30, widthCm: 24, heightCm: 4, isFragile: false },
	'womens-bottoms': { lengthCm: 34, widthCm: 26, heightCm: 5, isFragile: false },
	'womens-dresses': { lengthCm: 40, widthCm: 32, heightCm: 5, isFragile: false },
	'athletic-footwear': { lengthCm: 34, widthCm: 22, heightCm: 14, isFragile: false },
	'casual-footwear': { lengthCm: 32, widthCm: 20, heightCm: 13, isFragile: false },
	'boots-hiking': { lengthCm: 36, widthCm: 24, heightCm: 22, isFragile: false },
	'bags-backpacks': { lengthCm: 46, widthCm: 36, heightCm: 22, isFragile: false },
	'hats-caps': { lengthCm: 28, widthCm: 24, heightCm: 14, isFragile: false },
	'belts-wallets': { lengthCm: 14, widthCm: 11, heightCm: 3, isFragile: false },
	// Food & Beverages ────────────────────────────────────────────────────────
	'hot-drinks': { lengthCm: 16, widthCm: 11, heightCm: 11, isFragile: false },
	'cold-drinks': { lengthCm: 11, widthCm: 11, heightCm: 30, isFragile: false },
	'juices-smoothies': { lengthCm: 9, widthCm: 9, heightCm: 28, isFragile: false },
	'snack-bars': { lengthCm: 23, widthCm: 16, heightCm: 9, isFragile: false },
	'chips-crisps': { lengthCm: 28, widthCm: 18, heightCm: 8, isFragile: false },
	'confectionery': { lengthCm: 22, widthCm: 13, heightCm: 6, isFragile: false },
	'grains-pasta': { lengthCm: 26, widthCm: 9, heightCm: 32, isFragile: false },
	'oils-condiments': { lengthCm: 9, widthCm: 9, heightCm: 30, isFragile: false },
	'spreads-preserves': { lengthCm: 11, widthCm: 11, heightCm: 13, isFragile: false },
	// Home & Kitchen ──────────────────────────────────────────────────────────
	'cooking-appliances': { lengthCm: 40, widthCm: 38, heightCm: 40, isFragile: false },
	'coffee-tea-makers': { lengthCm: 32, widthCm: 28, heightCm: 40, isFragile: true },
	'food-preparation': { lengthCm: 26, widthCm: 26, heightCm: 42, isFragile: false },
	'pots-pans': { lengthCm: 52, widthCm: 32, heightCm: 18, isFragile: false },
	'baking-acc': { lengthCm: 46, widthCm: 34, heightCm: 6, isFragile: false },
	'kitchen-tools': { lengthCm: 36, widthCm: 26, heightCm: 9, isFragile: false },
	'storage-boxes': { lengthCm: 42, widthCm: 32, heightCm: 28, isFragile: false },
	'shelving-racks': { lengthCm: 82, widthCm: 42, heightCm: 20, isFragile: false },
	'desk-organisers': { lengthCm: 30, widthCm: 20, heightCm: 14, isFragile: false },
	// Sports & Outdoors ───────────────────────────────────────────────────────
	'strength-training': { lengthCm: 46, widthCm: 26, heightCm: 22, isFragile: false },
	'cardio-equipment': { lengthCm: 175, widthCm: 60, heightCm: 45, isFragile: false },
	'yoga-pilates': { lengthCm: 65, widthCm: 18, heightCm: 18, isFragile: false },
	'hiking-camping': { lengthCm: 62, widthCm: 38, heightCm: 28, isFragile: false },
	'cycling': { lengthCm: 34, widthCm: 24, heightCm: 14, isFragile: false },
	'water-sports': { lengthCm: 26, widthCm: 22, heightCm: 12, isFragile: false },
	'ball-sports': { lengthCm: 30, widthCm: 30, heightCm: 30, isFragile: false },
	'racket-sports': { lengthCm: 72, widthCm: 32, heightCm: 6, isFragile: false },
	'golf': { lengthCm: 125, widthCm: 12, heightCm: 12, isFragile: false },
	// Beauty & Personal Care ───────────────────────────────────────────────────
	'face-care': { lengthCm: 13, widthCm: 9, heightCm: 9, isFragile: false },
	'body-care': { lengthCm: 9, widthCm: 9, heightCm: 24, isFragile: false },
	'sun-care': { lengthCm: 9, widthCm: 7, heightCm: 22, isFragile: false },
	'shampoo-conditioner': { lengthCm: 9, widthCm: 9, heightCm: 26, isFragile: false },
	'styling-products': { lengthCm: 9, widthCm: 7, heightCm: 20, isFragile: false },
	'hair-treatments': { lengthCm: 11, widthCm: 9, heightCm: 18, isFragile: false },
	'face-makeup': { lengthCm: 13, widthCm: 9, heightCm: 5, isFragile: false },
	'eye-makeup': { lengthCm: 15, widthCm: 9, heightCm: 6, isFragile: false },
	'lip-products': { lengthCm: 5, widthCm: 5, heightCm: 16, isFragile: false },
	// Toys & Games ────────────────────────────────────────────────────────────
	'building-blocks': { lengthCm: 42, widthCm: 32, heightCm: 22, isFragile: false },
	'model-kits': { lengthCm: 36, widthCm: 26, heightCm: 9, isFragile: false },
	'stem-toys': { lengthCm: 32, widthCm: 26, heightCm: 16, isFragile: false },
	'ride-on-toys': { lengthCm: 85, widthCm: 45, heightCm: 65, isFragile: false },
	'sports-toys': { lengthCm: 42, widthCm: 32, heightCm: 16, isFragile: false },
	'garden-sand-play': { lengthCm: 58, widthCm: 44, heightCm: 24, isFragile: false },
	'board-games': { lengthCm: 42, widthCm: 32, heightCm: 9, isFragile: false },
	'card-games': { lengthCm: 16, widthCm: 11, heightCm: 5, isFragile: false },
	'jigsaw-puzzles': { lengthCm: 37, widthCm: 27, heightCm: 8, isFragile: false },
	// Automotive ──────────────────────────────────────────────────────────────
	'engine-oil': { lengthCm: 16, widthCm: 11, heightCm: 26, isFragile: false },
	'brakes-tyres': { lengthCm: 36, widthCm: 36, heightCm: 6, isFragile: false },
	'car-care': { lengthCm: 13, widthCm: 9, heightCm: 22, isFragile: false },
	'interior-accessories': { lengthCm: 52, widthCm: 42, heightCm: 6, isFragile: false },
	'exterior-accessories': { lengthCm: 62, widthCm: 48, heightCm: 12, isFragile: false },
	'car-electronics': { lengthCm: 20, widthCm: 14, heightCm: 10, isFragile: false },
	// Office & Stationery ─────────────────────────────────────────────────────
	'writing-instruments': { lengthCm: 22, widthCm: 14, heightCm: 6, isFragile: false },
	'paper-products': { lengthCm: 23, widthCm: 17, heightCm: 4, isFragile: false },
	'desk-accessories': { lengthCm: 26, widthCm: 22, heightCm: 12, isFragile: false },
	'printers-scanners': { lengthCm: 50, widthCm: 40, heightCm: 30, isFragile: true },
	'storage-devices': { lengthCm: 13, widthCm: 9, heightCm: 3, isFragile: false },
	'office-electronics': { lengthCm: 22, widthCm: 16, heightCm: 6, isFragile: false },
	// Health & Wellness ───────────────────────────────────────────────────────
	'vitamins-minerals': { lengthCm: 9, widthCm: 9, heightCm: 14, isFragile: false },
	'protein-supplements': { lengthCm: 19, widthCm: 19, heightCm: 30, isFragile: false },
	'herbal-supplements': { lengthCm: 8, widthCm: 8, heightCm: 16, isFragile: false },
	'monitoring-devices': { lengthCm: 15, widthCm: 12, heightCm: 10, isFragile: false },
	'first-aid': { lengthCm: 26, widthCm: 20, heightCm: 12, isFragile: false },
	'mobility-aids': { lengthCm: 110, widthCm: 14, heightCm: 14, isFragile: false },
};
const DEFAULT_DIMENSIONS = { lengthCm: 30, widthCm: 20, heightCm: 15, isFragile: false };

// ─────────────────────────────────────────────────────────────────────────────
// VENDORS  (60 vendors across all industries)
// ─────────────────────────────────────────────────────────────────────────────
const VENDOR_DATA: Array<{ name: string; contactEmail: string; type: string }> = [
	// Electronics – Hardware
	{ name: 'Samsung Electronics', contactEmail: 'orders@samsung-wholesale.com', type: 'Supplier' },
	{ name: 'Apple Inc.', contactEmail: 'supply@apple-trade.com', type: 'Supplier' },
	{ name: 'Sony Corporation', contactEmail: 'trade@sony-supply.com', type: 'Supplier' },
	{ name: 'LG Electronics', contactEmail: 'orders@lg-wholesale.com', type: 'Supplier' },
	{ name: 'Philips Electronics', contactEmail: 'supply@philips-trade.com', type: 'Supplier' },
	{ name: 'Panasonic Corporation', contactEmail: 'orders@panasonic-supply.com', type: 'Supplier' },
	{ name: 'Lenovo Group', contactEmail: 'trade@lenovo-wholesale.com', type: 'Supplier' },
	{ name: 'HP Inc.', contactEmail: 'supply@hp-trade.com', type: 'Supplier' },
	{ name: 'Dell Technologies', contactEmail: 'orders@dell-wholesale.com', type: 'Supplier' },
	{ name: 'Asus Technology', contactEmail: 'trade@asus-supply.com', type: 'Supplier' },
	{ name: 'Acer Inc.', contactEmail: 'orders@acer-wholesale.com', type: 'Supplier' },
	{ name: 'Logitech International', contactEmail: 'supply@logitech-trade.com', type: 'Supplier' },
	{ name: 'Razer Inc.', contactEmail: 'orders@razer-wholesale.com', type: 'Supplier' },
	{ name: 'MSI Gaming', contactEmail: 'trade@msi-supply.com', type: 'Supplier' },
	{ name: 'TCL Technology', contactEmail: 'orders@tcl-wholesale.com', type: 'Supplier' },
	{ name: 'Casio', contactEmail: 'orders@casio-wholesale.com', type: 'Supplier' },
	// Electronics – Audio & Mobile
	{ name: 'JBL (Harman International)', contactEmail: 'supply@jbl-trade.com', type: 'Supplier' },
	{ name: 'Bose Corporation', contactEmail: 'orders@bose-wholesale.com', type: 'Supplier' },
	{ name: 'Sennheiser Electronic', contactEmail: 'trade@sennheiser-supply.com', type: 'Supplier' },
	{ name: 'Jabra (GN Audio)', contactEmail: 'orders@jabra-wholesale.com', type: 'Supplier' },
	{ name: 'Anker Innovations', contactEmail: 'supply@anker-trade.com', type: 'Supplier' },
	{ name: 'Xiaomi Corporation', contactEmail: 'orders@xiaomi-wholesale.com', type: 'Supplier' },
	{ name: 'OnePlus Technology', contactEmail: 'trade@oneplus-supply.com', type: 'Supplier' },
	{ name: 'Huawei Technologies', contactEmail: 'orders@huawei-wholesale.com', type: 'Supplier' },
	// Fashion & Apparel
	{ name: 'Nike Inc.', contactEmail: 'orders@nike-wholesale.com', type: 'Vendor' },
	{ name: 'Adidas AG', contactEmail: 'trade@adidas-supply.com', type: 'Vendor' },
	{ name: 'Puma SE', contactEmail: 'orders@puma-wholesale.com', type: 'Vendor' },
	{ name: 'Reebok International', contactEmail: 'supply@reebok-trade.com', type: 'Vendor' },
	{ name: "Levi Strauss & Co.", contactEmail: 'orders@levis-wholesale.com', type: 'Vendor' },
	{ name: 'H&M Hennes & Mauritz', contactEmail: 'trade@hm-supply.com', type: 'Vendor' },
	{ name: 'Zara (Inditex)', contactEmail: 'orders@zara-wholesale.com', type: 'Vendor' },
	{ name: 'Uniqlo (Fast Retailing)', contactEmail: 'supply@uniqlo-trade.com', type: 'Vendor' },
	{ name: 'Under Armour Inc.', contactEmail: 'orders@underarmour-wholesale.com', type: 'Vendor' },
	{ name: 'New Balance Athletics', contactEmail: 'trade@newbalance-supply.com', type: 'Vendor' },
	{ name: 'The North Face', contactEmail: 'orders@northface-wholesale.com', type: 'Vendor' },
	{ name: 'Columbia Sportswear', contactEmail: 'supply@columbia-trade.com', type: 'Vendor' },
	// Food & Beverages
	{ name: "Nestlé S.A.", contactEmail: 'orders@nestle-trade.com', type: 'Supplier' },
	{ name: 'Kellogg Company', contactEmail: 'supply@kellogg-wholesale.com', type: 'Supplier' },
	{ name: 'PepsiCo Inc.', contactEmail: 'orders@pepsi-trade.com', type: 'Supplier' },
	{ name: 'The Coca-Cola Company', contactEmail: 'trade@cocacola-supply.com', type: 'Supplier' },
	{ name: 'Kraft Heinz Company', contactEmail: 'orders@kraftheinz-wholesale.com', type: 'Supplier' },
	{ name: 'General Mills Inc.', contactEmail: 'supply@generalmills-trade.com', type: 'Supplier' },
	{ name: 'Danone S.A.', contactEmail: 'orders@danone-wholesale.com', type: 'Supplier' },
	{ name: 'Mondelez International', contactEmail: 'trade@mondelez-supply.com', type: 'Supplier' },
	// Home & Kitchen
	{ name: 'KitchenAid (Whirlpool)', contactEmail: 'orders@kitchenaid-wholesale.com', type: 'Supplier' },
	{ name: 'Cuisinart (Conair)', contactEmail: 'supply@cuisinart-trade.com', type: 'Supplier' },
	{ name: 'Ninja (SharkNinja)', contactEmail: 'orders@ninja-wholesale.com', type: 'Supplier' },
	{ name: 'Breville Group', contactEmail: 'trade@breville-supply.com', type: 'Supplier' },
	{ name: "De'Longhi Group", contactEmail: 'orders@delonghi-wholesale.com', type: 'Supplier' },
	{ name: 'Dyson Ltd.', contactEmail: 'supply@dyson-trade.com', type: 'Supplier' },
	// Beauty & Personal Care
	{ name: "L'Oréal S.A.", contactEmail: 'orders@loreal-wholesale.com', type: 'Supplier' },
	{ name: 'Procter & Gamble', contactEmail: 'supply@pg-wholesale.com', type: 'Supplier' },
	{ name: 'Unilever PLC', contactEmail: 'orders@unilever-trade.com', type: 'Supplier' },
	{ name: 'Colgate-Palmolive', contactEmail: 'trade@colgate-supply.com', type: 'Supplier' },
	{ name: 'Beiersdorf AG', contactEmail: 'orders@beiersdorf-wholesale.com', type: 'Supplier' },
	// Sports & Outdoors
	{ name: 'Wilson Sporting Goods', contactEmail: 'supply@wilson-trade.com', type: 'Supplier' },
	{ name: 'Callaway Golf', contactEmail: 'orders@callaway-wholesale.com', type: 'Supplier' },
	{ name: 'Garmin Ltd.', contactEmail: 'trade@garmin-supply.com', type: 'Supplier' },
	{ name: 'Speedo International', contactEmail: 'orders@speedo-wholesale.com', type: 'Supplier' },
	// Toys & Games
	{ name: 'LEGO Group', contactEmail: 'orders@lego-wholesale.com', type: 'Supplier' },
	{ name: 'Hasbro Inc.', contactEmail: 'supply@hasbro-trade.com', type: 'Supplier' },
	{ name: 'Mattel Inc.', contactEmail: 'orders@mattel-wholesale.com', type: 'Supplier' },
	{ name: 'Spin Master Corp.', contactEmail: 'trade@spinmaster-supply.com', type: 'Supplier' },
	// Automotive / Office / Health
	{ name: 'Bosch Automotive', contactEmail: 'orders@bosch-wholesale.com', type: 'Supplier' },
	{ name: '3M Company', contactEmail: 'supply@3m-trade.com', type: 'Supplier' },
	{ name: 'Michelin Group', contactEmail: 'orders@michelin-wholesale.com', type: 'Supplier' },
	{ name: 'Omron Healthcare', contactEmail: 'trade@omron-supply.com', type: 'Supplier' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY HIERARCHY  (L1 → L2 → L3)
// ─────────────────────────────────────────────────────────────────────────────
interface CategoryNode {
	name: string;
	slug: string;
	description?: string;
	children?: CategoryNode[];
}

const CATEGORY_TREE: CategoryNode[] = [
	{
		name: 'Electronics', slug: 'electronics', description: 'Consumer electronics and gadgets',
		children: [
			{
				name: 'Smartphones & Tablets', slug: 'smartphones-tablets', description: 'Mobile devices',
				children: [
					{ name: 'Smartphones', slug: 'smartphones', description: 'Latest smartphones' },
					{ name: 'Tablets', slug: 'tablets', description: 'Tablet computers' },
					{ name: 'Phone Accessories', slug: 'phone-accessories', description: 'Cases, chargers and more' },
				],
			},
			{
				name: 'Computers & Laptops', slug: 'computers-laptops', description: 'Personal computers',
				children: [
					{ name: 'Laptops', slug: 'laptops', description: 'Portable computers' },
					{ name: 'Desktops', slug: 'desktops', description: 'Desktop computers' },
					{ name: 'Computer Peripherals', slug: 'computer-peripherals', description: 'Keyboards, mice and more' },
				],
			},
			{
				name: 'Audio & Video', slug: 'audio-video', description: 'Sound and visual equipment',
				children: [
					{ name: 'Headphones & Earbuds', slug: 'headphones-earbuds', description: 'Personal audio' },
					{ name: 'Speakers & Soundbars', slug: 'speakers-soundbars', description: 'Room audio' },
					{ name: 'TVs & Displays', slug: 'tvs-displays', description: 'Screens and televisions' },
				],
			},
			{
				name: 'Cameras & Drones', slug: 'cameras-drones', description: 'Photography and aerial equipment',
				children: [
					{ name: 'Digital Cameras', slug: 'digital-cameras', description: 'DSLR and mirrorless cameras' },
					{ name: 'Action Cameras', slug: 'action-cameras', description: 'Rugged action cameras' },
					{ name: 'Drones', slug: 'drones', description: 'Consumer and pro drones' },
				],
			},
		],
	},
	{
		name: 'Clothing & Apparel', slug: 'clothing-apparel', description: 'Fashion and clothing items',
		children: [
			{
				name: "Men's Clothing", slug: 'mens-clothing', description: "Clothing for men",
				children: [
					{ name: "Men's Tops", slug: 'mens-tops', description: 'T-shirts, shirts and tops' },
					{ name: "Men's Bottoms", slug: 'mens-bottoms', description: 'Jeans, trousers and shorts' },
					{ name: "Men's Outerwear", slug: 'mens-outerwear', description: 'Jackets and coats' },
				],
			},
			{
				name: "Women's Clothing", slug: 'womens-clothing', description: "Clothing for women",
				children: [
					{ name: "Women's Tops", slug: 'womens-tops', description: 'Blouses, shirts and tops' },
					{ name: "Women's Bottoms", slug: 'womens-bottoms', description: 'Jeans, trousers and skirts' },
					{ name: "Women's Dresses", slug: 'womens-dresses', description: 'Dresses and rompers' },
				],
			},
			{
				name: 'Footwear', slug: 'footwear', description: 'Shoes and boots',
				children: [
					{ name: 'Athletic Footwear', slug: 'athletic-footwear', description: 'Running and training shoes' },
					{ name: 'Casual Footwear', slug: 'casual-footwear', description: 'Sneakers and everyday shoes' },
					{ name: 'Boots & Hiking Shoes', slug: 'boots-hiking', description: 'Boots and hiking footwear' },
				],
			},
			{
				name: 'Fashion Accessories', slug: 'fashion-accessories', description: 'Bags, hats and accessories',
				children: [
					{ name: 'Bags & Backpacks', slug: 'bags-backpacks', description: 'Handbags, backpacks and luggage' },
					{ name: 'Hats & Caps', slug: 'hats-caps', description: 'Headwear' },
					{ name: 'Belts & Wallets', slug: 'belts-wallets', description: 'Leather goods and accessories' },
				],
			},
		],
	},
	{
		name: 'Food & Beverages', slug: 'food-beverages', description: 'Packaged food and drinks',
		children: [
			{
				name: 'Beverages', slug: 'beverages', description: 'All drinks',
				children: [
					{ name: 'Hot Drinks', slug: 'hot-drinks', description: 'Coffee and tea' },
					{ name: 'Cold Drinks', slug: 'cold-drinks', description: 'Soft drinks and water' },
					{ name: 'Juices & Smoothies', slug: 'juices-smoothies', description: 'Fruit and vegetable juices' },
				],
			},
			{
				name: 'Snacks', slug: 'snacks', description: 'Snack foods and confectionery',
				children: [
					{ name: 'Snack Bars', slug: 'snack-bars', description: 'Granola and protein bars' },
					{ name: 'Chips & Crisps', slug: 'chips-crisps', description: 'Savoury snacks' },
					{ name: 'Confectionery', slug: 'confectionery', description: 'Chocolate and candy' },
				],
			},
			{
				name: 'Pantry Staples', slug: 'pantry-staples', description: 'Everyday cooking essentials',
				children: [
					{ name: 'Grains & Pasta', slug: 'grains-pasta', description: 'Rice, pasta and grains' },
					{ name: 'Oils & Condiments', slug: 'oils-condiments', description: 'Cooking oils and sauces' },
					{ name: 'Spreads & Preserves', slug: 'spreads-preserves', description: 'Jams, butters and honey' },
				],
			},
		],
	},
	{
		name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Home appliances and kitchenware',
		children: [
			{
				name: 'Kitchen Appliances', slug: 'kitchen-appliances', description: 'Electrical kitchen equipment',
				children: [
					{ name: 'Cooking Appliances', slug: 'cooking-appliances', description: 'Air fryers, ovens and cookers' },
					{ name: 'Coffee & Tea Makers', slug: 'coffee-tea-makers', description: 'Espresso machines and kettles' },
					{ name: 'Food Preparation', slug: 'food-preparation', description: 'Blenders, mixers and processors' },
				],
			},
			{
				name: 'Cookware & Bakeware', slug: 'cookware-bakeware', description: 'Pots, pans and baking gear',
				children: [
					{ name: 'Pots & Pans', slug: 'pots-pans', description: 'Skillets, pots and pans' },
					{ name: 'Baking Accessories', slug: 'baking-acc', description: 'Baking sheets and moulds' },
					{ name: 'Kitchen Tools', slug: 'kitchen-tools', description: 'Utensils and gadgets' },
				],
			},
			{
				name: 'Home Organisation', slug: 'home-organisation', description: 'Storage and organisation solutions',
				children: [
					{ name: 'Storage Boxes & Bins', slug: 'storage-boxes', description: 'Containers and storage' },
					{ name: 'Shelving & Racks', slug: 'shelving-racks', description: 'Shelves and racks' },
					{ name: 'Desk Organisers', slug: 'desk-organisers', description: 'Desk and workspace storage' },
				],
			},
		],
	},
	{
		name: 'Sports & Outdoors', slug: 'sports-outdoors', description: 'Sports equipment and outdoor gear',
		children: [
			{
				name: 'Gym & Fitness', slug: 'gym-fitness', description: 'Home and gym fitness equipment',
				children: [
					{ name: 'Strength Training', slug: 'strength-training', description: 'Weights and resistance equipment' },
					{ name: 'Cardio Equipment', slug: 'cardio-equipment', description: 'Treadmills and bikes' },
					{ name: 'Yoga & Pilates', slug: 'yoga-pilates', description: 'Mats, blocks and bands' },
				],
			},
			{
				name: 'Outdoor Recreation', slug: 'outdoor-recreation', description: 'Outdoor activities and camping',
				children: [
					{ name: 'Hiking & Camping', slug: 'hiking-camping', description: 'Tents, backpacks and gear' },
					{ name: 'Cycling', slug: 'cycling', description: 'Bikes, helmets and accessories' },
					{ name: 'Water Sports', slug: 'water-sports', description: 'Swimming and paddle sports' },
				],
			},
			{
				name: 'Team & Ball Sports', slug: 'team-sports', description: 'Team sports and racket sports',
				children: [
					{ name: 'Ball Sports', slug: 'ball-sports', description: 'Football, basketball and more' },
					{ name: 'Racket Sports', slug: 'racket-sports', description: 'Tennis, badminton and squash' },
					{ name: 'Golf', slug: 'golf', description: 'Golf clubs, bags and accessories' },
				],
			},
		],
	},
	{
		name: 'Beauty & Personal Care', slug: 'beauty-personal-care', description: 'Beauty and grooming products',
		children: [
			{
				name: 'Skin Care', slug: 'skin-care', description: 'Face and body skin care',
				children: [
					{ name: 'Face Care', slug: 'face-care', description: 'Cleansers, moisturisers and serums' },
					{ name: 'Body Care', slug: 'body-care', description: 'Body lotions and washes' },
					{ name: 'Sun Care', slug: 'sun-care', description: 'Sunscreen and after-sun care' },
				],
			},
			{
				name: 'Hair Care', slug: 'hair-care', description: 'Shampoos, conditioners and styling',
				children: [
					{ name: 'Shampoo & Conditioner', slug: 'shampoo-conditioner', description: 'Cleansing and conditioning' },
					{ name: 'Styling Products', slug: 'styling-products', description: 'Gels, sprays and serums' },
					{ name: 'Hair Treatments', slug: 'hair-treatments', description: 'Masks and repair treatments' },
				],
			},
			{
				name: 'Makeup & Cosmetics', slug: 'makeup-cosmetics', description: 'Colour cosmetics',
				children: [
					{ name: 'Face Makeup', slug: 'face-makeup', description: 'Foundation, concealer and powder' },
					{ name: 'Eye Makeup', slug: 'eye-makeup', description: 'Mascara, eyeliner and eyeshadow' },
					{ name: 'Lip Products', slug: 'lip-products', description: 'Lipstick, gloss and liner' },
				],
			},
		],
	},
	{
		name: 'Toys & Games', slug: 'toys-games', description: 'Toys and entertainment for all ages',
		children: [
			{
				name: 'Building & Construction', slug: 'building-construction', description: 'Building and creative toys',
				children: [
					{ name: 'Building Blocks', slug: 'building-blocks', description: 'LEGO and block sets' },
					{ name: 'Model Kits', slug: 'model-kits', description: 'Scale models and assembly kits' },
					{ name: 'STEM Toys', slug: 'stem-toys', description: 'Science and learning toys' },
				],
			},
			{
				name: 'Outdoor Play', slug: 'outdoor-play', description: 'Active outdoor play',
				children: [
					{ name: 'Ride-On Toys', slug: 'ride-on-toys', description: 'Bikes, scooters and ride-ons' },
					{ name: 'Sports Toys', slug: 'sports-toys', description: 'Balls, bats and frisbees' },
					{ name: 'Garden & Sand Play', slug: 'garden-sand-play', description: 'Sandpits and garden toys' },
				],
			},
			{
				name: 'Board Games & Puzzles', slug: 'board-games-puzzles', description: 'Tabletop games and puzzles',
				children: [
					{ name: 'Board Games', slug: 'board-games', description: 'Strategy and family board games' },
					{ name: 'Card Games', slug: 'card-games', description: 'Playing cards and card games' },
					{ name: 'Jigsaw Puzzles', slug: 'jigsaw-puzzles', description: '500 to 5000-piece puzzles' },
				],
			},
		],
	},
	{
		name: 'Automotive', slug: 'automotive', description: 'Car accessories and maintenance products',
		children: [
			{
				name: 'Car Maintenance', slug: 'car-maintenance', description: 'Fluids, filters and maintenance',
				children: [
					{ name: 'Engine & Oil', slug: 'engine-oil', description: 'Motor oil and engine products' },
					{ name: 'Brakes & Tyres', slug: 'brakes-tyres', description: 'Brake parts and tyre care' },
					{ name: 'Car Care & Detailing', slug: 'car-care', description: 'Waxes, polishes and cleaners' },
				],
			},
			{
				name: 'Car Accessories', slug: 'car-accessories', description: 'Interior and exterior accessories',
				children: [
					{ name: 'Interior Accessories', slug: 'interior-accessories', description: 'Seat covers and floor mats' },
					{ name: 'Exterior Accessories', slug: 'exterior-accessories', description: 'Body kits and covers' },
					{ name: 'Car Electronics', slug: 'car-electronics', description: 'Dash cams and GPS units' },
				],
			},
		],
	},
	{
		name: 'Office & Stationery', slug: 'office-stationery', description: 'Office supplies and technology',
		children: [
			{
				name: 'Office Supplies', slug: 'office-supplies', description: 'Pens, paper and desk items',
				children: [
					{ name: 'Writing Instruments', slug: 'writing-instruments', description: 'Pens, pencils and markers' },
					{ name: 'Paper Products', slug: 'paper-products', description: 'Notebooks, pads and sheets' },
					{ name: 'Desk Accessories', slug: 'desk-accessories', description: 'Staplers, clips and organisers' },
				],
			},
			{
				name: 'Office Technology', slug: 'office-technology', description: 'Printers and storage',
				children: [
					{ name: 'Printers & Scanners', slug: 'printers-scanners', description: 'Inkjet and laser printers' },
					{ name: 'Storage Devices', slug: 'storage-devices', description: 'USB drives and hard disks' },
					{ name: 'Office Electronics', slug: 'office-electronics', description: 'Calculators and shredders' },
				],
			},
		],
	},
	{
		name: 'Health & Wellness', slug: 'health-wellness', description: 'Health products and supplements',
		children: [
			{
				name: 'Vitamins & Supplements', slug: 'vitamins-supplements', description: 'Dietary supplements',
				children: [
					{ name: 'Vitamins & Minerals', slug: 'vitamins-minerals', description: 'Daily vitamins and minerals' },
					{ name: 'Protein Supplements', slug: 'protein-supplements', description: 'Whey, casein and plant protein' },
					{ name: 'Herbal Supplements', slug: 'herbal-supplements', description: 'Natural herbal products' },
				],
			},
			{
				name: 'Medical Equipment', slug: 'medical-equipment', description: 'Home medical devices',
				children: [
					{ name: 'Monitoring Devices', slug: 'monitoring-devices', description: 'Blood pressure and glucose monitors' },
					{ name: 'First Aid Supplies', slug: 'first-aid', description: 'First aid kits and wound care' },
					{ name: 'Mobility Aids', slug: 'mobility-aids', description: 'Walking aids and supports' },
				],
			},
		],
	},
];

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT TEMPLATES  (keyed to L3 category slugs)
// ─────────────────────────────────────────────────────────────────────────────
interface ProductTemplate {
	categorySlug: string;   // L3 slug
	vendorName: string;
	brands: string[];
	types: string[];
	unit: string;
	variantType: VariantType;
}

const PRODUCT_TEMPLATES: ProductTemplate[] = [
	// ── Electronics ──────────────────────────────────────────────────────────
	{
		categorySlug: 'smartphones', vendorName: 'Samsung Electronics', unit: 'unit', variantType: 'colour',
		brands: ['Samsung', 'Apple', 'Huawei', 'OnePlus', 'Xiaomi', 'Oppo', 'Motorola', 'Nokia', 'Sony', 'Google'],
		types: ['Flagship Smartphone', 'Mid-Range Smartphone', 'Budget Smartphone', 'Rugged Smartphone', '5G Smartphone'],
	},
	{
		categorySlug: 'tablets', vendorName: 'Apple Inc.', unit: 'unit', variantType: 'colour',
		brands: ['Apple', 'Samsung', 'Lenovo', 'Amazon', 'Huawei', 'Microsoft'],
		types: ['10-inch Tablet', '12-inch Tablet', 'Kids Tablet', 'Drawing Tablet', 'Android Tablet'],
	},
	{
		categorySlug: 'phone-accessories', vendorName: 'Anker Innovations', unit: 'unit', variantType: 'colour',
		brands: ['Anker', 'Belkin', 'Spigen', 'OtterBox', 'Mophie'],
		types: ['Protective Phone Case', 'Screen Protector', 'Wireless Charger', 'Fast Charging Cable', 'Phone Stand'],
	},
	{
		categorySlug: 'laptops', vendorName: 'HP Inc.', unit: 'unit', variantType: 'colour',
		brands: ['HP', 'Dell', 'Lenovo', 'Asus', 'Acer', 'Apple', 'MSI', 'Razer', 'Microsoft'],
		types: ['Gaming Laptop', 'Ultrabook', 'Business Laptop', 'Chromebook', 'Budget Laptop', '2-in-1 Convertible'],
	},
	{
		categorySlug: 'desktops', vendorName: 'Dell Technologies', unit: 'unit', variantType: 'none',
		brands: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer'],
		types: ['Gaming Desktop PC', 'All-in-One PC', 'Mini Desktop PC', 'Tower Desktop PC', 'Workstation PC'],
	},
	{
		categorySlug: 'computer-peripherals', vendorName: 'Logitech International', unit: 'unit', variantType: 'colour',
		brands: ['Logitech', 'Razer', 'Corsair', 'SteelSeries', 'HyperX', 'Microsoft'],
		types: ['Mechanical Keyboard', 'Wireless Mouse', 'Gaming Headset', 'Webcam', 'USB Hub', 'Mouse Pad XL'],
	},
	{
		categorySlug: 'headphones-earbuds', vendorName: 'Sony Corporation', unit: 'unit', variantType: 'colour',
		brands: ['Sony', 'Bose', 'JBL', 'Sennheiser', 'Apple', 'Samsung', 'Jabra', 'Anker'],
		types: ['True Wireless Earbuds', 'Noise-Cancelling Headphones', 'Over-Ear Headphones', 'Sports Earbuds', 'Gaming Headset'],
	},
	{
		categorySlug: 'speakers-soundbars', vendorName: 'JBL (Harman International)', unit: 'unit', variantType: 'colour',
		brands: ['JBL', 'Bose', 'Sony', 'LG', 'Samsung', 'Sonos', 'Harman Kardon'],
		types: ['Portable Bluetooth Speaker', 'Soundbar with Subwoofer', 'Smart Speaker', 'Party Speaker', 'Bookshelf Speaker Pair'],
	},
	{
		categorySlug: 'tvs-displays', vendorName: 'LG Electronics', unit: 'unit', variantType: 'none',
		brands: ['LG', 'Samsung', 'Sony', 'TCL', 'Hisense', 'Philips'],
		types: ['55-inch 4K Smart TV', '65-inch OLED TV', '75-inch QLED TV', '32-inch Monitor', '27-inch Gaming Monitor', '43-inch LED TV'],
	},
	{
		categorySlug: 'digital-cameras', vendorName: 'Sony Corporation', unit: 'unit', variantType: 'none',
		brands: ['Sony', 'Canon', 'Nikon', 'Fujifilm', 'Panasonic', 'Olympus'],
		types: ['Mirrorless Camera', 'DSLR Camera', 'Compact Camera', 'Bridge Camera', 'Instant Camera'],
	},
	{
		categorySlug: 'action-cameras', vendorName: 'Sony Corporation', unit: 'unit', variantType: 'none',
		brands: ['GoPro', 'DJI', 'Sony', 'Insta360', 'Akaso'],
		types: ['Action Camera 4K', 'Action Camera 360°', 'Underwater Camera', 'Body Camera'],
	},
	{
		categorySlug: 'drones', vendorName: 'Sony Corporation', unit: 'unit', variantType: 'none',
		brands: ['DJI', 'Parrot', 'Autel Robotics', 'PowerVision'],
		types: ['Mini Drone', 'Professional Drone', 'Racing Drone', 'Agricultural Drone'],
	},
	// ── Clothing ─────────────────────────────────────────────────────────────
	{
		categorySlug: 'mens-tops', vendorName: 'Nike Inc.', unit: 'piece', variantType: 'colour-size',
		brands: ['Nike', 'Adidas', 'Puma', 'Under Armour', 'Champion', "Levi's", 'H&M', 'Uniqlo', 'Gap', 'Tommy Hilfiger'],
		types: ['Classic T-Shirt', 'Polo Shirt', 'Button-Down Shirt', 'Graphic Tee', 'Long-Sleeve Shirt', 'Athletic Tank Top', 'Henley Top'],
	},
	{
		categorySlug: 'mens-bottoms', vendorName: 'Adidas AG', unit: 'piece', variantType: 'colour-size',
		brands: ['Nike', 'Adidas', "Levi's", 'H&M', 'Zara', 'Uniqlo', 'Carhartt', 'Columbia', 'Wrangler'],
		types: ['Slim Fit Jeans', 'Relaxed Fit Jeans', 'Cargo Pants', 'Chino Trousers', 'Jogger Pants', 'Athletic Shorts', 'Board Shorts'],
	},
	{
		categorySlug: 'mens-outerwear', vendorName: 'The North Face', unit: 'piece', variantType: 'colour-size',
		brands: ['The North Face', 'Columbia', 'Patagonia', 'Nike', 'Adidas', 'Carhartt', 'Marmot'],
		types: ['Zip-Up Hoodie', 'Pullover Hoodie', 'Fleece Jacket', 'Windbreaker', 'Puffer Jacket', 'Denim Jacket', 'Parka Coat'],
	},
	{
		categorySlug: 'womens-tops', vendorName: 'H&M Hennes & Mauritz', unit: 'piece', variantType: 'colour-size',
		brands: ['H&M', 'Zara', 'Uniqlo', 'Nike', 'Adidas', "Levi's", 'Gap', 'Calvin Klein', 'Ralph Lauren'],
		types: ['Fitted Blouse', 'Casual T-Shirt', 'Sleeveless Top', 'Crop Top', 'Off-Shoulder Top', 'Ribbed Knit Top'],
	},
	{
		categorySlug: 'womens-bottoms', vendorName: 'Zara (Inditex)', unit: 'piece', variantType: 'colour-size',
		brands: ['Zara', 'H&M', 'Uniqlo', "Levi's", 'Nike', 'Adidas', 'Gap'],
		types: ['High-Waist Jeans', 'Wide-Leg Trousers', 'Mini Skirt', 'Pleated Midi Skirt', 'Yoga Leggings', 'Athletic Shorts'],
	},
	{
		categorySlug: 'womens-dresses', vendorName: 'Zara (Inditex)', unit: 'piece', variantType: 'colour-size',
		brands: ['Zara', 'H&M', 'Uniqlo', 'ASOS', 'Mango', 'Ralph Lauren'],
		types: ['Floral Wrap Dress', 'Casual Shirt Dress', 'Bodycon Dress', 'Maxi Dress', 'A-Line Dress', 'Sundress'],
	},
	{
		categorySlug: 'athletic-footwear', vendorName: 'Nike Inc.', unit: 'pair', variantType: 'colour-size',
		brands: ['Nike', 'Adidas', 'Puma', 'New Balance', 'Reebok', 'Under Armour', 'ASICS', 'Brooks', 'Saucony'],
		types: ['Road Running Shoes', 'Trail Running Shoes', 'Training Shoes', 'Basketball Shoes', 'Cross-Training Shoes'],
	},
	{
		categorySlug: 'casual-footwear', vendorName: 'Adidas AG', unit: 'pair', variantType: 'colour-size',
		brands: ['Adidas', 'Nike', 'Vans', 'Converse', "Levi's", 'Puma', 'Reebok'],
		types: ['Classic Sneakers', 'Slip-On Shoes', 'Canvas Shoes', 'Platform Sneakers', 'Loafers'],
	},
	{
		categorySlug: 'boots-hiking', vendorName: 'Columbia Sportswear', unit: 'pair', variantType: 'colour-size',
		brands: ['Columbia', 'Salomon', 'Merrell', 'Timberland', 'The North Face', 'Keen', 'Lowa'],
		types: ['Waterproof Hiking Boots', 'Lightweight Trail Shoes', 'Winter Snow Boots', 'Chelsea Boots', 'Work Boots'],
	},
	{
		categorySlug: 'bags-backpacks', vendorName: 'Nike Inc.', unit: 'unit', variantType: 'colour',
		brands: ['Nike', 'Adidas', 'The North Face', 'Osprey', 'Herschel', 'Fjallraven', 'Patagonia', 'Tumi'],
		types: ['Daypack Backpack', 'Gym Duffel Bag', 'Roll-Top Backpack', 'Laptop Backpack', 'Messenger Bag', 'Tote Bag'],
	},
	{
		categorySlug: 'hats-caps', vendorName: 'Nike Inc.', unit: 'unit', variantType: 'colour',
		brands: ['Nike', 'Adidas', 'The North Face', 'Puma', 'New Era', 'Columbia'],
		types: ['Snapback Cap', 'Dad Hat', 'Bucket Hat', 'Beanie', 'Sun Hat', 'Trucker Cap'],
	},
	{
		categorySlug: 'belts-wallets', vendorName: 'Levi Strauss & Co.', unit: 'unit', variantType: 'colour',
		brands: ["Levi's", 'Calvin Klein', 'Tommy Hilfiger', 'Fossil', 'Coach', 'Michael Kors'],
		types: ['Leather Belt', 'Canvas Belt', 'Slim Leather Wallet', 'Bifold Wallet', 'Card Holder', 'Phone Wallet'],
	},
	// ── Food & Beverages ──────────────────────────────────────────────────────
	{
		categorySlug: 'hot-drinks', vendorName: "Nestlé S.A.", unit: 'pack', variantType: 'none',
		brands: ["Nestlé", 'Lavazza', 'Nescafé', 'Twinings', 'Tetley', 'Clipper', 'Typhoo', 'PG Tips'],
		types: ['Ground Coffee', 'Instant Coffee', 'Espresso Pods', 'Green Tea Bags', 'Black Tea Bags', 'Herbal Tea Bags', 'Matcha Powder'],
	},
	{
		categorySlug: 'cold-drinks', vendorName: 'PepsiCo Inc.', unit: 'pack', variantType: 'none',
		brands: ['PepsiCo', 'The Coca-Cola Company', 'Red Bull', 'Monster', 'Schweppes', 'San Pellegrino'],
		types: ['Cola Soft Drink', 'Sparkling Water', 'Energy Drink', 'Sports Drink', 'Ginger Beer', 'Tonic Water'],
	},
	{
		categorySlug: 'juices-smoothies', vendorName: 'Danone S.A.', unit: 'bottle', variantType: 'none',
		brands: ['Tropicana', 'Innocent', 'Ocean Spray', 'Dole', 'Del Monte', 'Minute Maid'],
		types: ['Orange Juice', 'Apple Juice', 'Mixed Berry Juice', 'Mango Smoothie', 'Green Smoothie', 'Vegetable Juice'],
	},
	{
		categorySlug: 'snack-bars', vendorName: 'General Mills Inc.', unit: 'box', variantType: 'none',
		brands: ['Kellogg Company', 'General Mills Inc.', 'Quaker', 'Clif Bar', 'Kind', 'RxBar', 'Larabar'],
		types: ['Granola Bar', 'Protein Bar', 'Cereal Bar', 'Oat Bar', 'Nut & Seed Bar'],
	},
	{
		categorySlug: 'chips-crisps', vendorName: 'PepsiCo Inc.', unit: 'bag', variantType: 'none',
		brands: ["Lay's", 'Pringles', 'Doritos', 'Kettle Brand', 'Walkers', 'Tyrells'],
		types: ['Classic Salted Crisps', 'Cheese & Onion Crisps', 'Tortilla Chips', 'Popcorn', 'Rice Cakes'],
	},
	{
		categorySlug: 'confectionery', vendorName: 'Mondelez International', unit: 'pack', variantType: 'none',
		brands: ['Mondelez International', "Nestlé", 'Ferrero', 'Mars', "Hershey's", 'Lindt'],
		types: ['Milk Chocolate Bar', 'Dark Chocolate Bar', 'Gummy Bears', 'Jelly Beans', 'Lollipops', 'Marshmallows'],
	},
	{
		categorySlug: 'grains-pasta', vendorName: 'Kraft Heinz Company', unit: 'kg', variantType: 'none',
		brands: ['Barilla', 'De Cecco', 'Quaker', 'Uncle Bens', 'Ainsley Harriott'],
		types: ['Spaghetti Pasta', 'Penne Pasta', 'Fusilli Pasta', 'Basmati Rice', 'Brown Rice', 'Quinoa', 'Rolled Oats'],
	},
	{
		categorySlug: 'oils-condiments', vendorName: 'Kraft Heinz Company', unit: 'bottle', variantType: 'none',
		brands: ['Heinz', 'Hellmann\'s', 'Lea & Perrins', 'Kikkoman', "Bertolli"],
		types: ['Extra Virgin Olive Oil', 'Coconut Oil', 'Soy Sauce', 'Tomato Ketchup', 'Dijon Mustard', 'White Wine Vinegar'],
	},
	{
		categorySlug: 'spreads-preserves', vendorName: "Nestlé S.A.", unit: 'jar', variantType: 'none',
		brands: ['Nutella', 'Skippy', "Bonne Maman", 'Hartley\'s', "Marmite"],
		types: ['Chocolate Hazelnut Spread', 'Peanut Butter', 'Almond Butter', 'Strawberry Jam', 'Marmalade', 'Honey'],
	},
	// ── Home & Kitchen ────────────────────────────────────────────────────────
	{
		categorySlug: 'cooking-appliances', vendorName: 'Ninja (SharkNinja)', unit: 'unit', variantType: 'colour',
		brands: ['Ninja', 'Instant Pot', 'Cosori', 'Breville Group', 'KitchenAid (Whirlpool)', 'Philips Electronics'],
		types: ['Air Fryer', 'Pressure Cooker', 'Slow Cooker', 'Rice Cooker', 'Toaster Oven', 'Indoor Grill'],
	},
	{
		categorySlug: 'coffee-tea-makers', vendorName: "De'Longhi Group", unit: 'unit', variantType: 'colour',
		brands: ["De'Longhi Group", 'Breville Group', 'Nespresso', 'Keurig', 'Sage', 'Smeg'],
		types: ['Bean-to-Cup Coffee Machine', 'Espresso Machine', 'Pod Coffee Maker', 'Drip Coffee Maker', 'Electric Kettle'],
	},
	{
		categorySlug: 'food-preparation', vendorName: 'KitchenAid (Whirlpool)', unit: 'unit', variantType: 'colour',
		brands: ['KitchenAid (Whirlpool)', 'Cuisinart (Conair)', 'Ninja (SharkNinja)', 'Vitamix', 'Breville Group'],
		types: ['Stand Mixer', 'Hand Mixer', 'Immersion Blender', 'Food Processor', 'Countertop Blender', 'Juicer'],
	},
	{
		categorySlug: 'pots-pans', vendorName: 'Cuisinart (Conair)', unit: 'set', variantType: 'none',
		brands: ['Tefal', 'All-Clad', 'Calphalon', 'Lodge', 'Le Creuset', 'Circulon'],
		types: ['Non-Stick Frying Pan Set', 'Stainless Steel Pan Set', 'Cast Iron Skillet', 'Wok', 'Grill Pan', 'Saucepan Set'],
	},
	{
		categorySlug: 'baking-acc', vendorName: 'KitchenAid (Whirlpool)', unit: 'unit', variantType: 'none',
		brands: ['Nordic Ware', 'Wilton', 'USA Pan', 'Chicago Metallic', 'OXO'],
		types: ['Non-Stick Baking Sheet', 'Muffin Tin', 'Loaf Pan', 'Round Cake Pan', 'Springform Pan', 'Silicone Mould Set'],
	},
	{
		categorySlug: 'kitchen-tools', vendorName: 'Cuisinart (Conair)', unit: 'set', variantType: 'none',
		brands: ['OXO', 'KitchenAid (Whirlpool)', 'Zyliss', 'Joseph Joseph', 'Victorinox'],
		types: ['Silicone Spatula Set', 'Knife Block Set', 'Cutting Board Set', 'Measuring Cup & Spoon Set', 'Whisk Set'],
	},
	{
		categorySlug: 'storage-boxes', vendorName: 'Dyson Ltd.', unit: 'set', variantType: 'colour',
		brands: ['IRIS USA', 'Sterilite', 'Rubbermaid', 'Ikea', 'Sistema'],
		types: ['Plastic Storage Box Set', 'Stackable Storage Bins', 'Collapsible Storage Cube', 'Vacuum Storage Bags', 'Drawer Organiser Set'],
	},
	{
		categorySlug: 'shelving-racks', vendorName: 'Dyson Ltd.', unit: 'unit', variantType: 'colour',
		brands: ['Ikea', 'Honey-Can-Do', 'Seville Classics', 'Whitmor'],
		types: ['5-Tier Wire Rack', 'Floating Wall Shelf', 'Cube Storage Unit', 'Over-Door Organiser', 'Corner Shelf'],
	},
	{
		categorySlug: 'desk-organisers', vendorName: 'Dyson Ltd.', unit: 'unit', variantType: 'colour',
		brands: ['Ikea', 'Poppin', 'Artistic', 'Mindspace', 'Simple Houseware'],
		types: ['Pen & Pencil Holder', 'Monitor Stand with Storage', 'Letter Tray Set', 'Cable Management Box', 'Desktop File Organiser'],
	},
	// ── Sports & Outdoors ─────────────────────────────────────────────────────
	{
		categorySlug: 'strength-training', vendorName: 'Wilson Sporting Goods', unit: 'unit', variantType: 'size',
		brands: ['Rogue Fitness', 'Bowflex', 'PowerBlock', 'Cap Barbell', 'Marcy', 'Body-Solid'],
		types: ['Adjustable Dumbbell Set', 'Barbell & Weight Plates Set', 'Kettlebell', 'Pull-Up Bar', 'Resistance Band Set', 'Weight Bench'],
	},
	{
		categorySlug: 'cardio-equipment', vendorName: 'Garmin Ltd.', unit: 'unit', variantType: 'none',
		brands: ['NordicTrack', 'Peloton', 'Bowflex', 'ProForm', 'Schwinn', 'Life Fitness'],
		types: ['Treadmill', 'Stationary Bike', 'Rowing Machine', 'Elliptical Cross Trainer', 'Jump Rope'],
	},
	{
		categorySlug: 'yoga-pilates', vendorName: 'Wilson Sporting Goods', unit: 'unit', variantType: 'colour',
		brands: ['Manduka', 'Lululemon', 'Gaiam', 'Liforme', 'Jade Yoga'],
		types: ['Yoga Mat', 'Foam Roller', 'Yoga Block Set', 'Yoga Strap', 'Pilates Ring', 'Balance Ball'],
	},
	{
		categorySlug: 'hiking-camping', vendorName: 'Columbia Sportswear', unit: 'unit', variantType: 'colour',
		brands: ['Osprey', 'Deuter', 'The North Face', 'Marmot', 'Sea to Summit', 'Black Diamond'],
		types: ['Hiking Backpack 30L', 'Camping Tent 2-Person', 'Sleeping Bag', 'Trekking Poles', 'Headlamp', 'Hydration Bladder'],
	},
	{
		categorySlug: 'cycling', vendorName: 'Garmin Ltd.', unit: 'unit', variantType: 'size',
		brands: ['Giro', 'Bell', 'Specialized', 'Kryptonite', 'Garmin Ltd.', 'CamelBak'],
		types: ['Road Cycling Helmet', 'Mountain Bike Helmet', 'Bike Lock', 'Cycling Gloves', 'Bike Computer', 'Cycling Shorts'],
	},
	{
		categorySlug: 'water-sports', vendorName: 'Speedo International', unit: 'unit', variantType: 'colour',
		brands: ['Speedo International', 'Arena', 'TYR', 'Aqua Sphere', 'HEAD'],
		types: ['Competition Swimsuit', 'Swim Goggles', 'Swim Cap', 'Kickboard', 'Pull Buoy', 'Wetsuit'],
	},
	{
		categorySlug: 'ball-sports', vendorName: 'Wilson Sporting Goods', unit: 'unit', variantType: 'none',
		brands: ['Wilson Sporting Goods', 'Spalding', 'Molten', 'Adidas', 'Nike', 'Mikasa'],
		types: ['Football', 'Basketball', 'Volleyball', 'Rugby Ball', 'Cricket Ball', 'Baseball Glove'],
	},
	{
		categorySlug: 'racket-sports', vendorName: 'Wilson Sporting Goods', unit: 'unit', variantType: 'none',
		brands: ['Wilson Sporting Goods', 'Head', 'Babolat', 'Yonex', 'Prince', 'Dunlop'],
		types: ['Tennis Racket', 'Badminton Racket', 'Squash Racket', 'Table Tennis Paddle', 'Padel Racket'],
	},
	{
		categorySlug: 'golf', vendorName: 'Callaway Golf', unit: 'unit', variantType: 'none',
		brands: ['Callaway Golf', 'TaylorMade', 'Titleist', 'Ping', 'Cleveland', 'Cobra Golf'],
		types: ['Driver', 'Iron Set', 'Wedge', 'Putter', 'Golf Bag', 'Golf Balls (12-Pack)', 'Golf Glove'],
	},
	// ── Beauty & Personal Care ────────────────────────────────────────────────
	{
		categorySlug: 'face-care', vendorName: "L'Oréal S.A.", unit: 'bottle', variantType: 'colour',
		brands: ["L'Oréal S.A.", 'Neutrogena', 'Cetaphil', 'Olay', 'Garnier', 'Aveeno', 'The Ordinary', 'CeraVe'],
		types: ['Hydrating Face Wash', 'Exfoliating Face Scrub', 'Daily Moisturiser SPF 30', 'Vitamin C Serum', 'Retinol Night Cream', 'Eye Cream'],
	},
	{
		categorySlug: 'body-care', vendorName: 'Unilever PLC', unit: 'bottle', variantType: 'none',
		brands: ['Dove', 'Nivea', 'Aveeno', 'Olay', 'Vaseline', 'Palmer\'s'],
		types: ['Nourishing Body Lotion', 'Rich Body Butter', 'Refreshing Body Wash', 'Exfoliating Body Scrub', 'Roll-On Deodorant'],
	},
	{
		categorySlug: 'sun-care', vendorName: 'Beiersdorf AG', unit: 'bottle', variantType: 'none',
		brands: ['Nivea', 'Coppertone', 'Banana Boat', 'La Roche-Posay', 'Sun Bum', 'Hawaiian Tropic'],
		types: ['Sunscreen SPF 30', 'Sunscreen SPF 50+', 'Kids Sunscreen', 'After-Sun Lotion', 'Self-Tanning Lotion'],
	},
	{
		categorySlug: 'shampoo-conditioner', vendorName: 'Procter & Gamble', unit: 'bottle', variantType: 'none',
		brands: ['Pantene', 'Head & Shoulders', 'Herbal Essences', 'TRESemmé', 'L\'Oréal Paris', 'Dove'],
		types: ['Moisturising Shampoo', 'Volumising Shampoo', 'Anti-Dandruff Shampoo', 'Deep Conditioner', 'Leave-In Conditioner'],
	},
	{
		categorySlug: 'styling-products', vendorName: "L'Oréal S.A.", unit: 'bottle', variantType: 'none',
		brands: ["L'Oréal S.A.", 'Kenra', 'Redken', 'Wella', 'Schwarzkopf'],
		types: ['Hair Gel', 'Hairspray', 'Curl Cream', 'Heat Protectant Spray', 'Texturising Spray'],
	},
	{
		categorySlug: 'hair-treatments', vendorName: "L'Oréal S.A.", unit: 'bottle', variantType: 'none',
		brands: ["L'Oréal S.A.", 'Olaplex', 'Kerastase', 'Pantene', 'Dove'],
		types: ['Deep Conditioning Mask', 'Argan Oil Treatment', 'Bond Repair Treatment', 'Scalp Serum', 'Keratin Smoothing Treatment'],
	},
	{
		categorySlug: 'face-makeup', vendorName: "L'Oréal S.A.", unit: 'unit', variantType: 'colour',
		brands: ["L'Oréal S.A.", 'Maybelline', 'Revlon', 'Clinique', 'MAC', 'Fenty Beauty'],
		types: ['Full-Coverage Foundation', 'BB Cream', 'Setting Powder', 'Full-Coverage Concealer', 'Blush & Highlighter'],
	},
	{
		categorySlug: 'eye-makeup', vendorName: "L'Oréal S.A.", unit: 'unit', variantType: 'colour',
		brands: ["L'Oréal S.A.", 'Maybelline', 'Urban Decay', 'NYX', 'MAC'],
		types: ['Volumising Mascara', 'Liquid Eyeliner', 'Eyeshadow Palette', 'Brow Pencil', 'Eyebrow Gel'],
	},
	{
		categorySlug: 'lip-products', vendorName: "L'Oréal S.A.", unit: 'unit', variantType: 'colour',
		brands: ["L'Oréal S.A.", 'MAC', 'Charlotte Tilbury', 'NYX', 'Revlon', 'Maybelline'],
		types: ['Matte Lipstick', 'Creamy Lipstick', 'Lip Gloss', 'Lip Liner', 'Tinted Lip Balm'],
	},
	// ── Toys & Games ─────────────────────────────────────────────────────────
	{
		categorySlug: 'building-blocks', vendorName: 'LEGO Group', unit: 'set', variantType: 'none',
		brands: ['LEGO Group', 'Mega Bloks', 'Playmobil', 'K\'Nex'],
		types: ['City Building Set', 'Technic Advanced Set', 'Classic Brick Box', 'Modular House Set', 'Space Exploration Set'],
	},
	{
		categorySlug: 'model-kits', vendorName: 'Hasbro Inc.', unit: 'set', variantType: 'none',
		brands: ['Bandai', 'Tamiya', 'Revell', 'Airfix'],
		types: ['Scale Model Car Kit', 'Aircraft Model Kit', 'Ship Model Kit', 'Gundam Model Kit', 'Robot Assembly Kit'],
	},
	{
		categorySlug: 'stem-toys', vendorName: 'Hasbro Inc.', unit: 'set', variantType: 'none',
		brands: ['Snap Circuits', 'Klutz', 'Osmo', 'Thames & Kosmos', 'National Geographic'],
		types: ['Electronics Experiment Kit', 'Chemistry Science Kit', 'Coding Robot', 'Solar Energy Kit', 'Microscope Set'],
	},
	{
		categorySlug: 'ride-on-toys', vendorName: 'Mattel Inc.', unit: 'unit', variantType: 'colour',
		brands: ['Razor', 'Radio Flyer', 'Strider', 'Micro Kickboard', 'Globber'],
		types: ['Kids Kick Scooter', 'Balance Bike', 'Electric Ride-On Car', 'Tricycle', 'Go-Kart'],
	},
	{
		categorySlug: 'sports-toys', vendorName: 'Hasbro Inc.', unit: 'unit', variantType: 'colour',
		brands: ['Nerf', 'Spalding', 'Franklin Sports', 'Wham-O'],
		types: ['Foam Dart Blaster', 'Mini Basketball & Hoop', 'Frisbee', 'Badminton Set', 'Bubbles Set'],
	},
	{
		categorySlug: 'garden-sand-play', vendorName: 'Mattel Inc.', unit: 'set', variantType: 'colour',
		brands: ['Step2', 'Little Tikes', 'Kinetic Sand', 'Melissa & Doug'],
		types: ['Sandbox Play Set', 'Water Table', 'Garden Tool Set', 'Outdoor Sprinkler Mat', 'Sand Sculpting Kit'],
	},
	{
		categorySlug: 'board-games', vendorName: 'Hasbro Inc.', unit: 'set', variantType: 'none',
		brands: ['Hasbro Inc.', 'Mattel Inc.', 'Ravensburger', 'Catan Studio', 'Days of Wonder', 'Fantasy Flight'],
		types: ['Strategy Board Game', 'Cooperative Board Game', 'Family Board Game', 'Party Game', 'Word Game'],
	},
	{
		categorySlug: 'card-games', vendorName: 'Hasbro Inc.', unit: 'set', variantType: 'none',
		brands: ['Hasbro Inc.', 'Mattel Inc.', 'Exploding Kittens', 'Gamewright'],
		types: ['Collectible Card Game', 'Party Card Game', 'Memory Card Game', 'Educational Card Game'],
	},
	{
		categorySlug: 'jigsaw-puzzles', vendorName: 'Hasbro Inc.', unit: 'set', variantType: 'none',
		brands: ['Ravensburger', 'Buffalo Games', 'White Mountain', 'Springbok'],
		types: ['500-Piece Puzzle', '1000-Piece Puzzle', '2000-Piece Puzzle', '3D Puzzle', 'Glow-in-the-Dark Puzzle'],
	},
	// ── Automotive ────────────────────────────────────────────────────────────
	{
		categorySlug: 'engine-oil', vendorName: 'Bosch Automotive', unit: 'litre', variantType: 'none',
		brands: ['Mobil 1', 'Castrol', 'Pennzoil', 'Shell Helix', 'Valvoline', 'Total'],
		types: ['Full Synthetic Oil 5W-30', 'Full Synthetic Oil 0W-20', 'High Mileage Oil 10W-40', 'Diesel Engine Oil', 'Conventional Motor Oil'],
	},
	{
		categorySlug: 'brakes-tyres', vendorName: 'Michelin Group', unit: 'unit', variantType: 'none',
		brands: ['Bosch Automotive', 'Brembo', 'Michelin Group', 'Bridgestone', 'Goodyear', 'Continental'],
		types: ['Premium Brake Pads', 'Brake Disc Rotor', 'All-Season Tyre', 'Summer Performance Tyre', 'Winter Snow Tyre'],
	},
	{
		categorySlug: 'car-care', vendorName: '3M Company', unit: 'unit', variantType: 'none',
		brands: ["Meguiar's", 'Chemical Guys', '3M Company', 'Turtle Wax', 'Armor All', 'Mothers'],
		types: ['Car Wash Shampoo', 'Clay Bar Kit', 'Carnauba Car Wax', 'Paint Sealant', 'Wheel Cleaner', 'Tyre Dressing'],
	},
	{
		categorySlug: 'interior-accessories', vendorName: '3M Company', unit: 'unit', variantType: 'colour',
		brands: ['FH Group', 'BDK', 'WeatherTech', 'Motor Trend', 'Gorilla Grip'],
		types: ['Universal Seat Covers', 'All-Weather Floor Mats', 'Steering Wheel Cover', 'Car Seat Organiser', 'Sunshade'],
	},
	{
		categorySlug: 'exterior-accessories', vendorName: '3M Company', unit: 'unit', variantType: 'none',
		brands: ['3M Company', 'Covercraft', 'Classic Accessories', 'Lund', 'AVS'],
		types: ['Car Cover', 'Bug Deflector', 'Door Edge Guards', 'Mud Flaps', 'Roof Cargo Carrier'],
	},
	{
		categorySlug: 'car-electronics', vendorName: 'Garmin Ltd.', unit: 'unit', variantType: 'none',
		brands: ['Garmin Ltd.', 'Vantrue', 'Nextbase', 'Pioneer', 'Kenwood', 'Cobra'],
		types: ['Dash Camera 4K', 'GPS Navigation Unit', 'Bluetooth Car Kit', 'Reverse Camera', 'Portable Jump Starter'],
	},
	// ── Office & Stationery ───────────────────────────────────────────────────
	{
		categorySlug: 'writing-instruments', vendorName: '3M Company', unit: 'pack', variantType: 'colour',
		brands: ['Pilot', 'Parker', 'Staedtler', 'Uni-ball', 'Pentel', 'BIC', 'Sharpie'],
		types: ['Ballpoint Pen Set', 'Fountain Pen', 'Gel Ink Pen Set', 'Mechanical Pencil Set', 'Permanent Marker Set', 'Highlighter Set'],
	},
	{
		categorySlug: 'paper-products', vendorName: '3M Company', unit: 'pack', variantType: 'none',
		brands: ['Moleskine', 'Leuchtturm1917', 'Rhodia', 'Clairefontaine', 'Muji'],
		types: ['A5 Hardcover Notebook', 'A4 Ruled Pad', 'Sticky Note Set', 'Index Cards', 'Graph Paper Pad'],
	},
	{
		categorySlug: 'desk-accessories', vendorName: '3M Company', unit: 'unit', variantType: 'colour',
		brands: ['Swingline', 'Scotch', 'Avery', 'Poppin', 'Fellowes'],
		types: ['Desktop Stapler', 'Paper Shredder', 'Filing Cabinet', 'Desk Organiser Tray', 'Laminator'],
	},
	{
		categorySlug: 'printers-scanners', vendorName: 'HP Inc.', unit: 'unit', variantType: 'none',
		brands: ['HP Inc.', 'Canon', 'Epson', 'Brother', 'Xerox'],
		types: ['Inkjet Printer', 'Laser Printer', 'All-in-One Printer', 'Colour Laser Printer', 'Portable Scanner'],
	},
	{
		categorySlug: 'storage-devices', vendorName: 'Samsung Electronics', unit: 'unit', variantType: 'none',
		brands: ['Samsung Electronics', 'SanDisk', 'Western Digital', 'Seagate', 'Kingston', 'LaCie'],
		types: ['Portable SSD 1TB', 'Portable SSD 2TB', 'USB Flash Drive 128GB', 'External HDD 4TB', 'NAS Storage'],
	},
	{
		categorySlug: 'office-electronics', vendorName: 'Casio', unit: 'unit', variantType: 'none',
		brands: ['Casio', 'Texas Instruments', 'HP Inc.', 'Fellowes', 'Kensington'],
		types: ['Scientific Calculator', 'Graphing Calculator', 'Paper Shredder', 'Laminator A4', 'Label Maker'],
	},
	// ── Health & Wellness ─────────────────────────────────────────────────────
	{
		categorySlug: 'vitamins-minerals', vendorName: 'Omron Healthcare', unit: 'bottle', variantType: 'none',
		brands: ['Nature Made', 'NOW Foods', 'Garden of Life', 'Solgar', 'Swisse', 'Holland & Barrett'],
		types: ['Vitamin C 1000mg', 'Vitamin D3 2000IU', 'Multivitamin', 'Zinc Supplement', 'Magnesium 400mg', 'B-Complex Vitamins'],
	},
	{
		categorySlug: 'protein-supplements', vendorName: 'Omron Healthcare', unit: 'kg', variantType: 'none',
		brands: ['Optimum Nutrition', 'Myprotein', 'BSN', 'MuscleTech', 'Dymatize', 'Bulk'],
		types: ['Whey Protein Powder', 'Casein Protein', 'Plant Protein Blend', 'Mass Gainer', 'BCAA Powder', 'Creatine Monohydrate'],
	},
	{
		categorySlug: 'herbal-supplements', vendorName: 'Omron Healthcare', unit: 'bottle', variantType: 'none',
		brands: ['NOW Foods', 'Gaia Herbs', 'Nature\'s Way', 'Herb Pharm', 'Traditional Medicinals'],
		types: ['Turmeric & Ginger Capsules', 'Ashwagandha Extract', 'Echinacea Immune Support', 'Valerian Root', 'Elderberry Gummies'],
	},
	{
		categorySlug: 'monitoring-devices', vendorName: 'Omron Healthcare', unit: 'unit', variantType: 'none',
		brands: ['Omron Healthcare', 'Withings', 'Beurer', 'A&D Medical', 'iHealth'],
		types: ['Upper Arm Blood Pressure Monitor', 'Wrist BP Monitor', 'Digital Thermometer', 'Blood Glucose Monitor', 'Pulse Oximeter'],
	},
	{
		categorySlug: 'first-aid', vendorName: '3M Company', unit: 'kit', variantType: 'none',
		brands: ['3M Company', 'Johnson & Johnson', 'Nexcare', 'Curad', 'Smith & Nephew'],
		types: ['First Aid Kit 100-Piece', 'Bandage Variety Pack', 'Antiseptic Wound Spray', 'Instant Cold Pack', 'Elastic Bandage Roll'],
	},
	{
		categorySlug: 'mobility-aids', vendorName: 'Omron Healthcare', unit: 'unit', variantType: 'size',
		brands: ['Drive Medical', 'Medline', 'Hugo Mobility', 'Nova Medical'],
		types: ['Folding Cane', 'Quad Cane', 'Rollator Walker', 'Forearm Crutches', 'Knee Scooter'],
	},
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
interface CategoryRow { slug: string; id: string }

/** Recursively seed categories and collect slug→id mapping */
async function seedCategories(
	nodes: CategoryNode[],
	parentId: string | null,
	acc: Map<string, string>,
	order = 0,
): Promise<void> {
	for (const node of nodes) {
		let cat = await prisma.category.findUnique({ where: { slug: node.slug } });
		if (!cat) {
			cat = await prisma.category.create({
				data: {
					name: node.name,
					slug: node.slug,
					description: node.description,
					parentId,
					sortOrder: order++,
				},
			});
		}
		acc.set(node.slug, cat.id);
		if (node.children) {
			await seedCategories(node.children, cat.id, acc, 0);
		}
	}
}

interface Combo {
	name: string;
	vendorId: string;
	categoryId: string;
	categorySlug: string;
	unit: string;
	variantType: VariantType;
	dimensions: { lengthCm: number; widthCm: number; heightCm: number };
	isFragile: boolean;
	lowStockThreshold: number;
}

function buildCombos(
	vendorMap: Map<string, string>,
	categoryMap: Map<string, string>,
): Combo[] {
	const combos: Combo[] = [];
	let idx = 0;
	for (const tmpl of PRODUCT_TEMPLATES) {
		const vendorId = vendorMap.get(tmpl.vendorName);
		const categoryId = categoryMap.get(tmpl.categorySlug);
		if (!vendorId) throw new Error(`Vendor not found: ${tmpl.vendorName}`);
		if (!categoryId) throw new Error(`Category slug not found: ${tmpl.categorySlug}`);
		const dim = CATEGORY_DIMENSIONS[tmpl.categorySlug] ?? DEFAULT_DIMENSIONS;
		for (const brand of tmpl.brands) {
			for (const type of tmpl.types) {
				combos.push({
					name: `${brand} ${type}`,
					vendorId,
					categoryId,
					categorySlug: tmpl.categorySlug,
					unit: tmpl.unit,
					variantType: tmpl.variantType,
					dimensions: { lengthCm: dim.lengthCm, widthCm: dim.widthCm, heightCm: dim.heightCm },
					isFragile: dim.isFragile,
					lowStockThreshold: 5 + (idx % 45),
				});
				idx++;
			}
		}
	}
	return combos;
}

function getSkuName(baseName: string, edition: number): string {
	if (edition === 0) return baseName;
	if (edition <= EDITION_SUFFIXES.length) return `${baseName} ${EDITION_SUFFIXES[edition - 1]}`;
	return `${baseName} Series ${edition - EDITION_SUFFIXES.length + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
	console.log('🚀 Starting stress test seed (200,000 realistic products)...');

	// ── Units of Measure ──────────────────────────────────────────────────────
	const unitsToCreate = [
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

	let unitsCreated = 0;
	for (const unitEntry of unitsToCreate) {
		const existing = await prisma.unitOfMeasure.findUnique({ where: { name: unitEntry.name } });
		if (!existing) {
			await prisma.unitOfMeasure.create({
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
		}
	}
	console.log(`✅ Ensured ${unitsToCreate.length} units of measure (${unitsCreated} created)`);

	// ── Vendors ───────────────────────────────────────────────────────────────
	const vendorMap = new Map<string, string>();
	for (const vd of VENDOR_DATA) {
		let vendor = await prisma.vendor.findFirst({ where: { name: vd.name } });
		if (!vendor) {
			vendor = await prisma.vendor.create({ data: { name: vd.name, contactEmail: vd.contactEmail, type: vd.type } });
		}
		vendorMap.set(vd.name, vendor.id);
	}
	console.log(`✅ Ensured ${VENDOR_DATA.length} vendors`);

	// ── Category hierarchy ────────────────────────────────────────────────────
	const categoryMap = new Map<string, string>();
	await seedCategories(CATEGORY_TREE, null, categoryMap);
	const l1Count = CATEGORY_TREE.length;
	const l2Count = CATEGORY_TREE.reduce((s, n) => s + (n.children?.length ?? 0), 0);
	const l3Count = CATEGORY_TREE.reduce((s, n) => s + (n.children ?? []).reduce((s2, n2) => s2 + (n2.children?.length ?? 0), 0), 0);
	console.log(`✅ Ensured ${categoryMap.size} categories (L1: ${l1Count}, L2: ${l2Count}, L3: ${l3Count})`);

	// ── Attributes: Colour + Size ─────────────────────────────────────────────
	let colourAttr = await prisma.attribute.findUnique({ where: { name: 'Colour' } });
	if (!colourAttr) {
		colourAttr = await prisma.attribute.create({ data: { name: 'Colour', type: 'color', sortOrder: 0 } });
	}
	const colourValueMap = new Map<string, string>(); // colour label → attributeValue.id
	for (let i = 0; i < ALL_COLOURS.length; i++) {
		const label = ALL_COLOURS[i];
		let av = await prisma.attributeValue.findUnique({
			where: { attributeId_representedValue: { attributeId: colourAttr.id, representedValue: label } },
		});
		if (!av) {
			av = await prisma.attributeValue.create({
				data: { attributeId: colourAttr.id, displayName: label, representedValue: label, sortOrder: i },
			});
		}
		colourValueMap.set(label, av.id);
	}

	let sizeAttr = await prisma.attribute.findUnique({ where: { name: 'Size' } });
	if (!sizeAttr) {
		sizeAttr = await prisma.attribute.create({ data: { name: 'Size', type: 'dropdown', sortOrder: 1 } });
	}
	const sizeValueMap = new Map<string, string>(); // size label → attributeValue.id
	for (let i = 0; i < ALL_SIZES.length; i++) {
		const label = ALL_SIZES[i];
		let av = await prisma.attributeValue.findUnique({
			where: { attributeId_representedValue: { attributeId: sizeAttr.id, representedValue: label } },
		});
		if (!av) {
			av = await prisma.attributeValue.create({
				data: { attributeId: sizeAttr.id, displayName: label, representedValue: label, sortOrder: i },
			});
		}
		sizeValueMap.set(label, av.id);
	}
	console.log(`✅ Ensured Colour attribute (${ALL_COLOURS.length} values) and Size attribute (${ALL_SIZES.length} values)`);

	// ── Tags ──────────────────────────────────────────────────────────────────
	const tagMap = new Map<string, string>();
	for (const td of TAG_DATA) {
		let tag = await prisma.tag.findUnique({ where: { name: td.name } });
		if (!tag) {
			tag = await prisma.tag.create({ data: { name: td.name, color: td.color } });
		}
		tagMap.set(td.name, tag.id);
	}
	const tagIds = Array.from(tagMap.values());
	console.log(`✅ Ensured ${TAG_DATA.length} tags`);

	// ── Branch ────────────────────────────────────────────────────────────────
	let branch = await prisma.branch.findFirst({ where: { code: 'STRESS-01' } });
	if (!branch) {
		branch = await prisma.branch.create({
			data: { name: 'Stress Test Branch', code: 'STRESS-01', address: '1 Warehouse Road', isDefault: false },
		});
		console.log('✅ Created stress test branch');
	} else {
		console.log('⏭️  Stress test branch already exists, skipping');
	}

	// ── Floors ────────────────────────────────────────────────────────────────
	const floorIds: string[] = [];
	for (let f = 1; f <= FLOORS; f++) {
		const code = `ST-F${f}`;
		let floor = await prisma.floor.findFirst({ where: { branchId: branch.id, code } });
		if (!floor) {
			floor = await prisma.floor.create({
				data: {
					branchId: branch.id,
					name: `Warehouse Floor ${f}`,
					code,
					floorNumber: f,
					// 60 m × 40 m per floor  → renders as ~183 × 122 scene units in the 3D visualiser
					length: 60,
					width: 40,
				},
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
					data: {
						floorId: floorIds[f],
						name: `Floor ${f + 1} Rack ${r}`,
						code,
						widthCm: 120,
						heightCm: 220,
						depthCm: 50,
					},
				});
			}
			rackIds.push(rack.id);
		}
	}
	console.log(`✅ Ensured ${rackIds.length} racks (${RACKS_PER_FLOOR} per floor)`);

	// ── Shelves ───────────────────────────────────────────────────────────────
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
						rackId: rackIds[ri],
						name: `Floor ${floorIndex + 1} Rack ${rackNum} Shelf ${s}`,
						code,
						// Standard industrial shelf level: 1.2 m wide × 0.5 m deep × 0.5 m clear height
						// Fits nearly all consumer-goods packaging (up to 45 cm height/depth)
						height: 0.5,
						width: 1.2,
						length: 0.5,
					},
				});
			}
			shelfIds.push(shelf.id);
		}
	}
	console.log(`✅ Ensured ${shelfIds.length} shelves (${SHELVES_PER_RACK} per rack)`);

	// ── Build combo list ──────────────────────────────────────────────────────
	const combos = buildCombos(vendorMap, categoryMap);
	console.log(`📋 Built ${combos.length} unique brand×type combinations`);

	// ── Admin user (required for GRN.createdBy / InventoryEvent.userId) ───────
	const seederUser = await prisma.user.findFirst({ where: { role: 'Admin' } });
	if (!seederUser) {
		throw new Error('No Admin user found. Run the main seeder first: npm run prisma:seed');
	}
	const vendorIds = Array.from(vendorMap.values());

	// ── SKUs + Variants + SKUVariantValues + GRNs + Inventory ─────────────────
	const existingCount = await prisma.sKU.count({ where: { skuCode: { startsWith: 'PROD-' } } });
	const toCreate = TOTAL_SKUS - existingCount;

	if (toCreate <= 0) {
		console.log(`⏭️  ${existingCount} product SKUs already exist, skipping`);
	} else {
		console.log(`📦 Creating ${toCreate} SKUs in batches of ${BATCH_SIZE} (1 GRN per batch)...`);

		// Capture attribute IDs for variant value rows
		const colourAttrId = colourAttr.id;
		const sizeAttrId = sizeAttr.id;

		let created = 0;
		let batchNum = Math.floor(existingCount / BATCH_SIZE); // continue numbering if partial re-run
		while (created < toCreate) {
			const batchCount = Math.min(BATCH_SIZE, toCreate - created);
			const startIndex = existingCount + created;
			batchNum++;

			// ── GRN for this batch delivery ───────────────────────────────────
			const grnRef = `GRN-STRESS-${String(batchNum).padStart(5, '0')}`;
			const supplierId = vendorIds[batchNum % vendorIds.length];
			const deliveryDate = new Date(Date.now() - batchNum * 24 * 60 * 60 * 1000);
			let grn = await prisma.gRN.findFirst({ where: { invoiceReference: grnRef } });
			if (!grn) {
				grn = await prisma.gRN.create({
					data: {
						supplierId,
						invoiceReference: grnRef,
						status: 'Closed',
						deliveryDate,
						supplierInvoiceDate: deliveryDate,
						expectedDeliveryDate: deliveryDate,
						notes: `Stress-test batch delivery ${batchNum}`,
						createdBy: seederUser.id,
						createdAt: deliveryDate,
					},
				});
			}

			// ── Inventory event (one per GRN / batch) ─────────────────────────
			const invEvent = await prisma.inventoryEvent.create({
				data: {
					eventType: 'GRN_CREATED',
					parentEntityId: grn.id,
					quantityDelta: batchCount * 50,
					beforeQuantity: 0,
					afterQuantity: batchCount * 50,
					userId: seederUser.id,
					timestamp: deliveryDate,
					metadata: { batchNum, grnRef, batchSize: batchCount },
				},
			});

			// ── Build SKU metadata for this batch ────────────────────────────
			interface BatchMeta {
				skuCode: string;
				name: string;
				vendorId: string;
				categoryId: string;
				unitOfMeasure: string;
				variantType: VariantType;
				dimensions: { lengthCm: number; widthCm: number; heightCm: number };
				isFragile: boolean;
				lowStockThreshold: number;
				conversionRules: object;
				batchPricing: object;
			}
			const batchMeta: BatchMeta[] = Array.from({ length: batchCount }, (_, i) => {
				const globalIndex = startIndex + i;
				const comboIdx = globalIndex % combos.length;
				const edition = Math.floor(globalIndex / combos.length);
				const combo = combos[comboIdx];
				const costPrice = Math.round((5 + ((globalIndex * 17 + 31) % 500) * 0.8) * 100) / 100;
				return {
					skuCode: `PROD-${String(globalIndex + 1).padStart(6, '0')}`,
					name: getSkuName(combo.name, edition),
					vendorId: combo.vendorId,
					categoryId: combo.categoryId,
					unitOfMeasure: combo.unit,
					variantType: combo.variantType,
					dimensions: combo.dimensions,
					isFragile: combo.isFragile,
					lowStockThreshold: combo.lowStockThreshold,
					conversionRules: UNIT_CONVERSIONS[combo.unit] ?? { unitToBox: 6 },
					batchPricing: {
						defaultCost: costPrice,
						defaultSelling: Math.round(costPrice * 1.8 * 100) / 100,
						defaultWholesale: Math.round(costPrice * 1.35 * 100) / 100,
						defaultBulk: Math.round(costPrice * 1.15 * 100) / 100,
						currency: 'LKR',
					},
				};
			});

			// ── Insert SKUs ───────────────────────────────────────────────────
			const skuRows = batchMeta.map(({ variantType: _vt, ...rest }) => rest);
			await prisma.sKU.createMany({ data: skuRows, skipDuplicates: true });

			// ── Fetch newly inserted SKU IDs ──────────────────────────────────
			const skus: Array<{ id: string; skuCode: string }> = await prisma.sKU.findMany({
				where: { skuCode: { in: skuRows.map(s => s.skuCode) } },
				select: { id: true, skuCode: true },
			});
			const skuByCode = new Map(skus.map((s: { id: string; skuCode: string }) => [s.skuCode, s.id]));

			// ── SKUVendor entries (primary + 1 additional vendor) ──────────
			const skuVendorRows: Array<{ skuId: string; vendorId: string }> = [];
			for (let i = 0; i < batchMeta.length; i++) {
				const meta = batchMeta[i];
				const skuId = skuByCode.get(meta.skuCode);
				if (!skuId) continue;
				const globalIdx = startIndex + i;
				skuVendorRows.push({ skuId, vendorId: meta.vendorId });
				const extraVendorId = vendorIds[(globalIdx * 7 + 3) % vendorIds.length];
				if (extraVendorId !== meta.vendorId) {
					skuVendorRows.push({ skuId, vendorId: extraVendorId });
				}
			}
			await prisma.sKUVendor.createMany({ data: skuVendorRows, skipDuplicates: true });

			// ── SKUTag entries (~50% of SKUs get 1-2 tags) ────────────────
			const skuTagRows: Array<{ skuId: string; tagId: string }> = [];
			for (let i = 0; i < batchMeta.length; i++) {
				const globalIdx = startIndex + i;
				if (globalIdx % 2 === 0) continue;
				const skuId = skuByCode.get(batchMeta[i].skuCode);
				if (!skuId) continue;
				const tagCount = 1 + (globalIdx % 2);
				for (let t = 0; t < tagCount; t++) {
					skuTagRows.push({ skuId, tagId: tagIds[(globalIdx * 3 + t * 7) % tagIds.length] });
				}
			}
			if (skuTagRows.length > 0) {
				await prisma.sKUTag.createMany({ data: skuTagRows, skipDuplicates: true });
			}

			// ── SKUAttribute + SKUAttributeValue (for variant SKUs) ───────
			const skuAttrRows: Array<{ skuId: string; attributeId: string }> = [];
			for (const meta of batchMeta) {
				const skuId = skuByCode.get(meta.skuCode);
				if (!skuId || meta.variantType === 'none') continue;
				if (meta.variantType === 'colour' || meta.variantType === 'colour-size') {
					skuAttrRows.push({ skuId, attributeId: colourAttrId });
				}
				if (meta.variantType === 'size' || meta.variantType === 'colour-size') {
					skuAttrRows.push({ skuId, attributeId: sizeAttrId });
				}
			}
			if (skuAttrRows.length > 0) {
				await prisma.sKUAttribute.createMany({ data: skuAttrRows, skipDuplicates: true });
				const variantSkuIds = batchMeta
					.filter(m => m.variantType !== 'none')
					.map(m => skuByCode.get(m.skuCode))
					.filter(Boolean) as string[];
				const savedSkuAttrs = await prisma.sKUAttribute.findMany({
					where: { skuId: { in: variantSkuIds } },
					select: { id: true, skuId: true, attributeId: true },
				});
				const skuAttrValueRows: Array<{ skuAttributeId: string; attributeValueId: string }> = [];
				for (const sa of savedSkuAttrs) {
					const meta = batchMeta.find(m => skuByCode.get(m.skuCode) === sa.skuId);
					if (!meta) continue;
					if (sa.attributeId === colourAttrId) {
						const colours = meta.variantType === 'colour-size' ? MULTI_COLOURS : ALL_COLOURS;
						for (const c of colours) {
							const avId = colourValueMap.get(c);
							if (avId) skuAttrValueRows.push({ skuAttributeId: sa.id, attributeValueId: avId });
						}
					} else if (sa.attributeId === sizeAttrId) {
						const sizes = meta.variantType === 'colour-size' ? MULTI_SIZES : ALL_SIZES;
						for (const s of sizes) {
							const avId = sizeValueMap.get(s);
							if (avId) skuAttrValueRows.push({ skuAttributeId: sa.id, attributeValueId: avId });
						}
					}
				}
				if (skuAttrValueRows.length > 0) {
					await prisma.sKUAttributeValue.createMany({ data: skuAttrValueRows, skipDuplicates: true });
				}
			}

			// ── Product barcodes (EAN13-style, one per SKU) ───────────────
			const barcodeRows = batchMeta.map((meta, i) => {
				const skuId = skuByCode.get(meta.skuCode);
				if (!skuId) return null;
				const globalIdx = startIndex + i;
				return {
					skuId,
					barcode: `200${String(globalIdx + 1).padStart(10, '0')}`,
					barcodeType: 'EAN13',
					isDefault: true,
				};
			}).filter(Boolean) as Array<{ skuId: string; barcode: string; barcodeType: string; isDefault: boolean }>;
			await prisma.productBarcode.createMany({ data: barcodeRows, skipDuplicates: true });

			// ── Batch records (1 per SKU with pricing) ────────────────────
			const batchDataRows = batchMeta.map((meta) => {
				const skuId = skuByCode.get(meta.skuCode);
				if (!skuId) return null;
				const pricing = meta.batchPricing as { defaultCost: number; defaultSelling: number; defaultWholesale: number; defaultBulk: number };
				return {
					batchNumber: `${meta.skuCode}-B001`,
					skuId,
					sequenceNumber: 1,
					costPrice: pricing.defaultCost,
					sellingPrice: pricing.defaultSelling,
					wholesalePrice: pricing.defaultWholesale,
					bulkPrice: pricing.defaultBulk,
					currency: 'LKR',
					vendorId: meta.vendorId,
				};
			}).filter(Boolean) as Array<{
				batchNumber: string; skuId: string; sequenceNumber: number;
				costPrice: number; sellingPrice: number; wholesalePrice: number; bulkPrice: number;
				currency: string; vendorId: string;
			}>;
			await prisma.batch.createMany({ data: batchDataRows, skipDuplicates: true });

			// Fetch batch IDs for linking to GRN lines and inventory
			const savedBatches = await prisma.batch.findMany({
				where: { batchNumber: { in: batchDataRows.map(b => b.batchNumber) } },
				select: { id: true, batchNumber: true, costPrice: true, sellingPrice: true, wholesalePrice: true, bulkPrice: true },
			});
			const batchByNumber = new Map(savedBatches.map(b => [b.batchNumber, b]));

			// ── GRN lines (with pricing + batch linkage) ──────────────────
			await prisma.gRNLine.createMany({
				data: skus.map(sku => {
					const meta = batchMeta.find(m => m.skuCode === (skus.find(s => s.id === sku.id)?.skuCode ?? ''));
					const batch = batchByNumber.get(`${meta?.skuCode ?? ''}-B001`);
					return {
						grnId: grn!.id,
						skuId: sku.id,
						batchId: batch?.id ?? null,
						expectedQuantity: 50,
						receivedQuantity: 50,
						costPrice: batch?.costPrice ?? null,
						sellingPrice: batch?.sellingPrice ?? null,
						wholesalePrice: batch?.wholesalePrice ?? null,
						bulkPrice: batch?.bulkPrice ?? null,
					};
				}),
				skipDuplicates: true,
			});

			// ── Inspection records (every 10th SKU has 2 rejected) ────────
			const grnLinesForBatch = await prisma.gRNLine.findMany({
				where: { grnId: grn!.id, skuId: { in: skus.map(s => s.id) } },
				select: { id: true, receivedQuantity: true },
			});
			const inspectionRows = grnLinesForBatch.map((line, idx) => ({
				grnLineId: line.id,
				approvedQuantity: Math.max(0, line.receivedQuantity - (idx % 10 === 0 ? 2 : 0)),
				rejectedQuantity: idx % 10 === 0 ? 2 : 0,
				damageClassification: idx % 10 === 0 ? 'Minor' : null,
				inspectorUserId: seederUser.id,
				timestamp: deliveryDate,
				remarks: idx % 10 === 0 ? 'Minor packaging damage on arrival' : null,
			}));
			await prisma.inspectionRecord.createMany({ data: inspectionRows, skipDuplicates: true });

			// ── Build variant rows (in-memory) ────────────────────────────────
			interface VariantMeta {
				variantCode: string;
				skuId: string;
				name: string;
				colour?: string;   // only if colour or colour-size
				size?: string;     // only if size or colour-size
			}
			const variantMetas: VariantMeta[] = [];

			for (const meta of batchMeta) {
				const skuId = skuByCode.get(meta.skuCode);
				if (!skuId) continue;

				if (meta.variantType === 'colour') {
					for (const colour of ALL_COLOURS) {
						const tag = colour.replace(/\s+/g, '');
						variantMetas.push({
							variantCode: `${meta.skuCode}-${tag}`,
							skuId,
							name: `${meta.name} - ${colour}`,
							colour,
						});
					}
				} else if (meta.variantType === 'size') {
					for (const size of ALL_SIZES) {
						variantMetas.push({
							variantCode: `${meta.skuCode}-${size}`,
							skuId,
							name: `${meta.name} - Size ${size}`,
							size,
						});
					}
				} else if (meta.variantType === 'colour-size') {
					for (const colour of MULTI_COLOURS) {
						for (const size of MULTI_SIZES) {
							const tag = `${colour.replace(/\s+/g, '')}-${size}`;
							variantMetas.push({
								variantCode: `${meta.skuCode}-${tag}`,
								skuId,
								name: `${meta.name} - ${colour} / ${size}`,
								colour,
								size,
							});
						}
					}
				}
			}

			// ── Insert SKUVariant rows ────────────────────────────────────────
			if (variantMetas.length > 0) {
				await prisma.sKUVariant.createMany({
					data: variantMetas.map(vm => ({ skuId: vm.skuId, variantCode: vm.variantCode, name: vm.name })),
					skipDuplicates: true,
				});

				// ── Fetch variant IDs and create SKUVariantValue rows ─────────
				const savedVariants: Array<{ id: string; variantCode: string }> = await prisma.sKUVariant.findMany({
					where: { variantCode: { in: variantMetas.map(vm => vm.variantCode) } },
					select: { id: true, variantCode: true },
				});
				const variantIdByCode = new Map(savedVariants.map((v: { id: string; variantCode: string }) => [v.variantCode, v.id]));

				const variantValueRows: Array<{ variantId: string; attributeId: string; attributeValueId: string }> = [];
				for (const vm of variantMetas) {
					const variantId = variantIdByCode.get(vm.variantCode);
					if (!variantId) continue;
					if (vm.colour) {
						const avId = colourValueMap.get(vm.colour);
						if (avId) variantValueRows.push({ variantId, attributeId: colourAttrId, attributeValueId: avId });
					}
					if (vm.size) {
						const avId = sizeValueMap.get(vm.size);
						if (avId) variantValueRows.push({ variantId, attributeId: sizeAttrId, attributeValueId: avId });
					}
				}

				if (variantValueRows.length > 0) {
					await prisma.sKUVariantValue.createMany({ data: variantValueRows, skipDuplicates: true });
				}
			}

			// ── Inventory records (one per SKU, linked to GRN event + batch) ──
			const inventoryBatch = skus.map((sku, idx) => {
				const globalIdx = startIndex + idx;
				const shelfIdx = globalIdx % shelfIds.length;
				const floorIdx = Math.min(
					Math.floor(shelfIdx / (RACKS_PER_FLOOR * SHELVES_PER_RACK)),
					floorIds.length - 1,
				);
				const batch = batchByNumber.get(`${batchMeta[idx].skuCode}-B001`);
				return {
					skuId: sku.id,
					batchId: batch?.id ?? null,
					floorId: floorIds[floorIdx],
					shelfId: shelfIds[shelfIdx],
					quantity: Math.floor(Math.random() * 200) + 1,
					state: INVENTORY_STATES[globalIdx % INVENTORY_STATES.length],
					sourceEventId: invEvent.id,
					userId: seederUser.id,
				};
			});
			await prisma.inventoryRecord.createMany({ data: inventoryBatch, skipDuplicates: true });

			created += batchCount;
			process.stdout.write(
				`\r  Progress: ${existingCount + created}/${TOTAL_SKUS} SKUs` +
				`  (batch ${batchNum} | ${variantMetas.length} variants this batch)`,
			);
		}
		console.log(`\n✅ ${batchNum} GRNs created — every inventory record is backed by a GRN`);
		console.log('✅ SKUs, variants, batches, barcodes, tags, vendor links, inspections, and inventory records created');
	}

	// ── Pricing Overlays ──────────────────────────────────────────────────────
	const overlayDefs = [
		{ name: 'Summer Sale 10%', description: 'Summer seasonal discount', type: 'percentage_discount', value: 10, appliesTo: { categoryIds: [] as string[] }, conditions: {}, priority: 1, stackable: false, status: 'active' },
		{ name: 'Bulk Purchase 5% Off', description: 'Discount for bulk orders', type: 'percentage_discount', value: 5, appliesTo: { categoryIds: [] as string[] }, conditions: { minQty: 100 }, priority: 2, stackable: true, status: 'active' },
		{ name: 'Premium Markup 15%', description: 'Premium category markup', type: 'percentage_markup', value: 15, appliesTo: { categoryIds: [] as string[] }, conditions: {}, priority: 3, stackable: false, status: 'active' },
		{ name: 'Clearance 30% Off', description: 'Clearance items deep discount', type: 'percentage_discount', value: 30, appliesTo: { categoryIds: [] as string[] }, conditions: {}, priority: 4, stackable: false, status: 'active' },
		{ name: 'New Customer $5 Off', description: 'New customer flat discount', type: 'fixed_discount', value: 5, appliesTo: { categoryIds: [] as string[] }, conditions: { customerGroups: ['new'] }, priority: 5, stackable: true, status: 'active' },
		{ name: 'Holiday Special 20%', description: 'Holiday season promotion', type: 'percentage_discount', value: 20, appliesTo: { categoryIds: [] as string[] }, conditions: {}, priority: 1, stackable: false, status: 'scheduled', validFrom: new Date('2026-12-15'), validTo: new Date('2027-01-05') },
		{ name: 'Electronics Markup $10', description: 'Fixed markup on electronics', type: 'fixed_markup', value: 10, appliesTo: { categoryIds: [] as string[] }, conditions: {}, priority: 6, stackable: true, status: 'active' },
		{ name: 'Wholesale Tier 1', description: 'Wholesale pricing tier 1', type: 'percentage_discount', value: 15, appliesTo: { categoryIds: [] as string[] }, conditions: { customerGroups: ['wholesale'], minQty: 50 }, priority: 7, stackable: false, status: 'active' },
		{ name: 'Flash Sale 25%', description: 'Limited time flash sale', type: 'percentage_discount', value: 25, appliesTo: { categoryIds: [] as string[] }, conditions: {}, priority: 8, stackable: false, status: 'expired', validFrom: new Date('2026-03-01'), validTo: new Date('2026-03-07') },
		{ name: 'VIP Member 8%', description: 'VIP membership discount', type: 'percentage_discount', value: 8, appliesTo: { categoryIds: [] as string[] }, conditions: { customerGroups: ['vip'] }, priority: 9, stackable: true, status: 'active' },
	];

	const seederUserForPost = await prisma.user.findFirst({ where: { role: 'Admin' } });
	let overlaysCreated = 0;
	for (const def of overlayDefs) {
		const existing = await prisma.pricingOverlay.findFirst({ where: { name: def.name } });
		if (!existing) {
			await prisma.pricingOverlay.create({
				data: {
					name: def.name,
					description: def.description,
					type: def.type,
					value: def.value,
					appliesTo: def.appliesTo,
					conditions: def.conditions,
					priority: def.priority,
					stackable: def.stackable,
					status: def.status,
					validFrom: (def as any).validFrom ?? null,
					validTo: (def as any).validTo ?? null,
					createdBy: seederUserForPost?.id ?? null,
				},
			});
			overlaysCreated++;
		}
	}
	console.log(`✅ Ensured ${overlayDefs.length} pricing overlays (${overlaysCreated} created)`);

	// ── Storage Boxes (2 per every 10th shelf) ────────────────────────────────
	const boxShelfIndices = shelfIds.filter((_, i) => i % 10 === 0);
	let boxesCreated = 0;
	for (let si = 0; si < boxShelfIndices.length; si++) {
		const shelfId = boxShelfIndices[si];
		const floorIdx = Math.min(
			Math.floor(si * 10 / (RACKS_PER_FLOOR * SHELVES_PER_RACK)),
			floorIds.length - 1,
		);
		for (let b = 1; b <= 2; b++) {
			const code = `BOX-${String(si + 1).padStart(4, '0')}-${b}`;
			const existing = await prisma.storageBox.findFirst({ where: { code } });
			if (!existing) {
				await prisma.storageBox.create({
					data: {
						shelfId,
						floorId: floorIds[floorIdx],
						name: `Storage Box ${code}`,
						code,
						height: 0.3,
						width: 0.4,
						length: 0.3,
					},
				});
				boxesCreated++;
			}
		}
	}
	console.log(`✅ Ensured ${boxShelfIndices.length * 2} storage boxes (${boxesCreated} created)`);

	// ── Stock Transfers ───────────────────────────────────────────────────────
	const transferDefs = [
		{ refNum: 'ST-STRESS-001', fromFloorIdx: 0, toFloorIdx: 1, status: 'Completed', notes: 'Routine floor rebalancing' },
		{ refNum: 'ST-STRESS-002', fromFloorIdx: 1, toFloorIdx: 2, status: 'InTransit', notes: 'Overflow transfer' },
		{ refNum: 'ST-STRESS-003', fromFloorIdx: 2, toFloorIdx: 3, status: 'Approved', notes: 'Seasonal reorganisation' },
		{ refNum: 'ST-STRESS-004', fromFloorIdx: 3, toFloorIdx: 4, status: 'Pending', notes: 'New arrivals redistribution' },
		{ refNum: 'ST-STRESS-005', fromFloorIdx: 0, toFloorIdx: 4, status: 'Draft', notes: 'Proposed clearance move' },
	];

	let transfersCreated = 0;
	for (const td of transferDefs) {
		const existing = await prisma.stockTransfer.findFirst({ where: { referenceNumber: td.refNum } });
		if (!existing) {
			const sampleSkus = await prisma.sKU.findMany({
				where: { skuCode: { startsWith: 'PROD-' } },
				take: 5,
				skip: transfersCreated * 10,
				select: { id: true },
			});

			const transfer = await prisma.stockTransfer.create({
				data: {
					referenceNumber: td.refNum,
					fromBranchId: branch.id,
					toBranchId: branch.id,
					fromFloorId: floorIds[td.fromFloorIdx],
					toFloorId: floorIds[td.toFloorIdx],
					status: td.status,
					notes: td.notes,
					requestedBy: seederUserForPost!.id,
					approvedBy: td.status !== 'Draft' && td.status !== 'Pending' ? seederUserForPost!.id : null,
					approvedAt: td.status !== 'Draft' && td.status !== 'Pending' ? new Date() : null,
					completedAt: td.status === 'Completed' ? new Date() : null,
				},
			});

			if (sampleSkus.length > 0) {
				await prisma.stockTransferLine.createMany({
					data: sampleSkus.map((sku, i) => ({
						transferId: transfer.id,
						skuId: sku.id,
						requestedQty: 10 + i * 5,
						transferredQty: td.status === 'Completed' ? 10 + i * 5 : 0,
					})),
				});
			}
			transfersCreated++;
		}
	}
	console.log(`✅ Ensured ${transferDefs.length} stock transfers with lines (${transfersCreated} created)`);

	console.log('\n🎉 Stress test seed complete!');
	console.log(`   Branch       : ${branch.name} (${branch.code})`);
	console.log(`   Vendors      : ${VENDOR_DATA.length}`);
	console.log(`   Categories   : ${categoryMap.size} (${l1Count} L1 → ${l2Count} L2 → ${l3Count} L3)`);
	console.log(`   Tags         : ${TAG_DATA.length}`);
	console.log(`   Floors       : ${FLOORS}`);
	console.log(`   Racks        : ${rackIds.length} (${RACKS_PER_FLOOR}/floor)`);
	console.log(`   Shelves      : ${shelfIds.length} (${SHELVES_PER_RACK}/rack)`);
	console.log(`   Storage Boxes: ${boxShelfIndices.length * 2}`);
	console.log(`   SKUs         : ${TOTAL_SKUS.toLocaleString()} (with dimensions, pricing, barcodes, thresholds)`);
	console.log(`   SKUVendors   : ~${(TOTAL_SKUS * 1.5).toLocaleString()} (multi-vendor links)`);
	console.log(`   SKUTags      : ~${Math.floor(TOTAL_SKUS / 2).toLocaleString()} (50% of SKUs tagged)`);
	console.log(`   Batches      : ${TOTAL_SKUS.toLocaleString()} (1 per SKU with full pricing)`);
	console.log(`   Barcodes     : ${TOTAL_SKUS.toLocaleString()} (EAN13 per SKU)`);
	console.log(`   Variant types: colour-only (${ALL_COLOURS.length}/SKU), size-only (${ALL_SIZES.length}/SKU), colour+size (${MULTI_COLOURS.length}×${MULTI_SIZES.length}/SKU)`);
	console.log(`   GRNs         : 1 per batch of ${BATCH_SIZE} SKUs — all inventory backed by a GRN`);
	console.log(`   GRN lines    : ${TOTAL_SKUS.toLocaleString()} (with batch + pricing linkage)`);
	console.log(`   Inspections  : ${TOTAL_SKUS.toLocaleString()} (10% with rejected items)`);
	console.log(`   Inv. Records : ${TOTAL_SKUS.toLocaleString()} (linked to GRN event + batch)`);
	console.log(`   Overlays     : ${overlayDefs.length} pricing overlays`);
	console.log(`   Transfers    : ${transferDefs.length} stock transfers with lines`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
