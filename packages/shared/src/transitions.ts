import { InventoryState, UserRole } from './enums';

export type TransitionMap = Partial<Record<InventoryState, InventoryState[]>>;

export const ALLOWED_TRANSITIONS: TransitionMap = {
  [InventoryState.UnopenedBox]: [InventoryState.Uninspected, InventoryState.Damaged],
  [InventoryState.Uninspected]: [InventoryState.Inspected, InventoryState.Damaged],
  [InventoryState.Inspected]: [InventoryState.ShelfReady, InventoryState.Damaged],
  [InventoryState.ShelfReady]: [InventoryState.Reserved, InventoryState.Damaged],
  [InventoryState.Reserved]: [InventoryState.Sold, InventoryState.ShelfReady, InventoryState.Damaged],
  [InventoryState.Sold]: [InventoryState.Returned],
  [InventoryState.Returned]: [InventoryState.Inspected, InventoryState.Damaged],
  // Damaged is a terminal state; items cannot transition out without manual DB intervention.
  [InventoryState.Damaged]: [],
};

export const MANAGER_OVERRIDE_ROLES: UserRole[] = [UserRole.Admin, UserRole.Manager];

export function isValidTransition(from: InventoryState, to: InventoryState): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function canOverrideTransition(role: UserRole): boolean {
  return MANAGER_OVERRIDE_ROLES.includes(role);
}

export function validateTransition(
  from: InventoryState,
  to: InventoryState,
  userRole: UserRole
): { valid: boolean; requiresOverride: boolean; error?: string } {
  if (isValidTransition(from, to)) {
    return { valid: true, requiresOverride: false };
  }

  if (canOverrideTransition(userRole)) {
    return { valid: true, requiresOverride: true };
  }

  return {
    valid: false,
    requiresOverride: false,
    error: `Transition from ${from} to ${to} is not allowed for role ${userRole}`,
  };
}
