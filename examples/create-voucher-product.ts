/**
 * Example: Creating a Gift Voucher Product
 * 
 * This script demonstrates how to create a gift voucher product
 * with multiple denomination variants using the Jingles API.
 */

// Step 1: Create the base voucher SKU
const createVoucherSKU = async () => {
	const response = await fetch('http://localhost:3001/api/skus', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: 'Bearer YOUR_JWT_TOKEN',
		},
		body: JSON.stringify({
			skuCode: 'VOUCHER-GIFT',
			name: 'Gift Voucher',
			description: 'Redeemable gift voucher for any product',
			vendorId: 'your-vendor-id',
			unitOfMeasure: 'Piece',
			isVoucher: true,
			voucherValueType: 'fixed',
			categoryId: 'voucher-category-id',
			sellingPrice: 0, // Base price (variants will have their own)
			currency: 'LKR',
		}),
	});

	const { data: voucher } = await response.json();
	console.log('Created voucher SKU:', voucher.id);
	return voucher.id;
};

// Step 2: Create variants for different denominations
const createVoucherVariants = async (skuId: string) => {
	const denominations = [
		{ value: 500, name: '500 LKR' },
		{ value: 1000, name: '1,000 LKR' },
		{ value: 2000, name: '2,000 LKR' },
		{ value: 5000, name: '5,000 LKR' },
	];

	const variants = [];
	for (const denom of denominations) {
		const response = await fetch(
			`http://localhost:3001/api/skus/${skuId}/variants`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer YOUR_JWT_TOKEN',
				},
				body: JSON.stringify({
					variantCode: `VOUCHER-GIFT-${denom.value}`,
					name: denom.name,
				}),
			}
		);

		const { data: variant } = await response.json();
		console.log(`Created variant: ${denom.name} (${variant.id})`);
		variants.push(variant);
	}

	return variants;
};

// Step 3: Create batches for the 1000 LKR vouchers
const createBatchFor1000LKR = async (skuId: string, variantId: string) => {
	const response = await fetch('http://localhost:3001/api/vouchers/batches', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: 'Bearer YOUR_JWT_TOKEN',
		},
		body: JSON.stringify({
			skuId,
			variantId,
			batchName: 'June 2026 Promo - 1000 LKR',
			prefix: 'JUNE26',
			quantity: 100, // Generate 100 codes
			defaultValue: 1000,
			expiryDays: 180, // Valid for 6 months
		}),
	});

	const { data: batch } = await response.json();
	console.log('Created batch:', batch.id);
	return batch;
};

// Step 4: Add restrictions (cannot be used for alcohol products)
const addRestrictions = async (skuId: string, alcoholCategoryId: string) => {
	const response = await fetch(
		'http://localhost:3001/api/vouchers/restrictions',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer YOUR_JWT_TOKEN',
			},
			body: JSON.stringify({
				skuId,
				restrictionType: 'category_exclude',
				targetCategoryIds: [alcoholCategoryId],
				cannotCombineWithDiscounts: true,
				cannotCombineWithOtherVouchers: true,
				minPurchaseAmount: 500, // Minimum cart value
				maxDiscountAmount: 10000, // Max discount cap
			}),
		}
	);

	const { data: restriction } = await response.json();
	console.log('Created restriction:', restriction.id);
	return restriction;
};

// Step 5: Validate and redeem a voucher
const validateAndRedeemVoucher = async (voucherCode: string, cartItems: any[]) => {
	// First validate
	const validationResponse = await fetch(
		'http://localhost:3001/api/vouchers/validate',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				voucherCode,
				items: cartItems.map((item) => ({
					skuId: item.skuId,
					variantId: item.variantId,
					categoryId: item.categoryId,
					quantity: item.quantity,
					price: item.price,
				})),
				totalAmount: cartItems.reduce(
					(sum, item) => sum + item.price * item.quantity,
					0
				),
				hasOtherVouchers: false,
				hasDiscounts: false,
			}),
		}
	);

	const { data: validation } = await validationResponse.json();

	if (!validation.isValid) {
		console.error('Validation failed:', validation.errors);
		return null;
	}

	console.log(
		'Voucher is valid! Max redeemable:',
		validation.maxRedeemableAmount
	);

	// Now redeem
	const redemptionResponse = await fetch(
		'http://localhost:3001/api/vouchers/redeem',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer YOUR_JWT_TOKEN',
			},
			body: JSON.stringify({
				voucherCode,
				redeemedAmount: validation.maxRedeemableAmount,
				orderId: 'order-123',
				invoiceNumber: 'INV-12345',
				branchId: 'branch-001',
				appliedToItems: validation.applicableItems,
			}),
		}
	);

	const { data: redemption } = await redemptionResponse.json();
	console.log('Voucher redeemed successfully!');
	console.log('New balance:', redemption.voucherCode.currentBalance);

	return redemption;
};

// Example usage
async function main() {
	// Create voucher product
	const skuId = await createVoucherSKU();

	// Create variants
	const variants = await createVoucherVariants(skuId);

	// Generate batch of codes for 1000 LKR variant
	const variant1000 = variants.find((v: any) => v.name === '1,000 LKR');
	await createBatchFor1000LKR(skuId, variant1000.id);

	// Add restrictions
	await addRestrictions(skuId, 'alcohol-category-id');

	// Example redemption
	const cartItems = [
		{
			skuId: 'prod-001',
			variantId: 'var-red',
			categoryId: 'cat-electronics',
			quantity: 1,
			price: 800,
		},
	];

	await validateAndRedeemVoucher('JUNE26-ABC123XYZ456', cartItems);
}

// Run if needed
// main().catch(console.error);

export {
	createVoucherSKU,
	createVoucherVariants,
	createBatchFor1000LKR,
	addRestrictions,
	validateAndRedeemVoucher
};
