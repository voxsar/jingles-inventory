import path from 'path';
import fs from 'fs';

export interface InvoiceFields {
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
}

export function parseInvoiceText(text: string): InvoiceFields {
  const result: InvoiceFields = { lineItems: [] };

  const invoiceNumMatch = text.match(/(?:invoice\s*(?:no|number|#)[:\s]*)([\w-]+)/i);
  if (invoiceNumMatch) result.invoiceNumber = invoiceNumMatch[1];

  const dateMatch = text.match(/(?:date[:\s]*)(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (dateMatch) result.invoiceDate = dateMatch[1];

  const supplierMatch = text.match(/(?:from|supplier|vendor)[:\s]*([^\n]+)/i);
  if (supplierMatch) result.supplierName = supplierMatch[1].trim();

  const totalMatch = text.match(/(?:total|amount due)[:\s]*[$£€]?\s*([\d,]+\.?\d{0,2})/i);
  if (totalMatch) result.totalAmount = totalMatch[1];

  const lineItemPattern = /(\d+)\s+x?\s*([^\n]+?)\s+([\d,]+\.?\d{0,2})/g;
  let match;
  while ((match = lineItemPattern.exec(text)) !== null) {
    result.lineItems.push({
      quantity: match[1],
      description: match[2].trim(),
      total: match[3],
    });
  }

  result.rawText = text;
  return result;
}

export async function processInvoiceFile(filePath: string): Promise<InvoiceFields> {
  // Only plain-text invoices are supported. For image/PDF files, integrate a real
  // OCR service (e.g. Tesseract.js or Google Cloud Vision) before calling this function.
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt') {
    const text = fs.readFileSync(filePath, 'utf8');
    return parseInvoiceText(text);
  }

  throw new Error(
    `Unsupported file type "${ext}". Only .txt invoices can be parsed without an external OCR service.`
  );
}
