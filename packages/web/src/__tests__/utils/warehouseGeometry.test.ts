import { describe, expect, it } from 'vitest';
import { aggregateProductDimensions, centimetresToMetres, layoutFloorBoxes, orderedShelves, shelfBoardElevation } from '../../utils/warehouseGeometry';

describe('warehouse geometry', () => {
  it('uses centimetres without runtime unit guessing', () => {
    expect(centimetresToMetres(4, 1)).toBe(0.04);
    expect(centimetresToMetres(120, 1)).toBe(1.2);
  });

  it('orders and positions explicit shelf levels', () => {
    const shelves = [
      { id: 'b', levelIndex: 1, elevationCm: 105, createdAt: new Date(2) },
      { id: 'a', levelIndex: 0, elevationCm: 5, createdAt: new Date(1) },
    ] as any[];
    const ordered = orderedShelves(shelves);
    expect(ordered.map((s) => s.id)).toEqual(['a', 'b']);
    expect(shelfBoardElevation(ordered[1], 1, 2.2, 2)).toBe(1.05);
  });

  it('preserves total product volume in aggregate geometry', () => {
    const result = aggregateProductDimensions({ width: 20, length: 10, height: 5 }, 12, 1, 1);
    expect(result.width * result.depth * result.height).toBeCloseTo(0.012);
  });

  it('packs different box sizes without reusing the same origin and honors parent stacking', () => {
    const boxes = [
      { id: 'a', width: 40, height: 30, length: 50 },
      { id: 'b', width: 80, height: 20, length: 30 },
      { id: 'c', width: 40, height: 10, length: 50, parentBoxId: 'a' },
    ] as any[];
    const result = layoutFloorBoxes(boxes, 4, 4);
    expect(result.a.x).not.toBe(result.b.x);
    expect(result.c.x).toBe(result.a.x);
    expect(result.c.y).toBeGreaterThan(result.a.y);
  });
});
