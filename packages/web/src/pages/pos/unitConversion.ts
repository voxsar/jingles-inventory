import type { PosUnit } from './types';

/** Ratio to multiply a quantity in this unit by to express it in its base unit. 1 if it *is* the base unit. */
function factorToBase(unit: PosUnit): number {
  return unit.baseUnit && unit.conversionFactor ? unit.conversionFactor : 1;
}

/** Every active unit sharing `type` with `unit` — the set offered as alternate entry units in the qty popup. */
export function compatibleUnits(units: PosUnit[], unit: PosUnit | null | undefined): PosUnit[] {
  if (!unit) return [];
  return units.filter((u) => u.isActive && u.type === unit.type);
}

/** Converts a quantity entered in `fromUnit` into the equivalent quantity in `toUnit`. Same unit is a no-op. */
export function convertQuantity(qty: number, fromUnit: PosUnit, toUnit: PosUnit): number {
  if (fromUnit.id === toUnit.id) return qty;
  const inBase = qty * factorToBase(fromUnit);
  return inBase / factorToBase(toUnit);
}

/**
 * Assigns each unit a single hotkey letter with no collisions: first letter
 * of the name, then the abbreviation's first letter, then subsequent letters
 * of the name, so the SKU's own unit and its neighbours (Metre/Yard/Foot...)
 * never land on the same key.
 */
export function assignUnitHotkeys(units: PosUnit[]): Array<{ unit: PosUnit; letter: string }> {
  const used = new Set<string>();
  const result: Array<{ unit: PosUnit; letter: string }> = [];

  for (const unit of units) {
    const candidates = [
      unit.name[0],
      unit.abbreviation?.[0],
      ...unit.name.slice(1).split(''),
    ].filter((c): c is string => Boolean(c));

    const letter = candidates.map((c) => c.toUpperCase()).find((c) => /[A-Z0-9]/.test(c) && !used.has(c));
    if (letter) {
      used.add(letter);
      result.push({ unit, letter });
    } else {
      result.push({ unit, letter: '' });
    }
  }

  return result;
}
