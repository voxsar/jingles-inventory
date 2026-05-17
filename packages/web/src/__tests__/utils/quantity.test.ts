import { describe, expect, it } from 'vitest';
import { applyQuantityDelta, formatQuantity, parsePositiveQuantity } from '../../utils/quantity';

describe('quantity utils', () => {
	it('formats quantities with up to three decimals', () => {
		expect(formatQuantity(12)).toBe('12');
		expect(formatQuantity(12.5)).toBe('12.5');
		expect(formatQuantity(12.375)).toBe('12.375');
	});

	it('parses only positive finite quantities', () => {
		expect(parsePositiveQuantity('1.25')).toBe(1.25);
		expect(parsePositiveQuantity(0.5)).toBe(0.5);
		expect(parsePositiveQuantity('0')).toBeUndefined();
		expect(parsePositiveQuantity('-2')).toBeUndefined();
		expect(parsePositiveQuantity('abc')).toBeUndefined();
	});

	it('applies shortcut deltas without dropping decimal precision support', () => {
		expect(applyQuantityDelta('1.25', 1)).toBe('2.25');
		expect(applyQuantityDelta('0.25', -1)).toBe('0.001');
	});
});
