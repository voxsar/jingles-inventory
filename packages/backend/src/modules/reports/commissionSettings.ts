import prisma from '../../prisma/client';

export const DEFAULT_SALESMAN_COMMISSION_RATE_PERCENT = 2;
export const SALESMAN_COMMISSION_BASIS = 'after_discounts' as const;

const COMMISSION_RATE_CONFIG_KEY = 'salesmanCommission.defaultRatePercent';

export type SalesmanCommissionSettings = {
	defaultRatePercent: number;
	commissionBasis: typeof SALESMAN_COMMISSION_BASIS;
};

function normalizeRate(value: unknown, fallback = DEFAULT_SALESMAN_COMMISSION_RATE_PERCENT) {
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : fallback;
}

async function ensureConfigTable() {
	await prisma.$executeRaw`
		CREATE TABLE IF NOT EXISTS "config" (
			"key" TEXT PRIMARY KEY,
			"value" TEXT NOT NULL
		)
	`;
}

export async function getSalesmanCommissionSettings(): Promise<SalesmanCommissionSettings> {
	await ensureConfigTable();
	const rows = await prisma.$queryRaw<Array<{ value: string }>>`
		SELECT "value"
		FROM "config"
		WHERE "key" = ${COMMISSION_RATE_CONFIG_KEY}
		LIMIT 1
	`;

	return {
		defaultRatePercent: normalizeRate(rows[0]?.value),
		commissionBasis: SALESMAN_COMMISSION_BASIS,
	};
}

export async function saveSalesmanCommissionSettings(input: {
	defaultRatePercent: number;
}): Promise<SalesmanCommissionSettings> {
	const defaultRatePercent = normalizeRate(input.defaultRatePercent);
	await ensureConfigTable();
	await prisma.$executeRaw`
		INSERT INTO "config" ("key", "value")
		VALUES (${COMMISSION_RATE_CONFIG_KEY}, ${String(defaultRatePercent)})
		ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"
	`;

	return {
		defaultRatePercent,
		commissionBasis: SALESMAN_COMMISSION_BASIS,
	};
}
