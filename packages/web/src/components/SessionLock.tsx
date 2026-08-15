import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { readSessionLockMinutes, SESSION_LOCK_SETTINGS_EVENT } from '../utils/sessionLock';

const LAST_ACTIVITY_STORAGE_KEY = 'jingles-inventory-last-activity-at';
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
];

export default function SessionLock() {
  const { user, unlock, logout } = useAuthStore();
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const timerRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const lastActivityWriteRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armTimer = useCallback((delay = readSessionLockMinutes() * 60_000) => {
    clearTimer();
    if (!user?.hasPin || lockedRef.current) return;
    timerRef.current = window.setTimeout(() => {
      lockedRef.current = true;
      setIsLocked(true);
      setPin('');
      setError('');
    }, Math.max(0, delay));
  }, [clearTimer, user?.hasPin]);

  useEffect(() => {
    const handleManualLock = () => {
      if (!user?.hasPin) return;
      lockedRef.current = true;
      setIsLocked(true);
      setPin('');
      setError('');
    };
    window.addEventListener('jingles:lock-now', handleManualLock);
    return () => window.removeEventListener('jingles:lock-now', handleManualLock);
  }, [user?.hasPin]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== 'l') return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('jingles:lock-now'));
    };
    const handleSettingsChange = () => armTimer();
    window.addEventListener('keydown', handleShortcut, true);
    window.addEventListener(SESSION_LOCK_SETTINGS_EVENT, handleSettingsChange);
    return () => {
      window.removeEventListener('keydown', handleShortcut, true);
      window.removeEventListener(SESSION_LOCK_SETTINGS_EVENT, handleSettingsChange);
    };
  }, [armTimer]);

  useEffect(() => {
    const timeoutMs = readSessionLockMinutes() * 60_000;
    const lastActivityAt = Number(window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY));
    const remaining = lastActivityAt
      ? timeoutMs - (Date.now() - lastActivityAt)
      : 0;
    lockedRef.current = Boolean(user?.hasPin && remaining <= 0);
    setIsLocked(lockedRef.current);
    if (!lockedRef.current) armTimer(remaining || timeoutMs);

    const handleActivity = () => {
      if (!lockedRef.current) {
        const now = Date.now();
        if (now - lastActivityWriteRef.current >= 1000) {
          window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
          lastActivityWriteRef.current = now;
        }
        armTimer();
      }
    };
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
    };
  }, [armTimer, clearTimer, user?.id]);

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Enter your 4 to 6 digit PIN.');
      return;
    }
    setIsUnlocking(true);
    setError('');
    try {
      await unlock(pin);
      window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
      lockedRef.current = false;
      setIsLocked(false);
      setPin('');
      armTimer();
    } catch (nextError: any) {
      setError(nextError.response?.data?.error ?? 'Unable to unlock. Try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/90 px-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-5 text-center">
          <div className="mb-3 text-4xl">🔒</div>
          <h2 className="text-xl font-bold text-gray-900">Session locked</h2>
          <p className="mt-1 text-sm text-gray-500">{user?.email}</p>
          <p className="mt-3 text-sm text-gray-600">Enter your PIN to continue.</p>
        </div>
        <form onSubmit={handleUnlock} className="space-y-4">
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            minLength={4}
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-label="Unlock PIN"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.45em] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isUnlocking || pin.length < 4}
            className="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUnlocking ? 'Unlocking…' : 'Unlock'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Sign in as another user
          </button>
        </form>
      </div>
    </div>
  );
}
