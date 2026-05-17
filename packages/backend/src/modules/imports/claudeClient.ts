import https from 'https';
import {
	ClaudeImportResult,
	GRNImportInput,
	ImportEntityType,
	InventoryImportInput,
	PreparedPromptContent,
	PRNImportInput,
	ProductImportInput,
	SupplierImportInput,
} from './types';

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
const ANTHROPIC_API_VERSION = '2023-06-01';
const IMPORT_TOOL_NAME = 'submit_import_mapping';

type JsonSchema = Record<string, any>;

interface ClaudeMessageResponse {
	content?: Array<{ type: string; name?: string; input?: any; text?: string }>;
	error?: { message?: string };
}

function stringProperty(description: string): JsonSchema {
	return { type: 'string', description };
}

function numberProperty(description: string): JsonSchema {
	return { type: 'number', description };
}

function stringArrayProperty(description: string): JsonSchema {
	return {
		type: 'array',
		description,
		items: { type: 'string' },
	};
}

function buildRecordSchema(dataSchema: JsonSchema): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			summary: stringProperty('A concise human-readable summary of the record.'),
			confidence: numberProperty('A confidence score between 0 and 1 for this extracted record.'),
			warnings: stringArrayProperty('Any record-level caveats or ambiguities noticed during extraction.'),
			data: dataSchema,
		},
		required: ['data'],
	};
}

function buildSupplierSchema(): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			name: stringProperty('Supplier or vendor display name from the document.'),
			contactEmail: stringProperty('Supplier email address if shown.'),
			contactPhone: stringProperty('Supplier phone number if shown.'),
			address: stringProperty('Supplier address if shown.'),
			type: stringProperty('Supplier type label if shown, such as Supplier, Vendor, or Both.'),
			website: stringProperty('Supplier website if shown.'),
			taxId: stringProperty('Tax or registration identifier if shown.'),
			paymentTerms: stringProperty('Payment terms if shown.'),
			notes: stringProperty('Free-form notes relevant to this supplier.'),
			confidence: numberProperty('A confidence score between 0 and 1 for the extracted supplier.'),
		},
	};
}

function buildProductSchema(): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			skuCode: stringProperty('SKU code, product code, or stock code if shown.'),
			name: stringProperty('Product name.'),
			description: stringProperty('Product description if shown.'),
			vendorName: stringProperty('Supplier or vendor name associated with the product.'),
			vendorEmail: stringProperty('Supplier or vendor email if shown.'),
			categoryName: stringProperty('Category or department name if shown.'),
			unitOfMeasure: stringProperty('Unit of measure such as Piece, Box, Kg, or Liter.'),
			costPrice: numberProperty('Cost price as a numeric value if shown.'),
			sellingPrice: numberProperty('Selling or retail price as a numeric value if shown.'),
			wholesalePrice: numberProperty('Wholesale price as a numeric value if shown.'),
			bulkPrice: numberProperty('Bulk or dealer price as a numeric value if shown.'),
			marginType: stringProperty('Margin type if the document explicitly indicates fixed or percentage.'),
			marginValue: numberProperty('Margin amount or percentage if shown.'),
			currency: stringProperty('Currency code if shown, otherwise omit.'),
			defaultManufacturingDate: stringProperty('Manufacturing date normalized to YYYY-MM-DD when possible.'),
			defaultExpiryDate: stringProperty('Expiry date normalized to YYYY-MM-DD when possible.'),
			shelfLifeDays: numberProperty('Shelf life in days if shown.'),
			lowStockThreshold: numberProperty('Low stock threshold if shown.'),
			notes: stringProperty('Free-form notes relevant to this product.'),
			confidence: numberProperty('A confidence score between 0 and 1 for the extracted product.'),
		},
	};
}

function buildInventorySchema(): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			skuCode: stringProperty('SKU code or stock code if shown.'),
			skuName: stringProperty('Product name if shown.'),
			variantCode: stringProperty('Variant code if shown.'),
			variantName: stringProperty('Variant name if shown.'),
			batchNumber: stringProperty('Batch number if shown.'),
			quantity: numberProperty('Inventory quantity as a numeric value.'),
			state: stringProperty('Inventory state label if shown.'),
			branchCode: stringProperty('Branch code if shown.'),
			branchName: stringProperty('Branch name if shown.'),
			floorCode: stringProperty('Floor code if shown.'),
			floorName: stringProperty('Floor name if shown.'),
			shelfCode: stringProperty('Shelf code if shown.'),
			shelfName: stringProperty('Shelf name if shown.'),
			boxCode: stringProperty('Storage box code if shown.'),
			boxName: stringProperty('Storage box name if shown.'),
			vendorName: stringProperty('Supplier or vendor name relevant to the batch if shown.'),
			costPrice: numberProperty('Cost price as a numeric value if shown.'),
			sellingPrice: numberProperty('Selling price as a numeric value if shown.'),
			wholesalePrice: numberProperty('Wholesale price as a numeric value if shown.'),
			bulkPrice: numberProperty('Bulk price as a numeric value if shown.'),
			currency: stringProperty('Currency code if shown.'),
			manufacturingDate: stringProperty('Manufacturing date normalized to YYYY-MM-DD when possible.'),
			expiryDate: stringProperty('Expiry date normalized to YYYY-MM-DD when possible.'),
			terminalId: stringProperty('Terminal or device identifier if shown.'),
			notes: stringProperty('Free-form notes relevant to this inventory record.'),
			confidence: numberProperty('A confidence score between 0 and 1 for the extracted inventory row.'),
		},
	};
}

