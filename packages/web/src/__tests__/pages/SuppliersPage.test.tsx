import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuppliersPage from '../../pages/SuppliersPage';

const listMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const getDuplicateGroupsMock = vi.fn();
const mergeDuplicateMock = vi.fn();
const listStatusesMock = vi.fn();

vi.mock('../../api/client', () => ({
  vendorsApi: {
    list: (...args: unknown[]) => listMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    getDuplicateGroups: (...args: unknown[]) => getDuplicateGroupsMock(...args),
    mergeDuplicate: (...args: unknown[]) => mergeDuplicateMock(...args),
  },
  settingsApi: {
    listStatuses: (...args: unknown[]) => listStatusesMock(...args),
  },
}));

describe('SuppliersPage', () => {
  const alertMock = vi.fn();
  const confirmMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', alertMock);
    vi.stubGlobal('confirm', confirmMock);

    listMock.mockResolvedValue({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Acme Trading Ltd',
          contactEmail: 'sales@acme.example',
          contactPhone: '+94 77 123 4567',
          type: 'Supplier',
          paymentTerms: 'Net 30',
          isActive: true,
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Global Wholesale Co',
          contactEmail: 'ops@global.example',
          contactPhone: '+94 11 222 3333',
          type: 'Supplier',
          paymentTerms: 'Net 15',
          isActive: true,
        },
      ],
    });
    listStatusesMock.mockResolvedValue({
      data: {
        data: [
          { value: 'Supplier', label: 'Supplier' },
          { value: 'Vendor', label: 'Vendor' },
          { value: 'Both', label: 'Both' },
        ],
      },
    });
    getDuplicateGroupsMock.mockResolvedValue({
      data: {
        data: {
          items: [
            {
              target: {
                id: '11111111-1111-4111-8111-111111111111',
                name: 'Acme Trading Ltd',
                contactEmail: 'sales@acme.example',
                contactPhone: '+94 77 123 4567',
                type: 'Supplier',
                website: 'https://acme.example',
                taxId: 'TX-100',
                _count: {
                  skus: 5,
                  skuVendors: 7,
                  grns: 3,
                  prns: 1,
                  users: 1,
                  batches: 4,
                },
              },
              items: [
                {
                  vendor: {
                    id: '22222222-2222-4222-8222-222222222222',
                    name: 'Acme Supplier',
                    contactEmail: 'sales@acme.example',
                    contactPhone: '0771234567',
                    type: 'Supplier',
                    website: 'http://www.acme.example',
                    taxId: 'TX100',
                    _count: {
                      skus: 2,
                      skuVendors: 2,
                      grns: 2,
                      prns: 1,
                      users: 1,
                      batches: 4,
                    },
                  },
                  score: 98,
                  reason: 'Exact supplier name and email match',
                  matchedSignals: [
                    { key: 'email', label: 'Email', value: 'sales@acme.example' },
                    { key: 'taxId', label: 'Tax ID', value: 'TX100' },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    mergeDuplicateMock.mockResolvedValue({
      data: {
        data: {
          mergedVendorName: 'Acme Supplier',
          movedPrimaryProducts: 2,
          movedProductLinks: 2,
          movedUsers: 1,
          movedGrns: 2,
          movedPrns: 1,
          movedBatches: 4,
          updatedFieldCount: 3,
        },
      },
    });
    confirmMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads supplier duplicate groups and merges a candidate supplier', async () => {
    const user = userEvent.setup();

    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Trading Ltd')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Possible Duplicates' }));

    await waitFor(() => {
      expect(getDuplicateGroupsMock).toHaveBeenCalledWith({ minScore: '74', limit: '1000' });
      expect(screen.getByText('Acme Supplier')).toBeInTheDocument();
      expect(screen.getByText('98% match')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Merge' }));

    expect(confirmMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(mergeDuplicateMock).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      );
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Merged Acme Supplier.'));
    });
  });

  it('lets users manually select suppliers and merge them into a chosen target', async () => {
    const user = userEvent.setup();

    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByText('Global Wholesale Co')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Select supplier Acme Trading Ltd'));
    await user.click(screen.getByLabelText('Select supplier Global Wholesale Co'));

    await waitFor(() => {
      expect(screen.getByText('2 selected • 1 will merge into the target')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Merge 1 Into Target' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Merge 1 Into Target' }));

    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('Keep "Acme Trading Ltd" and merge 1 other supplier(s) into it?'));

    await waitFor(() => {
      expect(mergeDuplicateMock).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
      );
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Merged 1 supplier(s) into Acme Trading Ltd.'));
    });
  });
});
