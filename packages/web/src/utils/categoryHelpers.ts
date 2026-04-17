export interface CategoryOption {
  value: string;
  label: string;
  depth: number;
}

interface CategoryNode {
  id: string;
  name: string;
  children?: CategoryNode[];
}

/**
 * Recursively flatten a category tree into a list with hierarchical labels
 * @param categories Array of categories (tree structure with children)
 * @param depth Current depth level (for internal use)
 * @returns Flat array of category options with indented labels
 */
function flattenCategoryTree(categories: CategoryNode[], depth = 0): CategoryOption[] {
  const result: CategoryOption[] = [];

  for (const category of categories) {
    // Add indentation using tab characters for proper spacing
    // Use visual tree indicators for better hierarchy visualization
    const indent = depth > 0 ? '\t'.repeat(depth) + '└─ ' : '';

    result.push({
      value: category.id,
      label: `${indent}${category.name}`,
      depth,
    });

    // Recursively process children
    if (category.children && category.children.length > 0) {
      result.push(...flattenCategoryTree(category.children, depth + 1));
    }
  }

  return result;
}

/**
 * Build hierarchical category options from a tree structure
 * @param categoryTree Tree-structured categories
 * @returns Array of options with hierarchical labels for use in dropdowns
 */
export function buildHierarchicalCategoryOptions(categoryTree: CategoryNode[]): CategoryOption[] {
  return flattenCategoryTree(categoryTree);
}

/**
 * Build hierarchical category options from a flat list
 * Converts flat list to tree first, then flattens with hierarchical labels
 * @param flatCategories Flat array of categories
 * @returns Array of options with hierarchical labels for use in dropdowns
 */
export function buildHierarchicalCategoryOptionsFromFlat(flatCategories: any[]): CategoryOption[] {
  // Build tree structure
  const categoryMap = new Map<string, any>();
  const rootCategories: any[] = [];

  // First pass: create map of all categories
  flatCategories.forEach(cat => {
    categoryMap.set(cat.id, { ...cat, children: [] });
  });

  // Second pass: build tree structure
  flatCategories.forEach(cat => {
    const category = categoryMap.get(cat.id);
    if (cat.parentId && categoryMap.has(cat.parentId)) {
      categoryMap.get(cat.parentId).children.push(category);
    } else {
      rootCategories.push(category);
    }
  });

  return flattenCategoryTree(rootCategories);
}

