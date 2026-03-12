import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Admin user
  const adminEmail = 'admin@jingles.com';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({ data: { email: adminEmail, passwordHash, role: 'Admin' } });
    console.log('Seed: created admin user');
  } else {
    console.log('Seed: admin user already exists, skipping');
  }

  // Manager user
  const managerEmail = 'manager@jingles.com';
  const existingManager = await prisma.user.findUnique({ where: { email: managerEmail } });
  if (!existingManager) {
    const passwordHash = await bcrypt.hash('manager123', 10);
    await prisma.user.create({ data: { email: managerEmail, passwordHash, role: 'Manager' } });
    console.log('Seed: created manager user');
  }

  // Sample vendor
  let vendor = await prisma.vendor.findFirst({ where: { name: 'Sample Vendor' } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: { name: 'Sample Vendor', contactEmail: 'vendor@sample.com' },
    });
    console.log('Seed: created sample vendor');
  }

  // Sample SKU
  const existingSku = await prisma.sKU.findUnique({ where: { skuCode: 'SKU-001' } });
  if (!existingSku) {
    await prisma.sKU.create({
      data: {
        skuCode: 'SKU-001',
        name: 'Sample Product',
        vendorId: vendor.id,
        unitOfMeasure: 'box',
        conversionRules: { boxToPiece: 12 },
      },
    });
    console.log('Seed: created sample SKU');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
