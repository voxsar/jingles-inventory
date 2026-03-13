import { InventoryState } from '@jingles/shared';

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
}

export default function StateBadge({ state }: StateBadgeProps) {
  const tone = STATE_TONES[state] ?? '';
  return tone
    ? <s-badge tone={tone as any}>{state}</s-badge>
    : <s-badge>{state}</s-badge>;
}
