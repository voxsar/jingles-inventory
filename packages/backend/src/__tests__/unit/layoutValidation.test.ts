import { describe, expect, it } from 'vitest';
import { rotatedHalfExtents, validateRackPlacement } from '../../modules/space/layoutValidation';

describe('warehouse layout validation', () => {
  it('accounts for rotation when calculating a rack footprint', () => {
    const half = rotatedHalfExtents({ x: 0, z: 0, widthM: 2, depthM: 1, rotationDeg: 90 });
    expect(half.x).toBeCloseTo(0.5);
    expect(half.z).toBeCloseTo(1);
  });

  it('rejects racks outside floor boundaries', () => {
    expect(validateRackPlacement({ x: 4.8, z: 0, widthM: 1, depthM: 1 }, { length: 10, width: 8 }, []))
      .toContain('floor length');
  });

  it('rejects overlap and permits edge contact', () => {
    const other = { id: 'other', x: 0, z: 0, widthM: 2, depthM: 1 };
    expect(validateRackPlacement({ id: 'new', x: 1, z: 0, widthM: 1, depthM: 1 }, { length: 10, width: 8 }, [other]))
      .toContain('overlap');
    expect(validateRackPlacement({ id: 'new', x: 1.5, z: 0, widthM: 1, depthM: 1 }, { length: 10, width: 8 }, [other]))
      .toBeNull();
  });
});
