import { buildTscTe244Prn, type PrinterFileTemplate } from '../../utils/barcodePrinterFiles';

const template: PrinterFileTemplate = {
  pageWidthMm: 108,
  marginTopMm: 0,
  marginRightMm: 1,
  marginLeftMm: 1,
  columns: 4,
  labelWidthMm: 25,
  labelHeightMm: 15,
  gapXMm: 2,
  gapYMm: 2,
  paddingTopMm: 1,
  paddingRightMm: 2,
  paddingBottomMm: 1,
  paddingLeftMm: 2,
  barcodeHeightMm: 3,
  barcodeFormat: 'CODE128',
  showProductName: true,
  showVariantName: false,
  showPrice: true,
  showSkuCode: false,
  showBarcodeNumber: true,
};

const row = {
  barcode: '4791234567890',
  productName: 'Demo product',
  skuCode: 'SKU-1',
  price: 1250,
  copies: 4,
};

describe('buildTscTe244Prn', () => {
  it('packs four copies across one physical row', () => {
    const output = buildTscTe244Prn([row], template);

    expect(output).toContain('SIZE 108 mm,15 mm\r\n');
    expect(output).toContain('GAP 2 mm,0 mm\r\n');
    expect(output.match(/^PRINT 1,1$/gm)).toHaveLength(1);
    expect(output.match(/^BARCODE /gm)).toHaveLength(4);
    expect(output).toContain('BARCODE 24,');
    expect(output).toContain('BARCODE 240,');
    expect(output).toContain('BARCODE 456,');
    expect(output).toContain('BARCODE 672,');
  });

  it('advances to a second row only after filling four columns', () => {
    const output = buildTscTe244Prn([{ ...row, copies: 5 }], template);

    expect(output.match(/^PRINT 1,1$/gm)).toHaveLength(2);
    expect(output.match(/^CLS$/gm)).toHaveLength(2);
    expect(output.match(/^BARCODE /gm)).toHaveLength(5);
  });

  it('rejects media wider than the TE244 print head', () => {
    expect(() => buildTscTe244Prn([row], { ...template, pageWidthMm: 210 }))
      .toThrow('TSC TE244 media width must be between 1 and 108 mm.');
  });

  it('rejects a layout whose columns do not fit the configured media', () => {
    expect(() => buildTscTe244Prn([row], { ...template, labelWidthMm: 26 }))
      .toThrow('The 4-column layout needs 112 mm but the configured media is 108 mm wide.');
  });
});
