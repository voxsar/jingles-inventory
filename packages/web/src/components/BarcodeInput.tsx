import { useState, useRef, useEffect } from 'react';
import { barcodeApi } from '../api/client';

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
    <s-stack direction="inline" gap="base">
      <input
        ref={inputRef}
        type="text"
        value={barcode}
        placeholder={placeholder}
        disabled={isLoading}
        onChange={(e) => setBarcode(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleScan(barcode)}
        style={{ flex: 1, padding: '8px 12px', border: '1px solid #c9cccf', borderRadius: '6px', fontSize: '14px' }}
      />
      <button
        type="button"
        onClick={() => handleScan(barcode)}
        disabled={isLoading || !barcode}
        style={{ padding: '8px 16px', background: '#008060', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        {isLoading ? 'Scanning...' : 'Scan'}
      </button>
      {error && <s-banner tone="critical">{error}</s-banner>}
    </s-stack>
  );
}
