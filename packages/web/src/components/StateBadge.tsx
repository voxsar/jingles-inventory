import clsx from 'clsx';
import { InventoryState } from '@jingles/shared';

const STATE_COLORS: Record<string, string> = {
  [InventoryState.UnopenedBox]: 'bg-purple-100 text-purple-800',
  [InventoryState.Uninspected]: 'bg-yellow-100 text-yellow-800',
  [InventoryState.Inspected]: 'bg-blue-100 text-blue-800',
  [InventoryState.ShelfReady]: 'bg-green-100 text-green-800',
  [InventoryState.Damaged]: 'bg-red-100 text-red-800',
  [InventoryState.Returned]: 'bg-orange-100 text-orange-800',
  [InventoryState.Reserved]: 'bg-indigo-100 text-indigo-800',
  [InventoryState.Sold]: 'bg-gray-100 text-gray-800',
};

interface StateBadgeProps {
  state: string;
  className?: string;
}

export default function StateBadge({ state, className }: StateBadgeProps) {
  return (
    <span className={clsx('px-2 py-1 text-xs font-medium rounded-full', STATE_COLORS[state] ?? 'bg-gray-100 text-gray-800', className)}>
      {state}
    </span>
  );
}
