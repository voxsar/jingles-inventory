import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BarcodePrintPage from '../../pages/BarcodePrintPage';

const listTemplatesMock = vi.fn();
const listPrintJobsMock = vi.fn();
const uploadTemplateLogoMock = vi.fn();
const deleteTemplateLogoMock = vi.fn();
const updateTemplateMock = vi.fn();
const createTemplateMock = vi.fn();
const skusListMock = vi.fn();

vi.mock('../../api/client', () => ({
  barcodeApi: {
    listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
    listPrintJobs: (...args: unknown[]) => listPrintJobsMock(...args),
    uploadTemplateLogo: (...args: unknown[]) => uploadTemplateLogoMock(...args),
    deleteTemplateLogo: (...args: unknown[]) => deleteTemplateLogoMock(...args),
    updateTemplate: (...args: unknown[]) => updateTemplateMock(...args),
    createTemplate: (...args: unknown[]) => createTemplateMock(...args),
  },
  skusApi: {
    list: (...args: unknown[]) => skusListMock(...args),
  },
  variantsApi: {
    list: vi.fn(),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BarcodePrintPage />
    </MemoryRouter>,
  );
}

describe('BarcodePrintPage logo template field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTemplatesMock.mockResolvedValue({ data: { data: [] } });
    listPrintJobsMock.mockResolvedValue({ data: { data: { items: [], total: 0, totalPages: 1 } } });
    skusListMock.mockResolvedValue({ data: { data: [] } });
  });

  it('shows a "Company logo" toggle in the template editor, off by default', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'New print entry' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'New print entry' }));

    const logoCheckbox = await screen.findByRole('checkbox', { name: 'Company logo' });
    expect(logoCheckbox).not.toBeChecked();
  });

  it('disables logo upload until the template has been saved', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'New print entry' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'New print entry' }));

    await screen.findByRole('checkbox', { name: 'Company logo' });
    expect(screen.getByText('Save this template first to upload a logo.')).toBeInTheDocument();
  });

  it('uploads a logo file for an already-saved template and shows the preview', async () => {
    const user = userEvent.setup();
    listTemplatesMock.mockResolvedValue({
      data: {
        data: [
          {
            id: 'tpl-1', name: 'Existing template', isDefault: true, showLogo: true, logoUrl: null,
            pageWidthMm: 210, pageHeightMm: 297, columns: 3, rows: 8, labelWidthMm: 62, labelHeightMm: 34,
          },
        ],
      },
    });
    uploadTemplateLogoMock.mockResolvedValue({ data: { data: { logoUrl: '/uploads/barcode/logo-1.png' } } });

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'New print entry' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'New print entry' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Template name')).toHaveValue('Existing template');
    });

    const file = new File(['fake-image'], 'logo.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"][accept*="image/png"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(uploadTemplateLogoMock).toHaveBeenCalledWith('tpl-1', file);
    });
  });
});
