# 🎁 Gift Voucher System

## Overview

The Jingles Inventory Management System now includes a comprehensive **Gift Voucher System** that allows you to create, manage, and redeem gift vouchers as products. Vouchers can have different denominations (variants), conditional restrictions, and balance tracking.

## Key Features

✅ **Voucher Products**: Create vouchers as regular SKUs with variants for different denominations (e.g., 500, 1000, 2000 LKR)
✅ **Range-Based Values**: Support both fixed-value and range-based vouchers
✅ **Bulk Generation**: Generate thousands of voucher codes in batches
✅ **Unique Code Generation**: Auto-generate unique, human-friendly voucher codes
✅ **Balance Tracking**: Track voucher balance and partial redemptions
✅ **Conditional Restrictions**: Apply category/product exclusions and combination rules
✅ **Redemption History**: Full audit trail of voucher usage
✅ **Expiry Management**: Set expiry dates and extend them when needed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VOUCHER SYSTEM                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Voucher Products (SKUs)                                  │
│     • Flag: isVoucher = true                                 │
│     • Variants for denominations (500, 1000, etc.)           │
│     • Normal inventory management                            │
│                                                               │
│  2. Voucher Codes                                            │
│     • Unique codes (e.g., GV-ABCD1234EFGH)                   │
│     • Balance tracking (initial → current)                   │
│     • Status: active, redeemed, expired, cancelled           │
│                                                               │
│  3. Restrictions                                             │
│     • Category exclusions/inclusions                         │
│     • SKU/variant exclusions/inclusions                      │
│     • Cannot combine with discounts/other vouchers           │
│     • Minimum purchase amount                                │
│     • Maximum discount amount                                │
│                                                               │
│  4. Redemption Tracking                                      │
│     • Full redemption history                                │
│     • Applied items tracking                                 │
│     • Balance before/after                                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Voucher Fields in SKU Table

```typescript
SKU {
  isVoucher: boolean           // Mark as voucher product
  voucherValueType: 'fixed' | 'range'
  voucherMinValue: number     // For range-based vouchers
  voucherMaxValue: number     // For range-based vouchers
}
```

### VoucherBatch (Bulk Generation)

```typescript
VoucherBatch {
  id: string
  skuId: string              // The voucher product
  variantId?: string         // Specific denomination variant
  batchName: string
  prefix?: string            // Code prefix (e.g., "GIFT")
  quantity: number           // How many codes to generate
  generatedCount: number     // How many generated so far
  defaultValue: number       // Value for each code
  expiryDays?: number        // Days until expiry
  defaultExpiresAt?: Date
  status: 'pending' | 'generating' | 'completed' | 'failed'
}
```

### VoucherCode (Individual Voucher)

```typescript
VoucherCode {
  id: string
  code: string                    // Unique code (e.g., "GV-ABC123XYZ")
  skuId: string
  variantId?: string
  initialValue: number            // Original value
  currentBalance: number          // Remaining balance
  currency: string                // 'LKR', 'USD', etc.
  status: 'active' | 'redeemed' | 'expired' | 'cancelled' | 'suspended'
  issuedAt: Date
  expiresAt?: Date
  activatedAt?: Date              // First redemption
  fullyRedeemedAt?: Date
  customerId?: string             // Who purchased it
  orderId?: string
  purchaseReference?: string
}
```

### VoucherRedemption (Usage History)

```typescript
VoucherRedemption {
  id: string
  voucherCodeId: string
  code: string
  redeemedAmount: number
  balanceBefore: number
  balanceAfter: number
  orderId?: string
  invoiceNumber?: string
  branchId?: string
  appliedToItems?: Array<{
    skuId: string
    variantId?: string
    quantity: number
    originalPrice: number
    discountedPrice: number
  }>
  redeemedBy?: string
  redeemedAt: Date
}
```

### VoucherRestriction (Conditions)

```typescript
VoucherRestriction {
  id: string
  skuId: string                               // The voucher product
  restrictionType: 
    | 'category_exclude'                      // Exclude categories
    | 'category_include'                      // Only these categories
    | 'sku_exclude'                           // Exclude specific products
    | 'sku_include'                           // Only these products
    | 'variant_exclude'                       // Exclude variants
    | 'variant_include'                       // Only these variants
  targetCategoryIds?: string[]
  targetSkuIds?: string[]
  targetVariantIds?: string[]
  cannotCombineWithDiscounts: boolean         // Default: true
  cannotCombineWithOtherVouchers: boolean     // Default: true
  minPurchaseAmount?: number                  // Minimum cart value
  maxDiscountAmount?: number                  // Cap the discount
  priority: number
}
```

## API Endpoints

### Voucher Code Management

#### Create Single Voucher Code
```http
POST /api/vouchers/codes
Authorization: Bearer <token>
Content-Type: application/json

{
  "skuId": "voucher-sku-id",
  "variantId": "variant-1000",
  "value": 1000,
  "currency": "LKR",
  "expiresAt": "2027-01-01T00:00:00Z",
  "prefix": "GIFT",
  "notes": "Birthday gift voucher"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "vc-001",
    "code": "GIFT-ABC123XYZ456",
    "initialValue": 1000,
    "currentBalance": 1000,
    "status": "active"
  }
}
```

