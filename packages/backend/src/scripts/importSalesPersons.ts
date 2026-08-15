import prisma from '../prisma/client';

/**
 * One-off seed for the MaxSoft `SalesPerson` roster.
 *
 * The legacy `Inventory_Schema_2026-08-11.sql` export only carries the
 * `SalesPerson` / `SalesPersonSync` table *structure* (no INSERT rows), so
 * there is nothing to stream through the general legacy SQL importer yet.
 * This hardcodes the rows currently known from the legacy system and
 * idempotently upserts them as app users with the salesman flag set, keyed
 * on the legacy `SalesPersonCode` so re-running this is always safe.
 *
 * Extend LEGACY_SALESPERSONS below (or replace this script with a proper
 * `importLegacySqlDump.ts` mapping) once the full roster / a real data
 * export is available.
 *
 * Usage:
 *   npm exec --workspace=packages/backend ts-node src/scripts/importSalesPersons.ts
 */

type LegacySalesPerson = {
	code: string;
	name: string;
};

const LEGACY_SALESPERSONS: LegacySalesPerson[] = [
	{ code: '0', name: 'DEFAULT' },
	{ code: '1', name: 'DEFAULT 1' },
	{ code: '10', name: 'REENI' },
	{ code: '11', name: 'NILUKA' },
	{ code: '12', name: 'ANUSHA' },
	{ code: '13', name: 'IMMAM DEEN' },
	{ code: '15', name: 'Abdul Raheem' },
	{ code: '16', name: 'MADUSHA' },
	{ code: '17', name: 'SADAMALI' },
	{ code: '18', name: 'RASIKA' },
];

function buildLegacySalesmanEmail(code: string) {
	return `salesman.${code}@legacy-import.local`;
}

async function main() {
	let created = 0;
	let updated = 0;

	for (const person of LEGACY_SALESPERSONS) {
		const existing = await prisma.user.findUnique({ where: { legacyCode: person.code } });

		if (existing) {
			await prisma.user.update({
				where: { id: existing.id },
				data: {
					name: person.name,
					isSalesman: true,
					isActive: true,
				},
			});
			updated += 1;
			console.log(`Updated salesman ${person.code} (${person.name})`);
			continue;
		}

		await prisma.user.create({
			data: {
				email: buildLegacySalesmanEmail(person.code),
				// Not a real login account — locked out the same way the legacy
				// SQL importer disables its synthetic attribution users.
				passwordHash: 'legacy-import-disabled',
				role: 'Staff',
				accessScope: 'CASHIER',
				isSalesman: true,
				isActive: true,
				name: person.name,
				legacyCode: person.code,
			},
		});
		created += 1;
		console.log(`Created salesman ${person.code} (${person.name})`);
	}

	console.log('');
	console.log(`Done. ${created} created, ${updated} updated, ${LEGACY_SALESPERSONS.length} total.`);
}

main()
	.catch((error: any) => {
		console.error(error?.message ?? error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
