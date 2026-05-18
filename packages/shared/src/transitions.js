"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGER_OVERRIDE_ROLES = exports.ALLOWED_TRANSITIONS = void 0;
exports.isValidTransition = isValidTransition;
exports.canOverrideTransition = canOverrideTransition;
exports.validateTransition = validateTransition;
const enums_1 = require("./enums");
exports.ALLOWED_TRANSITIONS = {
    [enums_1.InventoryState.UnopenedBox]: [enums_1.InventoryState.Uninspected, enums_1.InventoryState.Damaged],
    [enums_1.InventoryState.Uninspected]: [enums_1.InventoryState.Inspected, enums_1.InventoryState.Damaged],
    [enums_1.InventoryState.Inspected]: [enums_1.InventoryState.ShelfReady, enums_1.InventoryState.Damaged],
    [enums_1.InventoryState.ShelfReady]: [enums_1.InventoryState.Reserved, enums_1.InventoryState.Damaged],
    [enums_1.InventoryState.Reserved]: [enums_1.InventoryState.Sold, enums_1.InventoryState.ShelfReady, enums_1.InventoryState.Damaged],
    [enums_1.InventoryState.Sold]: [enums_1.InventoryState.Returned],
    [enums_1.InventoryState.Returned]: [enums_1.InventoryState.Inspected, enums_1.InventoryState.Damaged],
    // Damaged is a terminal state; items cannot transition out without manual DB intervention.
    [enums_1.InventoryState.Damaged]: [],
};
exports.MANAGER_OVERRIDE_ROLES = [enums_1.UserRole.Admin, enums_1.UserRole.Manager];
function isValidTransition(from, to) {
    const allowed = exports.ALLOWED_TRANSITIONS[from];
    if (!allowed)
        return false;
    return allowed.includes(to);
}
function canOverrideTransition(role) {
    return exports.MANAGER_OVERRIDE_ROLES.includes(role);
}
function validateTransition(from, to, userRole) {
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
