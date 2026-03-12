import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the keyboard wedge scanner logic by extracting the pure function
// We test the logic without electron-specific imports

const SCAN_TIMEOUT_MS = 100;

function createKeyboardWedgeListener(onScan: (barcode: string) => void) {
  let scanBuffer = '';
  let scanTimeout: ReturnType<typeof setTimeout> | null = null;

  return function handleKeypress(event: { key: string; target?: { tagName?: string; isContentEditable?: boolean } }) {
    const target = event.target;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
      return;
    }

    if (event.key === 'Enter') {
      if (scanBuffer.length > 0) {
        onScan(scanBuffer);
        scanBuffer = '';
      }
      return;
    }

    scanBuffer += event.key;

    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanBuffer = '';
    }, SCAN_TIMEOUT_MS);
  };
}

describe('Keyboard wedge scanner logic', () => {
  let handler: (event: any) => void;
  let onScan: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onScan = vi.fn();
    handler = createKeyboardWedgeListener(onScan);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('accumulates characters into scan buffer', () => {
    handler({ key: 'S' });
    handler({ key: 'K' });
    handler({ key: 'U' });
    handler({ key: '-' });
    handler({ key: '0' });
    handler({ key: '0' });
    handler({ key: '1' });
    handler({ key: 'Enter' });

    expect(onScan).toHaveBeenCalledWith('SKU-001');
  });

  it('fires onScan callback on Enter key', () => {
    handler({ key: 'A' });
    handler({ key: 'B' });
    handler({ key: 'C' });
    handler({ key: 'Enter' });

    expect(onScan).toHaveBeenCalledOnce();
    expect(onScan).toHaveBeenCalledWith('ABC');
  });

  it('does not fire onScan for empty buffer on Enter', () => {
    handler({ key: 'Enter' });
    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores keypress when target is INPUT element', () => {
    handler({ key: 'S', target: { tagName: 'INPUT' } });
    handler({ key: 'K', target: { tagName: 'INPUT' } });
    handler({ key: 'U', target: { tagName: 'INPUT' } });
    handler({ key: 'Enter', target: { tagName: 'INPUT' } });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores keypress when target is TEXTAREA', () => {
    handler({ key: 'A', target: { tagName: 'TEXTAREA' } });
    handler({ key: 'Enter', target: { tagName: 'TEXTAREA' } });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores keypress when target is contentEditable', () => {
    handler({ key: 'A', target: { isContentEditable: true } });
    handler({ key: 'Enter', target: { isContentEditable: true } });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('clears buffer after timeout (human typing too slow)', () => {
    handler({ key: 'S' });
    handler({ key: 'K' });

    // Advance time past scan timeout
    vi.advanceTimersByTime(SCAN_TIMEOUT_MS + 10);

    // Buffer should be cleared, Enter should not trigger scan
    handler({ key: 'Enter' });
    expect(onScan).not.toHaveBeenCalled();
  });

  it('handles rapid scan within timeout window', () => {
    handler({ key: 'B' });
    vi.advanceTimersByTime(10);
    handler({ key: 'A' });
    vi.advanceTimersByTime(10);
    handler({ key: 'R' });
    vi.advanceTimersByTime(10);
    handler({ key: 'Enter' });

    expect(onScan).toHaveBeenCalledWith('BAR');
  });

  it('resets buffer after successful scan for next scan', () => {
    handler({ key: 'A' });
    handler({ key: 'B' });
    handler({ key: 'Enter' });

    expect(onScan).toHaveBeenCalledWith('AB');

    // Second scan
    handler({ key: 'C' });
    handler({ key: 'D' });
    handler({ key: 'Enter' });

    expect(onScan).toHaveBeenCalledWith('CD');
    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it('handles special characters in barcode', () => {
    const barcode = 'SKU-001/A+B';
    for (const char of barcode) {
      handler({ key: char });
    }
    handler({ key: 'Enter' });

    expect(onScan).toHaveBeenCalledWith('SKU-001/A+B');
  });
});
