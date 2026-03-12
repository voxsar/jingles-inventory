import { describe, it, expect, vi } from 'vitest';

// Mock prisma/client since vendorService imports it
vi.mock('../../prisma/client', () => ({
  default: {
    user: { findUnique: vi.fn() },
    sKU: { findMany: vi.fn() },
  },
}));

import { buildVendorFilter } from '../../modules/vendor/vendorService';
import { UserRole } from '@jingles/shared';

describe('buildVendorFilter', () => {
  it('returns vendorId filter when role is Vendor and vendorId is set', () => {
    const filter = buildVendorFilter(UserRole.Vendor, 'vendor-acme-001');
    expect(filter).toEqual({ vendorId: 'vendor-acme-001' });
  });

  it('returns empty filter for Admin role regardless of vendorId', () => {
    const filter = buildVendorFilter(UserRole.Admin, 'vendor-acme-001');
    expect(filter).toEqual({});
  });

  it('returns empty filter for Manager role', () => {
    const filter = buildVendorFilter(UserRole.Manager, 'vendor-acme-001');
    expect(filter).toEqual({});
  });

  it('returns empty filter for Staff role', () => {
    const filter = buildVendorFilter(UserRole.Staff, undefined);
    expect(filter).toEqual({});
  });

  it('returns empty filter for Inspector role', () => {
    const filter = buildVendorFilter(UserRole.Inspector, 'vendor-acme-001');
    expect(filter).toEqual({});
  });

  it('returns empty filter when Vendor role but no vendorId', () => {
    const filter = buildVendorFilter(UserRole.Vendor, undefined);
    expect(filter).toEqual({});
  });

  it('returns empty filter when Vendor role but vendorId is null', () => {
    const filter = buildVendorFilter(UserRole.Vendor, null);
    expect(filter).toEqual({});
  });

  it('different vendor users get different filters', () => {
    const filterA = buildVendorFilter(UserRole.Vendor, 'vendor-acme-001');
    const filterB = buildVendorFilter(UserRole.Vendor, 'vendor-globaltech-002');
    expect(filterA).toEqual({ vendorId: 'vendor-acme-001' });
    expect(filterB).toEqual({ vendorId: 'vendor-globaltech-002' });
    expect(filterA).not.toEqual(filterB);
  });
});
