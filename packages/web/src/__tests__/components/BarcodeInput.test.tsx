import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BarcodeInput from '../../components/BarcodeInput';

// Mock the barcode API
vi.mock('../../api/client', () => ({
  barcodeApi: {
    scan: vi.fn(),
  },
}));

import { barcodeApi } from '../../api/client';

describe('BarcodeInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input field with default placeholder', () => {
    render(<BarcodeInput />);
    expect(screen.getByPlaceholderText('Scan or type barcode...')).toBeInTheDocument();
  });

  it('renders input with custom placeholder', () => {
    render(<BarcodeInput placeholder="Type barcode here" />);
    expect(screen.getByPlaceholderText('Type barcode here')).toBeInTheDocument();
  });

  it('renders scan button', () => {
    render(<BarcodeInput />);
    expect(screen.getByRole('button', { name: /scan/i })).toBeInTheDocument();
  });

  it('scan button is disabled when input is empty', () => {
    render(<BarcodeInput />);
    expect(screen.getByRole('button', { name: /scan/i })).toBeDisabled();
  });

  it('scan button is enabled when barcode is typed', async () => {
    render(<BarcodeInput />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    await userEvent.type(input, 'SKU-001');
    expect(screen.getByRole('button', { name: /scan/i })).not.toBeDisabled();
  });

  it('calls barcodeApi.scan on Enter key press', async () => {
    (barcodeApi.scan as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { found: true, sku: { id: 'sku-001', skuCode: 'SKU-001' } } },
    });

    render(<BarcodeInput />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    await userEvent.type(input, 'SKU-001');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(barcodeApi.scan).toHaveBeenCalledWith('SKU-001');
    });
  });

  it('calls barcodeApi.scan on button click', async () => {
    (barcodeApi.scan as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { found: true, sku: { skuCode: 'SKU-001' } } },
    });

    render(<BarcodeInput />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    await userEvent.type(input, 'SKU-001');
    await userEvent.click(screen.getByRole('button', { name: /scan/i }));

    await waitFor(() => {
      expect(barcodeApi.scan).toHaveBeenCalledWith('SKU-001');
    });
  });

  it('calls onResult callback with scan result', async () => {
    const mockResult = { found: true, sku: { skuCode: 'SKU-001' } };
    (barcodeApi.scan as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: mockResult },
    });

    const onResult = vi.fn();
    render(<BarcodeInput onResult={onResult} />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    await userEvent.type(input, 'SKU-001');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(mockResult);
    });
  });

  it('clears input after successful scan', async () => {
    (barcodeApi.scan as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { found: true } },
    });

    render(<BarcodeInput />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    await userEvent.type(input, 'SKU-001');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
    });
  });

  it('shows error message on scan failure', async () => {
    (barcodeApi.scan as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { error: 'Barcode not found' } },
    });

    render(<BarcodeInput />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    await userEvent.type(input, 'UNKNOWN-001');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Barcode not found')).toBeInTheDocument();
    });
  });

  it('shows generic error when no response error available', async () => {
    (barcodeApi.scan as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network Error'));

    render(<BarcodeInput />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    await userEvent.type(input, 'SKU-001');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Scan failed')).toBeInTheDocument();
    });
  });

  it('does not scan when input is empty or whitespace', async () => {
    render(<BarcodeInput />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(barcodeApi.scan).not.toHaveBeenCalled();
  });

  it('disables input while loading', async () => {
    let resolvePromise: (value: any) => void;
    (barcodeApi.scan as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(resolve => { resolvePromise = resolve; })
    );

    render(<BarcodeInput />);
    const input = screen.getByPlaceholderText('Scan or type barcode...');
    await userEvent.type(input, 'SKU-001');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(input).toBeDisabled();
    });
  });
});
