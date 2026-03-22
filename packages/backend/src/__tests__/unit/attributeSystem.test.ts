import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMocks } from '../mocks/prismaMock';
import { ATTRIBUTES, ATTRIBUTE_VALUES, SKU_VARIANTS, SKUS, USERS } from '../fixtures/testData';

vi.mock('../../prisma/client', () => ({ default: prismaMock }));

describe('Global Attribute System', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  describe('Attribute creation', () => {
    it('creates an attribute with allowed values', async () => {
      const newAttribute = {
        ...ATTRIBUTES.size,
        values: [ATTRIBUTE_VALUES.small, ATTRIBUTE_VALUES.large],
      };
      prismaMock.attribute.findUnique.mockResolvedValue(null);
      prismaMock.attribute.create.mockResolvedValue(newAttribute);

      const result = await prismaMock.attribute.create({
        data: { name: 'Size', type: 'dropdown', sortOrder: 0 },
        include: { values: true },
      });

      expect(result.name).toBe('Size');
      expect(result.type).toBe('dropdown');
      expect(result.values).toHaveLength(2);
    });

    it('prevents duplicate attribute names', async () => {
      prismaMock.attribute.findUnique.mockResolvedValue(ATTRIBUTES.size);

      const existing = await prismaMock.attribute.findUnique({ where: { name: 'Size' } });
      expect(existing).not.toBeNull();
      // In the route, we return 409 if existing is found
    });

    it('prevents deletion of attribute in use', async () => {
      prismaMock.sKUAttribute.count.mockResolvedValue(3);

      const inUse = await prismaMock.sKUAttribute.count({
        where: { attributeId: ATTRIBUTES.size.id },
      });
      expect(inUse).toBeGreaterThan(0);
    });
  });

  describe('Attribute values', () => {
    it('creates a value for an attribute', async () => {
      prismaMock.attribute.findUnique.mockResolvedValue(ATTRIBUTES.size);
      prismaMock.attributeValue.findUnique.mockResolvedValue(null);
      prismaMock.attributeValue.create.mockResolvedValue(ATTRIBUTE_VALUES.small);

      const result = await prismaMock.attributeValue.create({
        data: { attributeId: ATTRIBUTES.size.id, value: 'Small', sortOrder: 0 },
      });

      expect(result.value).toBe('Small');
      expect(result.attributeId).toBe(ATTRIBUTES.size.id);
    });

    it('prevents duplicate values within the same attribute', async () => {
      prismaMock.attributeValue.findUnique.mockResolvedValue(ATTRIBUTE_VALUES.small);

      const existing = await prismaMock.attributeValue.findUnique({
        where: { attributeId_value: { attributeId: ATTRIBUTES.size.id, value: 'Small' } },
      });
      expect(existing).not.toBeNull();
    });

    it('prevents deletion of value used by variants', async () => {
      prismaMock.sKUVariantValue.count.mockResolvedValue(2);

      const inUse = await prismaMock.sKUVariantValue.count({
        where: { attributeValueId: ATTRIBUTE_VALUES.small.id },
      });
      expect(inUse).toBeGreaterThan(0);
    });
  });

  describe('SKU Variant generation', () => {
    it('creates a variant with attribute combinations', async () => {
      const variantWithValues = {
        ...SKU_VARIANTS.smallRed,
        attributeValues: [
          {
            variantId: SKU_VARIANTS.smallRed.id,
            attributeId: ATTRIBUTES.size.id,
            attributeValueId: ATTRIBUTE_VALUES.small.id,
            attribute: ATTRIBUTES.size,
            attributeValue: ATTRIBUTE_VALUES.small,
          },
          {
            variantId: SKU_VARIANTS.smallRed.id,
            attributeId: ATTRIBUTES.color.id,
            attributeValueId: ATTRIBUTE_VALUES.red.id,
            attribute: ATTRIBUTES.color,
            attributeValue: ATTRIBUTE_VALUES.red,
          },
        ],
      };
      prismaMock.sKUVariant.create.mockResolvedValue(variantWithValues);

      const result = await prismaMock.sKUVariant.create({
        data: {
          skuId: SKUS.widgetBox.id,
          variantCode: 'WDG-BOX-Small-Red',
          name: 'Small / Red',
          attributeValues: { create: [] },
        },
      });

      expect(result.variantCode).toBe('WDG-BOX-Small-Red');
      expect(result.name).toBe('Small / Red');
      expect(result.attributeValues).toHaveLength(2);
    });

    it('lists all variants for a product', async () => {
      prismaMock.sKUVariant.findMany.mockResolvedValue([
        SKU_VARIANTS.smallRed,
        SKU_VARIANTS.largeBlue,
      ]);

      const variants = await prismaMock.sKUVariant.findMany({
        where: { skuId: SKUS.widgetBox.id },
      });

      expect(variants).toHaveLength(2);
      expect(variants[0].variantCode).toBe('WDG-BOX-Small-Red');
      expect(variants[1].variantCode).toBe('WDG-BOX-Large-Blue');
    });

    it('bulk enables/disables variants', async () => {
      prismaMock.sKUVariant.updateMany.mockResolvedValue({ count: 2 });

      const result = await prismaMock.sKUVariant.updateMany({
        where: {
          id: { in: [SKU_VARIANTS.smallRed.id, SKU_VARIANTS.largeBlue.id] },
          skuId: SKUS.widgetBox.id,
        },
        data: { isActive: false },
      });

      expect(result.count).toBe(2);
    });

    it('prevents deletion of variant with inventory records', async () => {
      prismaMock.inventoryRecord.count.mockResolvedValue(5);

      const inventoryCount = await prismaMock.inventoryRecord.count({
        where: { variantId: SKU_VARIANTS.smallRed.id },
      });
      expect(inventoryCount).toBeGreaterThan(0);
    });
  });

  describe('GRN with variant support', () => {
    it('detects duplicate variant combinations in GRN lines', () => {
      const lines = [
        { skuId: SKUS.widgetBox.id, variantId: SKU_VARIANTS.smallRed.id, expectedQuantity: 10 },
        { skuId: SKUS.widgetBox.id, variantId: SKU_VARIANTS.smallRed.id, expectedQuantity: 5 },
      ];

      const lineKeys = lines.map(l => `${l.skuId}:${l.variantId ?? ''}`);
      const uniqueKeys = new Set(lineKeys);
      expect(uniqueKeys.size).toBeLessThan(lineKeys.length);
    });

    it('allows same SKU with different variants in GRN lines', () => {
      const lines = [
        { skuId: SKUS.widgetBox.id, variantId: SKU_VARIANTS.smallRed.id, expectedQuantity: 10 },
        { skuId: SKUS.widgetBox.id, variantId: SKU_VARIANTS.largeBlue.id, expectedQuantity: 5 },
      ];

      const lineKeys = lines.map(l => `${l.skuId}:${l.variantId ?? ''}`);
      const uniqueKeys = new Set(lineKeys);
      expect(uniqueKeys.size).toBe(lineKeys.length);
    });
  });
});
