export interface LayoutRect {
  id?: string;
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  rotationDeg?: number | null;
}

export function rotatedHalfExtents(rect: LayoutRect) {
  const radians = ((rect.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    x: cos * rect.widthM / 2 + sin * rect.depthM / 2,
    z: sin * rect.widthM / 2 + cos * rect.depthM / 2,
  };
}

export function validateRackPlacement(
  candidate: LayoutRect,
  floor: { length?: number | null; width?: number | null },
  existing: LayoutRect[],
): string | null {
  if (![candidate.x, candidate.z, candidate.widthM, candidate.depthM].every(Number.isFinite)) {
    return 'Rack placement contains invalid numbers';
  }
  if (candidate.widthM <= 0 || candidate.depthM <= 0) return 'Rack dimensions must be greater than zero';
  const half = rotatedHalfExtents(candidate);
  if (floor.length && Math.abs(candidate.x) + half.x > floor.length / 2) return 'Rack would extend beyond the floor length';
  if (floor.width && Math.abs(candidate.z) + half.z > floor.width / 2) return 'Rack would extend beyond the floor width';

  for (const other of existing) {
    if (other.id && candidate.id === other.id) continue;
    const otherHalf = rotatedHalfExtents(other);
    if (
      Math.abs(candidate.x - other.x) < half.x + otherHalf.x &&
      Math.abs(candidate.z - other.z) < half.z + otherHalf.z
    ) {
      return 'Rack would overlap another positioned rack';
    }
  }
  return null;
}
