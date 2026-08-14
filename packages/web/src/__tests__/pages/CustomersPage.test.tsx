import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomersPage from '../../pages/CustomersPage';

const listMock = vi.fn();
const getMock = vi.fn();

vi.mock('../../api/client', () => ({
  customersApi: {
    list: (...args: unknown[]) => listMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}));

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({
      data: [
        {
          id: 'customer-001',
          code: 'C001',
          name: 'Acme Stores',
          tier: 'Wholesale',
          email: 'accounts@acme.example',
          phone: '0771234567',
          creditLimit: 50000,
          creditBalance: 8750,
          availableCredit: 41250,
        },
      ],
    });
    getMock.mockResolvedValue({
      data: {
        customer: {
          id: 'customer-001',
          code: 'C001',
          name: 'Acme Stores',
          tier: 'Wholesale',
          email: 'accounts@acme.example',
          phone: '0771234567',
          creditLimit: 50000,
          creditBalance: 8750,
          availableCredit: 41250,
        },
        creditPayments: [
          { id: 'payment-001', amount: 1250, method: 'CASH', note: 'Counter payment', createdAt: '2026-08-14T10:05:00.000Z' },
        ],
        sales: [
          { id: 'sale-001', receiptNumber: 'R-1001', status: 'COMPLETED', total: 10000, createdAt: '2026-08-14T10:00:00.000Z' },
        ],
      },
    });
  });

  it('shows a read-only customer account with payment and order history', async () => {
    render(<CustomersPage />);

    expect(await screen.findByText('Acme Stores')).toBeInTheDocument();
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('customer-001'));
    expect(await screen.findByText('Counter payment')).toBeInTheDocument();
    expect(screen.getByText('R-1001')).toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Search by name/), 'missing');
    expect(screen.getByText('No customer accounts have synced from POS yet')).toBeInTheDocument();
  });
});
