export const DESKTOP_OUTBOX_CHANGED_EVENT = 'desktop-sync-outbox-changed';

export function emitDesktopOutboxChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(DESKTOP_OUTBOX_CHANGED_EVENT));
}

export function subscribeDesktopOutboxChanged(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener(DESKTOP_OUTBOX_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener(DESKTOP_OUTBOX_CHANGED_EVENT, callback);
  };
}
