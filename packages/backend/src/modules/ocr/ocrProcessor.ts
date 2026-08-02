import path from 'path';
import fs from 'fs';
import { createWorker } from 'tesseract.js';
import { PDFParse } from 'pdf-parse';

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
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt') {
    const text = fs.readFileSync(filePath, 'utf8');
    return parseInvoiceText(text);
  }

  const recognize = async (input: string | Buffer | Uint8Array) => {
    const worker = await createWorker('eng');
    try {
      const result = await worker.recognize(input);
      return result.data.text;
    } finally {
      await worker.terminate();
    }
  };

  if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    return parseInvoiceText(await recognize(filePath));
  }

  if (ext === '.pdf') {
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
      const extracted = await parser.getText();
      let text = extracted.text?.trim() ?? '';
      if (!text) {
        const screenshots = await parser.getScreenshot({ imageBuffer: true, scale: 1.5, first: 5 });
        const pages: string[] = [];
        for (const screenshot of screenshots.pages) {
          pages.push(await recognize(screenshot.data));
        }
        text = pages.join('\n');
      }
      if (!text.trim()) throw new Error('No readable text was found in the PDF');
      return parseInvoiceText(text);
    } finally {
      await parser.destroy();
    }
  }

  throw new Error(
	    `Unsupported file type "${ext}". Supported types are .txt, .jpg, .jpeg, .png, and .pdf.`
  );
}
