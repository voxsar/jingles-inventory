# 🎯 Layered Pricing Architecture

## Overview

The Jingles Inventory Management System now includes a sophisticated **Layered Pricing Architecture** that separates base pricing from dynamic pricing overlays. This architecture provides flexibility for complex pricing strategies while maintaining backward compatibility with existing batch-based pricing.

## Architecture

```
Final Price = Base Price ⊕ Pricing Overlays

Layer 1: Base Price (Batch-level, stable)
         ↓
Layer 2: Pricing Overlays (Dynamic, runtime-applied)
         ↓
Layer 3: Resolution Engine (Priority-based stacking)
```

## Conceptual Model

### Layer 1 — Base Pricing (Immutable-ish)

Base pricing remains tied to the **Batch** model and includes:
- **Cost Price**: Unit cost
- **Selling Price**: Retail price
- **Wholesale Price**: Wholesale tier
- **Bulk Price**: Bulk/distributor tier
- **Margin-based calculation**: Fixed or percentage margins

Base prices are stable and come from:
- GRN line pricing (at receipt)
- Batch creation
- Manual price updates

**Example:**
```
Batch B001 → Base Selling Price = 1000 LKR
```

### Layer 2 — Pricing Overlays (Dynamic)

Overlays are runtime modifiers applied on top of base prices. They don't replace the base price, they adjust it.

#### Overlay Types

| Type | Description | Example |
|------|-------------|---------|
| **Percentage Discount** | Reduces price by % | 10% off → 1000 → 900 |
| **Fixed Discount** | Reduces price by fixed amount | 50 off → 1000 → 950 |
| **Percentage Markup** | Increases price by % | 20% markup → 1000 → 1200 |
| **Fixed Markup** | Increases price by fixed amount | 100 surcharge → 1000 → 1100 |

#### Overlay Scope (appliesTo)

Overlays can target specific products:
- **Specific Batches**: `{ batchIds: ['batch-001'] }`
- **Variants**: `{ variantIds: ['var-red', 'var-blue'] }`
- **SKUs**: `{ skuIds: ['sku-widget'] }`
- **Categories**: `{ categoryIds: ['cat-electronics'] }`
- **All Products**: `{}` (empty = applies to all)

#### Overlay Conditions

Overlays activate only when conditions are met:

```typescript
{
  minQty: 100,              // Minimum quantity
  maxQty: 500,              // Maximum quantity
  customerType: 'wholesale', // Customer type filter
  customerGroups: ['vip'],   // Customer group filter
  branches: ['branch-001'],  // Branch-specific
  dateRange: {               // Time-bound
    start: '2026-04-01',
    end: '2026-04-07'
  }
}
```

#### Overlay Priority & Stacking

```typescript
{
  priority: 1,      // Higher = applied first
  stackable: false  // Can combine with others?
}
```

**Priority Rules:**
1. Overlays sorted by priority (highest → lowest)
2. Applied sequentially
3. If `stackable: false`, stop after applying that overlay
4. If `stackable: true`, continue to next overlay

### Layer 3 — Resolution Engine

The pricing resolution engine executes at runtime:

```
┌─────────────────────────────┐
│ 1. Get Base Price           │
│    (from batch pricing)     │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ 2. Fetch Applicable Overlays│
│    • Filter by target       │
│    • Filter by conditions   │
│    • Check validity dates   │
│    • Sort by priority       │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ 3. Apply Overlays           │
│    • Sequential application │
│    • Respect stacking rules │
│    • Track adjustments      │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ 4. Return Resolved Price    │
│    • Base price             │
│    • Final price            │
│    • Applied overlays list  │
│    • Warnings               │
└─────────────────────────────┘
```

## Database Schema

### PricingOverlay Model

```sql
CREATE TABLE "pricing_overlays" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,              -- 'percentage_discount', 'fixed_discount', etc.
    "value" DOUBLE PRECISION NOT NULL,
    "applies_to" JSONB NOT NULL,       -- Product targeting
    "conditions" JSONB,                -- Activation conditions
    "priority" INTEGER DEFAULT 0,
    "stackable" BOOLEAN DEFAULT false,
    "status" TEXT DEFAULT 'active',    -- 'active', 'inactive', 'scheduled', 'expired'
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3)
);

-- Indexes for performance
CREATE INDEX "pricing_overlays_status_idx" ON "pricing_overlays"("status");
CREATE INDEX "pricing_overlays_priority_idx" ON "pricing_overlays"("priority");
CREATE INDEX "pricing_overlays_valid_from_valid_to_idx" ON "pricing_overlays"("valid_from", "valid_to");
```

