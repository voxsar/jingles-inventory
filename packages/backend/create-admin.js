const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createAdmin() {
	try {
		const email = 'admin@avrinalanka.com';
		const password = 'admin@avrinalanka.com';

		const existing = await prisma.user.findUnique({ where: { email } });

		if (!existing) {
			const passwordHash = await bcrypt.hash(password, 10);
			await prisma.user.create({
				data: {
					email,
					passwordHash,
					role: 'Admin'
				}
			});
			console.log('✓ Admin user created successfully');
			console.log('  Email:', email);
			console.log('  Password:', password);
		} else {
			console.log('✓ Admin user already exists');
			console.log('  Email:', email);
		}
	} catch (error) {
		console.error('Error creating admin user:', error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

createAdmin();
