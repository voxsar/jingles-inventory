import { IConversionRule } from '@jingles/shared';
import prisma from '../../prisma/client';

// In-memory cache of unit conversions loaded from the database
let conversionCache: Record<string, Record<string, number>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Load unit conversions from the database
 * Converts baseUnit + conversionFactor into a lookup table
 */
async function loadConversionsFromDB(): Promise<Record<string, Record<string, number>>> {
	const units = await prisma.unitOfMeasureModel.findMany({
		where: { isActive: true },
		select: { name: true, baseUnit: true, conversionFactor: true },
	});

	const conversions: Record<string, Record<string, number>> = {};

	for (const unit of units) {
		if (unit.baseUnit && unit.conversionFactor) {
			// Forward: from derived unit to base unit
			if (!conversions[unit.name]) conversions[unit.name] = {};
			conversions[unit.name][unit.baseUnit] = unit.conversionFactor;

			// Reverse: from base unit to derived unit
			if (!conversions[unit.baseUnit]) conversions[unit.baseUnit] = {};
			conversions[unit.baseUnit][unit.name] = 1 / unit.conversionFactor;
		}
	}

	return conversions;
}

/**
 * Get cached conversions or load from DB if stale
 */
async function getConversions(): Promise<Record<string, Record<string, number>>> {
	const now = Date.now();
	if (!conversionCache || now - cacheTimestamp > CACHE_TTL) {
		conversionCache = await loadConversionsFromDB();
		cacheTimestamp = now;
	}
	return conversionCache;
}

/**
 * Convert quantity between units using database-driven conversions
 * Falls back to customRules if provided
 */
export async function convert(
	quantity: number,
	fromUnit: string,
	toUnit: string,
	customRules?: IConversionRule[]
): Promise<number> {
	if (fromUnit === toUnit) return quantity;

	// Check custom rules first
	if (customRules) {
		const rule = customRules.find((r) => r.fromUnit === fromUnit && r.toUnit === toUnit);
		if (rule) return quantity * rule.ratio;
		const reverseRule = customRules.find((r) => r.fromUnit === toUnit && r.toUnit === fromUnit);
		if (reverseRule) return quantity / reverseRule.ratio;
	}

	// Load database conversions
	const dbConversions = await getConversions();

	const ratio = dbConversions[fromUnit]?.[toUnit];
	if (ratio !== undefined) return quantity * ratio;

	const reverseRatio = dbConversions[toUnit]?.[fromUnit];
	if (reverseRatio !== undefined) return quantity / reverseRatio;

	throw new Error(`No conversion rule found from ${fromUnit} to ${toUnit}`);
}

/**
 * Get the conversion ratio between two units
 */
export async function getConversionRatio(
	fromUnit: string,
	toUnit: string,
	customRules?: IConversionRule[]
): Promise<number> {
	return convert(1, fromUnit, toUnit, customRules);
}

/**
 * Check if a conversion rule exists
 */
export async function hasConversionRule(
	fromUnit: string,
	toUnit: string,
	customRules?: IConversionRule[]
): Promise<boolean> {
	try {
		await getConversionRatio(fromUnit, toUnit, customRules);
		return true;
	} catch {
		return false;
	}
}

/**
 * Clear the conversion cache (useful for testing or when units are updated)
 */
export function clearConversionCache(): void {
	conversionCache = null;
	cacheTimestamp = 0;
}
