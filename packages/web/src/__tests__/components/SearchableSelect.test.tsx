import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SearchableSelect from '../../components/SearchableSelect';

describe('SearchableSelect', () => {
  it('always shows a dedicated menu search box for a one-option list', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        options={[{ value: 'only', label: 'Only option' }]}
        value="only"
        onChange={vi.fn()}
        isClearable={false}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('searchbox', { name: 'Search options' })).toBeVisible();
  });

  it('filters options through the dedicated search box', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        options={[{ value: 'all', label: 'All products' }, { value: 'gel', label: 'Shaving gel' }]}
        value="all"
        onChange={vi.fn()}
        isClearable={false}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('searchbox', { name: 'Search options' }));
    await user.keyboard('gel');

    expect(screen.getByRole('option', { name: 'Shaving gel' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'All products' })).not.toBeInTheDocument();
  });
});
