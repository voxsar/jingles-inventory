import type { PrismaClient } from '@prisma/client';

type CatalogDefaultsDb = Pick<PrismaClient, 'unitOfMeasure' | 'tag' | 'attribute' | 'attributeValue'>;

export type UnitSeedEntry = {
	name: string;
	abbreviation: string;
	type: string;
	baseUnit?: string;
	conversionFactor?: number;
	isSystem: boolean;
};

export type AttributeSeedEntry = {
	name: string;
	type?: string;
	sortOrder?: number;
	values: { display: string; value: string; sortOrder?: number }[];
};

export const SYSTEM_UNIT_SEED_DATA: UnitSeedEntry[] = [
	{ name: 'Unit', abbreviation: 'unit', type: 'Count', isSystem: true },
	{ name: 'Piece', abbreviation: 'pc', type: 'Count', isSystem: true },
	{ name: 'Pair', abbreviation: 'pair', type: 'Count', baseUnit: 'Piece', conversionFactor: 2, isSystem: true },
	{ name: 'Dozen', abbreviation: 'doz', type: 'Count', baseUnit: 'Piece', conversionFactor: 12, isSystem: true },
	{ name: 'Pack', abbreviation: 'pack', type: 'Count', baseUnit: 'Piece', conversionFactor: 6, isSystem: true },
	{ name: 'Box', abbreviation: 'box', type: 'Count', baseUnit: 'Piece', conversionFactor: 12, isSystem: true },
	{ name: 'Carton', abbreviation: 'ctn', type: 'Count', baseUnit: 'Piece', conversionFactor: 24, isSystem: true },
	{ name: 'Case', abbreviation: 'case', type: 'Count', baseUnit: 'Piece', conversionFactor: 48, isSystem: true },
	{ name: 'Set', abbreviation: 'set', type: 'Count', isSystem: true },
	{ name: 'Bundle', abbreviation: 'bdl', type: 'Count', isSystem: true },
	{ name: 'Roll', abbreviation: 'roll', type: 'Count', isSystem: true },
	{ name: 'Gram', abbreviation: 'g', type: 'Weight', isSystem: true },
	{ name: 'Kilogram', abbreviation: 'kg', type: 'Weight', baseUnit: 'Gram', conversionFactor: 1000, isSystem: true },
	{ name: 'Milliliter', abbreviation: 'ml', type: 'Volume', isSystem: true },
	{ name: 'Liter', abbreviation: 'L', type: 'Volume', baseUnit: 'Milliliter', conversionFactor: 1000, isSystem: true },
	{ name: 'Centimeter', abbreviation: 'cm', type: 'Length', isSystem: true },
	{ name: 'Meter', abbreviation: 'm', type: 'Length', baseUnit: 'Centimeter', conversionFactor: 100, isSystem: true },
	{ name: 'Inch', abbreviation: 'in', type: 'Length', isSystem: true },
	{ name: 'Foot', abbreviation: 'ft', type: 'Length', baseUnit: 'Inch', conversionFactor: 12, isSystem: true },
];

export const DEFAULT_TAG_SEED = [
	{ name: 'New Arrival', color: '#22c55e' },
	{ name: 'Best Seller', color: '#f59e0b' },
	{ name: 'Premium', color: '#8b5cf6' },
	{ name: 'Fragile', color: '#f97316' },
	{ name: 'Clearance', color: '#ef4444' },
	{ name: 'Seasonal', color: '#06b6d4' },
	{ name: 'Limited Stock', color: '#eab308' },
	{ name: 'Imported', color: '#14b8a6' },
	{ name: 'Local', color: '#64748b' },
	{ name: 'Heavy', color: '#78716c' },
	{ name: 'Bulky', color: '#0f766e' },
	{ name: 'Temperature Controlled', color: '#0ea5e9' },
	{ name: 'Returnable', color: '#10b981' },
	{ name: 'Non-returnable', color: '#dc2626' },
];