## API Reference

### Overlay Management

#### Create Overlay
```http
POST /api/pricing-overlays
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Year Sale",
  "description": "10% off all products",
  "type": "percentage_discount",
  "value": 10,
  "appliesTo": {
    "skuIds": ["sku-001", "sku-002"]
  },
  "conditions": {
    "minQty": 1,
    "dateRange": {
      "start": "2026-04-01T00:00:00Z",
      "end": "2026-04-07T23:59:59Z"
    }
  },
  "priority": 1,
  "stackable": false,
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "overlay-001",
    "name": "New Year Sale",
    "type": "percentage_discount",
    "value": 10,
    ...
  }
}
```

#### List Overlays
```http
GET /api/pricing-overlays?status=active&page=1&pageSize=50
```

#### Get Single Overlay
```http
GET /api/pricing-overlays/:id
```

#### Update Overlay
```http
PUT /api/pricing-overlays/:id
Content-Type: application/json

{
  "value": 15,
  "status": "active"
}
```

#### Delete Overlay (Soft Delete)
```http
DELETE /api/pricing-overlays/:id
```

#### Detect Conflicts
```http
GET /api/pricing-overlays/:id/conflicts
```

Returns list of overlays that conflict (non-stackable with same priority and overlapping targets).

### Price Resolution

#### Resolve Price with Overlays
```http
POST /api/pricing-overlays/resolve-price
Content-Type: application/json

{
  "skuId": "sku-001",
  "batchId": "batch-001",
  "quantity": 100,
  "priceType": "selling",
  "customerType": "wholesale",
  "branchId": "branch-001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "basePrice": 1000,
    "finalPrice": 855,
    "currency": "LKR",
    "priceType": "selling",
    "batchNumber": "PROD001-B001",
    "source": "batch",
    "appliedOverlays": [
      {
        "overlayId": "overlay-001",
        "overlayName": "Seasonal 10% Off",
        "type": "percentage_discount",
        "value": 10,
        "adjustment": -100
      },
      {
        "overlayId": "overlay-002",
        "overlayName": "VIP 5% Off",
        "type": "percentage_discount",
        "value": 5,
        "adjustment": -45
      }
    ],
    "warnings": []
  }
}
```

## Usage Examples

### Example 1: Simple Percentage Discount

Create a 15% discount for all SKUs:

```javascript
const overlay = await fetch('/api/pricing-overlays', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: "Store-Wide Sale",
    type: "percentage_discount",
    value: 15,
    appliesTo: {},  // Empty = all products
    priority: 1,
    stackable: false
  })
});
```

**Result:** All products get 15% off their base price.

### Example 2: Quantity-Based Bulk Discount

Create a discount that applies only for bulk orders:

```javascript
const bulkOverlay = {
  name: "Bulk Discount 20%",
  type: "percentage_discount",
  value: 20,
  appliesTo: {},
  conditions: {
    minQty: 100  // Only for orders of 100+ units
  },
  priority: 2,
  stackable: false
};
```

### Example 3: Time-Limited Flash Sale

Create a short-term promotional overlay:

```javascript
const flashSale = {
  name: "Flash Sale 25% Off",
  type: "percentage_discount",
  value: 25,
  appliesTo: {
    categoryIds: ["electronics"]  // Only electronics
  },
  conditions: {
    dateRange: {
      start: "2026-04-01T12:00:00Z",
      end: "2026-04-01T18:00:00Z"   // 6-hour window
    }
  },
  priority: 5,  // High priority
  stackable: false
};
```

### Example 4: Stackable VIP + Seasonal Discounts

```javascript
// Seasonal discount (stackable)
const seasonal = {
  name: "Spring Sale 10%",
  type: "percentage_discount",
  value: 10,
  appliesTo: {},
  priority: 2,
  stackable: true  // Can combine with other overlays
};

// VIP customer discount (stackable)
const vip = {
  name: "VIP Loyalty 5%",
  type: "percentage_discount",
  value: 5,
  appliesTo: {},
  conditions: {
    customerGroups: ["vip"]
  },
  priority: 1,
  stackable: true
};

// VIP customers get both: 10% + 5% = ~14.5% total
// (1000 - 10% = 900, then 900 - 5% = 855)
```

