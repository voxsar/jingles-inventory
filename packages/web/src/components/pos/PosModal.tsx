import { useEffect, useRef, type ReactNode } from 'react';
import { useOutsideClick } from '../../utils/useOutsideClick';

interface PosModalProps {
  title: string;
  legacyKey?: string;
  onClose: () => void;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}

const WIDTH_CLASS: Record<NonNullable<PosModalProps['width']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Shared popup shell for the POS terminal. Closes on Esc or an outside click;
 * while it's mounted the page's global hotkey listener steps aside (see
 * PosTerminalPage), so any keydown handling a specific popup adds itself is
 * the only thing reacting to the keyboard besides normal text input.
 */
export default function PosModal({ title, legacyKey, onClose, children, width = 'md', footer }: PosModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useOutsideClick(panelRef, onClose);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        className={`w-full ${WIDTH_CLASS[width]} overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="text-base font-bold text-[var(--ink)]">{title}</h2>
          <div className="flex items-center gap-2">
            {legacyKey && (
              <span className="rounded-md bg-[var(--chip)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--ink-3)]">
                {legacyKey}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-[var(--ink-3)] hover:bg-[var(--row-hover)] hover:text-[var(--ink)]"
              aria-label="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-[var(--line)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
