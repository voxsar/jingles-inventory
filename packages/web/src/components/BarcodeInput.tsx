import { useState, useRef, useEffect } from 'react';
import { barcodeApi } from '../api/client';
import { UiBanner } from './UiPrimitives';

interface BarcodeInputProps {
  onResult?: (result: any) => void;
  placeholder?: string;
}

export default function BarcodeInput({ onResult, placeholder = 'Scan or type barcode...' }: BarcodeInputProps) {
  const [barcode, setBarcode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleScan = async (value: string) => {
    if (!value.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await barcodeApi.scan(value.trim());
      onResult?.(res.data.data);
      setBarcode('');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Scan failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-3">
      <input
        ref={inputRef}
        type="text"
        value={barcode}
        placeholder={placeholder}
        disabled={isLoading}
        onChange={(e) => setBarcode(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleScan(barcode)}
        className="input-field min-w-[240px] flex-1"
      />
      <button
        type="button"
        onClick={() => handleScan(barcode)}
        disabled={isLoading || !barcode}
        className="btn-primary whitespace-nowrap"
      >
        {isLoading ? 'Scanning...' : 'Scan'}
      </button>
      {error && (
        <div className="w-full">
          <UiBanner tone="critical">{error}</UiBanner>
        </div>
      )}
    </div>
  );
}