### Example 5: Express Delivery Surcharge

Add a markup for expedited delivery:

```javascript
const expediteFee = {
  name: "Express Delivery Fee",
  type: "percentage_markup",
  value: 10,
  appliesTo: {},
  conditions: {
    // Could add custom field for deliveryType: 'express'
  },
  priority: 1,
  stackable: true
};
```

## Conflict Detection

The system automatically detects overlays that conflict:

**Conflict occurs when:**
- Two overlays are **both non-stackable**
- They have the **same priority**
- They target **overlapping products** (same SKU/variant/batch)

**Warning Example:**
```json
{
  "warnings": [
    "Overlay 'Flash Sale 25% Off' (non-stackable) overrides 1 other overlay(s) at the same priority level"
  ]
}
```

## Best Practices

### 1. Use Clear Naming Conventions

```
✅ Good: "Spring Sale 2026 - Electronics 20% Off"
❌ Bad: "Promo 1"
```

### 2. Set Appropriate Priorities

```
Priority 5: Flash sales, urgent promotions
Priority 3: Seasonal campaigns
Priority 2: Customer-type discounts (VIP, wholesale)
Priority 1: Base adjustments
```

### 3. Use Stackable Overlays for Additive Discounts

```javascript
// Allow VIP + Seasonal to combine
{ stackable: true, priority: 2 }  // Seasonal
{ stackable: true, priority: 1 }  // VIP
```

### 4. Use Non-Stackable for Exclusive Promotions

```javascript
// Flash sale overrides everything
{ stackable: false, priority: 5 }
```

### 5. Set Validity Dates for Time-Limited Offers

```javascript
{
  validFrom: new Date('2026-04-01'),
  validTo: new Date('2026-04-07')
}
```

### 6. Use Status Management

- `active`: Currently in effect
- `scheduled`: Queued for future activation
- `inactive`: Disabled but not deleted
- `expired`: Past validity period

## Performance Considerations

1. **Indexes**: The system uses database indexes on `status`, `priority`, and validity dates for fast filtering.

2. **Caching**: Consider caching overlay lists for frequently accessed products.

3. **Batch Operations**: When resolving prices for multiple products, batch overlay fetches.

4. **JSON Queries**: The `appliesTo` and `conditions` fields use JSONB for flexible filtering without schema changes.

## Testing

The system includes comprehensive test coverage:

- **Overlay Service Tests**: 15 tests covering CRUD, filtering, and conflict detection
- **Price Resolution Tests**: 8 tests covering stacking, priority, and conditions
- **Integration Tests**: End-to-end API tests

Run tests:
```bash
npm run test:backend
```

## Migration Guide

### Existing Code Compatibility

**Old pricing API still works:**
```javascript
// Still supported - returns base price only
const price = await getPrice({
  skuId: 'sku-001',
  batchId: 'batch-001',
  priceType: 'selling'
});
```

**New overlay-aware API:**
```javascript
// Returns resolved price with overlays
const resolvedPrice = await getPriceWithOverlays({
  skuId: 'sku-001',
  batchId: 'batch-001',
  priceType: 'selling',
  quantity: 100,
  customerType: 'wholesale'
});

console.log(resolvedPrice.basePrice);   // 1000
console.log(resolvedPrice.finalPrice);  // 850 (after overlays)
console.log(resolvedPrice.appliedOverlays);  // List of applied overlays
```

## Future Enhancements

- **Frontend UI**: Overlay management page (Campaign Manager)
- **Effective Price Preview**: Show base + overlays in product views
- **Overlay Badges**: Visual indicators ("10% OFF", "Clearance")
- **Analytics**: Track overlay performance and revenue impact
- **A/B Testing**: Test different overlay configurations
- **Customer Segment Targeting**: More sophisticated customer rules
- **Location-Based Pricing**: Branch/region-specific overlays

## Related Documentation

- [Batch Pricing System](./README.md#pricing)
- [API Reference](./README.md#api-reference)
- [Database Schema](./packages/backend/prisma/schema.prisma)