export const DEFAULT_ATTRIBUTE_SEED: AttributeSeedEntry[] = [
	{
		name: 'Color',
		type: 'color',
		sortOrder: 0,
		values: [
			{ display: 'Carbon Black', value: '#111827', sortOrder: 0 },
			{ display: 'Arctic White', value: '#f9fafb', sortOrder: 1 },
			{ display: 'Midnight Blue', value: '#1e3a8a', sortOrder: 2 },
			{ display: 'Crimson Red', value: '#dc2626', sortOrder: 3 },
			{ display: 'Forest Green', value: '#166534', sortOrder: 4 },
			{ display: 'Silver', value: '#c0c0c0', sortOrder: 5 },
			{ display: 'Gold', value: '#d4af37', sortOrder: 6 },
			{ display: 'Natural', value: '#d6b98c', sortOrder: 7 },
			{ display: 'Purple', value: '#7e22ce', sortOrder: 8 },
		],
	},
	{
		name: 'Size',
		type: 'dropdown',
		sortOrder: 1,
		values: [
			{ display: 'Compact', value: 'compact', sortOrder: 0 },
			{ display: 'Standard', value: 'standard', sortOrder: 1 },
			{ display: 'Extended', value: 'extended', sortOrder: 2 },
			{ display: 'XS', value: 'xs', sortOrder: 3 },
			{ display: 'S', value: 's', sortOrder: 4 },
			{ display: 'M', value: 'm', sortOrder: 5 },
			{ display: 'L', value: 'l', sortOrder: 6 },
			{ display: 'XL', value: 'xl', sortOrder: 7 },
			{ display: 'One Size', value: 'one-size', sortOrder: 8 },
		],
	},
	{
		name: 'Material',
		type: 'dropdown',
		sortOrder: 2,
		values: [
			{ display: 'Plastic', value: 'plastic', sortOrder: 0 },
			{ display: 'Metal', value: 'metal', sortOrder: 1 },
			{ display: 'Glass', value: 'glass', sortOrder: 2 },
			{ display: 'Wood', value: 'wood', sortOrder: 3 },
			{ display: 'Ceramic', value: 'ceramic', sortOrder: 4 },
			{ display: 'Rubber', value: 'rubber', sortOrder: 5 },
			{ display: 'Cotton', value: 'cotton', sortOrder: 6 },
			{ display: 'Polyester', value: 'polyester', sortOrder: 7 },
			{ display: 'Leather', value: 'leather', sortOrder: 8 },
		],
	},
	{
		name: 'Pack Size',
		type: 'dropdown',
		sortOrder: 3,
		values: [
			{ display: 'Single', value: '1', sortOrder: 0 },
			{ display: 'Pair', value: '2', sortOrder: 1 },
			{ display: 'Pack of 3', value: '3', sortOrder: 2 },
			{ display: 'Pack of 6', value: '6', sortOrder: 3 },
			{ display: 'Pack of 12', value: '12', sortOrder: 4 },
			{ display: 'Bulk Pack', value: 'bulk', sortOrder: 5 },
		],
	},
	{
		name: 'Voltage',
		type: 'dropdown',
		sortOrder: 4,
		values: [
			{ display: '110V', value: '110v', sortOrder: 0 },
			{ display: '220V', value: '220v', sortOrder: 1 },
			{ display: '240V', value: '240v', sortOrder: 2 },
			{ display: 'Dual Voltage', value: 'dual-voltage', sortOrder: 3 },
		],
	},
	{
		name: 'Finish',
		type: 'dropdown',
		sortOrder: 5,
		values: [
			{ display: 'Matte', value: 'matte', sortOrder: 0 },
			{ display: 'Glossy', value: 'glossy', sortOrder: 1 },
			{ display: 'Brushed', value: 'brushed', sortOrder: 2 },
			{ display: 'Polished', value: 'polished', sortOrder: 3 },
		],
	},
];

export async function upsertDefaultUnits(db: CatalogDefaultsDb) {
	const unitMap = new Map<string, string>();

	for (const entry of SYSTEM_UNIT_SEED_DATA) {
		const unit = await db.unitOfMeasure.upsert({
			where: { name: entry.name },
			update: {
				abbreviation: entry.abbreviation,
				baseUnit: entry.baseUnit ?? null,
				conversionFactor: entry.conversionFactor ?? null,
				type: entry.type,
				isSystem: true,
				isActive: true,
			},
			create: {
				...entry,
				baseUnit: entry.baseUnit ?? null,
				conversionFactor: entry.conversionFactor ?? null,
				isActive: true,
			},
		});
		unitMap.set(entry.name, unit.id);
	}

	return unitMap;
}

export async function upsertDefaultTags(db: CatalogDefaultsDb) {
	const tagMap = new Map<string, string>();

	for (const tag of DEFAULT_TAG_SEED) {
		const created = await db.tag.upsert({
			where: { name: tag.name },
			update: { color: tag.color },
			create: { name: tag.name, color: tag.color },
		});
		tagMap.set(tag.name, created.id);
	}

	return tagMap;
}

export async function upsertDefaultAttributes(db: CatalogDefaultsDb) {
	const attributeMap = new Map<string, string>();
	const valueMap = new Map<string, Map<string, string>>();

	for (const attr of DEFAULT_ATTRIBUTE_SEED) {
		const attribute = await db.attribute.upsert({
			where: { name: attr.name },
			update: { type: attr.type ?? 'dropdown', sortOrder: attr.sortOrder ?? 0, isActive: true },
			create: { name: attr.name, type: attr.type ?? 'dropdown', sortOrder: attr.sortOrder ?? 0, isActive: true },
		});
		attributeMap.set(attr.name, attribute.id);

		const valuesForAttr = new Map<string, string>();
		for (const val of attr.values) {
			const createdValue = await db.attributeValue.upsert({
				where: { attributeId_representedValue: { attributeId: attribute.id, representedValue: val.value } },
				update: { displayName: val.display, sortOrder: val.sortOrder ?? 0, isActive: true },
				create: {
					attributeId: attribute.id,
					displayName: val.display,
					representedValue: val.value,
					sortOrder: val.sortOrder ?? 0,
					isActive: true,
				},
			});
			valuesForAttr.set(val.display, createdValue.id);
		}
		valueMap.set(attr.name, valuesForAttr);
	}

	return { attributeMap, valueMap };
}

export async function upsertCatalogDefaults(db: CatalogDefaultsDb) {
	const unitMap = await upsertDefaultUnits(db);
	const tagMap = await upsertDefaultTags(db);
	const { attributeMap, valueMap } = await upsertDefaultAttributes(db);

	return { unitMap, tagMap, attributeMap, valueMap };
}
