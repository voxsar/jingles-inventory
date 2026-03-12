import { describe, it, expect } from 'vitest';
import {
  InventoryState,
  InventoryEventType,
  GRNStatus,
  UserRole,
  SyncStatus,
  DamageClassification,
  UnitOfMeasure,
} from '../enums';

describe('InventoryState enum', () => {
  it('contains all required states', () => {
    const states = Object.values(InventoryState);
    expect(states).toContain('UnopenedBox');
    expect(states).toContain('Uninspected');
    expect(states).toContain('Inspected');
    expect(states).toContain('ShelfReady');
    expect(states).toContain('Damaged');
    expect(states).toContain('Returned');
    expect(states).toContain('Reserved');
    expect(states).toContain('Sold');
  });

  it('has exactly 8 states', () => {
    expect(Object.values(InventoryState)).toHaveLength(8);
  });
});

describe('InventoryEventType enum', () => {
  it('contains all required event types', () => {
    const types = Object.values(InventoryEventType);
    expect(types).toContain('GRN_CREATED');
    expect(types).toContain('BOX_OPENED');
    expect(types).toContain('INSPECTION_APPROVED');
    expect(types).toContain('LOCATION_TRANSFER');
    expect(types).toContain('STATE_CHANGE');
    expect(types).toContain('SALE_DEDUCTED');
    expect(types).toContain('RETURN_RECEIVED');
    expect(types).toContain('MANUAL_ADJUSTMENT');
    expect(types).toContain('DAMAGE_RECORDED');
  });

  it('has exactly 9 event types', () => {
    expect(Object.values(InventoryEventType)).toHaveLength(9);
  });
});

describe('GRNStatus enum', () => {
  it('contains all required GRN statuses', () => {
    const statuses = Object.values(GRNStatus);
    expect(statuses).toContain('Draft');
    expect(statuses).toContain('Submitted');
    expect(statuses).toContain('PartiallyInspected');
    expect(statuses).toContain('FullyInspected');
    expect(statuses).toContain('Closed');
  });

  it('has exactly 5 statuses', () => {
    expect(Object.values(GRNStatus)).toHaveLength(5);
  });
});

describe('UserRole enum', () => {
  it('contains all required roles', () => {
    const roles = Object.values(UserRole);
    expect(roles).toContain('Admin');
    expect(roles).toContain('Manager');
    expect(roles).toContain('Staff');
    expect(roles).toContain('Inspector');
    expect(roles).toContain('Vendor');
  });
});

describe('SyncStatus enum', () => {
  it('contains conflict and pending statuses', () => {
    expect(Object.values(SyncStatus)).toContain('Conflict');
    expect(Object.values(SyncStatus)).toContain('Pending');
    expect(Object.values(SyncStatus)).toContain('Processed');
    expect(Object.values(SyncStatus)).toContain('Failed');
  });
});

describe('UnitOfMeasure enum', () => {
  it('supports box-to-piece conversion units', () => {
    expect(Object.values(UnitOfMeasure)).toContain('Box');
    expect(Object.values(UnitOfMeasure)).toContain('Piece');
    expect(Object.values(UnitOfMeasure)).toContain('Pack');
  });

  it('supports weight units', () => {
    expect(Object.values(UnitOfMeasure)).toContain('Kilogram');
    expect(Object.values(UnitOfMeasure)).toContain('Gram');
  });
});

describe('DamageClassification enum', () => {
  it('contains Minor, Major, and Totaled', () => {
    expect(Object.values(DamageClassification)).toContain('Minor');
    expect(Object.values(DamageClassification)).toContain('Major');
    expect(Object.values(DamageClassification)).toContain('Totaled');
  });
});
