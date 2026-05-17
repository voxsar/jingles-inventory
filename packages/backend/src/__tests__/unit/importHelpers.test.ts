import { describe, expect, it } from 'vitest';
import { buildDerivedImportJobStatus, isImportEntityType } from '../../modules/imports/importService';
import { normalizeLookup } from '../../modules/imports/previewBuilder';

describe('import helper utilities', () => {
	it('recognizes supported import entity types', () => {
		expect(isImportEntityType('grn')).toBe(true);
		expect(isImportEntityType('inventory')).toBe(true);
		expect(isImportEntityType('unknown')).toBe(false);
	});

	it('derives import job status from approval counts', () => {
		expect(buildDerivedImportJobStatus({
			approvedCount: 0,
			rejectedCount: 0,
			failedCount: 0,
			pendingSelectedCount: 3,
		})).toBe('Ready');

		expect(buildDerivedImportJobStatus({
			approvedCount: 2,
			rejectedCount: 0,
			failedCount: 1,
			pendingSelectedCount: 1,
		})).toBe('PartiallyApproved');

		expect(buildDerivedImportJobStatus({
			approvedCount: 2,
			rejectedCount: 1,
			failedCount: 0,
			pendingSelectedCount: 0,
		})).toBe('Approved');

		expect(buildDerivedImportJobStatus({
			approvedCount: 0,
			rejectedCount: 4,
			failedCount: 0,
			pendingSelectedCount: 0,
		})).toBe('Rejected');

		expect(buildDerivedImportJobStatus({
			approvedCount: 0,
			rejectedCount: 0,
			failedCount: 2,
			pendingSelectedCount: 0,
		})).toBe('Failed');
	});

	it('normalizes lookup text for fuzzy document matching', () => {
		expect(normalizeLookup('  Shelf-A / Main  ')).toBe('shelf a main');
		expect(normalizeLookup('ÁBC Suppliers (Pvt) Ltd.')).toBe('abc suppliers pvt ltd');
	});
});
