import { InventoryState } from '@jingles/shared';

const STATE_CLASSES: Record<string, string> = {
  [InventoryState.UnopenedBox]: 'badge-purple',
  [InventoryState.Uninspected]: 'badge-yellow',
  [InventoryState.Inspected]: 'badge-blue',
  [InventoryState.ShelfReady]: 'badge-green',
  [InventoryState.Damaged]: 'badge-red',
  [InventoryState.Returned]: 'badge-orange',
  [InventoryState.Reserved]: 'badge-indigo',
  [InventoryState.Sold]: 'badge-gray',
};

const STATE_TONES: Record<string, string> = {
  [InventoryState.UnopenedBox]: 'info',
  [InventoryState.Uninspected]: 'warning',
  [InventoryState.Inspected]: 'info',
  [InventoryState.ShelfReady]: 'success',
  [InventoryState.Damaged]: 'critical',
  [InventoryState.Returned]: 'warning',
  [InventoryState.Reserved]: 'info',
  [InventoryState.Sold]: '',
};

interface StateBadgeProps {
  state: string;
  className?: string;
}

export default function StateBadge({ state, className }: StateBadgeProps) {
  const colorClass = STATE_CLASSES[state] ?? 'badge-gray';
  const tone = STATE_TONES[state] ?? '';
  const classes = [colorClass, className].filter(Boolean).join(' ');
  return (
    <span className={classes} data-tone={tone}>
      {state}
    </span>
  );
}
