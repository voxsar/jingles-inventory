import { IConversionRule, UnitOfMeasure } from '@jingles/shared';

const DEFAULT_CONVERSIONS: Record<string, Record<string, number>> = {
  [UnitOfMeasure.Box]: { [UnitOfMeasure.Piece]: 12 },
  [UnitOfMeasure.Pack]: { [UnitOfMeasure.Piece]: 6 },
  [UnitOfMeasure.Liter]: { [UnitOfMeasure.Milliliter]: 1000 },
  [UnitOfMeasure.Kilogram]: { [UnitOfMeasure.Gram]: 1000 },
  [UnitOfMeasure.Meter]: { [UnitOfMeasure.Centimeter]: 100 },
};

export function convert(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  customRules?: IConversionRule[]
): number {
  if (fromUnit === toUnit) return quantity;

  if (customRules) {
    const rule = customRules.find(r => r.fromUnit === fromUnit && r.toUnit === toUnit);
    if (rule) return quantity * rule.ratio;
    const reverseRule = customRules.find(r => r.fromUnit === toUnit && r.toUnit === fromUnit);
    if (reverseRule) return quantity / reverseRule.ratio;
  }

  const defaultRatio = DEFAULT_CONVERSIONS[fromUnit]?.[toUnit];
  if (defaultRatio !== undefined) return quantity * defaultRatio;

  const reverseRatio = DEFAULT_CONVERSIONS[toUnit]?.[fromUnit];
  if (reverseRatio !== undefined) return quantity / reverseRatio;

  throw new Error(`No conversion rule found from ${fromUnit} to ${toUnit}`);
}

export function getConversionRatio(
  fromUnit: string,
  toUnit: string,
  customRules?: IConversionRule[]
): number {
  return convert(1, fromUnit, toUnit, customRules);
}

export function hasConversionRule(
  fromUnit: string,
  toUnit: string,
  customRules?: IConversionRule[]
): boolean {
  try {
    getConversionRatio(fromUnit, toUnit, customRules);
    return true;
  } catch {
    return false;
  }
}
