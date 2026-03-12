import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  canOverrideTransition,
  validateTransition,
  ALLOWED_TRANSITIONS,
} from '../transitions';
import { InventoryState, UserRole } from '../enums';

describe('isValidTransition', () => {
  it('allows UnopenedBox → Uninspected', () => {
    expect(isValidTransition(InventoryState.UnopenedBox, InventoryState.Uninspected)).toBe(true);
  });

  it('allows UnopenedBox → Damaged', () => {
    expect(isValidTransition(InventoryState.UnopenedBox, InventoryState.Damaged)).toBe(true);
  });

  it('allows Uninspected → Inspected', () => {
    expect(isValidTransition(InventoryState.Uninspected, InventoryState.Inspected)).toBe(true);
  });

  it('allows Inspected → ShelfReady', () => {
    expect(isValidTransition(InventoryState.Inspected, InventoryState.ShelfReady)).toBe(true);
  });

  it('allows ShelfReady → Reserved', () => {
    expect(isValidTransition(InventoryState.ShelfReady, InventoryState.Reserved)).toBe(true);
  });

  it('allows Reserved → Sold', () => {
    expect(isValidTransition(InventoryState.Reserved, InventoryState.Sold)).toBe(true);
  });

  it('allows Sold → Returned', () => {
    expect(isValidTransition(InventoryState.Sold, InventoryState.Returned)).toBe(true);
  });

  it('allows Returned → Inspected', () => {
    expect(isValidTransition(InventoryState.Returned, InventoryState.Inspected)).toBe(true);
  });

  it('allows Returned → Damaged', () => {
    expect(isValidTransition(InventoryState.Returned, InventoryState.Damaged)).toBe(true);
  });

  it('allows any → Damaged from ShelfReady', () => {
    expect(isValidTransition(InventoryState.ShelfReady, InventoryState.Damaged)).toBe(true);
  });

  it('allows any → Damaged from Reserved', () => {
    expect(isValidTransition(InventoryState.Reserved, InventoryState.Damaged)).toBe(true);
  });

  it('rejects UnopenedBox → ShelfReady (invalid skip)', () => {
    expect(isValidTransition(InventoryState.UnopenedBox, InventoryState.ShelfReady)).toBe(false);
  });

  it('rejects UnopenedBox → Sold (invalid skip)', () => {
    expect(isValidTransition(InventoryState.UnopenedBox, InventoryState.Sold)).toBe(false);
  });

  it('rejects Damaged → any transition (terminal state)', () => {
    expect(isValidTransition(InventoryState.Damaged, InventoryState.Inspected)).toBe(false);
    expect(isValidTransition(InventoryState.Damaged, InventoryState.ShelfReady)).toBe(false);
    expect(isValidTransition(InventoryState.Damaged, InventoryState.Uninspected)).toBe(false);
  });

  it('rejects Sold → ShelfReady (cannot un-sell without return)', () => {
    expect(isValidTransition(InventoryState.Sold, InventoryState.ShelfReady)).toBe(false);
  });

  it('rejects Uninspected → Sold (must be inspected first)', () => {
    expect(isValidTransition(InventoryState.Uninspected, InventoryState.Sold)).toBe(false);
  });

  it('rejects transition from unknown state', () => {
    expect(isValidTransition('UNKNOWN' as InventoryState, InventoryState.Sold)).toBe(false);
  });
});

describe('canOverrideTransition', () => {
  it('allows Admin to override', () => {
    expect(canOverrideTransition(UserRole.Admin)).toBe(true);
  });

  it('allows Manager to override', () => {
    expect(canOverrideTransition(UserRole.Manager)).toBe(true);
  });

  it('rejects Staff from override', () => {
    expect(canOverrideTransition(UserRole.Staff)).toBe(false);
  });

  it('rejects Inspector from override', () => {
    expect(canOverrideTransition(UserRole.Inspector)).toBe(false);
  });

  it('rejects Vendor from override', () => {
    expect(canOverrideTransition(UserRole.Vendor)).toBe(false);
  });
});

describe('validateTransition', () => {
  it('returns valid=true, requiresOverride=false for allowed transition', () => {
    const result = validateTransition(
      InventoryState.UnopenedBox,
      InventoryState.Uninspected,
      UserRole.Staff
    );
    expect(result.valid).toBe(true);
    expect(result.requiresOverride).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('returns valid=true, requiresOverride=true when Manager performs invalid transition', () => {
    const result = validateTransition(
      InventoryState.Damaged,
      InventoryState.Inspected,
      UserRole.Manager
    );
    expect(result.valid).toBe(true);
    expect(result.requiresOverride).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid=false for invalid transition by non-override role', () => {
    const result = validateTransition(
      InventoryState.Uninspected,
      InventoryState.Sold,
      UserRole.Staff
    );
    expect(result.valid).toBe(false);
    expect(result.requiresOverride).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('requires override for Admin on terminal Damaged state', () => {
    const result = validateTransition(
      InventoryState.Damaged,
      InventoryState.ShelfReady,
      UserRole.Admin
    );
    expect(result.valid).toBe(true);
    expect(result.requiresOverride).toBe(true);
  });

  it('error message contains from and to state names', () => {
    const result = validateTransition(
      InventoryState.Uninspected,
      InventoryState.Sold,
      UserRole.Staff
    );
    expect(result.error).toContain(InventoryState.Uninspected);
    expect(result.error).toContain(InventoryState.Sold);
  });
});

describe('ALLOWED_TRANSITIONS completeness', () => {
  it('covers all InventoryState values except Damaged as source', () => {
    const states = Object.values(InventoryState);
    for (const state of states) {
      expect(ALLOWED_TRANSITIONS).toHaveProperty(state);
    }
  });

  it('Damaged state has empty allowed transitions (terminal)', () => {
    expect(ALLOWED_TRANSITIONS[InventoryState.Damaged]).toEqual([]);
  });

  it('Sold can only transition to Returned', () => {
    expect(ALLOWED_TRANSITIONS[InventoryState.Sold]).toEqual([InventoryState.Returned]);
  });
});
