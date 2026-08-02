import { IDimensions } from '@jingles/shared';
import prisma from '../../prisma/client';

export function calculateVolume(dimensions: IDimensions): number {
	return dimensions.height * dimensions.width * dimensions.length;
}

export function calculateCapacityUsage(
	usedVolume: number,
	totalCapacity: number
): number {
	if (totalCapacity <= 0) return 0;
	return Math.min((usedVolume / totalCapacity) * 100, 100);
}

export interface StackingValidation {
	canStack: boolean;
	reason?: string;
}

export function validateStacking(
	items: Array<{ isFragile: boolean; maxStackHeight?: number | null; dimensions?: IDimensions | null; weight?: number; quantity?: number }>,
	newItem: { isFragile: boolean; maxStackHeight?: number | null; dimensions?: IDimensions | null; weight?: number; quantity?: number }
): StackingValidation {
	if (items.some((item) => item.isFragile)) {
		return { canStack: false, reason: 'Items cannot be stacked on top of a fragile item' };
	}

	const supportingItem = items.at(-1);
	const supportingWeight = supportingItem?.weight ?? supportingItem?.dimensions?.weight;
	const newWeight = newItem.weight ?? newItem.dimensions?.weight;
	if (supportingWeight != null && newWeight != null && newWeight > supportingWeight) {
		return { canStack: false, reason: 'Heavier items must be placed below lighter items' };
	}

	const existingHeight = items.reduce((sum, item) => {
		return sum + (item.dimensions?.height ?? 0) * Math.max(1, item.quantity ?? 1);
	}, 0);

	const totalHeight = existingHeight + (newItem.dimensions?.height ?? 0) * Math.max(1, newItem.quantity ?? 1);

	for (const item of items) {
		if (item.maxStackHeight !== null && item.maxStackHeight !== undefined && totalHeight > item.maxStackHeight) {
			return { canStack: false, reason: `Stack height ${totalHeight}cm exceeds max ${item.maxStackHeight}cm` };
		}
	}

	const newItemHeight = (newItem.dimensions?.height ?? 0) * Math.max(1, newItem.quantity ?? 1);
	if (newItem.maxStackHeight !== null && newItem.maxStackHeight !== undefined && newItemHeight > newItem.maxStackHeight) {
		return { canStack: false, reason: `Item height ${newItemHeight}cm exceeds its max ${newItem.maxStackHeight}cm` };
	}

	return { canStack: true };
}

export async function calculateShelfUsage(shelfId: string) {
	const shelf = await prisma.shelf.findUnique({
		where: { id: shelfId, isActive: true },
		include: {
			inventoryRecords: {
				where: { quantity: { gt: 0 } },
				include: { sku: true },
			},
			boxes: {
				where: { isActive: true },
				include: { inventoryRecords: { where: { quantity: { gt: 0 } }, include: { sku: true } } },
			},
		},
	});

	if (!shelf) {
		return { shelfId, totalCapacity: 0, usedVolume: 0, usagePercentage: 0 };
	}

	const totalCapacity = shelf.height * shelf.width * shelf.length;
	let usedVolume = 0;

	const records = [...shelf.inventoryRecords, ...shelf.boxes.flatMap((box) => box.inventoryRecords)]
		.filter((record, index, all) => all.findIndex((candidate) => candidate.id === record.id) === index);
	for (const record of records) {
		const dims = record.sku.dimensions as IDimensions | null;
		if (dims) {
			usedVolume += calculateVolume(dims) * record.quantity;
		}
	}

	return {
		shelfId,
		totalCapacity,
		usedVolume,
		usagePercentage: calculateCapacityUsage(usedVolume, totalCapacity),
	};
}

export async function getStackingSuggestions(skuId: string, floorId: string) {
	const [sku, floor] = await Promise.all([
		prisma.sKU.findUnique({ where: { id: skuId } }),
		prisma.floor.findUnique({
			where: { id: floorId },
			include: {
				shelves: {
					where: { isActive: true },
					include: {
						inventoryRecords: { where: { quantity: { gt: 0 } }, include: { sku: true } },
						boxes: { where: { isActive: true }, include: { inventoryRecords: { where: { quantity: { gt: 0 } }, include: { sku: true } } } },
					},
				},
			},
		}),
	]);

	if (!sku || !floor) {
		return { canPlace: false, reason: 'SKU or Floor not found' };
	}

	const candidates = floor.shelves.map((shelf: any) => {
		const records = [...shelf.inventoryRecords, ...shelf.boxes.flatMap((box: any) => box.inventoryRecords)]
			.filter((record: any, index: number, all: any[]) => all.findIndex((candidate) => candidate.id === record.id) === index);
		const existingItems = records.map((record: any) => ({
			isFragile: record.sku.isFragile,
			maxStackHeight: record.sku.maxStackHeight,
			dimensions: record.sku.dimensions as IDimensions | null,
			quantity: record.quantity,
		}));
		const validation = validateStacking(existingItems, {
			isFragile: sku.isFragile,
			maxStackHeight: sku.maxStackHeight,
			dimensions: sku.dimensions as IDimensions | null,
		});
		const capacity = shelf.height * shelf.width * shelf.length;
		const used = existingItems.reduce((sum: number, item: any) => sum + (item.dimensions ? calculateVolume(item.dimensions) * item.quantity : 0), 0);
		return { shelfId: shelf.id, shelfName: shelf.name, canPlace: validation.canStack && used < capacity, reason: validation.reason, usagePercentage: calculateCapacityUsage(used, capacity), currentItems: records.length };
	});
	const suggested = candidates.filter((candidate: any) => candidate.canPlace).sort((a: any, b: any) => a.usagePercentage - b.usagePercentage)[0] ?? null;
	return {
		canPlace: Boolean(suggested),
		reason: suggested ? undefined : (candidates[0]?.reason ?? 'No active shelf has available capacity'),
		currentItems: candidates.reduce((sum: number, candidate: any) => sum + candidate.currentItems, 0),
		suggestedFloor: suggested ? floorId : null,
		suggestedShelfId: suggested?.shelfId ?? null,
		candidates,
	};
}
