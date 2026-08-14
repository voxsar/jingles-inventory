export type PrinterFileTemplate = {
  pageWidthMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginLeftMm: number;
  columns: number;
  labelWidthMm: number;
  labelHeightMm: number;
  gapXMm: number;
  gapYMm: number;
  paddingTopMm: number;
  paddingRightMm: number;
  paddingBottomMm: number;
  paddingLeftMm: number;
  barcodeHeightMm: number;
  barcodeFormat: string;
  showProductName: boolean;
  showVariantName: boolean;
  showPrice: boolean;
  showSkuCode: boolean;
  showBarcodeNumber: boolean;
};

export type PrinterFileRow = {
  barcode: string;
  productName: string;
  variantName?: string | null;
  skuCode: string;
  price?: number | null;
  copies: number;
};

const TSC_TE244_DOTS_PER_MM = 8;
const TSC_TE244_MAX_PRINT_WIDTH_MM = 108;

function mm(value: number) {
  return Number(value.toFixed(2)).toString();
}

function dots(value: number) {
  return Math.max(0, Math.round(value * TSC_TE244_DOTS_PER_MM));
}

function printableText(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/["\\]/g, "'")
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function barcodeText(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error('A barcode value is empty.');
  if (!/^[\x20-\x7e]+$/.test(normalized) || normalized.includes('"')) {
    throw new Error(`Barcode ${normalized || '(empty)'} contains characters that cannot be sent safely to the TSC printer.`);
  }
  return normalized;
}

function truncateFixedFont(value: string, availableDots: number, characterWidth = 8) {
  const safe = printableText(value);
  const maxCharacters = Math.max(1, Math.floor(availableDots / characterWidth));
  if (safe.length <= maxCharacters) return safe;
  if (maxCharacters <= 3) return safe.slice(0, maxCharacters);
  return `${safe.slice(0, maxCharacters - 3)}...`;
}

function formatPrice(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
  return `LKR ${Number(value).toFixed(2)}`;
}

function estimatedCode128Width(value: string) {
  // TSPL's automatic Code 128 mode normally switches numeric pairs to subset C.
  const dataSymbols = /^\d+$/.test(value)
    ? Math.ceil(value.length / 2) + (value.length % 2)
    : value.length;
  return 11 * dataSymbols + 35;
}

function expandedRows(rows: PrinterFileRow[]) {
  return rows.flatMap((row) => Array.from(
    { length: Math.max(1, Math.round(row.copies)) },
    () => row,
  ));
}

function validateTemplate(template: PrinterFileTemplate) {
  const columns = Math.round(template.columns);
  if (!Number.isFinite(columns) || columns < 1) {
    throw new Error('The TSC template must have at least one column.');
  }
  if (template.pageWidthMm <= 0 || template.pageWidthMm > TSC_TE244_MAX_PRINT_WIDTH_MM) {
    throw new Error(`TSC TE244 media width must be between 1 and ${TSC_TE244_MAX_PRINT_WIDTH_MM} mm.`);
  }
  if (template.labelWidthMm <= 0 || template.labelHeightMm <= 0) {
    throw new Error('TSC label width and height must be greater than zero.');
  }
  const usedWidth = template.marginLeftMm
    + template.marginRightMm
    + columns * template.labelWidthMm
    + Math.max(0, columns - 1) * template.gapXMm;
  if (usedWidth > template.pageWidthMm + 0.01) {
    throw new Error(`The ${columns}-column layout needs ${mm(usedWidth)} mm but the configured media is ${mm(template.pageWidthMm)} mm wide.`);
  }
  if (template.barcodeFormat.toUpperCase() !== 'CODE128') {
    throw new Error('Direct TSC download currently supports CODE128 labels only.');
  }
  return columns;
}

function renderLabel(row: PrinterFileRow, template: PrinterFileTemplate, column: number) {
  const labelLeft = template.marginLeftMm + column * (template.labelWidthMm + template.gapXMm);
  const left = dots(labelLeft + template.paddingLeftMm);
  const top = dots(template.marginTopMm + template.paddingTopMm);
  const right = dots(labelLeft + template.labelWidthMm - template.paddingRightMm);
  const bottom = dots(template.labelHeightMm - template.paddingBottomMm);
  const availableWidth = right - left;
  if (availableWidth < 40) {
    throw new Error('The printable width inside each TSC label is too small.');
  }

  const value = barcodeText(row.barcode);
  if (estimatedCode128Width(value) > availableWidth) {
    throw new Error(`Barcode ${value} is too wide for the configured ${mm(template.labelWidthMm)} mm label.`);
  }

  const commands: string[] = [];
  let y = top;
  const lineHeight = 12;
  const lineGap = 2;

  if (template.showProductName) {
    commands.push(`TEXT ${left},${y},"1",0,1,1,"${truncateFixedFont(row.productName, availableWidth)}"`);
    y += lineHeight + lineGap;
  }
  if (template.showVariantName && row.variantName) {
    commands.push(`TEXT ${left},${y},"1",0,1,1,"${truncateFixedFont(row.variantName, availableWidth)}"`);
    y += lineHeight + lineGap;
  }

  const footerParts: string[] = [];
  if (template.showSkuCode) footerParts.push(row.skuCode);
  if (template.showPrice) {
    const price = formatPrice(row.price);
    if (price) footerParts.push(price);
  }
  const reservedFooter = (footerParts.length > 0 ? lineHeight + lineGap : 0)
    + (template.showBarcodeNumber ? lineHeight + lineGap : 0);
  const requestedBarcodeHeight = Math.max(16, dots(template.barcodeHeightMm));
  const barcodeHeight = Math.min(requestedBarcodeHeight, bottom - y - reservedFooter);
  if (barcodeHeight < 16) {
    throw new Error(`The configured ${mm(template.labelHeightMm)} mm label is too short for the selected TSC label content.`);
  }

  commands.push(`BARCODE ${left},${y},"128",${barcodeHeight},0,0,1,1,"${value}"`);
  y += barcodeHeight + lineGap;

  if (footerParts.length > 0) {
    commands.push(`TEXT ${left},${y},"1",0,1,1,"${truncateFixedFont(footerParts.join('  '), availableWidth)}"`);
    y += lineHeight + lineGap;
  }
  if (template.showBarcodeNumber) {
    commands.push(`TEXT ${left},${y},"1",0,1,1,"${truncateFixedFont(value, availableWidth)}"`);
  }

  return commands;
}

/**
 * Builds a raw TSPL/TSPL2 job for a 203 dpi TSC TE244. Each PRINT command
 * advances one physical row, while labels in that row are packed left-to-right.
 */
export function buildTscTe244Prn(rows: PrinterFileRow[], template: PrinterFileTemplate) {
  if (rows.length === 0) throw new Error('There are no barcode rows to download.');
  const columns = validateTemplate(template);
  const items = expandedRows(rows);
  const commands = [
    `SIZE ${mm(template.pageWidthMm)} mm,${mm(template.labelHeightMm)} mm`,
    `GAP ${mm(Math.max(0, template.gapYMm))} mm,0 mm`,
    'DIRECTION 1,0',
    'REFERENCE 0,0',
    'CLS',
  ];

  for (let start = 0; start < items.length; start += columns) {
    if (start > 0) commands.push('CLS');
    items.slice(start, start + columns).forEach((row, column) => {
      commands.push(...renderLabel(row, template, column));
    });
    commands.push('PRINT 1,1');
  }

  return `${commands.join('\r\n')}\r\n`;
}
