import 'dotenv/config';
import prisma from '../prisma/client';
import { upsertCatalogDefaults } from '../prisma/catalogDefaults';

async function main() {
	const before = await Promise.all([
		prisma.unitOfMeasure.count(),
		prisma.tag.count(),
		prisma.attribute.count(),
		prisma.attributeValue.count(),
	]);

	const result = await upsertCatalogDefaults(prisma);

	const after = await Promise.all([
		prisma.unitOfMeasure.count(),
		prisma.tag.count(),
		prisma.attribute.count(),
		prisma.attributeValue.count(),
	]);

	console.log('Catalog defaults restored');
	console.log(
		JSON.stringify(
			{
				before: {
					units: before[0],
					tags: before[1],
					attributes: before[2],
					attributeValues: before[3],
				},
				after: {
					units: after[0],
					tags: after[1],
					attributes: after[2],
					attributeValues: after[3],
				},
				defaults: {
					units: result.unitMap.size,
					tags: result.tagMap.size,
					attributes: result.attributeMap.size,
				},
			},
			null,
			2
		)
	);
}

let exitCode = 0;

main()
	.catch((error) => {
		console.error('Catalog defaults restore failed:', error);
		exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
		process.exit(exitCode);
	});
