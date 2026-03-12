import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StateBadge from '../../components/StateBadge';
import { InventoryState } from '@jingles/shared';

describe('StateBadge', () => {
  it('renders the state text', () => {
    render(<StateBadge state={InventoryState.ShelfReady} />);
    expect(screen.getByText('ShelfReady')).toBeInTheDocument();
  });

  it('renders UnopenedBox with purple color class', () => {
    const { container } = render(<StateBadge state={InventoryState.UnopenedBox} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('purple');
  });

  it('renders Uninspected with yellow color class', () => {
    const { container } = render(<StateBadge state={InventoryState.Uninspected} />);
    expect(container.querySelector('span')?.className).toContain('yellow');
  });

  it('renders Inspected with blue color class', () => {
    const { container } = render(<StateBadge state={InventoryState.Inspected} />);
    expect(container.querySelector('span')?.className).toContain('blue');
  });

  it('renders ShelfReady with green color class', () => {
    const { container } = render(<StateBadge state={InventoryState.ShelfReady} />);
    expect(container.querySelector('span')?.className).toContain('green');
  });

  it('renders Damaged with red color class', () => {
    const { container } = render(<StateBadge state={InventoryState.Damaged} />);
    expect(container.querySelector('span')?.className).toContain('red');
  });

  it('renders Returned with orange color class', () => {
    const { container } = render(<StateBadge state={InventoryState.Returned} />);
    expect(container.querySelector('span')?.className).toContain('orange');
  });

  it('renders Reserved with indigo color class', () => {
    const { container } = render(<StateBadge state={InventoryState.Reserved} />);
    expect(container.querySelector('span')?.className).toContain('indigo');
  });

  it('renders Sold with gray color class', () => {
    const { container } = render(<StateBadge state={InventoryState.Sold} />);
    expect(container.querySelector('span')?.className).toContain('gray');
  });

  it('renders unknown state with fallback gray class', () => {
    const { container } = render(<StateBadge state="UNKNOWN_STATE" />);
    expect(container.querySelector('span')?.className).toContain('gray');
    expect(screen.getByText('UNKNOWN_STATE')).toBeInTheDocument();
  });

  it('applies additional className prop', () => {
    const { container } = render(<StateBadge state={InventoryState.Sold} className="custom-class" />);
    expect(container.querySelector('span')?.className).toContain('custom-class');
  });

  it('renders all 8 inventory states without throwing', () => {
    const states = Object.values(InventoryState);
    for (const state of states) {
      expect(() => render(<StateBadge state={state} />)).not.toThrow();
    }
  });
});
