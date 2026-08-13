import prisma from '../../prisma/client';
import {
	InventoryState,
	LegacySyncChunk,
	LegacySyncChunkResult,
	LegacySyncEntityCounts,
	LegacySyncLocationDetail,
	LegacySyncLocationRow,
	LegacySyncProductRow,
	LegacySyncSupplierRow,
	LegacySyncUnitRow,
	LegacySyncVariantRow,
} from '@jingles/shared';
import { upsertLegacyPosRecords } from '../../services/posCloud';
import { queueDashboardStatsRefresh } from '../dashboard/dashboardService';
import { importLegacyDocuments, LegacyDocumentImportResult } from './legacyDocumentImport';
import {
	legacyQuantitySyncIsEnabled,
	lockInventoryQuantityWrites,
} from '../inventory/inventoryControl';

export const LEGACY_SYNC_TERMINAL_ID = 'legacy-desktop-sync';
const LEGACY_IMPORT_TERMINAL_ID = 'legacy-sql-import';
const LEGACY_SYNC_EVENT_TYPE = 'LEGACY_SYNC_ADJUSTMENT';
const DEFAULT_FLOOR_CODE = 'MAIN';
const DEFAULT_FLOOR_NAME = 'Main Floor';
const QTY_EPSILON = 0.0005;
const MAX_WARNINGS_PER_CHUNK = 200;

// States that count as physically on hand when mirroring legacy quantities.
const ON_HAND_STATES = [
	InventoryState.UnopenedBox,
	InventoryState.Uninspected,
	InventoryState.Inspected,
	InventoryState.ShelfReady,
	InventoryState.Reserved,
];

// ── Small helpers shared with the one-time importer's conventions ──────────

