# WooCommerce-Style Attribute & Variant System

## Overview

The product creation flow now supports **WooCommerce-style attribute selection** where attributes and variants are configured during product creation, not after.

## Key Features

### ✅ What Changed

1. **During Product Creation:**
   - Select which attributes apply to the product (e.g., Color, Size)
   - Choose specific values for each attribute (e.g., Red, Blue, Green for Color)
   - System automatically generates all variant combinations
   - See live preview of how many variants will be created

2. **Complete Attribute Combinations:**
   - All variants have values for ALL selected attributes
   - No partial combinations (e.g., cannot have a variant with Size but no Color)
   - Enforced at the backend level

3. **Edit Mode:**
   - After creation, you can still remove unwanted variants
   - Cannot add new attribute combinations (would need to regenerate)

## How to Use

### Step 1: Create Attributes (One-time Setup)

Go to **Settings → Product Attributes** and create your attributes:

```
Attribute: Color
Type: color
Values:
  - Red (#FF0000)
  - Blue (#0000FF)
  - Green (#00FF00)

Attribute: Size
Type: dropdown
Values:
  - Small
  - Medium
  - Large
```

### Step 2: Create Product with Attributes

1. Click **+ New Product**
2. Fill in basic details (SKU Code, Name, Vendor, etc.)
3. Scroll to **🧩 Product Attributes & Variants** section
4. Check the attributes you want (e.g., ☑ Color, ☑ Size)
5. Select specific values for each:
   - For Color: Check Red, Blue
   - For Size: Check Small, Large
6. See preview: **"4 variants will be created"**
7. Click **Create Product**

### Generated Variants

For the example above, 4 variants are automatically created:

| Variant Code | Attributes |
|--------------|------------|
| PEN-001-Red-Small | Color: Red, Size: Small |
| PEN-001-Red-Large | Color: Red, Size: Large |
| PEN-001-Blue-Small | Color: Blue, Size: Small |
| PEN-001-Blue-Large | Color: Blue, Size: Large |

### Step 3: Edit/Remove Variants (Optional)

After creation:
1. Click **Edit** on the product
2. Go to **🧩 Variants** tab
3. Uncheck **Active** for variants you don't need
4. Or click **Delete** to permanently remove them

## API Changes

### Backend `/api/skus` POST Endpoint

**New optional field:** `attributeSelections`

```typescript
POST /api/skus
{
  "skuCode": "PEN-001",
  "name": "Premium Pen",
  "vendorId": "...",
  "unitOfMeasure": "Piece",
  // ... other fields ...
  
  // New: Attribute selections
  "attributeSelections": [
    {
      "attributeId": "color-attribute-uuid",
      "valueIds": ["red-uuid", "blue-uuid"]
    },
    {
      "attributeId": "size-attribute-uuid",
      "valueIds": ["small-uuid", "large-uuid"]
    }
  ]
}
```

**Response includes variants:**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "skuCode": "PEN-001",
    "name": "Premium Pen",
    "variants": [
      {
        "id": "...",
        "variantCode": "PEN-001-Red-Small",
        "name": "Red / Small",
        "attributeValues": [...]
      },
      // ... 3 more variants
    ],
    "variantCount": 4
  }
}
```

## Validation Rules

1. **All attributes must exist** - Invalid attribute IDs will roll back product creation
2. **All values must belong to their attribute** - Cannot mix values from different attributes
3. **Complete combinations only** - Every variant gets a value for EVERY selected attribute
4. **No duplicate combinations** - Each unique combination is created only once
5. **Unique variant codes** - If collision occurs, suffix is added (e.g., `-1`, `-2`)

## Migration Notes

**Existing products are not affected** - Products created before this update continue to work as before. They can still use the "Generate Variants" button in edit mode.

**No database changes required** - Uses existing attribute schema, only API and UI changed.

## Examples

### Single Attribute (Color)

```
Product: T-Shirt
Attributes: Color (Red, Blue, Green)
Result: 3 variants
  - T-SHIRT-001-Red
  - T-SHIRT-001-Blue
  - T-SHIRT-001-Green
```

### Two Attributes (Color + Size)

```
Product: Bottle
Attributes:
  - Color (Red, Blue)
  - Size (500ml, 1L, 2L)
Result: 6 variants (2 × 3)
  - BOTTLE-001-Red-500ml
  - BOTTLE-001-Red-1L
  - BOTTLE-001-Red-2L
  - BOTTLE-001-Blue-500ml
  - BOTTLE-001-Blue-1L
  - BOTTLE-001-Blue-2L
```

### Three Attributes (Color + Size + Material)

```
Product: Notebook
Attributes:
  - Color (Red, Blue)
  - Size (A4, A5)
  - Material (Hardcover, Softcover)
Result: 8 variants (2 × 2 × 2)
  - NOTEBOOK-001-Red-A4-Hardcover
  - NOTEBOOK-001-Red-A4-Softcover
  - NOTEBOOK-001-Red-A5-Hardcover
  - NOTEBOOK-001-Red-A5-Softcover
  - NOTEBOOK-001-Blue-A4-Hardcover
  - NOTEBOOK-001-Blue-A4-Softcover
  - NOTEBOOK-001-Blue-A5-Hardcover
  - NOTEBOOK-001-Blue-A5-Softcover
```

## Technical Implementation

### Cartesian Product Algorithm

Variants are generated using a cartesian product of all selected attribute value combinations:

```typescript
function cartesian(arrays: ComboItem[][]): ComboItem[][] {
  return arrays.reduce<ComboItem[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]]
  );
}
```

### Variant Code Generation

Format: `{SKU_CODE}-{Value1}-{Value2}-...`

Example: `PEN-001-Red-Large`

If duplicate codes exist, a numeric suffix is added: `PEN-001-Red-Large-1`

### Database Structure

No schema changes required. Uses existing tables:
- `attributes` - Global attribute definitions
- `attribute_values` - Values for each attribute
- `sku_attributes` - Which attributes are assigned to a product
- `sku_attribute_values` - Which specific values are selected
- `sku_variants` - Generated variant records
- `sku_variant_values` - Links variants to their attribute values

## Best Practices

1. **Define attributes first** - Create common attributes in Settings before creating products
2. **Select carefully** - Too many attributes create exponential variants (3×3×3 = 27 variants!)
3. **Use meaningful names** - Variant codes include value labels (e.g., "Red" not "COLOR_001")
4. **Remove unused variants** - After creation, deactivate or delete variants you don't sell
5. **Consider inventory** - Large variant counts mean more inventory records to manage

## Troubleshooting

**Q: I don't see attributes in the create form**
- Go to Settings → Product Attributes and create attributes first
- Make sure attributes are marked as Active
- Refresh the page if needed

**Q: Variant count seems wrong**
- Variant count = Value1Count × Value2Count × Value3Count × ...
- Example: 3 colors × 2 sizes = 6 variants
- Make sure you selected the values you want (not just the attribute checkbox)

**Q: Can I add variants after creation?**
- Yes, but you need to regenerate all variants in edit mode
- Existing variants won't be duplicated
- New combinations will be added

**Q: Can I have variants with partial attributes?**
- No, this is intentionally prevented
- All variants must have values for ALL selected attributes
- This ensures data consistency

## Future Enhancements

Potential improvements for future versions:
- Bulk edit variant properties (pricing, SKU codes)
- Import variants from CSV
- Variant-specific images
- Conditional variant generation (exclude specific combinations)
- Variant inventory templates
