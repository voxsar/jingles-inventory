import { vi } from 'vitest';

// Ensure JWT_SECRET is always available in tests
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/jingles_test';

// Mock @prisma/client globally so it doesn't fail when not generated
vi.mock('@prisma/client', () => {
  function MockPrismaClient(this: any) {
    this.$connect = vi.fn();
    this.$disconnect = vi.fn();
    this.$transaction = vi.fn();
    this.user = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.vendor = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.category = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.unitOfMeasure = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.sKU = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.sKUVariant = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.batch = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() };
    this.branch = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.floor = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.location = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.area = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.shelf = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.storageBox = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.boxBarcode = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() };
    this.inventoryRecord = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() };
    this.inventoryEvent = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() };
    this.gRN = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.gRNLine = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.pRN = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.pRNLine = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.inspectionRecord = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.statusOption = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.importJob = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() };
    this.importRecord = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() };
    this.sKUVendor = { upsert: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() };
    this.auditLog = { findMany: vi.fn(), create: vi.fn() };
    this.syncQueue = { findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
  }
  return { PrismaClient: MockPrismaClient };
});
