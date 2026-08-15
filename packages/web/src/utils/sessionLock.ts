export const DEFAULT_SESSION_LOCK_MINUTES = 2;
export const SESSION_LOCK_MINUTES_KEY = 'jingles-inventory-session-lock-minutes';
export const SESSION_LOCK_SETTINGS_EVENT = 'jingles:session-lock-settings';

export function readSessionLockMinutes(): number {
  const value = Number(window.localStorage.getItem(SESSION_LOCK_MINUTES_KEY));
  return Number.isFinite(value) ? Math.min(120, Math.max(1, Math.round(value))) : DEFAULT_SESSION_LOCK_MINUTES;
}

export function persistSessionLockMinutes(minutes: number) {
  const normalized = Math.min(120, Math.max(1, Math.round(minutes)));
  window.localStorage.setItem(SESSION_LOCK_MINUTES_KEY, String(normalized));
  window.dispatchEvent(new CustomEvent(SESSION_LOCK_SETTINGS_EVENT, { detail: { minutes: normalized } }));
}

export function lockSessionNow() {
  window.dispatchEvent(new CustomEvent('jingles:lock-now'));
}
