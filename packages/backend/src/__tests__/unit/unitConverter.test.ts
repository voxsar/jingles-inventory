import { describe, it, expect } from 'vitest';
import { convert, getConversionRatio, hasConversionRule } from '../../modules/conversion/unitConverter';
import { UnitOfMeasure } from '@jingles/shared';

describe('convert - default rules', () => {
  it('converts Box to Piece at 1:12', () => {
    expect(convert(1, UnitOfMeasure.Box, UnitOfMeasure.Piece)).toBe(12);
    expect(convert(5, UnitOfMeasure.Box, UnitOfMeasure.Piece)).toBe(60);
  });

  it('converts Pack to Piece at 1:6', () => {
    expect(convert(1, UnitOfMeasure.Pack, UnitOfMeasure.Piece)).toBe(6);
    expect(convert(10, UnitOfMeasure.Pack, UnitOfMeasure.Piece)).toBe(60);
  });

  it('converts Liter to Milliliter at 1:1000', () => {
    expect(convert(1, UnitOfMeasure.Liter, UnitOfMeasure.Milliliter)).toBe(1000);
    expect(convert(2.5, UnitOfMeasure.Liter, UnitOfMeasure.Milliliter)).toBe(2500);
  });

  it('converts Kilogram to Gram at 1:1000', () => {
    expect(convert(1, UnitOfMeasure.Kilogram, UnitOfMeasure.Gram)).toBe(1000);
    expect(convert(0.5, UnitOfMeasure.Kilogram, UnitOfMeasure.Gram)).toBe(500);
  });

  it('converts Meter to Centimeter at 1:100', () => {
    expect(convert(1, UnitOfMeasure.Meter, UnitOfMeasure.Centimeter)).toBe(100);
    expect(convert(3.5, UnitOfMeasure.Meter, UnitOfMeasure.Centimeter)).toBe(350);
  });

  it('supports reverse conversion: Piece to Box', () => {
    expect(convert(12, UnitOfMeasure.Piece, UnitOfMeasure.Box)).toBe(1);
    expect(convert(24, UnitOfMeasure.Piece, UnitOfMeasure.Box)).toBe(2);
  });

  it('supports reverse conversion: Milliliter to Liter', () => {
    expect(convert(1000, UnitOfMeasure.Milliliter, UnitOfMeasure.Liter)).toBe(1);
  });

  it('returns same quantity when fromUnit equals toUnit', () => {
    expect(convert(10, UnitOfMeasure.Box, UnitOfMeasure.Box)).toBe(10);
    expect(convert(42, UnitOfMeasure.Piece, UnitOfMeasure.Piece)).toBe(42);
  });

  it('throws when no conversion rule exists', () => {
    expect(() => convert(1, UnitOfMeasure.Box, UnitOfMeasure.Kilogram)).toThrow(
      'No conversion rule found'
    );
  });

  it('throws when converting to completely unrelated units', () => {
    expect(() => convert(1, UnitOfMeasure.Liter, UnitOfMeasure.Box)).toThrow();
  });
});

describe('convert - custom rules', () => {
  const customRules = [
    { fromUnit: 'Box', toUnit: 'Piece', ratio: 24 },
    { fromUnit: 'Pallet', toUnit: 'Box', ratio: 48 },
  ];

  it('uses custom rule over default when available', () => {
    expect(convert(1, 'Box', 'Piece', customRules)).toBe(24);
    expect(convert(2, 'Box', 'Piece', customRules)).toBe(48);
  });

  it('supports custom units not in defaults', () => {
    expect(convert(1, 'Pallet', 'Box', customRules)).toBe(48);
  });

  it('supports reverse of custom rule', () => {
    expect(convert(24, 'Piece', 'Box', customRules)).toBe(1);
  });

  it('falls back to default if custom rule not found', () => {
    const partialCustomRules = [{ fromUnit: 'Pallet', toUnit: 'Box', ratio: 48 }];
    expect(convert(1, UnitOfMeasure.Box, UnitOfMeasure.Piece, partialCustomRules)).toBe(12);
  });
});

describe('getConversionRatio', () => {
  it('returns ratio for Box to Piece', () => {
    expect(getConversionRatio(UnitOfMeasure.Box, UnitOfMeasure.Piece)).toBe(12);
  });

  it('returns 1 when same unit', () => {
    expect(getConversionRatio(UnitOfMeasure.Box, UnitOfMeasure.Box)).toBe(1);
  });

  it('throws for unsupported conversion', () => {
    expect(() => getConversionRatio(UnitOfMeasure.Box, UnitOfMeasure.Kilogram)).toThrow();
  });
});

describe('hasConversionRule', () => {
  it('returns true for supported conversion', () => {
    expect(hasConversionRule(UnitOfMeasure.Box, UnitOfMeasure.Piece)).toBe(true);
    expect(hasConversionRule(UnitOfMeasure.Kilogram, UnitOfMeasure.Gram)).toBe(true);
  });

  it('returns false for unsupported conversion', () => {
    expect(hasConversionRule(UnitOfMeasure.Box, UnitOfMeasure.Kilogram)).toBe(false);
    expect(hasConversionRule(UnitOfMeasure.Liter, UnitOfMeasure.Box)).toBe(false);
  });

  it('returns true for same unit', () => {
    expect(hasConversionRule(UnitOfMeasure.Box, UnitOfMeasure.Box)).toBe(true);
  });

  it('returns true with custom rules', () => {
    const customRules = [{ fromUnit: 'Pallet', toUnit: 'Box', ratio: 48 }];
    expect(hasConversionRule('Pallet', 'Box', customRules)).toBe(true);
  });
});

describe('box-to-piece conversion - business rules', () => {
  it('converts exactly 1 box to 12 pieces by default', () => {
    const pieces = convert(1, UnitOfMeasure.Box, UnitOfMeasure.Piece);
    expect(pieces).toBe(12);
    expect(Number.isInteger(pieces)).toBe(true);
  });

  it('converts partial boxes correctly with custom ratio', () => {
    const customRules = [{ fromUnit: 'Box', toUnit: 'Piece', ratio: 10 }];
    expect(convert(0.5, 'Box', 'Piece', customRules)).toBe(5);
  });
});
