type VariantSelection = {
	id: string;
	skuId: string;
	variantCode: string;
	name: string | null;
};

type BatchSelection = {
	id: string;
	skuId: string;
	variantId: string | null;
	batchNumber: string;
};

type VariantReferenceDb = {
	sKUVariant: {
		findFirst: (args: any) => Promise<VariantSelection | null>;
	};
	batch: {
		findUnique: (args: any) => Promise<BatchSelection | null>;
	};
};

const withContext = (message: string, context?: string) => (context ? `${context}: ${message}` : message);

export const buildDocumentLineContext = (documentType: string, lineIndex: number) =>
	`${documentType} line ${lineIndex + 1}`;

export async function assertVariantBelongsToSku(
	db: VariantReferenceDb,
	skuId: string,
	variantId: string,
	context?: string,
): Promise<VariantSelection>;
export async function assertVariantBelongsToSku(
	db: VariantReferenceDb,
	skuId: string,
	variantId?: string | null,
	context?: string,
): Promise<VariantSelection | null>;
export async function assertVariantBelongsToSku(
	db: VariantReferenceDb,
	skuId: string,
	variantId?: string | null,
	context?: string,
) {
	if (!variantId) return null;

	const variant = await db.sKUVariant.findFirst({
		where: { id: variantId, skuId },
		select: { id: true, skuId: true, variantCode: true, name: true },
	});

	if (!variant) {
		throw new Error(withContext('variant does not belong to the selected product', context));
	}

	return variant;
}

export async function assertBatchBelongsToSkuVariant(
	db: VariantReferenceDb,
	skuId: string,
	batchId?: string | null,
	variantId?: string | null,
	context?: string,
) {
	if (!batchId) return null;

	const batch = await db.batch.findUnique({
		where: { id: batchId },
		select: { id: true, skuId: true, variantId: true, batchNumber: true },
	});

	if (!batch) {
		throw new Error(withContext('batch was not found', context));
	}

	if (batch.skuId !== skuId) {
		throw new Error(withContext(`batch ${batch.batchNumber} does not belong to the selected product`, context));
	}

	const normalizedVariantId = variantId ?? null;
	const batchVariantId = batch.variantId ?? null;

	if (batchVariantId !== normalizedVariantId) {
		if (batchVariantId && !normalizedVariantId) {
			throw new Error(
				withContext(`batch ${batch.batchNumber} belongs to a specific variant that must be selected`, context),
			);
		}

		if (!batchVariantId && normalizedVariantId) {
			throw new Error(
				withContext(`batch ${batch.batchNumber} is not assigned to the selected variant`, context),
			);
		}

		throw new Error(withContext(`batch ${batch.batchNumber} does not belong to the selected variant`, context));
	}

	return batch;
}

export async function assertVariantBatchReferences(
	db: VariantReferenceDb,
	params: {
		skuId: string;
		variantId?: string | null;
		batchId?: string | null;
		context?: string;
	},
) {
	await assertVariantBelongsToSku(db, params.skuId, params.variantId, params.context);
	await assertBatchBelongsToSkuVariant(db, params.skuId, params.batchId, params.variantId, params.context);
}