function normalizeLookup(value: unknown) {
	return String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function slugify(value: string) {
	return normalizeLookup(value).replace(/\s+/g, '-');
}

function composeCategorySlug(parentSlug: string | undefined, segmentSlug: string) {
	return parentSlug ? `${parentSlug}--${segmentSlug}` : segmentSlug;
}

function compactString(value: unknown) {
	if (value === null || value === undefined) return undefined;
	const text = String(value).trim();
	return text.length > 0 ? text : undefined;
}

function detectUnitType(name: string) {
	const key = normalizeLookup(name);
	if (key.includes('kg') || key.includes('gram') || key.includes('g ')) return 'Weight';
	if (key.includes('liter') || key.includes('litre') || key.includes('l ') || key === 'ml' || key.includes('milliliter')) return 'Volume';
	if (key.includes('meter') || key.includes('centimeter') || key === 'm' || key === 'cm') return 'Length';
	if (key.includes('piece') || key.includes('pack') || key.includes('box') || key.includes('unit')) return 'Count';
	return 'Other';
}

function valuesEqual(left: unknown, right: unknown) {
	if (typeof left === 'number' && typeof right === 'number') {
		return Math.abs(left - right) < 1e-9;
	}
	return left === right;
}

type PlainRecord = Record<string, unknown>;

// Three-way merge: a field is written only when the legacy side actually
// changed it (compared to the last value this sync applied). On first contact
// with a pre-existing entity we only fill gaps, so curation done in this
// system (renames, repricing after a variant merge) is never clobbered by a
// legacy value that has not moved.
function planFieldUpdates(incoming: PlainRecord, lastApplied: PlainRecord | undefined, current: PlainRecord) {
	const updates: PlainRecord = {};
	for (const [key, incomingValue] of Object.entries(incoming)) {
		if (incomingValue === undefined) continue;
		const currentValue = current[key];
		const baseKnown = lastApplied !== undefined && key in lastApplied;
		if (!baseKnown) {
			if (currentValue === null || currentValue === undefined) {
				updates[key] = incomingValue;
			}
			continue;
		}
		if (!valuesEqual(incomingValue, (lastApplied as PlainRecord)[key]) && !valuesEqual(incomingValue, currentValue)) {
			updates[key] = incomingValue;
		}
	}
	return updates;
}

// ── Per-chunk context ───────────────────────────────────────────────────────

interface ChunkContext {
	runId: string;
	counts: Record<string, LegacySyncEntityCounts>;
	inventoryAdjustments: number;
	warnings: string[];
	branchByLocationId: Map<string, { branchId: string; floorId: string; code: string } | null>;
	unitByLegacyId: Map<string, { id: string; name: string }>;
	vendorByLegacyId: Map<string, string>;
	categoryBySlug: Map<string, string>;
	attributeByName: Map<string, string>;
	attributeValueByKey: Map<string, string>;
	onlyBranchId: string | null;
}

function newCounts(): LegacySyncEntityCounts {
	return { received: 0, created: 0, updated: 0, unchanged: 0, skipped: 0 };
}

function warn(ctx: ChunkContext, message: string) {
	if (ctx.warnings.length < MAX_WARNINGS_PER_CHUNK) {
		ctx.warnings.push(message);
	}
}

// ── Link bookkeeping ────────────────────────────────────────────────────────

async function getLink(sourceType: string, sourceId: string) {
	return prisma.legacyEntityLink.findUnique({
		where: { sourceType_sourceId: { sourceType, sourceId } },
	});
}

async function saveLink(args: {
	sourceType: string;
	sourceId: string;
	sourceCode?: string;
	targetType: string;
	targetId: string;
	resolution: string;
	lastApplied: PlainRecord;
}) {
	return prisma.legacyEntityLink.upsert({
		where: { sourceType_sourceId: { sourceType: args.sourceType, sourceId: args.sourceId } },
		create: {
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			sourceCode: args.sourceCode ?? null,
			targetType: args.targetType,
			targetId: args.targetId,
			resolution: args.resolution,
			lastApplied: args.lastApplied as any,
			lastSeenAt: new Date(),
		},
		update: {
			sourceCode: args.sourceCode ?? null,
			targetType: args.targetType,
			targetId: args.targetId,
			resolution: args.resolution,
			lastApplied: args.lastApplied as any,
			lastSeenAt: new Date(),
		},
	});
}

async function touchLink(linkId: string, lastApplied: PlainRecord) {
	await prisma.legacyEntityLink.update({
		where: { id: linkId },
		data: { lastApplied: lastApplied as any, lastSeenAt: new Date() },
	});
}

// ── Units ───────────────────────────────────────────────────────────────────

async function ensureUnitByName(ctx: ChunkContext, name: string, code?: string) {
	const existing = await prisma.unitOfMeasure.findUnique({ where: { name }, select: { id: true, name: true } });
	if (existing) return existing;
	const created = await prisma.unitOfMeasure.create({
		data: {
			name,
			abbreviation: compactString(code) ?? name.slice(0, 3).toUpperCase(),
			type: detectUnitType(name),
		},
		select: { id: true, name: true },
	});
	ctx.counts.units.created += 1;
	return created;
}

async function applyUnit(ctx: ChunkContext, row: LegacySyncUnitRow) {
	ctx.counts.units.received += 1;
	const name = compactString(row.name);
	if (!name) {
		ctx.counts.units.skipped += 1;
		return;
	}

	const link = await getLink('unit', row.unitId);
	if (link) {
		const unit = await prisma.unitOfMeasure.findUnique({ where: { id: link.targetId }, select: { id: true, name: true } });
		if (unit) {
			ctx.unitByLegacyId.set(row.unitId, unit);
			ctx.counts.units.unchanged += 1;
			return;
		}
	}

	const before = ctx.counts.units.created;
	const unit = await ensureUnitByName(ctx, name, row.code);
	if (ctx.counts.units.created === before) ctx.counts.units.unchanged += 1;
	ctx.unitByLegacyId.set(row.unitId, unit);
	await saveLink({
		sourceType: 'unit',
		sourceId: row.unitId,
		sourceCode: row.code,
		targetType: 'unit',
		targetId: unit.id,
		resolution: ctx.counts.units.created > before ? 'created' : 'name',
		lastApplied: { name },
	});
}

// ── Suppliers ───────────────────────────────────────────────────────────────

function supplierFields(row: LegacySyncSupplierRow): PlainRecord {
	return {
		name: compactString(row.name),
		contactPhone: compactString(row.phone) ?? null,
		address: compactString(row.address) ?? null,
		website: compactString(row.website) ?? null,
		taxId: compactString(row.taxId) ?? null,
		paymentTerms: row.creditPeriodDays !== undefined ? `Net ${row.creditPeriodDays} days` : undefined,
		isActive: row.isActive,
	};
}

async function applySupplier(ctx: ChunkContext, row: LegacySyncSupplierRow) {
	ctx.counts.suppliers.received += 1;
	const name = compactString(row.name);
	if (!name) {
		ctx.counts.suppliers.skipped += 1;
		warn(ctx, `Skipped legacy supplier ${row.supplierId}: empty name.`);
		return;
	}

	const incoming = supplierFields(row);
	const link = await getLink('supplier', row.supplierId);
	let vendor = link
		? await prisma.vendor.findUnique({ where: { id: link.targetId } })
		: null;

	if (!vendor) {
		vendor = await prisma.vendor.findUnique({ where: { name } });
	}

	if (!vendor) {
		vendor = await prisma.vendor.create({
			data: {
				name,
				contactEmail: compactString(row.email) ?? `${slugify(row.supplierCode ?? row.supplierId)}@legacy-import.local`,
				contactPhone: (incoming.contactPhone as string | null) ?? undefined,
				address: (incoming.address as string | null) ?? undefined,
				website: (incoming.website as string | null) ?? undefined,
				taxId: (incoming.taxId as string | null) ?? undefined,
				paymentTerms: (incoming.paymentTerms as string | undefined) ?? undefined,
				isActive: row.isActive,
			},
		});
		ctx.counts.suppliers.created += 1;
		ctx.vendorByLegacyId.set(row.supplierId, vendor.id);
		await saveLink({
			sourceType: 'supplier',
			sourceId: row.supplierId,
			sourceCode: row.supplierCode,
			targetType: 'vendor',
			targetId: vendor.id,
			resolution: 'created',
			lastApplied: incoming,
		});
		return;
	}

	ctx.vendorByLegacyId.set(row.supplierId, vendor.id);
	const lastApplied = (link?.lastApplied as PlainRecord | null) ?? undefined;
	const updates = planFieldUpdates(incoming, lastApplied, vendor as unknown as PlainRecord);

	if (Object.keys(updates).length > 0) {
		try {
			await prisma.vendor.update({ where: { id: vendor.id }, data: updates });
			ctx.counts.suppliers.updated += 1;
		} catch (error: any) {
			if (updates.name && error?.code === 'P2002') {
				delete updates.name;
				warn(ctx, `Legacy supplier ${row.supplierId}: rename to "${name}" conflicts with an existing vendor; kept current name.`);
				if (Object.keys(updates).length > 0) {
					await prisma.vendor.update({ where: { id: vendor.id }, data: updates });
					ctx.counts.suppliers.updated += 1;
				} else {
					ctx.counts.suppliers.unchanged += 1;
				}
			} else {
				throw error;
			}
		}
	} else {
		ctx.counts.suppliers.unchanged += 1;
	}

	if (link) {
		await touchLink(link.id, incoming);
	} else {
		await saveLink({
			sourceType: 'supplier',
			sourceId: row.supplierId,
			sourceCode: row.supplierCode,
			targetType: 'vendor',
			targetId: vendor.id,
			resolution: 'name',
			lastApplied: incoming,
		});
	}
}

// ── Locations / branches ────────────────────────────────────────────────────

async function ensureDefaultFloor(branchId: string) {
	const floor = await prisma.floor.findFirst({
		where: { branchId, code: DEFAULT_FLOOR_CODE },
		select: { id: true },
	});
	if (floor) return floor.id;
	const created = await prisma.floor.create({
		data: { branchId, name: DEFAULT_FLOOR_NAME, code: DEFAULT_FLOOR_CODE, floorNumber: 1 },
		select: { id: true },
	});
	return created.id;
}

async function applyLocation(ctx: ChunkContext, row: LegacySyncLocationRow) {
	ctx.counts.locations.received += 1;
	const code = compactString(row.code) ?? `LOC-${row.locationId}`;
	const name = compactString(row.name) ?? code;
	const incoming: PlainRecord = {
		name,
		address: compactString(row.address) ?? null,
		phone: compactString(row.phone) ?? null,
		email: compactString(row.email) ?? null,
		isActive: row.isActive,
	};

	const link = await getLink('location', row.locationId);
	let branch = link
		? await prisma.branch.findUnique({ where: { id: link.targetId } })
		: null;
	if (!branch) {
		branch = await prisma.branch.findUnique({ where: { code } });
	}

	let resolution = link ? link.resolution : 'code';
	if (!branch) {
		const isFirstBranch = (await prisma.branch.count()) === 0;
		branch = await prisma.branch.create({
			data: {
				code,
				name,
				address: (incoming.address as string | null) ?? undefined,
				phone: (incoming.phone as string | null) ?? undefined,
				email: (incoming.email as string | null) ?? undefined,
				isActive: row.isActive,
				isDefault: isFirstBranch,
			},
		});
		ctx.counts.locations.created += 1;
		resolution = 'created';
	} else if (link) {
		const updates = planFieldUpdates(incoming, (link.lastApplied as PlainRecord | null) ?? undefined, branch as unknown as PlainRecord);
		if (Object.keys(updates).length > 0) {
			await prisma.branch.update({ where: { id: branch.id }, data: updates });
			ctx.counts.locations.updated += 1;
		} else {
			ctx.counts.locations.unchanged += 1;
		}
	} else {
		ctx.counts.locations.unchanged += 1;
	}

	const floorId = await ensureDefaultFloor(branch.id);
	ctx.branchByLocationId.set(row.locationId, { branchId: branch.id, floorId, code });
	await saveLink({
		sourceType: 'location',
		sourceId: row.locationId,
		sourceCode: code,
		targetType: 'branch',
		targetId: branch.id,
		resolution,
		lastApplied: incoming,
	});
}

async function resolveBranchForLocation(ctx: ChunkContext, locationId: string | undefined) {
	if (!locationId) return null;
	if (ctx.branchByLocationId.has(locationId)) return ctx.branchByLocationId.get(locationId) ?? null;

	const link = await getLink('location', locationId);
	if (!link) {
		ctx.branchByLocationId.set(locationId, null);
		return null;
	}
	const branch = await prisma.branch.findUnique({ where: { id: link.targetId }, select: { id: true, code: true } });
	if (!branch) {
		ctx.branchByLocationId.set(locationId, null);
		return null;
	}
	const floorId = await ensureDefaultFloor(branch.id);
	const resolved = { branchId: branch.id, floorId, code: branch.code };
	ctx.branchByLocationId.set(locationId, resolved);
	return resolved;
}

// ── Categories ──────────────────────────────────────────────────────────────

async function ensureCategoryPath(ctx: ChunkContext, segments: Array<{ kind: string; code: string; name: string }>) {
	let parentId: string | undefined;
	let parentSlug: string | undefined;
	let resolvedId: string | undefined;

	for (const segment of segments) {
		const code = compactString(segment.code);
		const name = compactString(segment.name) ?? code;
		if (!code || !name) continue;
		const prefix = segment.kind === 'department' ? 'legacy-department' : segment.kind === 'category' ? 'legacy-category' : `legacy-${segment.kind}`;
		const slug = composeCategorySlug(parentSlug, `${prefix}-${slugify(code)}`);

		let categoryId = ctx.categoryBySlug.get(slug);
		if (!categoryId) {
			const existing = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
			if (existing) {
				categoryId = existing.id;
			} else {
				const created = await prisma.category.create({
					data: { name, slug, parentId: parentId ?? null },
					select: { id: true },
				});
				categoryId = created.id;
			}
			ctx.categoryBySlug.set(slug, categoryId);
		}

		parentId = categoryId;
		parentSlug = slug;
		resolvedId = categoryId;
	}

	return resolvedId;
}

// ── Attributes (Color / Size for legacy variants) ───────────────────────────

async function ensureAttributeByName(ctx: ChunkContext, name: string) {
	const cached = ctx.attributeByName.get(name);
	if (cached) return cached;
	const existing = await prisma.attribute.findUnique({ where: { name }, select: { id: true } });
	const id = existing
		? existing.id
		: (await prisma.attribute.create({ data: { name, type: name === 'Color' ? 'color' : 'dropdown' }, select: { id: true } })).id;
	ctx.attributeByName.set(name, id);
	return id;
}

async function ensureAttributeValueFor(ctx: ChunkContext, attributeId: string, displayName: string, representedValue: string) {
	const key = `${attributeId}|${representedValue}`;
	const cached = ctx.attributeValueByKey.get(key);
	if (cached) return cached;
	const existing = await prisma.attributeValue.findUnique({
		where: { attributeId_representedValue: { attributeId, representedValue } },
		select: { id: true },
	});
	const id = existing
		? existing.id
		: (await prisma.attributeValue.create({ data: { attributeId, displayName, representedValue }, select: { id: true } })).id;
	ctx.attributeValueByKey.set(key, id);
	return id;
}

async function attachVariantAttributeValue(skuId: string, variantId: string, attributeId: string, attributeValueId: string) {
	const skuAttribute = await prisma.sKUAttribute.upsert({
		where: { skuId_attributeId: { skuId, attributeId } },
		create: { skuId, attributeId },
		update: {},
		select: { id: true },
	});
	await prisma.sKUAttributeValue.upsert({
		where: { skuAttributeId_attributeValueId: { skuAttributeId: skuAttribute.id, attributeValueId } },
		create: { skuAttributeId: skuAttribute.id, attributeValueId },
		update: {},
	});
	const existingValue = await prisma.sKUVariantValue.findUnique({
		where: { variantId_attributeId: { variantId, attributeId } },
	});
	if (!existingValue) {
		await prisma.sKUVariantValue.create({ data: { variantId, attributeId, attributeValueId } });
	}
}

// ── Pricing helpers ─────────────────────────────────────────────────────────

async function pickPricingDetail(ctx: ChunkContext, details: LegacySyncLocationDetail[]) {
	if (details.length === 0) return undefined;
	for (const detail of details) {
		const branch = await resolveBranchForLocation(ctx, detail.locationId);
		if (!branch) continue;
		const branchRecord = await prisma.branch.findUnique({ where: { id: branch.branchId }, select: { isDefault: true } });
		if (branchRecord?.isDefault) return detail;
	}
	return details.find((detail) =>
		detail.costPrice !== undefined
		|| detail.sellingPrice !== undefined
		|| detail.wholesalePrice !== undefined
		|| detail.bulkPrice !== undefined,
	) ?? details[0];
}

function priceFields(detail: LegacySyncLocationDetail | undefined): PlainRecord {
	if (!detail) return {};
	return {
		costPrice: detail.costPrice,
		sellingPrice: detail.sellingPrice,
		wholesalePrice: detail.wholesalePrice,
		bulkPrice: detail.bulkPrice,
	};
}

// The price carrier for a variant is its most recent active batch (the same
// place the variant-family merge tooling preserved standalone pricing).
async function ensureVariantPriceBatch(skuId: string, variant: { id: string; variantCode: string }, vendorId?: string | null) {
	const latest = await prisma.batch.findFirst({
		where: { variantId: variant.id, isActive: true },
		orderBy: { sequenceNumber: 'desc' },
	});
	if (latest) return latest;

	const lastSequence = await prisma.batch.findFirst({
		where: { skuId, variantId: variant.id },
		orderBy: { sequenceNumber: 'desc' },
		select: { sequenceNumber: true },
	});
	let sequenceNumber = (lastSequence?.sequenceNumber ?? 0) + 1;
	let batchNumber = `${variant.variantCode}-B${String(sequenceNumber).padStart(3, '0')}`;

	// Batch numbers are globally unique. After standalone products are merged
	// into a variant family, another variant in the family can already own the
	// conventional <variant-code>-B001 number. Advance until both the per-
	// variant sequence and the global batch number are available.
	while (await prisma.batch.findUnique({ where: { batchNumber }, select: { id: true } })) {
		sequenceNumber += 1;
		batchNumber = `${variant.variantCode}-B${String(sequenceNumber).padStart(3, '0')}`;
	}

	return prisma.batch.create({
		data: {
			batchNumber,
			skuId,
			variantId: variant.id,
			sequenceNumber,
			vendorId: vendorId ?? null,
			currency: 'LKR',
			notes: 'Auto-created by legacy desktop sync to carry variant pricing.',
		},
	});
}

// ── Inventory mirroring ─────────────────────────────────────────────────────

function branchScopeFilter(ctx: ChunkContext, branchId: string) {
	const scopes: PlainRecord[] = [
		{ floor: { branchId } },
		{ shelf: { floor: { branchId } } },
		{ box: { OR: [{ floor: { branchId } }, { shelf: { floor: { branchId } } }] } },
	];
	if (ctx.onlyBranchId === branchId) {
		scopes.push({ AND: [{ floorId: null }, { shelfId: null }, { boxId: null }] });
	}
	return { OR: scopes };
}

async function mirrorQuantity(args: {
	ctx: ChunkContext;
	skuId: string;
	variantId: string | null;
	branch: { branchId: string; floorId: string; code: string };
	targetQuantity: number;
	legacyRef: { sourceType: string; sourceId: string; locationId: string };
}) {
	const { ctx, skuId, variantId, branch, targetQuantity, legacyRef } = args;
	return prisma.$transaction(async (tx: any) => {
		await lockInventoryQuantityWrites(tx);
		if (!(await legacyQuantitySyncIsEnabled(tx))) {
			if (!ctx.warnings.some((message) => message.includes('quantity mirroring is disabled'))) {
				warn(ctx, 'MaxSoft quantity mirroring is disabled because inventory was zeroed. Catalog and historical data continue to sync.');
			}
			return;
		}

	const scope = branchScopeFilter(ctx, branch.branchId);
	const variantFilter = variantId === null ? {} : { variantId };

	const aggregate = await tx.inventoryRecord.aggregate({
		_sum: { quantity: true },
		where: {
			skuId,
			...variantFilter,
			state: { in: ON_HAND_STATES },
			...scope,
		} as any,
	});
	const currentQuantity = aggregate._sum.quantity ?? 0;
	let delta = targetQuantity - currentQuantity;
	if (Math.abs(delta) < QTY_EPSILON) return;

	const legacyOwned = await tx.inventoryRecord.findMany({
		where: {
			skuId,
			...variantFilter,
			state: { in: ON_HAND_STATES },
			terminalId: { in: [LEGACY_SYNC_TERMINAL_ID, LEGACY_IMPORT_TERMINAL_ID] },
			...scope,
		} as any,
		orderBy: { quantity: 'desc' },
	});

	if (delta > 0) {
		const target = legacyOwned[0];
		if (target) {
			await tx.inventoryRecord.update({
				where: { id: target.id },
				data: { quantity: target.quantity + delta, terminalId: LEGACY_SYNC_TERMINAL_ID },
			});
		} else {
			await tx.inventoryRecord.create({
				data: {
					skuId,
					variantId,
					floorId: branch.floorId,
					quantity: delta,
					state: InventoryState.ShelfReady,
					terminalId: LEGACY_SYNC_TERMINAL_ID,
				},
			});
		}
	} else {
		let remaining = -delta;
		for (const record of legacyOwned) {
			if (remaining <= QTY_EPSILON) break;
			const take = Math.min(record.quantity, remaining);
			if (take > 0) {
				await tx.inventoryRecord.update({
					where: { id: record.id },
					data: { quantity: record.quantity - take, terminalId: LEGACY_SYNC_TERMINAL_ID },
				});
				remaining -= take;
			}
		}
		if (remaining > QTY_EPSILON) {
			// All remaining stock is held by records created in this system
			// (GRNs etc.). Record the shortfall on a sync-owned record so the
			// branch total still mirrors the legacy POS, and flag it for review.
			const target = legacyOwned[0];
			if (target) {
				const fresh = await tx.inventoryRecord.findUnique({ where: { id: target.id }, select: { quantity: true } });
				await tx.inventoryRecord.update({
					where: { id: target.id },
					data: { quantity: (fresh?.quantity ?? 0) - remaining },
				});
			} else {
				await tx.inventoryRecord.create({
					data: {
						skuId,
						variantId,
						floorId: branch.floorId,
						quantity: -remaining,
						state: InventoryState.ShelfReady,
						terminalId: LEGACY_SYNC_TERMINAL_ID,
					},
				});
			}
			warn(ctx, `Legacy ${legacyRef.sourceType} ${legacyRef.sourceId} @ location ${legacyRef.locationId}: legacy on-hand (${targetQuantity}) is lower than non-legacy records in this system; a negative sync balance was recorded.`);
		}
	}

	await tx.inventoryEvent.create({
		data: {
			eventType: LEGACY_SYNC_EVENT_TYPE,
			parentEntityId: `legacy-sync:${legacyRef.sourceType}:${legacyRef.sourceId}:${legacyRef.locationId}`,
			quantityDelta: delta,
			beforeQuantity: currentQuantity,
			afterQuantity: targetQuantity,
			reasonCode: 'LegacyDesktopSync',
			terminalId: LEGACY_SYNC_TERMINAL_ID,
			metadata: {
				runId: ctx.runId,
				branchId: branch.branchId,
				branchCode: branch.code,
				legacySourceType: legacyRef.sourceType,
				legacySourceId: legacyRef.sourceId,
				legacyLocationId: legacyRef.locationId,
			} as any,
		},
	});
	ctx.inventoryAdjustments += 1;
	});
}

// ── Product resolution & apply ──────────────────────────────────────────────

type ProductTarget =
	| { kind: 'sku'; sku: { id: string; skuCode: string } }
	| { kind: 'variant'; variant: { id: string; variantCode: string; skuId: string } };

async function loadLinkedProductTarget(link: { targetType: string; targetId: string }): Promise<ProductTarget | null> {
	if (link.targetType === 'variant') {
		const variant = await prisma.sKUVariant.findUnique({
			where: { id: link.targetId },
			select: { id: true, variantCode: true, skuId: true },
		});
		return variant ? { kind: 'variant', variant } : null;
	}
	if (link.targetType === 'sku') {
		const sku = await prisma.sKU.findUnique({
			where: { id: link.targetId },
			select: { id: true, skuCode: true },
		});
		return sku ? { kind: 'sku', sku } : null;
	}
	return null;
}

// Resolution order is what keeps manual variant merges intact:
// 1. an existing link always wins;
// 2. a variant whose variantCode equals the legacy ProductCode — this is
//    exactly what the variant-family/variantize tooling creates when a
//    standalone product is merged into a family, so a merged product keeps
//    syncing into its variant even though the legacy DB still sees a product;
// 3. a SKU whose skuCode equals the legacy ProductCode (unmerged products);
// 4. a barcode match (covers renamed codes);
// 5. otherwise a brand-new SKU is created.
async function resolveProductTarget(ctx: ChunkContext, row: LegacySyncProductRow): Promise<{ target: ProductTarget; resolution: string } | null> {
	const link = await getLink('product', row.productId);
	if (link) {
		const target = await loadLinkedProductTarget(link);
		if (target) return { target, resolution: link.resolution };
		if (link.isLocked) {
			warn(ctx, `Legacy product ${row.productId} (${row.productCode}) has a locked link to a missing ${link.targetType}; skipped.`);
			return null;
		}
	}

	const code = compactString(row.productCode);
	if (code) {
		const variant = await prisma.sKUVariant.findUnique({
			where: { variantCode: code },
			select: { id: true, variantCode: true, skuId: true },
		});
		if (variant) return { target: { kind: 'variant', variant }, resolution: 'variant-code' };

		const sku = await prisma.sKU.findUnique({
			where: { skuCode: code },
			select: { id: true, skuCode: true },
		});
		if (sku) return { target: { kind: 'sku', sku }, resolution: 'sku-code' };
	}

	const barcode = compactString(row.barcode);
	if (barcode) {
		const match = await prisma.productBarcode.findUnique({
			where: { barcode },
			select: {
				skuId: true,
				variantId: true,
				sku: { select: { id: true, skuCode: true } },
				variant: { select: { id: true, variantCode: true, skuId: true } },
			},
		});
		if (match?.variant) return { target: { kind: 'variant', variant: match.variant }, resolution: 'barcode' };
		if (match?.sku) return { target: { kind: 'sku', sku: match.sku }, resolution: 'barcode' };
	}

	return null;
}

async function resolveVendorForProduct(ctx: ChunkContext, row: LegacySyncProductRow) {
	if (row.supplierId) {
		const cached = ctx.vendorByLegacyId.get(row.supplierId);
		if (cached) return cached;
		const link = await getLink('supplier', row.supplierId);
		if (link) {
			ctx.vendorByLegacyId.set(row.supplierId, link.targetId);
			return link.targetId;
		}
	}

	const fallbackName = `Legacy Supplier ${row.supplierId ?? row.productId}`;
	const existing = await prisma.vendor.findUnique({ where: { name: fallbackName }, select: { id: true } });
	if (existing) return existing.id;
	const created = await prisma.vendor.create({
		data: {
			name: fallbackName,
			contactEmail: `${slugify(fallbackName)}@legacy-import.local`,
		},
		select: { id: true },
	});
	return created.id;
}

async function createSkuForProduct(ctx: ChunkContext, row: LegacySyncProductRow, pricing: LegacySyncLocationDetail | undefined) {
	const skuCode = compactString(row.productCode) ?? `LEGACY-SKU-${row.productId}`;
	const vendorId = await resolveVendorForProduct(ctx, row);
	const categoryId = row.categoryPath?.length ? await ensureCategoryPath(ctx, row.categoryPath) : undefined;
	const unitName = compactString(row.unitName) ?? compactString(row.unitCode) ?? 'Unit';
	const unit = await ensureUnitByName(ctx, unitName, row.unitCode);

	const sku = await prisma.sKU.create({
		data: {
			skuCode,
			name: compactString(row.name) ?? compactString(row.printName) ?? skuCode,
			categoryId: categoryId ?? null,
			vendorId,
			unitOfMeasureId: unit.id,
			unitOfMeasure: unit.name,
			costPrice: pricing?.costPrice,
			sellingPrice: pricing?.sellingPrice,
			wholesalePrice: pricing?.wholesalePrice,
			bulkPrice: pricing?.bulkPrice,
			currency: 'LKR',
			isActive: row.isActive,
		},
		select: { id: true, skuCode: true },
	});

	await prisma.sKUVendor.upsert({
		where: { skuId_vendorId: { skuId: sku.id, vendorId } },
		create: { skuId: sku.id, vendorId },
		update: {},
	});

	const barcode = compactString(row.barcode);
	if (barcode) {
		const existing = await prisma.productBarcode.findUnique({ where: { barcode }, select: { id: true } });
		if (!existing) {
			await prisma.productBarcode.create({
				data: { skuId: sku.id, barcode, barcodeType: 'CODE128', isDefault: true },
			});
		}
	}

	return sku;
}

function productLastApplied(row: LegacySyncProductRow, pricing: LegacySyncLocationDetail | undefined): PlainRecord {
	return {
		name: compactString(row.name),
		isActive: row.isActive,
		...priceFields(pricing),
	};
}

async function applyProduct(ctx: ChunkContext, row: LegacySyncProductRow) {
	ctx.counts.products.received += 1;
	const pricing = await pickPricingDetail(ctx, row.details ?? []);
	const lastAppliedValues = productLastApplied(row, pricing);

	let resolved = await resolveProductTarget(ctx, row);
	let created = false;
	if (!resolved) {
		const link = await getLink('product', row.productId);
		if (link?.isLocked) {
			ctx.counts.products.skipped += 1; // warning already raised by resolver
			return;
		}
		const sku = await createSkuForProduct(ctx, row, pricing);
		resolved = { target: { kind: 'sku', sku }, resolution: 'created' };
		created = true;
		ctx.counts.products.created += 1;
	}

	const { target, resolution } = resolved;
	const existingLink = await getLink('product', row.productId);
	const lastApplied = created ? undefined : ((existingLink?.lastApplied as PlainRecord | null) ?? undefined);

	let updated = false;
	if (!created) {
		if (target.kind === 'sku') {
			const sku = await prisma.sKU.findUnique({ where: { id: target.sku.id } });
			if (sku) {
				const incoming: PlainRecord = {
					name: compactString(row.name),
					isActive: row.isActive,
					...priceFields(pricing),
				};
				const updates = planFieldUpdates(incoming, lastApplied, sku as unknown as PlainRecord);
				if (Object.keys(updates).length > 0) {
					await prisma.sKU.update({ where: { id: sku.id }, data: updates });
					updated = true;
				}
			}
		} else {
			const variant = await prisma.sKUVariant.findUnique({ where: { id: target.variant.id } });
			if (variant) {
				const incoming: PlainRecord = {
					name: compactString(row.name),
					isActive: row.isActive,
				};
				const updates = planFieldUpdates(incoming, lastApplied, variant as unknown as PlainRecord);
				if (Object.keys(updates).length > 0) {
					await prisma.sKUVariant.update({ where: { id: variant.id }, data: updates });
					updated = true;
				}
			}

			const incomingPrices = priceFields(pricing);
			if (Object.values(incomingPrices).some((value) => value !== undefined)) {
				const batch = await ensureVariantPriceBatch(target.variant.skuId, target.variant);
				const updates = planFieldUpdates(incomingPrices, lastApplied, batch as unknown as PlainRecord);
				if (Object.keys(updates).length > 0) {
					await prisma.batch.update({ where: { id: batch.id }, data: updates });
					updated = true;
				}
			}
		}
	}

	if (updated) ctx.counts.products.updated += 1;
	else if (!created) ctx.counts.products.unchanged += 1;

	await saveLink({
		sourceType: 'product',
		sourceId: row.productId,
		sourceCode: compactString(row.productCode),
		targetType: target.kind,
		targetId: target.kind === 'sku' ? target.sku.id : target.variant.id,
		resolution,
		lastApplied: lastAppliedValues,
	});

	// Mirror per-location on-hand quantities. For a merged (variant-linked)
	// product the quantity flows to that variant; for a plain product it
	// flows to the SKU total.
	for (const detail of row.details ?? []) {
		if (detail.quantity === undefined) continue;
		const branch = await resolveBranchForLocation(ctx, detail.locationId);
		if (!branch) {
			warn(ctx, `Legacy product ${row.productId} (${row.productCode}): location ${detail.locationId} is not linked to a branch yet; quantity skipped.`);
			continue;
		}
		await mirrorQuantity({
			ctx,
			skuId: target.kind === 'sku' ? target.sku.id : target.variant.skuId,
			variantId: target.kind === 'variant' ? target.variant.id : null,
			branch,
			targetQuantity: detail.quantity,
			legacyRef: { sourceType: 'product', sourceId: row.productId, locationId: detail.locationId },
		});
	}
}

// ── Legacy color/size variants ──────────────────────────────────────────────

async function resolveParentSkuForVariant(ctx: ChunkContext, row: LegacySyncVariantRow) {
	const parentLink = await getLink('product', row.productId);
	if (!parentLink) return null;
	const parentTarget = await loadLinkedProductTarget(parentLink);
	if (!parentTarget) return null;
	const skuId = parentTarget.kind === 'sku' ? parentTarget.sku.id : parentTarget.variant.skuId;
	return prisma.sKU.findUnique({ where: { id: skuId }, select: { id: true, skuCode: true } });
}

async function applyVariant(ctx: ChunkContext, row: LegacySyncVariantRow) {
	ctx.counts.variants.received += 1;

	const link = await getLink('productcolorsize', row.productColorSizeId);
	let variant = link
		? await prisma.sKUVariant.findUnique({
			where: { id: link.targetId },
			select: { id: true, variantCode: true, skuId: true, name: true, isActive: true },
		})
		: null;
	let resolution = link?.resolution ?? 'variant-code';
	let created = false;

	const parentSku = await resolveParentSkuForVariant(ctx, row);
	if (!variant) {
		if (!parentSku) {
			ctx.counts.variants.skipped += 1;
			warn(ctx, `Legacy variant ${row.productColorSizeId}: parent product ${row.productId} is not linked yet; send products before variants.`);
			return;
		}

		const comboSeed = [
			compactString(row.colorCode) ?? compactString(row.colorName),
			compactString(row.sizeCode) ?? compactString(row.sizeName),
		].filter(Boolean).join('-');
		const codeSeed = compactString(row.colorSizeCode) ?? (comboSeed || row.productColorSizeId);
		const conventionCode = `${parentSku.skuCode}-${slugify(codeSeed).toUpperCase()}`;

		for (const candidate of [conventionCode, compactString(row.colorSizeCode)]) {
			if (!candidate) continue;
			const match = await prisma.sKUVariant.findUnique({
				where: { variantCode: candidate },
				select: { id: true, variantCode: true, skuId: true, name: true, isActive: true },
			});
			if (match) {
				variant = match;
				break;
			}
		}

		if (!variant) {
			const comboName = [compactString(row.colorName), compactString(row.sizeName)].filter(Boolean).join(' / ');
			const name = compactString(row.colorSizeName) ?? (comboName || codeSeed);
			variant = await prisma.sKUVariant.create({
				data: {
					skuId: parentSku.id,
					variantCode: conventionCode,
					name,
					isActive: row.isActive,
				},
				select: { id: true, variantCode: true, skuId: true, name: true, isActive: true },
			});
			created = true;
			resolution = 'created';
			ctx.counts.variants.created += 1;

			const colorName = compactString(row.colorName);
			if (colorName) {
				const attributeId = await ensureAttributeByName(ctx, 'Color');
				const valueId = await ensureAttributeValueFor(ctx, attributeId, colorName, compactString(row.colorCode) ?? colorName);
				await attachVariantAttributeValue(variant.skuId, variant.id, attributeId, valueId);
			}
			const sizeName = compactString(row.sizeName);
			if (sizeName) {
				const attributeId = await ensureAttributeByName(ctx, 'Size');
				const valueId = await ensureAttributeValueFor(ctx, attributeId, sizeName, compactString(row.sizeCode) ?? sizeName);
				await attachVariantAttributeValue(variant.skuId, variant.id, attributeId, valueId);
			}
		}
	}

	const pricing = await pickPricingDetail(ctx, row.details ?? []);
	const incomingName = compactString(row.colorSizeName)
		?? [compactString(row.colorName), compactString(row.sizeName)].filter(Boolean).join(' / ');
	const incoming: PlainRecord = {
		name: incomingName || undefined,
		isActive: row.isActive,
	};
	const lastApplied = created ? undefined : ((link?.lastApplied as PlainRecord | null) ?? undefined);

	let updated = false;
	if (!created) {
		const updates = planFieldUpdates(incoming, lastApplied, variant as unknown as PlainRecord);
		if (Object.keys(updates).length > 0) {
			await prisma.sKUVariant.update({ where: { id: variant.id }, data: updates });
			updated = true;
		}
	}

	const incomingPrices = priceFields(pricing);
	if (Object.values(incomingPrices).some((value) => value !== undefined)) {
		const batch = await ensureVariantPriceBatch(variant.skuId, variant);
		const updates = planFieldUpdates(incomingPrices, lastApplied, batch as unknown as PlainRecord);
		if (Object.keys(updates).length > 0) {
			await prisma.batch.update({ where: { id: batch.id }, data: updates });
			updated = true;
		}
	}

	if (updated) ctx.counts.variants.updated += 1;
	else if (!created) ctx.counts.variants.unchanged += 1;

	await saveLink({
		sourceType: 'productcolorsize',
		sourceId: row.productColorSizeId,
		sourceCode: compactString(row.colorSizeCode),
		targetType: 'variant',
		targetId: variant.id,
		resolution,
		lastApplied: { ...incoming, ...incomingPrices },
	});
}

// ── Run management & chunk entry point ──────────────────────────────────────

export async function openRun(agentId?: string) {
	return prisma.legacySyncRun.create({
		data: { agentId: agentId ?? null },
	});
}

export async function completeRun(runId: string, args: { status?: string; stats?: unknown; errorMessage?: string }) {
	let status = args.status ?? 'Completed';
	let errorMessage = args.errorMessage ?? null;
	let historicalDocuments: LegacyDocumentImportResult | undefined;

	// The raw archive is the lossless source of truth. Converting supported
	// documents into native Inventory records is deliberately best-effort so a
	// mapping problem cannot discard or roll back the archived MaxSoft rows.
	if (status !== 'Failed') {
		try {
			historicalDocuments = await importLegacyDocuments(runId);
			if (historicalDocuments.warnings.length > 0 && status === 'Completed') {
				status = 'CompletedWithWarnings';
			}
		} catch (error: any) {
			const message = `Historical documents were archived but native conversion failed: ${error?.message ?? error}`;
			historicalDocuments = { grns: 0, prns: 0, transfers: 0, adjustments: 0, warnings: [message] };
			if (status === 'Completed') status = 'CompletedWithWarnings';
			errorMessage = errorMessage ? `${errorMessage}\n${message}` : message;
		}
	}

	const inputStats = args.stats && typeof args.stats === 'object' && !Array.isArray(args.stats)
		? args.stats as Record<string, unknown>
		: {};
	return prisma.legacySyncRun.update({
		where: { id: runId },
		data: {
			status,
			finishedAt: new Date(),
			stats: historicalDocuments ? { ...inputStats, historicalDocuments } as any : (args.stats as any) ?? undefined,
			errorMessage,
		},
	});
}

export async function getRun(runId: string) {
	return prisma.legacySyncRun.findUnique({ where: { id: runId } });
}

export async function getStatus() {
	const [lastRuns, linkGroups] = await Promise.all([
		prisma.legacySyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
		prisma.legacyEntityLink.groupBy({
			by: ['sourceType', 'targetType'],
			_count: { _all: true },
		}),
	]);
	return {
		recentRuns: lastRuns,
		links: linkGroups.map((group: any) => ({
			sourceType: group.sourceType,
			targetType: group.targetType,
			count: group._count._all,
		})),
	};
}

export async function listLinks(args: { sourceType?: string; q?: string; page?: number; pageSize?: number }) {
	const page = Math.max(1, args.page ?? 1);
	const pageSize = Math.min(200, Math.max(1, args.pageSize ?? 50));
	const where: PlainRecord = {};
	if (args.sourceType) where.sourceType = args.sourceType;
	if (args.q) where.sourceCode = { contains: args.q };
	const [total, items] = await Promise.all([
		prisma.legacyEntityLink.count({ where: where as any }),
		prisma.legacyEntityLink.findMany({
			where: where as any,
			orderBy: { updatedAt: 'desc' },
			skip: (page - 1) * pageSize,
			take: pageSize,
		}),
	]);
	return { total, page, pageSize, items };
}

export async function applyChunk(runId: string, chunk: LegacySyncChunk): Promise<LegacySyncChunkResult> {
	const activeBranches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true }, take: 2 });
	const ctx: ChunkContext = {
		runId,
		counts: {
			units: newCounts(),
			suppliers: newCounts(),
			locations: newCounts(),
			products: newCounts(),
			variants: newCounts(),
			posRecords: newCounts(),
		},
		inventoryAdjustments: 0,
		warnings: [],
		branchByLocationId: new Map(),
		unitByLegacyId: new Map(),
		vendorByLegacyId: new Map(),
		categoryBySlug: new Map(),
		attributeByName: new Map(),
		attributeValueByKey: new Map(),
		onlyBranchId: activeBranches.length === 1 ? activeBranches[0].id : null,
	};

	for (const row of chunk.units ?? []) {
		await applyUnit(ctx, row);
	}
	for (const row of chunk.suppliers ?? []) {
		await applySupplier(ctx, row);
	}
	for (const row of chunk.locations ?? []) {
		await applyLocation(ctx, row);
	}
	for (const row of chunk.products ?? []) {
		try {
			await applyProduct(ctx, row);
		} catch (error: any) {
			ctx.counts.products.skipped += 1;
			warn(ctx, `Legacy product ${row.productId} (${row.productCode}) failed: ${error?.message ?? error}`);
		}
	}
	for (const row of chunk.variants ?? []) {
		try {
			await applyVariant(ctx, row);
		} catch (error: any) {
			ctx.counts.variants.skipped += 1;
			warn(ctx, `Legacy variant ${row.productColorSizeId} failed: ${error?.message ?? error}`);
		}
	}
	if ((chunk.posRecords?.length ?? 0) > 0) {
		const posCounts = await upsertLegacyPosRecords(chunk.posRecords!, runId);
		ctx.counts.posRecords.received += chunk.posRecords!.length;
		ctx.counts.posRecords.created += posCounts.created;
		ctx.counts.posRecords.updated += posCounts.updated;
		ctx.counts.posRecords.unchanged += posCounts.unchanged;
	}

	if (ctx.inventoryAdjustments > 0) {
		queueDashboardStatsRefresh();
	}

	return {
		runId,
		counts: ctx.counts,
		inventoryAdjustments: ctx.inventoryAdjustments,
		warnings: ctx.warnings,
	};
}
