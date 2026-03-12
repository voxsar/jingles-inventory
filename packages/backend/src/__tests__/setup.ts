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
    this.sKU = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.location = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.inventoryRecord = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.inventoryEvent = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() };
    this.gRN = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.gRNLine = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
    this.inspectionRecord = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() };
    this.auditLog = { findMany: vi.fn(), create: vi.fn() };
    this.syncQueue = { findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
  }
  return { PrismaClient: MockPrismaClient };
});