function buildGRNLineSchema(): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			skuCode: stringProperty('SKU code or stock code for the GRN line.'),
			skuName: stringProperty('Product name for the GRN line.'),
			variantCode: stringProperty('Variant code if shown.'),
			variantName: stringProperty('Variant name if shown.'),
			batchNumber: stringProperty('Batch number if shown.'),
			expectedQuantity: numberProperty('Expected or received quantity for this GRN line as a numeric value.'),
			costPrice: numberProperty('Line-level cost price if shown.'),
			sellingPrice: numberProperty('Line-level selling price if shown.'),
			wholesalePrice: numberProperty('Line-level wholesale price if shown.'),
			bulkPrice: numberProperty('Line-level bulk price if shown.'),
			marginType: stringProperty('Margin type if explicitly shown.'),
			marginValue: numberProperty('Margin value if explicitly shown.'),
			notes: stringProperty('Notes specific to this GRN line.'),
		},
	};
}

function buildGRNSchema(): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			supplierName: stringProperty('Supplier or vendor name for the GRN.'),
			supplierEmail: stringProperty('Supplier email if shown.'),
			invoiceReference: stringProperty('Invoice or GRN reference number.'),
			supplierInvoiceDate: stringProperty('Supplier invoice date normalized to YYYY-MM-DD when possible.'),
			expectedDeliveryDate: stringProperty('Expected delivery date normalized to YYYY-MM-DD when possible.'),
			deliveryDate: stringProperty('Delivery date normalized to YYYY-MM-DD when possible.'),
			branchCode: stringProperty('Branch code if shown.'),
			branchName: stringProperty('Branch name if shown.'),
			floorCode: stringProperty('Floor code if shown.'),
			floorName: stringProperty('Floor name if shown.'),
			shelfCode: stringProperty('Shelf code if shown.'),
			shelfName: stringProperty('Shelf name if shown.'),
			notes: stringProperty('Notes for the GRN.'),
			confidence: numberProperty('A confidence score between 0 and 1 for the extracted GRN.'),
			lines: {
				type: 'array',
				description: 'The GRN line items grouped under this GRN.',
				items: buildGRNLineSchema(),
			},
		},
		required: ['lines'],
	};
}

function buildPRNLineSchema(): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			skuCode: stringProperty('SKU code or stock code for the PRN line.'),
			skuName: stringProperty('Product name for the PRN line.'),
			variantCode: stringProperty('Variant code if shown.'),
			variantName: stringProperty('Variant name if shown.'),
			batchNumber: stringProperty('Batch number if shown.'),
			returnQuantity: numberProperty('Return quantity for the PRN line as a numeric value.'),
			notes: stringProperty('Notes specific to this PRN line.'),
		},
	};
}

function buildPRNSchema(): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			supplierName: stringProperty('Supplier or vendor name for the PRN.'),
			supplierEmail: stringProperty('Supplier email if shown.'),
			returnReason: stringProperty('Return reason or memo for the PRN.'),
			expectedPickupDate: stringProperty('Expected pickup date normalized to YYYY-MM-DD when possible.'),
			branchCode: stringProperty('Branch code if shown.'),
			branchName: stringProperty('Branch name if shown.'),
			floorCode: stringProperty('Floor code if shown.'),
			floorName: stringProperty('Floor name if shown.'),
			shelfCode: stringProperty('Shelf code if shown.'),
			shelfName: stringProperty('Shelf name if shown.'),
			notes: stringProperty('Notes for the PRN.'),
			confidence: numberProperty('A confidence score between 0 and 1 for the extracted PRN.'),
			lines: {
				type: 'array',
				description: 'The PRN line items grouped under this PRN.',
				items: buildPRNLineSchema(),
			},
		},
		required: ['lines'],
	};
}

function buildDataSchema(entityType: ImportEntityType): JsonSchema {
	switch (entityType) {
		case 'supplier':
			return buildSupplierSchema();
		case 'product':
			return buildProductSchema();
		case 'inventory':
			return buildInventorySchema();
		case 'grn':
			return buildGRNSchema();
		case 'prn':
			return buildPRNSchema();
		default:
			throw new Error(`Unsupported import entity type "${entityType}"`);
	}
}

function buildToolSchema(entityType: ImportEntityType): JsonSchema {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			documentSummary: stringProperty('A concise summary of what the uploaded document contains.'),
			warnings: stringArrayProperty('Any document-level caveats, ambiguities, or formatting issues found while extracting records.'),
			records: {
				type: 'array',
				description: 'The extracted records to import.',
				items: buildRecordSchema(buildDataSchema(entityType)),
			},
		},
		required: ['records'],
	};
}

