import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { convert, getConversionRatio, hasConversionRule, clearConversionCache } from '../../modules/conversion/unitConverter';
import { resetPrismaMocks } from '../mocks/prismaMock';
import prisma from '../../prisma/client';

// Mock database units
const mockUnits = [
	{ name: 'Piece', baseUnit: null, conversionFactor: null, isActive: true },
	{ name: 'Box', baseUnit: 'Piece', conversionFactor: 12, isActive: true },
	{ name: 'Pack', baseUnit: 'Piece', conversionFactor: 6, isActive: true },
	{ name: 'Gram', baseUnit: null, conversionFactor: null, isActive: true },
	{ name: 'Kilogram', baseUnit: 'Gram', conversionFactor: 1000, isActive: true },
	{ name: 'Milliliter', baseUnit: null, conversionFactor: null, isActive: true },
	{ name: 'Liter', baseUnit: 'Milliliter', conversionFactor: 1000, isActive: true },
	{ name: 'Centimeter', baseUnit: null, conversionFactor: null, isActive: true },
	{ name: 'Meter', baseUnit: 'Centimeter', conversionFactor: 100, isActive: true },
];

describe('convert - database-driven rules', () => {
	beforeAll(() => {
		resetPrismaMocks();
	});

	afterEach(() => {
		clearConversionCache();
		resetPrismaMocks();
		(prisma.unitOfMeasure.findMany as any).mockResolvedValue(mockUnits);
	});

	it('converts Box to Piece at 1:12', async () => {
		(prisma.unitOfMeasure.findMany as any).mockResolvedValue(mockUnits);
		expect(await convert(1, 'Box', 'Piece')).toBe(12);
		expect(await convert(5, 'Box', 'Piece')).toBe(60);
	});

	it('converts Pack to Piece at 1:6', async () => {
		expect(await convert(1, 'Pack', 'Piece')).toBe(6);
		expect(await convert(10, 'Pack', 'Piece')).toBe(60);
	});

	it('converts Liter to Milliliter at 1:1000', async () => {
		expect(await convert(1, 'Liter', 'Milliliter')).toBe(1000);
		expect(await convert(2.5, 'Liter', 'Milliliter')).toBe(2500);
	});

	it('converts Kilogram to Gram at 1:1000', async () => {
		expect(await convert(1, 'Kilogram', 'Gram')).toBe(1000);
		expect(await convert(0.5, 'Kilogram', 'Gram')).toBe(500);
	});

	it('converts Meter to Centimeter at 1:100', async () => {
		expect(await convert(1, 'Meter', 'Centimeter')).toBe(100);
		expect(await convert(3.5, 'Meter', 'Centimeter')).toBe(350);
	});

	it('supports reverse conversion: Piece to Box', async () => {
		expect(await convert(12, 'Piece', 'Box')).toBe(1);
		expect(await convert(24, 'Piece', 'Box')).toBe(2);
	});

	it('supports reverse conversion: Milliliter to Liter', async () => {
		expect(await convert(1000, 'Milliliter', 'Liter')).toBe(1);
	});

	it('returns same quantity when fromUnit equals toUnit', async () => {
		expect(await convert(10, 'Box', 'Box')).toBe(10);
		expect(await convert(42, 'Piece', 'Piece')).toBe(42);
	});

	it('throws when no conversion rule exists', async () => {
		await expect(convert(1, 'Box', 'Kilogram')).rejects.toThrow('No conversion rule found');
	});

	it('throws when converting to completely unrelated units', async () => {
		await expect(convert(1, 'Liter', 'Box')).rejects.toThrow();
	});
});

describe('convert - custom rules', () => {
	beforeAll(() => {
		resetPrismaMocks();
		(prisma.unitOfMeasure.findMany as any).mockResolvedValue(mockUnits);
	});

	afterEach(() => {
		clearConversionCache();
	});

	const customRules = [
		{ fromUnit: 'Box', toUnit: 'Piece', ratio: 24 },
		{ fromUnit: 'Pallet', toUnit: 'Box', ratio: 48 },
	];

	it('uses custom rule over default when available', async () => {
		expect(await convert(1, 'Box', 'Piece', customRules)).toBe(24);
		expect(await convert(2, 'Box', 'Piece', customRules)).toBe(48);
	});

	it('supports custom units not in defaults', async () => {
		expect(await convert(1, 'Pallet', 'Box', customRules)).toBe(48);
	});

	it('supports reverse of custom rule', async () => {
		expect(await convert(24, 'Piece', 'Box', customRules)).toBe(1);
	});

	it('falls back to database default if custom rule not found', async () => {
		const partialCustomRules = [{ fromUnit: 'Pallet', toUnit: 'Box', ratio: 48 }];
		expect(await convert(1, 'Box', 'Piece', partialCustomRules)).toBe(12);
	});
});

describe('getConversionRatio', () => {
	beforeAll(() => {
		resetPrismaMocks();
		(prisma.unitOfMeasure.findMany as any).mockResolvedValue(mockUnits);
	});

	afterEach(() => {
		clearConversionCache();
	});

	it('returns ratio for Box to Piece', async () => {
		expect(await getConversionRatio('Box', 'Piece')).toBe(12);
	});

	it('returns 1 when same unit', async () => {
		expect(await getConversionRatio('Box', 'Box')).toBe(1);
	});

	it('throws for unsupported conversion', async () => {
		await expect(getConversionRatio('Box', 'Kilogram')).rejects.toThrow();
	});
});

describe('hasConversionRule', () => {
	beforeAll(() => {
		resetPrismaMocks();
		(prisma.unitOfMeasure.findMany as any).mockResolvedValue(mockUnits);
	});

	afterEach(() => {
		clearConversionCache();
	});

	it('returns true for supported conversion', async () => {
		expect(await hasConversionRule('Box', 'Piece')).toBe(true);
		expect(await hasConversionRule('Kilogram', 'Gram')).toBe(true);
	});

	it('returns false for unsupported conversion', async () => {
		expect(await hasConversionRule('Box', 'Kilogram')).toBe(false);
	});

	it('returns false for completely unrelated units', async () => {
		expect(await hasConversionRule('Liter', 'Box')).toBe(false);
	});

	it('returns true for same unit', async () => {
		expect(await hasConversionRule('Box', 'Box')).toBe(true);
	});

	it('returns true with custom rules', async () => {
		const customRules = [{ fromUnit: 'Pallet', toUnit: 'Box', ratio: 48 }];
		expect(await hasConversionRule('Pallet', 'Box', customRules)).toBe(true);
	});
});

describe('box-to-piece conversion - business rules', () => {
	beforeAll(() => {
		resetPrismaMocks();
		(prisma.unitOfMeasure.findMany as any).mockResolvedValue(mockUnits);
	});

	afterEach(() => {
		clearConversionCache();
	});

	it('converts exactly 1 box to 12 pieces by default', async () => {
		const pieces = await convert(1, 'Box', 'Piece');
		expect(pieces).toBe(12);
		expect(Number.isInteger(pieces)).toBe(true);
	});

	it('converts partial boxes correctly with custom ratio', async () => {
		const customRules = [{ fromUnit: 'Box', toUnit: 'Piece', ratio: 10 }];
		expect(await convert(0.5, 'Box', 'Piece', customRules)).toBe(5);
	});
});