#### Create Bulk Batch
```http
POST /api/vouchers/batches
Authorization: Bearer <token>
Content-Type: application/json

{
  "skuId": "voucher-sku-id",
  "variantId": "variant-1000",
  "batchName": "Christmas 2026 Promo",
  "prefix": "XMAS26",
  "quantity": 1000,
  "defaultValue": 1000,
  "expiryDays": 365
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "batch-001",
    "batchName": "Christmas 2026 Promo",
    "quantity": 1000,
    "status": "generating"
  }
}
```

#### List Voucher Codes
```http
GET /api/vouchers/codes?skuId=xxx&status=active&page=1&pageSize=50
```

#### Get Voucher Details
```http
GET /api/vouchers/codes/GIFT-ABC123XYZ456
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "vc-001",
    "code": "GIFT-ABC123XYZ456",
    "initialValue": 1000,
    "currentBalance": 750,
    "status": "active",
    "expiresAt": "2027-01-01T00:00:00Z",
    "sku": {
      "id": "sku-001",
      "name": "Gift Voucher 1000 LKR"
    },
    "redemptions": [
      {
        "id": "red-001",
        "redeemedAmount": 250,
        "redeemedAt": "2026-06-01T10:30:00Z",
        "invoiceNumber": "INV-12345"
      }
    ]
  }
}
```

### Voucher Validation & Redemption

#### Validate Voucher
```http
POST /api/vouchers/validate
Content-Type: application/json

{
  "voucherCode": "GIFT-ABC123XYZ456",
  "items": [
    {
      "skuId": "prod-001",
      "variantId": "var-red",
      "categoryId": "cat-electronics",
      "quantity": 2,
      "price": 500
    }
  ],
  "totalAmount": 1000,
  "branchId": "branch-001",
  "hasOtherVouchers": false,
  "hasDiscounts": false
}
```

**Response (Valid):**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "voucher": { /* voucher details */ },
    "maxRedeemableAmount": 750,
    "applicableItems": [
      {
        "skuId": "prod-001",
        "variantId": "var-red",
        "quantity": 2,
        "maxDiscount": 750
      }
    ]
  }
}
```

**Response (Invalid):**
```json
{
  "success": true,
  "data": {
    "isValid": false,
    "errors": [
      "Voucher has expired",
      "This voucher cannot be combined with discounts"
    ]
  }
}
```

#### Redeem Voucher
```http
POST /api/vouchers/redeem
Authorization: Bearer <token>
Content-Type: application/json

{
  "voucherCode": "GIFT-ABC123XYZ456",
  "redeemedAmount": 500,
  "orderId": "order-123",
  "invoiceNumber": "INV-12345",
  "branchId": "branch-001",
  "appliedToItems": [
    {
      "skuId": "prod-001",
      "variantId": "var-red",
      "quantity": 2,
      "originalPrice": 500,
      "discountedPrice": 250
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "voucherCode": {
      "currentBalance": 250,
      "status": "active"
    },
    "redemption": {
      "id": "red-002",
      "redeemedAmount": 500,
      "balanceBefore": 750,
      "balanceAfter": 250
    }
  }
}
```

#### Get Voucher Balance
```http
GET /api/vouchers/balance/GIFT-ABC123XYZ456
```

#### Get Redemption History
```http
GET /api/vouchers/redemptions/GIFT-ABC123XYZ456
```

### Voucher Restrictions

#### Create/Update Restrictions
```http
POST /api/vouchers/restrictions
Authorization: Bearer <token>
Content-Type: application/json

{
  "skuId": "voucher-sku-id",
  "restrictionType": "category_exclude",
  "targetCategoryIds": ["cat-alcohol", "cat-tobacco"],
  "cannotCombineWithDiscounts": true,
  "cannotCombineWithOtherVouchers": true,
  "minPurchaseAmount": 500,
  "maxDiscountAmount": 5000
}
```

#### Get Restrictions
```http
GET /api/vouchers/restrictions/voucher-sku-id
```

#### Delete Restriction
```http
DELETE /api/vouchers/restrictions/:restrictionId
```

### Voucher Management

#### Cancel Voucher
```http
PUT /api/vouchers/codes/GIFT-ABC123XYZ456/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Customer requested refund"
}
```

#### Extend Expiry
```http
PUT /api/vouchers/codes/GIFT-ABC123XYZ456/extend
Authorization: Bearer <token>
Content-Type: application/json

{
  "newExpiryDate": "2028-01-01T00:00:00Z"
}
```

## Usage Examples

### Example 1: Create a 1000 LKR Gift Voucher Product

1. **Create the voucher SKU:**
```typescript
const voucherSku = await prisma.sku.create({
  data: {
    skuCode: 'VOUCHER-GIFT',
    name: 'Gift Voucher',
    description: 'Redeemable gift voucher',
    vendorId: 'internal-vendor-id',
    unitOfMeasure: 'Piece',
    isVoucher: true,
    voucherValueType: 'fixed',
    sellingPrice: 1000,  // Face value
    currency: 'LKR',
  }
});
```

2. **Create variants for different denominations:**
```typescript
// 500 LKR variant
const variant500 = await prisma.skuVariant.create({
  data: {
    skuId: voucherSku.id,
    variantCode: 'VOUCHER-GIFT-500',
    name: '500 LKR',
  }
});

