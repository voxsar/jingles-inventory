export const LEGACY_REFERENCE_BARCODE_LABEL = 'Legacy reference code';
export const LEGACY_REFERENCE_BARCODE_TYPE = 'Custom';

const LEGACY_REFERENCE_CODE_PATTERN = /\blegacy\s+reference\s+code\s*:\s*([A-Za-z0-9][A-Za-z0-9._/-]*)(?=\s|$)/i;

export function extractLegacyReferenceCode(value: string | null | undefined) {
	if (!value) return null;
	const match = value.match(LEGACY_REFERENCE_CODE_PATTERN);
	return match?.[1] ?? null;
}
