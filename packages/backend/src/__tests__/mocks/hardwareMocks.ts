/**
 * Mock barcode scanner adapter for testing.
 * Simulates keyboard-wedge and serial barcode scanner events without real hardware.
 */

export interface MockScanEvent {
  barcode: string;
  timestamp: Date;
  terminalId: string;
  scanDurationMs: number;
}

export const MOCK_BARCODES = {
  validSKU: 'SKU-001-BOX',
  anotherValidSKU: 'SKU-002-PIECE',
  unknownBarcode: 'UNKNOWN-9999',
  damagedItem: 'SKU-DAMAGED-001',
  emptyBarcode: '',
  longBarcode: 'A'.repeat(128),
  specialChars: 'SKU-001/A+B',
};

export function createMockScanEvent(barcode: string, terminalId = 'TERMINAL-001'): MockScanEvent {
  return {
    barcode,
    timestamp: new Date(),
    terminalId,
    scanDurationMs: Math.floor(Math.random() * 50) + 10,
  };
}

export function createMockScanSequence(barcodes: string[], terminalId = 'TERMINAL-001'): MockScanEvent[] {
  return barcodes.map(barcode => createMockScanEvent(barcode, terminalId));
}

/**
 * Simulates keyboard-wedge scanner input as DOM keypress events.
 * Each character is dispatched as a keypress event, followed by Enter.
 */
export function simulateKeyboardWedgeScan(barcode: string, target: EventTarget = document): void {
  for (const char of barcode) {
    const event = new KeyboardEvent('keypress', {
      key: char,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
  }
  // Simulate Enter to complete the scan
  const enterEvent = new KeyboardEvent('keypress', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(enterEvent);
}

/**
 * Mock OCR adapter for testing invoice/document scanning.
 */
export interface MockOCRPayload {
  invoiceNumber?: string;
  supplierName?: string;
  invoiceDate?: string;
  totalAmount?: string;
  lineItems: Array<{
    description?: string;
    quantity?: string;
    unitPrice?: string;
    total?: string;
  }>;
  rawText?: string;
  confidence?: number;
}

export const MOCK_OCR_PAYLOADS = {
  validInvoice: {
    invoiceNumber: 'INV-2024-001',
    supplierName: 'Acme Supplies Ltd',
    invoiceDate: '12/01/2024',
    totalAmount: '1500.00',
    lineItems: [
      { description: 'Widget A', quantity: '10', unitPrice: '50.00', total: '500.00' },
      { description: 'Widget B', quantity: '20', unitPrice: '50.00', total: '1000.00' },
    ],
    rawText:
      'Invoice No: INV-2024-001\nFrom: Acme Supplies Ltd\nDate: 12/01/2024\n10 Widget A 500.00\n20 Widget B 1000.00\nTotal: 1500.00',
    confidence: 0.97,
  } as MockOCRPayload,

  partialInvoice: {
    invoiceNumber: 'INV-2024-002',
    supplierName: undefined,
    invoiceDate: '15/01/2024',
    totalAmount: undefined,
    lineItems: [{ description: 'Partial Item', quantity: '5' }],
    rawText: 'Invoice No: INV-2024-002\nDate: 15/01/2024\n5 Partial Item',
    confidence: 0.72,
  } as MockOCRPayload,

  emptyDocument: {
    invoiceNumber: undefined,
    supplierName: undefined,
    invoiceDate: undefined,
    totalAmount: undefined,
    lineItems: [],
    rawText: '',
    confidence: 0.0,
  } as MockOCRPayload,

  malformedInvoice: {
    invoiceNumber: undefined,
    supplierName: undefined,
    invoiceDate: undefined,
    totalAmount: undefined,
    lineItems: [],
    rawText: 'Lorem ipsum dolor sit amet',
    confidence: 0.12,
  } as MockOCRPayload,
};

export function createMockOCRResponse(payload: MockOCRPayload) {
  return {
    success: true,
    data: payload,
    processingTimeMs: Math.floor(Math.random() * 2000) + 500,
    engine: 'mock-ocr-v1',
  };
}
