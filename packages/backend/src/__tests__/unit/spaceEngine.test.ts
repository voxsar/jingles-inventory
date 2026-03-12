import { describe, it, expect, vi } from 'vitest';

// Mock prisma/client since spaceEngine imports it (for DB-connected functions we won't test here)
vi.mock('../../prisma/client', () => ({
  default: {
    location: { findMany: vi.fn() },
    sKU: { findUnique: vi.fn() },
  },
}));

import {
  calculateVolume,
  calculateCapacityUsage,
  validateStacking,
} from '../../modules/space/spaceEngine';
import { IDimensions } from '@jingles/shared';
import { STORAGE_GEOMETRIES, SKUS } from '../fixtures/testData';

describe('calculateVolume', () => {
  it('computes correct volume for standard dimensions', () => {
    const dims: IDimensions = { height: 10, width: 5, depth: 2, weight: 1 };
    expect(calculateVolume(dims)).toBe(100);
  });

  it('computes volume for small item', () => {
    expect(calculateVolume(STORAGE_GEOMETRIES.smallItem)).toBe(400);
  });

  it('computes volume for medium box', () => {
    expect(calculateVolume(STORAGE_GEOMETRIES.mediumBox)).toBe(9000);
  });

  it('computes volume for large fragile item', () => {
    expect(calculateVolume(STORAGE_GEOMETRIES.largeFragile)).toBe(60000);
  });

  it('returns 0 when any dimension is 0', () => {
    const dims: IDimensions = { height: 0, width: 10, depth: 5, weight: 1 };
    expect(calculateVolume(dims)).toBe(0);
  });

  it('handles fractional dimensions', () => {
    const dims: IDimensions = { height: 1.5, width: 2.0, depth: 2.0, weight: 0.5 };
    expect(calculateVolume(dims)).toBeCloseTo(6.0);
  });
});

describe('calculateCapacityUsage', () => {
  it('returns correct percentage for half-full storage', () => {
    expect(calculateCapacityUsage(250000, 500000)).toBe(50);
  });

  it('returns 100 when usage exceeds capacity (capped)', () => {
    expect(calculateCapacityUsage(600000, 500000)).toBe(100);
  });

  it('returns 0 when used volume is 0', () => {
    expect(calculateCapacityUsage(0, 500000)).toBe(0);
  });

  it('returns 0 when total capacity is 0 (division guard)', () => {
    expect(calculateCapacityUsage(100, 0)).toBe(0);
  });

  it('returns 0 when total capacity is negative (division guard)', () => {
    expect(calculateCapacityUsage(100, -1)).toBe(0);
  });

  it('calculates small percentage correctly', () => {
    expect(calculateCapacityUsage(1000, 100000)).toBe(1);
  });
});

describe('validateStacking', () => {
  const nonFragileItem = {
    isFragile: false,
    maxStackHeight: 120,
    dimensions: { height: 20, width: 15, depth: 10, weight: 2 } as IDimensions,
  };

  const fragileItem = {
    isFragile: true,
    maxStackHeight: 40,
    dimensions: { height: 15, width: 12, depth: 8, weight: 1.5 } as IDimensions,
  };

  it('allows stacking non-fragile items when height is within limit', () => {
    const result = validateStacking([nonFragileItem], nonFragileItem);
    expect(result.canStack).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('prevents placing a fragile NEW item when existing items are already stacked', () => {
    // Implementation: fragile new items cannot be placed when there are items below them
    const result = validateStacking([nonFragileItem], fragileItem);
    expect(result.canStack).toBe(false);
    expect(result.reason).toContain('Fragile');
  });

  it('prevents placing a fragile item that would exceed max stack height', () => {
    const tallStack = [
      { isFragile: false, maxStackHeight: 30, dimensions: { height: 25, width: 15, depth: 10, weight: 2 } as IDimensions },
    ];
    const shortItem = { isFragile: false, maxStackHeight: 30, dimensions: { height: 10, width: 15, depth: 10, weight: 1 } as IDimensions };
    const result = validateStacking(tallStack, shortItem);
    expect(result.canStack).toBe(false);
    expect(result.reason).toContain('Stack height');
  });

  it('allows stacking when total height is exactly at max', () => {
    const existingItems = [
      { isFragile: false, maxStackHeight: 40, dimensions: { height: 20, width: 15, depth: 10, weight: 2 } as IDimensions },
    ];
    const newItem = { isFragile: false, maxStackHeight: 40, dimensions: { height: 20, width: 15, depth: 10, weight: 2 } as IDimensions };
    const result = validateStacking(existingItems, newItem);
    expect(result.canStack).toBe(true);
  });

  it('allows stacking on empty shelf', () => {
    const result = validateStacking([], nonFragileItem);
    expect(result.canStack).toBe(true);
  });

  it('prevents stacking when new item exceeds its own max stack height', () => {
    const base = [
      { isFragile: false, maxStackHeight: 200, dimensions: { height: 60, width: 50, depth: 40, weight: 10 } as IDimensions },
    ];
    const restrictedItem = { isFragile: false, maxStackHeight: 60, dimensions: { height: 10, width: 50, depth: 40, weight: 5 } as IDimensions };
    const result = validateStacking(base, restrictedItem);
    expect(result.canStack).toBe(false);
  });

  it('handles items without dimensions gracefully', () => {
    const itemWithoutDims = { isFragile: false, maxStackHeight: 100, dimensions: null };
    const result = validateStacking([itemWithoutDims], itemWithoutDims);
    expect(result.canStack).toBe(true);
  });

  it('handles undefined maxStackHeight gracefully', () => {
    const itemNoMax = { isFragile: false, maxStackHeight: null, dimensions: { height: 50, width: 20, depth: 20, weight: 5 } as IDimensions };
    const result = validateStacking([itemNoMax, itemNoMax], itemNoMax);
    expect(result.canStack).toBe(true);
  });

  it('uses SKUS fixture for stacking validation (fragile widget piece)', () => {
    const fragile = {
      isFragile: SKUS.widgetPiece.isFragile,
      maxStackHeight: SKUS.widgetPiece.maxStackHeight,
      dimensions: SKUS.widgetPiece.dimensions,
    };
    const nonFragile = {
      isFragile: SKUS.widgetBox.isFragile,
      maxStackHeight: SKUS.widgetBox.maxStackHeight,
      dimensions: SKUS.widgetBox.dimensions,
    };
    // fragile item on top of non-fragile stack — fragile item cannot be placed if items are below
    expect(validateStacking([nonFragile], fragile).canStack).toBe(false);
    // non-fragile on top of non-fragile — should be allowed if height permits
    expect(validateStacking([nonFragile], nonFragile).canStack).toBe(true);
  });
});
