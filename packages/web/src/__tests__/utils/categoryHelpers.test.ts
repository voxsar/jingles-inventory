import { describe, it, expect } from 'vitest';
import { buildHierarchicalCategoryOptions, buildHierarchicalCategoryOptionsFromFlat } from '../../utils/categoryHelpers';
import { ICategory } from '@jingles/shared';

describe('categoryHelpers', () => {
  describe('buildHierarchicalCategoryOptions', () => {
    it('should handle empty array', () => {
      const result = buildHierarchicalCategoryOptions([]);
      expect(result).toEqual([]);
    });

    it('should format root categories without indentation', () => {
      const categories: ICategory[] = [
        {
          id: '1',
          name: 'Electronics',
          slug: 'electronics',
          sortOrder: 0,
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: '2',
          name: 'Clothing',
          slug: 'clothing',
          sortOrder: 1,
          isActive: true,
          createdAt: new Date(),
        },
      ];

      const result = buildHierarchicalCategoryOptions(categories);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ value: '1', label: 'Electronics', depth: 0 });
      expect(result[1]).toEqual({ value: '2', label: 'Clothing', depth: 0 });
    });

    it('should format nested categories with hierarchical indentation', () => {
      const categories: ICategory[] = [
        {
          id: '1',
          name: 'Electronics',
          slug: 'electronics',
          sortOrder: 0,
          isActive: true,
          createdAt: new Date(),
          children: [
            {
              id: '1-1',
              name: 'Phones',
              slug: 'phones',
              parentId: '1',
              sortOrder: 0,
              isActive: true,
              createdAt: new Date(),
              children: [
                {
                  id: '1-1-1',
                  name: 'Smartphones',
                  slug: 'smartphones',
                  parentId: '1-1',
                  sortOrder: 0,
                  isActive: true,
                  createdAt: new Date(),
                },
              ],
            },
            {
              id: '1-2',
              name: 'Laptops',
              slug: 'laptops',
              parentId: '1',
              sortOrder: 1,
              isActive: true,
              createdAt: new Date(),
            },
          ],
        },
      ];

      const result = buildHierarchicalCategoryOptions(categories);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ value: '1', label: 'Electronics', depth: 0 });
      expect(result[1]).toEqual({ value: '1-1', label: '\t└─ Phones', depth: 1 });
      expect(result[2]).toEqual({ value: '1-1-1', label: '\t\t└─ Smartphones', depth: 2 });
      expect(result[3]).toEqual({ value: '1-2', label: '\t└─ Laptops', depth: 1 });
    });
  });

  describe('buildHierarchicalCategoryOptionsFromFlat', () => {
    it('should handle empty array', () => {
      const result = buildHierarchicalCategoryOptionsFromFlat([]);
      expect(result).toEqual([]);
    });

    it('should build tree and format flat categories', () => {
      const flatCategories = [
        { id: '1', name: 'Electronics', slug: 'electronics', parentId: null, sortOrder: 0 },
        { id: '1-1', name: 'Phones', slug: 'phones', parentId: '1', sortOrder: 0 },
        { id: '1-2', name: 'Laptops', slug: 'laptops', parentId: '1', sortOrder: 1 },
        { id: '1-1-1', name: 'Smartphones', slug: 'smartphones', parentId: '1-1', sortOrder: 0 },
        { id: '2', name: 'Clothing', slug: 'clothing', parentId: null, sortOrder: 1 },
      ];

      const result = buildHierarchicalCategoryOptionsFromFlat(flatCategories);

      expect(result).toHaveLength(5);

      // Root categories should have no indentation
      expect(result[0]).toEqual({ value: '1', label: 'Electronics', depth: 0 });

      // Level 1 children should have one tab
      expect(result[1].value).toBe('1-1');
      expect(result[1].label).toBe('\t└─ Phones');
      expect(result[1].depth).toBe(1);

      // Level 2 children should have two tabs
      expect(result[2].value).toBe('1-1-1');
      expect(result[2].label).toBe('\t\t└─ Smartphones');
      expect(result[2].depth).toBe(2);

      expect(result[3]).toEqual({ value: '1-2', label: '\t└─ Laptops', depth: 1 });
      expect(result[4]).toEqual({ value: '2', label: 'Clothing', depth: 0 });
    });

    it('should handle categories with undefined parentId', () => {
      const flatCategories = [
        { id: '1', name: 'Root1', slug: 'root1', parentId: undefined, sortOrder: 0 },
        { id: '2', name: 'Root2', slug: 'root2', sortOrder: 1 },
      ];

      const result = buildHierarchicalCategoryOptionsFromFlat(flatCategories);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Root1');
      expect(result[1].label).toBe('Root2');
    });

    it('should preserve sortOrder in tree structure', () => {
      const flatCategories = [
        { id: '1', name: 'Electronics', slug: 'electronics', parentId: null, sortOrder: 0 },
        { id: '1-2', name: 'Laptops', slug: 'laptops', parentId: '1', sortOrder: 1 },
        { id: '1-1', name: 'Phones', slug: 'phones', parentId: '1', sortOrder: 0 },
      ];

      const result = buildHierarchicalCategoryOptionsFromFlat(flatCategories);

      // Should maintain order from input (backend should sort)
      expect(result[0].label).toBe('Electronics');
      expect(result[1].label).toBe('\t└─ Laptops');
      expect(result[2].label).toBe('\t└─ Phones');
    });
  });
});
