import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SKUPage from '../../pages/SKUPage';

const listSkusMock = vi.fn();
const getDuplicateGroupsMock = vi.fn();
const createVariantFamilyMock = vi.fn();
const listVendorsMock = vi.fn();
const listCategoriesMock = vi.fn();
const listUnitsMock = vi.fn();
const getAllTagsMock = vi.fn();

vi.mock('../../api/client', () => ({
	skusApi: {
		list: (...args: unknown[]) => listSkusMock(...args),
		getDuplicateGroups: (...args: unknown[]) => getDuplicateGroupsMock(...args),
		createVariantFamily: (...args: unknown[]) => createVariantFamilyMock(...args),
		getAllTags: (...args: unknown[]) => getAllTagsMock(...args),
	},
	vendorsApi: {
		list: (...args: unknown[]) => listVendorsMock(...args),
	},
	categoriesApi: {
		list: (...args: unknown[]) => listCategoriesMock(...args),
	},
	settingsApi: {
		listUnits: (...args: unknown[]) => listUnitsMock(...args),
	},
	inventoryApi: {},
	attributesApi: {},
	variantsApi: {},
	batchesApi: {},
	floorsApi: {},
	shelvesApi: {},
	boxesApi: {},
	grnsApi: {},
}));

describe('SKUPage', () => {
	const alertMock = vi.fn();
	const confirmMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('alert', alertMock);
		vi.stubGlobal('confirm', confirmMock);
		confirmMock.mockReturnValue(true);

		listSkusMock.mockResolvedValue({
			data: {
				data: {
					items: [
						{
							id: '11111111-1111-4111-8111-111111111111',
							skuCode: 'PADLOCK-701',
							name: 'GLOBE PADLOCK 701 20MM',
							category: { name: 'Hardware' },
							vendor: { name: 'Globe' },
							skuVendors: [],
							unitOfMeasure: 'Piece',
							tags: [],
							lowStockThreshold: null,
							isFragile: false,
							isActive: true,
							_count: { variants: 0 },
						},
						{
							id: '22222222-2222-4222-8222-222222222222',
							skuCode: 'PADLOCK-702',
							name: 'GLOBE PADLOCK 702 25MM',
							category: { name: 'Hardware' },
							vendor: { name: 'Globe' },
							skuVendors: [],
							unitOfMeasure: 'Piece',
							tags: [],
							lowStockThreshold: null,
							isFragile: false,
							isActive: true,
							_count: { variants: 0 },
						},
					],
					total: 2,
					totalPages: 1,
				},
			},
		});
		listVendorsMock.mockResolvedValue({ data: [] });
		listCategoriesMock.mockResolvedValue({ data: { data: [] } });
		listUnitsMock.mockResolvedValue({ data: { data: [] } });
		getAllTagsMock.mockResolvedValue({ data: { data: [] } });
		getDuplicateGroupsMock.mockResolvedValue({ data: { data: { items: [] } } });
		createVariantFamilyMock.mockResolvedValue({
			data: {
				data: {
					masterName: 'GLOBE PADLOCK',
					createdVariantCount: 2,
					movedInventoryRecords: 3,
					movedBatches: 0,
					createdSyntheticBatches: 2,
				},
			},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('lets users select products in order and create a variant family', async () => {
		const user = userEvent.setup();

		render(<SKUPage />);

		await waitFor(() => {
			expect(screen.getByText('GLOBE PADLOCK 701 20MM')).toBeInTheDocument();
		});

		await user.click(screen.getByLabelText('Select product GLOBE PADLOCK 701 20MM'));
		await user.click(screen.getByLabelText('Select product GLOBE PADLOCK 702 25MM'));

		await waitFor(() => {
			expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
			expect(screen.getByText(/master: GLOBE PADLOCK 701 20MM/i)).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Create 2 Variants Under Master' })).toBeEnabled();
		});

		await user.click(screen.getByRole('button', { name: 'Create 2 Variants Under Master' }));

		expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('Create a variant family with "GLOBE PADLOCK 701 20MM" as the master product?'));

		await waitFor(() => {
			expect(createVariantFamilyMock).toHaveBeenCalledWith({
				masterSkuId: '11111111-1111-4111-8111-111111111111',
				sourceSkuIds: ['22222222-2222-4222-8222-222222222222'],
			});
			expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Created 2 variant(s) under GLOBE PADLOCK.'));
		});
	});
});
