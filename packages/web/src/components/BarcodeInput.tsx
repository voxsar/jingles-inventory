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
    <div className="flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={barcode}
        onChange={e => setBarcode(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleScan(barcode)}
        placeholder={placeholder}
        className="input-field flex-1"
        disabled={isLoading}
      />
      <button
        onClick={() => handleScan(barcode)}
        disabled={isLoading || !barcode}
        className="btn-primary whitespace-nowrap"
      >
        {isLoading ? '...' : '🔍 Scan'}
      </button>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}
