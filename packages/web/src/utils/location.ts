// Human-readable location trail for an inventory record, e.g.
// "🏢 Main › Ground Floor › 📚 Shelf A › 📦 Box 3".
export function formatInventoryLocation(record: any, fallback = '—') {
	const parts: string[] = [];
	if (record.floor) {
		const branchName = record.floor.branch?.name;
		parts.push(branchName ? `🏢 ${branchName} › ${record.floor.name}` : `${record.floor.name} (${record.floor.code})`);
	}
	if (record.shelf) parts.push(`📚 ${record.shelf.name}`);
	if (record.box) parts.push(`📦 ${record.box.name}`);
	return parts.length > 0 ? parts.join(' › ') : fallback;
}
