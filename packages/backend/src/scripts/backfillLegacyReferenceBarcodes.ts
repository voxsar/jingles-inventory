import 'dotenv/config';
import prisma from '../prisma/client';
import {
	LEGACY_REFERENCE_BARCODE_LABEL,
	LEGACY_REFERENCE_BARCODE_TYPE,
	extractLegacyReferenceCode,
} from '../utils/legacyReferenceCode';

type Conflict = {
	barcode: string;
	sourceSkuCode: string;
	sourceSkuName: string;
	assignedSkuCode: string;
	assignedSkuName: string;
};

type Summary = {
	scanned: number;
	withReferenceCode: number;
	created: number;
	alreadyOnSku: number;
	conflicts: Conflict[];
};

const isDryRun = process.argv.includes('--dry-run');

async function main() {
	const skus = await prisma.sKU.findMany({
		where: { description: { contains: 'Legacy reference code' } },
		select: {
			id: true,
			skuCode: true,
			name: true,
			description: true,
			barcodes: { select: { barcode: true } },
		},
		orderBy: { skuCode: 'asc' },
	});

	const summary: Summary = {
		scanned: skus.length,
		withReferenceCode: 0,
		created: 0,
		alreadyOnSku: 0,
		conflicts: [],
	};
	const plannedBarcodes = new Map<string, { skuCode: string; name: string }>();

	for (const sku of skus) {
		const legacyReferenceCode = extractLegacyReferenceCode(sku.description);
		if (!legacyReferenceCode) continue;
		summary.withReferenceCode += 1;

		if (sku.barcodes.some((barcode) => barcode.barcode === legacyReferenceCode)) {
			summary.alreadyOnSku += 1;
			continue;
		}

		const plannedBarcode = plannedBarcodes.get(legacyReferenceCode);
		if (plannedBarcode) {
			summary.conflicts.push({
				barcode: legacyReferenceCode,
				sourceSkuCode: sku.skuCode,
				sourceSkuName: sku.name,
				assignedSkuCode: plannedBarcode.skuCode,
				assignedSkuName: plannedBarcode.name,
			});
			continue;
		}

		const existingBarcode = await prisma.productBarcode.findUnique({
			where: { barcode: legacyReferenceCode },
			include: { sku: { select: { skuCode: true, name: true } } },
		});

		if (existingBarcode) {
			summary.conflicts.push({
				barcode: legacyReferenceCode,
				sourceSkuCode: sku.skuCode,
				sourceSkuName: sku.name,
				assignedSkuCode: existingBarcode.sku.skuCode,
				assignedSkuName: existingBarcode.sku.name,
			});
			continue;
		}

		if (!isDryRun) {
			await prisma.productBarcode.create({
				data: {
					skuId: sku.id,
					barcode: legacyReferenceCode,
					barcodeType: LEGACY_REFERENCE_BARCODE_TYPE,
					isDefault: false,
					label: LEGACY_REFERENCE_BARCODE_LABEL,
				},
			});
		}
		plannedBarcodes.set(legacyReferenceCode, { skuCode: sku.skuCode, name: sku.name });
		summary.created += 1;
	}

	console.log(`${isDryRun ? 'Dry run complete' : 'Legacy reference barcode backfill complete'}`);
	console.log(JSON.stringify(summary, null, 2));
}

let exitCode = 0;

main()
	.catch((error) => {
		console.error('Legacy reference barcode backfill failed:', error);
		exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
		process.exit(exitCode);
	});
