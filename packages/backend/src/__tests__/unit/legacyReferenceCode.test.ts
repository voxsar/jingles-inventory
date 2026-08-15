import { describe, expect, it } from 'vitest';
import { extractLegacyReferenceCode } from '../../utils/legacyReferenceCode';

describe('extractLegacyReferenceCode', () => {
	it('extracts the numeric code and preserves leading zeroes', () => {
		expect(extractLegacyReferenceCode('Legacy reference code: 000102')).toBe('000102');
	});

	it('extracts the code from multi-line legacy notes', () => {
		expect(extractLegacyReferenceCode('Legacy invoice label: Widget\nLegacy reference code: 102\nLegacy flags: Bulk product')).toBe('102');
	});

	it('returns null when no legacy reference code exists', () => {
		expect(extractLegacyReferenceCode('Legacy barcode: 4791234567890')).toBeNull();
	});

	it('preserves alphanumeric legacy reference tokens instead of extracting partial numbers', () => {
		expect(extractLegacyReferenceCode('Legacy reference code: 4M')).toBe('4M');
	});
});
