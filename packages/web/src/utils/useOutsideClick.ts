import { useEffect, type RefObject } from 'react';

/**
 * Calls `onOutside` when a mousedown/touchstart lands outside `ref`'s element.
 * Used by PosModal so popups dismiss on outside click without losing focus
 * management for the keyboard-driven POS terminal.
 */
export function useOutsideClick<T extends HTMLElement>(ref: RefObject<T>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!ref.current || !target || ref.current.contains(target)) return;
      onOutside();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [ref, onOutside, active]);
}
