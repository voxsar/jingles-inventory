import qrcode from 'qrcode-generator';

/**
 * Renders `value` as a scalable inline QR-code SVG string, sized for an 80mm
 * thermal receipt. Used in place of the long CODE128 barcode legacy receipts
 * print at the bottom — a QR code packs the same (or more) data into far
 * less vertical space and scans reliably off thermal paper.
 *
 * `typeNumber: 0` lets the encoder auto-pick the smallest QR version that
 * fits `value`, so short payloads (a receipt number) render a small, dense
 * code rather than an oversized one.
 */
export function receiptQrSvg(value: string, sizeMm = 20): string {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  // `scalable: true` emits a viewBox-based SVG (1 unit per module, no fixed
  // pixel size) so it stays crisp at any print DPI.
  const svg = qr.createSvgTag({ scalable: true });
  // Pin the on-page size via width/height so it lays out at `sizeMm` in the
  // receipt regardless of the viewBox the library picked.
  return svg.replace('<svg ', `<svg width="${sizeMm}mm" height="${sizeMm}mm" `);
}