function buildExtractionInstructions(entityType: ImportEntityType) {
	const baseRules = [
		'Extract structured records from the uploaded document for import into an inventory system.',
		`The target import type is "${entityType}". Only return records for that target type.`,
		'Do not invent database ids, UUIDs, or hidden values.',
		'If a field is missing or unclear, omit it and add a warning explaining the ambiguity.',
		'Normalize dates to YYYY-MM-DD whenever the date is recognizable.',
		'Return numeric quantities and prices as numbers, not strings.',
		'Keep summaries short and scan-friendly.',
	];

	switch (entityType) {
		case 'supplier':
			baseRules.push('Each supplier/vendor row or document entry should become one record.');
			break;
		case 'product':
			baseRules.push('Each product/SKU row or product card should become one record.');
			break;
		case 'inventory':
			baseRules.push('Each inventory row or stock row should become one record.');
			break;
		case 'grn':
			baseRules.push('Group GRN line items under the correct top-level GRN based on supplier, invoice, and document structure.');
			baseRules.push('Each top-level record should represent one GRN and include its line items in the lines array.');
			break;
		case 'prn':
			baseRules.push('Group PRN line items under the correct top-level PRN based on supplier, return reason, and document structure.');
			baseRules.push('Each top-level record should represent one PRN and include its line items in the lines array.');
			break;
	}

	return baseRules.join('\n');
}

function postToAnthropic(body: Record<string, any>): Promise<ClaudeMessageResponse> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error('ANTHROPIC_API_KEY is not configured');
	}

	const payload = JSON.stringify(body);

	return new Promise((resolve, reject) => {
		const request = https.request(
			{
				hostname: 'api.anthropic.com',
				path: '/v1/messages',
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'content-length': Buffer.byteLength(payload),
					'x-api-key': apiKey,
					'anthropic-version': ANTHROPIC_API_VERSION,
				},
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
				response.on('end', () => {
					const raw = Buffer.concat(chunks).toString('utf8');
					let parsed: ClaudeMessageResponse;
					try {
						parsed = JSON.parse(raw);
					} catch (error) {
						reject(new Error(`Anthropic returned invalid JSON: ${raw.slice(0, 500)}`));
						return;
					}

					if (!response.statusCode || response.statusCode >= 400) {
						reject(new Error(parsed.error?.message ?? `Anthropic request failed with status ${response.statusCode}`));
						return;
					}

					resolve(parsed);
				});
			}
		);

		request.on('error', reject);
		request.write(payload);
		request.end();
	});
}

function getToolInput<T>(response: ClaudeMessageResponse): T {
	const toolUse = response.content?.find((block) => block.type === 'tool_use' && block.name === IMPORT_TOOL_NAME);
	if (!toolUse?.input) {
		throw new Error('Claude did not return structured import data');
	}

	return toolUse.input as T;
}

export async function mapImportDocumentWithClaude(
	entityType: ImportEntityType,
	promptContent: PreparedPromptContent,
): Promise<ClaudeImportResult>;
export async function mapImportDocumentWithClaude(
	entityType: 'supplier',
	promptContent: PreparedPromptContent,
): Promise<ClaudeImportResult<SupplierImportInput>>;
export async function mapImportDocumentWithClaude(
	entityType: 'product',
	promptContent: PreparedPromptContent,
): Promise<ClaudeImportResult<ProductImportInput>>;
export async function mapImportDocumentWithClaude(
	entityType: 'inventory',
	promptContent: PreparedPromptContent,
): Promise<ClaudeImportResult<InventoryImportInput>>;
export async function mapImportDocumentWithClaude(
	entityType: 'grn',
	promptContent: PreparedPromptContent,
): Promise<ClaudeImportResult<GRNImportInput>>;
export async function mapImportDocumentWithClaude(
	entityType: 'prn',
	promptContent: PreparedPromptContent,
): Promise<ClaudeImportResult<PRNImportInput>>;
export async function mapImportDocumentWithClaude(
	entityType: ImportEntityType,
	promptContent: PreparedPromptContent,
): Promise<ClaudeImportResult>;
export async function mapImportDocumentWithClaude(
	entityType: ImportEntityType,
	promptContent: PreparedPromptContent,
): Promise<ClaudeImportResult> {
	const response = await postToAnthropic({
		model: DEFAULT_ANTHROPIC_MODEL,
		max_tokens: 8_192,
		system: buildExtractionInstructions(entityType),
		tool_choice: {
			type: 'tool',
			name: IMPORT_TOOL_NAME,
		},
		tools: [
			{
				name: IMPORT_TOOL_NAME,
				description: `Return the structured ${entityType} records extracted from the uploaded document. Use this tool exactly once and only after you have finished analyzing the document.`,
				input_schema: buildToolSchema(entityType),
				strict: true,
			},
		],
		messages: [
			{
				role: 'user',
				content: [
					...promptContent.contentBlocks,
					{
						type: 'text',
						text: `Analyze the uploaded file and extract import-ready ${entityType} records. If the document mixes unrelated information, keep only the parts relevant to ${entityType} imports.`,
					},
				],
			},
		],
	});

	return getToolInput<ClaudeImportResult>(response);
}