// 1000 LKR variant
const variant1000 = await prisma.skuVariant.create({
  data: {
    skuId: voucherSku.id,
    variantCode: 'VOUCHER-GIFT-1000',
    name: '1000 LKR',
  }
});

// 2000 LKR variant
const variant2000 = await prisma.skuVariant.create({
  data: {
    skuId: voucherSku.id,
    variantCode: 'VOUCHER-GIFT-2000',
    name: '2000 LKR',
  }
});
```

3. **Generate voucher codes:**
```http
POST /api/vouchers/batches

{
  "skuId": "voucher-sku-id",
  "variantId": "variant1000-id",
  "batchName": "June Promo 2026",
  "prefix": "JUNE26",
  "quantity": 100,
  "defaultValue": 1000,
  "expiryDays": 180
}
```

### Example 2: Voucher with Category Restrictions

**Scenario**: Create a voucher that cannot be used for alcohol products

```http
POST /api/vouchers/restrictions

{
  "skuId": "voucher-sku-id",
  "restrictionType": "category_exclude",
  "targetCategoryIds": ["alcohol-category-id"],
  "cannotCombineWithDiscounts": true,
  "minPurchaseAmount": 500
}
```

### Example 3: Voucher Redemption Workflow

```typescript
// 1. Customer provides voucher code at checkout
const voucherCode = "JUNE26-ABC123XYZ456";

// 2. Validate the voucher
const validation = await fetch('/api/vouchers/validate', {
  method: 'POST',
  body: JSON.stringify({
    voucherCode,
    items: cart.items,
    totalAmount: cart.total,
    hasDiscounts: cart.hasActiveDiscounts,
  })
});

if (!validation.isValid) {
  // Show errors to customer
  alert(validation.errors.join(', '));
  return;
}

// 3. Apply discount to cart
const discount = Math.min(
  validation.maxRedeemableAmount,
  cart.total
);
cart.applyVoucherDiscount(discount);

// 4. Complete order
const order = await createOrder(cart);

// 5. Redeem the voucher
await fetch('/api/vouchers/redeem', {
  method: 'POST',
  body: JSON.stringify({
    voucherCode,
    redeemedAmount: discount,
    orderId: order.id,
    invoiceNumber: order.invoiceNumber,
    appliedToItems: order.items,
  })
});
```

## Migration Instructions

1. **Run the Prisma migration:**
```bash
cd packages/backend
npx prisma migrate deploy
```

2. **Regenerate Prisma Client:**
```bash
npx prisma generate
```

3. **Restart the backend server:**
```bash
npm run deploy:backend
```

4. **Build the shared package:**
```bash
npm run build:shared
```

## Testing Checklist

- [ ] Create voucher SKU with `isVoucher: true`
- [ ] Create variants for different denominations
- [ ] Generate single voucher code
- [ ] Generate bulk batch (100+ codes)
- [ ] Validate voucher with valid cart
- [ ] Validate voucher with restricted categories
- [ ] Redeem voucher partially
- [ ] Redeem voucher fully
- [ ] Check balance after redemption
- [ ] View redemption history
- [ ] Cancel voucher
- [ ] Extend voucher expiry
- [ ] Test expiry date validation
- [ ] Test combination restrictions

## Security Considerations

1. **Unique Code Generation**: Codes use cryptographically random characters (excluding similar-looking ones)
2. **Database Constraints**: Unique constraint on `code` field prevents duplicates
3. **Transaction Safety**: Redemption uses database transactions to prevent race conditions
4. **Balance Validation**: Server-side validation prevents over-redemption
5. **Audit Trail**: Complete redemption history with user tracking

## Best Practices

1. **Prefix Codes**: Use meaningful prefixes (e.g., "XMAS26", "BDAY", "PROMO") for easy identification
2. **Expiry Dates**: Always set expiry dates for promotional vouchers
3. **Restrictions**: Clearly communicate restrictions to customers
4. **Monitoring**: Regularly check voucher batch status and redemption rates
5. **Inventory**: Treat vouchers as regular inventory items for stock management

## Future Enhancements

- [ ] Email voucher codes to customers
- [ ] Print-ready voucher templates
- [ ] QR code generation for vouchers
- [ ] Analytics dashboard for voucher performance
- [ ] Auto-apply vouchers based on customer segments
- [ ] Gift voucher purchase flow in POS
- [ ] Physical voucher scanning
- [ ] Multi-currency voucher support
- [ ] Voucher gifting (transfer codes)
- [ ] Integration with loyalty programs

## Support

For issues or questions about the voucher system, contact the development team or refer to the main README.md for general system documentation.
