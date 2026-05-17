export const QUANTITY_INPUT_STEP = '0.001';
export const QUANTITY_INPUT_MIN = '0.001';
const QUANTITY_DECIMALS = 3;

export function formatQuantity(value: unknown, fallback = '0') {
	const numeric = typeof value === 'number' ? value : Number(value ?? NaN);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}

	return numeric.toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: QUANTITY_DECIMALS,
	});
}

export function parsePositiveQuantity(value: string | number) {
	const numeric = typeof value === 'number' ? value : Number(String(value).trim());
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return undefined;
	}
	return numeric;
}

export function applyQuantityDelta(current: string, delta: number) {
	const numeric = parsePositiveQuantity(current) ?? 0;
	const next = Math.max(Number(QUANTITY_INPUT_MIN), numeric + delta);
	return String(Number(next.toFixed(QUANTITY_DECIMALS)));
}
