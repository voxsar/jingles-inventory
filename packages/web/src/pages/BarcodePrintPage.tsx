import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { barcodeApi, skusApi, variantsApi } from '../api/client';
import { UiBadge, UiText } from '../components/UiPrimitives';
import Pagination from '../components/Pagination';

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

type BarcodeTemplate = {
  id?: string;
  name: string;
  description?: string | null;
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  columns: number;
  rows: number;
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
  isDefault: boolean;
  printCount?: number;
};

type PrintRow = {
  localId: string;
  skuId: string;
  variantId?: string | null;
  barcodeId?: string | null;
  barcode: string;
  productName: string;
  variantName?: string | null;
  skuCode: string;
  price?: number | null;
  copies: number;
};

type JobFilters = {
  search: string;
  sourceType: string;
  status: string;
  fromDate: string;
  toDate: string;
};

const defaultTemplate: BarcodeTemplate = {
  name: 'Standard A4 3 x 8',
  description: 'Default barcode label sheet',
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginTopMm: 8,
  marginRightMm: 8,
  marginBottomMm: 8,
  marginLeftMm: 8,
  columns: 3,
  rows: 8,
  labelWidthMm: 62,
  labelHeightMm: 34,
  gapXMm: 2,
  gapYMm: 2,
  paddingTopMm: 2,
  paddingRightMm: 2,
  paddingBottomMm: 2,
  paddingLeftMm: 2,
  barcodeHeightMm: 14,
  barcodeFormat: 'CODE128',
  showProductName: true,
  showVariantName: true,
  showPrice: true,
  showSkuCode: false,
  showBarcodeNumber: true,
  isDefault: true,
};

function encodeCode128B(value: string) {
  const text = value.replace(/[^\x20-\x7e]/g, '?');
  const codes = [104, ...Array.from(text).map((char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  return [...codes, checksum, 106];
}

function Code128Barcode({ value, height = 48 }: { value: string; height?: number }) {
  const codes = encodeCode128B(value || ' ');
  const bars: JSX.Element[] = [];
  let cursor = 0;

  codes.forEach((code, codeIndex) => {
    const pattern = CODE128_PATTERNS[code];
    let black = true;
    Array.from(pattern).forEach((char, widthIndex) => {
      const width = Number(char);
      if (black) {
        bars.push(
          <rect
            key={`${codeIndex}-${widthIndex}-${cursor}`}
            x={cursor}
            y={0}
            width={width}
            height={height}
            fill="currentColor"
          />
        );
      }
      cursor += width;
      black = !black;
    });
  });

  return (
    <svg className="barcode-svg" viewBox={`0 0 ${cursor} ${height}`} preserveAspectRatio="none" aria-label={value}>
      {bars}
    </svg>
  );
}

function normalizeTemplate(raw: any): BarcodeTemplate {
  return { ...defaultTemplate, ...raw };
}

function formatPrice(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
  return `LKR ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rowFromJobItem(item: any): PrintRow {
  return {
    localId: item.id,
    skuId: item.skuId,
    variantId: item.variantId ?? null,
    barcodeId: item.barcodeId ?? null,
    barcode: item.barcodeSnapshot,
    productName: item.productNameSnapshot,
    variantName: item.variantNameSnapshot,
    skuCode: item.skuCodeSnapshot,
    price: item.priceSnapshot === null || item.priceSnapshot === undefined ? null : Number(item.priceSnapshot),
    copies: item.copies,
  };
}

function expandRows(rows: PrintRow[]) {
  return rows.flatMap((row) => Array.from({ length: Math.max(1, row.copies) }, (_, index) => ({
    ...row,
    localId: `${row.localId}-${index}`,
  })));
}

const DOTS_PER_MM = 8;

function mmToDots(value: number) {
  return Math.max(0, Math.round(value * DOTS_PER_MM));
}

function zplText(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/[\^~]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function buildZpl(rows: PrintRow[], template: BarcodeTemplate) {
  const width = mmToDots(template.labelWidthMm);
  const height = mmToDots(template.labelHeightMm);
  const padLeft = mmToDots(template.paddingLeftMm);
  const padTop = mmToDots(template.paddingTopMm);
  const barcodeHeight = Math.max(32, mmToDots(template.barcodeHeightMm));
  const contentWidth = Math.max(80, width - padLeft - mmToDots(template.paddingRightMm));
  const fontSmall = Math.max(16, Math.min(28, Math.round(height * 0.08)));
  const fontMedium = Math.max(18, Math.min(34, Math.round(height * 0.1)));
  const expanded = expandRows(rows);

  return expanded.map((row) => {
    let y = padTop;
    const lines = [
      '^XA',
      `^PW${width}`,
      `^LL${height}`,
      '^CI28',
    ];

    if (template.showProductName) {
      lines.push(`^FO${padLeft},${y}^A0N,${fontMedium},${fontMedium}^FB${contentWidth},1,0,L,0^FD${zplText(row.productName)}^FS`);
      y += fontMedium + 4;
    }
    if (template.showVariantName && row.variantName) {
      lines.push(`^FO${padLeft},${y}^A0N,${fontSmall},${fontSmall}^FB${contentWidth},1,0,L,0^FD${zplText(row.variantName)}^FS`);
      y += fontSmall + 4;
    }

    lines.push(`^FO${padLeft},${y}^BY2,2,${barcodeHeight}^BCN,${barcodeHeight},N,N,N^FD${zplText(row.barcode)}^FS`);
    y += barcodeHeight + 10;

    const footerParts = [];
    if (template.showSkuCode) footerParts.push(row.skuCode);
    if (template.showPrice && row.price !== null && row.price !== undefined) footerParts.push(formatPrice(row.price));
    if (footerParts.length > 0) {
      lines.push(`^FO${padLeft},${y}^A0N,${fontSmall},${fontSmall}^FB${contentWidth},1,0,L,0^FD${zplText(footerParts.join('  '))}^FS`);
      y += fontSmall + 2;
    }
    if (template.showBarcodeNumber) {
      lines.push(`^FO${padLeft},${y}^A0N,${fontSmall},${fontSmall}^FB${contentWidth},1,0,C,0^FD${zplText(row.barcode)}^FS`);
    }

    lines.push('^XZ');
    return lines.join('\n');
  }).join('\n');
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/zpl;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'barcode-print';
}

function BarcodeLabel({ row, template }: { row: PrintRow; template: BarcodeTemplate }) {
  return (
    <div
      className="barcode-label"
      style={{
        width: `${template.labelWidthMm}mm`,
        height: `${template.labelHeightMm}mm`,
        padding: `${template.paddingTopMm}mm ${template.paddingRightMm}mm ${template.paddingBottomMm}mm ${template.paddingLeftMm}mm`,
      }}
    >
      {template.showProductName && <div className="barcode-product-name">{row.productName}</div>}
      {template.showVariantName && row.variantName && <div className="barcode-variant-name">{row.variantName}</div>}
      <div className="barcode-image" style={{ height: `${template.barcodeHeightMm}mm` }}>
        <Code128Barcode value={row.barcode} height={48} />
      </div>
      <div className="barcode-label-footer">
        {template.showSkuCode && <span>{row.skuCode}</span>}
        {template.showPrice && row.price !== null && row.price !== undefined && <span>{formatPrice(row.price)}</span>}
      </div>
      {template.showBarcodeNumber && <div className="barcode-number">{row.barcode}</div>}
    </div>
  );
}

function LabelSheet({ rows, template, allPages = false }: { rows: PrintRow[]; template: BarcodeTemplate; allPages?: boolean }) {
  const expanded = expandRows(rows);
  const cellsPerPage = Math.max(1, template.columns * template.rows);
  const pages = allPages
    ? Array.from({ length: Math.max(1, Math.ceil(expanded.length / cellsPerPage)) }, (_, page) =>
        expanded.slice(page * cellsPerPage, page * cellsPerPage + cellsPerPage)
      )
    : [expanded.slice(0, cellsPerPage)];

  return (
    <>
      {pages.map((pageRows, pageIndex) => (
        <div
          key={pageIndex}
          className="barcode-sheet"
          style={{
            width: `${template.pageWidthMm}mm`,
            minHeight: `${template.pageHeightMm}mm`,
            padding: `${template.marginTopMm}mm ${template.marginRightMm}mm ${template.marginBottomMm}mm ${template.marginLeftMm}mm`,
          }}
        >
          <div
            className="barcode-sheet-grid"
            style={{
              gridTemplateColumns: `repeat(${template.columns}, ${template.labelWidthMm}mm)`,
              gridAutoRows: `${template.labelHeightMm}mm`,
              columnGap: `${template.gapXMm}mm`,
              rowGap: `${template.gapYMm}mm`,
            }}
          >
            {Array.from({ length: cellsPerPage }).map((_, index) => {
              const row = pageRows[index];
              return row ? <BarcodeLabel key={row.localId} row={row} template={template} /> : <div key={index} />;
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export default function BarcodePrintPage() {
  const [searchParams] = useSearchParams();
  const grnId = searchParams.get('grn');
  const autoGrnRef = useRef<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<'list' | 'designer'>(grnId ? 'designer' : 'list');
  const [templates, setTemplates] = useState<BarcodeTemplate[]>([]);
  const [template, setTemplate] = useState<BarcodeTemplate>(defaultTemplate);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [variantsBySku, setVariantsBySku] = useState<Record<string, any[]>>({});
  const [rows, setRows] = useState<PrintRow[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobTotalPages, setJobTotalPages] = useState(1);
  const [jobPage, setJobPage] = useState(1);
  const [jobPageSize, setJobPageSize] = useState(20);
  const [jobFilters, setJobFilters] = useState<JobFilters>({
    search: '',
    sourceType: '',
    status: '',
    fromDate: '',
    toDate: '',
  });
  const [jobListLoading, setJobListLoading] = useState(false);
  const [currentJob, setCurrentJob] = useState<any | null>(null);
  const [aliasInputs, setAliasInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totalCopies = useMemo(() => rows.reduce((sum, row) => sum + Math.max(1, row.copies), 0), [rows]);
  const cellsPerPage = Math.max(1, template.columns * template.rows);

  const loadTemplates = useCallback(async () => {
    const response = await barcodeApi.listTemplates();
    const items = (response.data?.data ?? []).map(normalizeTemplate);
    setTemplates(items);
    setTemplate(items.find((item: BarcodeTemplate) => item.isDefault) ?? items[0] ?? defaultTemplate);
  }, []);

  const loadJobs = useCallback(async () => {
    setJobListLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(jobPage),
        pageSize: String(jobPageSize),
      };
      if (jobFilters.search.trim()) params.search = jobFilters.search.trim();
      if (jobFilters.sourceType) params.sourceType = jobFilters.sourceType;
      if (jobFilters.status) params.status = jobFilters.status;
      if (jobFilters.fromDate) params.fromDate = jobFilters.fromDate;
      if (jobFilters.toDate) params.toDate = jobFilters.toDate;
      const response = await barcodeApi.listPrintJobs(params);
      const data = response.data?.data ?? {};
      setJobs(data.items ?? []);
      setJobTotal(data.total ?? 0);
      setJobTotalPages(data.totalPages ?? 1);
    } finally {
      setJobListLoading(false);
    }
  }, [jobFilters, jobPage, jobPageSize]);

  useEffect(() => {
    Promise.all([loadTemplates(), loadJobs()])
      .catch((error) => setNotice(error.response?.data?.error ?? 'Failed to load barcode printing data'))
      .finally(() => setLoading(false));
  }, [loadTemplates, loadJobs]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params: Record<string, string> = { pageSize: '10', isActive: 'true' };
      if (productSearch.trim()) params.search = productSearch.trim();
      skusApi.list(params)
        .then((response) => setProducts(response.data?.data?.items ?? []))
        .catch(() => setProducts([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  useEffect(() => {
    if (!grnId || autoGrnRef.current === grnId || loading) return;
    autoGrnRef.current = grnId;
    void createFromGrn(grnId);
  }, [grnId, loading]);

  const updateTemplate = (field: keyof BarcodeTemplate, value: string | number | boolean) => {
    setTemplate((current) => ({
      ...current,
      [field]: typeof current[field] === 'number' ? Number(value) : value,
    }));
  };

  const updateJobFilter = (field: keyof JobFilters, value: string) => {
    setJobFilters((current) => ({ ...current, [field]: value }));
    setJobPage(1);
  };

  const resetDesigner = () => {
    setRows([]);
    setCurrentJob(null);
    setAliasInputs({});
    setMode('designer');
  };

  const downloadZpl = (sourceRows = rows, sourceTemplate = template, job?: any) => {
    if (sourceRows.length === 0) {
      setNotice('There are no barcode rows to download.');
      return;
    }
    const zpl = buildZpl(sourceRows, sourceTemplate);
    const nameSeed = job?.grn?.invoiceReference
      ? `grn-${job.grn.invoiceReference}`
      : job?.id
        ? `barcode-print-${job.id.slice(0, 8)}`
        : `barcode-print-${new Date().toISOString().slice(0, 10)}`;
    downloadTextFile(`${safeFilePart(nameSeed)}.zpl`, zpl);
  };

  const downloadJobZpl = async (job: any) => {
    setBusy(`zpl-${job.id}`);
    try {
      const response = await barcodeApi.getPrintJob(job.id);
      const fullJob = response.data?.data;
      downloadZpl(
        (fullJob.items ?? []).map(rowFromJobItem),
        normalizeTemplate(fullJob.template ?? template),
        fullJob,
      );
    } catch (error: any) {
      setNotice(error.response?.data?.error ?? 'Failed to download ZPL');
    } finally {
      setBusy(null);
    }
  };

  const saveTemplate = async () => {
    if (!template.name.trim()) {
      setNotice('Template name is required.');
      return;
    }
    setBusy('template');
    try {
      const response = template.id
        ? await barcodeApi.updateTemplate(template.id, template)
        : await barcodeApi.createTemplate(template);
      const saved = normalizeTemplate(response.data?.data);
      setTemplate(saved);
      await loadTemplates();
      setNotice('Template saved.');
    } catch (error: any) {
      setNotice(error.response?.data?.error ?? 'Failed to save template');
    } finally {
      setBusy(null);
    }
  };

  const loadVariants = async (skuId: string) => {
    if (variantsBySku[skuId]) return;
    try {
      const response = await variantsApi.list(skuId);
      setVariantsBySku((current) => ({ ...current, [skuId]: response.data?.data ?? [] }));
    } catch {
      setVariantsBySku((current) => ({ ...current, [skuId]: [] }));
    }
  };

  const addProductRow = async (sku: any, variant?: any, forceNew = false) => {
    setBusy(`${sku.id}-${variant?.id ?? 'product'}`);
    try {
      const barcodeResponse = await barcodeApi.generate({ skuId: sku.id, variantId: variant?.id ?? null, forceNew });
      const barcode = barcodeResponse.data?.data;
      setRows((current) => [
        ...current,
        {
          localId: `${sku.id}-${variant?.id ?? 'product'}-${Date.now()}`,
          skuId: sku.id,
          variantId: variant?.id ?? null,
          barcodeId: barcode?.id ?? null,
          barcode: barcode?.barcode ?? sku.barcodes?.[0]?.barcode ?? sku.skuCode,
          productName: sku.name,
          variantName: variant ? (variant.name ?? variant.variantCode) : null,
          skuCode: sku.skuCode,
          price: sku.sellingPrice ?? null,
          copies: 1,
        },
      ]);
      setCurrentJob(null);
      setMode('designer');
    } catch (error: any) {
      setNotice(error.response?.data?.error ?? 'Failed to add barcode row');
    } finally {
      setBusy(null);
    }
  };

  const linkAlias = async (row: PrintRow) => {
    const barcode = aliasInputs[row.localId]?.trim();
    if (!barcode) return;
    setBusy(`alias-${row.localId}`);
    try {
      const response = await barcodeApi.link({
        skuId: row.skuId,
        variantId: row.variantId,
        barcode,
        barcodeType: 'CODE128',
        label: 'Linked from barcode print designer',
      });
      const linked = response.data?.data;
      setRows((current) => current.map((item) => item.localId === row.localId
        ? { ...item, barcodeId: linked.id, barcode: linked.barcode }
        : item
      ));
      setAliasInputs((current) => ({ ...current, [row.localId]: '' }));
      setNotice('Barcode linked to the same product.');
    } catch (error: any) {
      setNotice(error.response?.data?.error ?? 'Failed to link barcode');
    } finally {
      setBusy(null);
    }
  };

  const savePrintJob = async () => {
    if (rows.length === 0) {
      setNotice('Add at least one product barcode before saving a print job.');
      return null;
    }
    setBusy('job');
    try {
      const response = await barcodeApi.createPrintJob({
        templateId: template.id ?? null,
        sourceType: currentJob?.sourceType ?? 'MANUAL',
        grnId: currentJob?.grnId ?? grnId ?? null,
        items: rows.map((row) => ({
          skuId: row.skuId,
          variantId: row.variantId ?? null,
          barcodeId: row.barcodeId ?? null,
          copies: row.copies,
          price: row.price ?? null,
        })),
      });
      const job = response.data?.data;
      setCurrentJob(job);
      setRows((job.items ?? []).map(rowFromJobItem));
      await loadJobs();
      setMode('designer');
      setNotice('Barcode print job saved.');
      return job;
    } catch (error: any) {
      setNotice(error.response?.data?.error ?? 'Failed to save print job');
      return null;
    } finally {
      setBusy(null);
    }
  };

  async function createFromGrn(id: string) {
    setBusy('grn');
    try {
      const response = await barcodeApi.createPrintJobFromGrn(id, { templateId: template.id ?? null });
      const job = response.data?.data;
      setCurrentJob(job);
      setRows((job.items ?? []).map(rowFromJobItem));
      await loadJobs();
      setMode('designer');
      setNotice(`Created barcode print entry from GRN ${job.grn?.invoiceReference ?? id.slice(0, 8)}.`);
    } catch (error: any) {
      setNotice(error.response?.data?.error ?? 'Failed to create print entry from GRN');
    } finally {
      setBusy(null);
    }
  }

  const loadJob = async (id: string) => {
    setBusy(`job-${id}`);
    try {
      const response = await barcodeApi.getPrintJob(id);
      const job = response.data?.data;
      setCurrentJob(job);
      setRows((job.items ?? []).map(rowFromJobItem));
      if (job.template) setTemplate(normalizeTemplate(job.template));
      setMode('designer');
    } catch (error: any) {
      setNotice(error.response?.data?.error ?? 'Failed to load print job');
    } finally {
      setBusy(null);
    }
  };

  const printLabels = async () => {
    let job = currentJob;
    if (!job?.id) {
      job = await savePrintJob();
      if (!job?.id) return;
    }
    const mount = document.createElement('div');
    mount.className = 'barcode-print-document';
    const sheetHtml = printRef.current?.innerHTML ?? '';
    const printWindow = window.open('', '_blank', 'width=960,height=720');
    if (!printWindow) {
      setNotice('The print window was blocked by the browser.');
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Barcode Print ${job.id}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: white; color: #111; font-family: Arial, sans-serif; }
            .barcode-sheet { background: #fff; break-after: page; page-break-after: always; }
            .barcode-sheet:last-child { break-after: auto; page-break-after: auto; }
            .barcode-sheet-grid { display: grid; align-content: start; }
            .barcode-label { overflow: hidden; border: 0; display: flex; flex-direction: column; justify-content: center; color: #111; background: white; }
            .barcode-product-name { font-weight: 700; font-size: 9pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .barcode-variant-name { font-size: 7.5pt; line-height: 1.1; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .barcode-image { width: 100%; margin: 1mm 0; color: #111; }
            .barcode-svg { width: 100%; height: 100%; display: block; }
            .barcode-label-footer { display: flex; justify-content: space-between; gap: 2mm; font-size: 7pt; font-weight: 700; }
            .barcode-number { font-family: Consolas, monospace; font-size: 6.5pt; text-align: center; line-height: 1.1; }
            @page { size: ${template.pageWidthMm}mm ${template.pageHeightMm}mm; margin: 0; }
          </style>
        </head>
        <body><div class="barcode-print-document">${sheetHtml}</div></body>
      </html>
    `);
    printWindow.document.close();
    mount.remove();
    printWindow.focus();
    printWindow.print();
    try {
      const response = await barcodeApi.markPrintJobPrinted(job.id);
      const updated = response.data?.data;
      setCurrentJob(updated);
      setRows((updated.items ?? []).map(rowFromJobItem));
      await loadJobs();
      setNotice('Print count recorded.');
    } catch (error: any) {
      setNotice(error.response?.data?.error ?? 'Labels printed, but the print count was not recorded.');
    }
  };

  if (loading) {
    return <div className="content-section px-6 py-8 text-sm text-gray-500">Loading barcode designer...</div>;
  }

  if (mode === 'list') {
    const hasFilters = Object.values(jobFilters).some(Boolean);
    return (
      <div className="barcode-print-page">
        <div className="page-header">
          <div className="page-header-left">
            <h1 className="page-title">Barcodes</h1>
            <p className="page-subtitle">Saved barcode print entries, print counts, ZPL downloads, and label design.</p>
          </div>
          <button type="button" className="btn-primary" onClick={resetDesigner}>New print entry</button>
        </div>

        {notice && (
          <div className="ui-banner ui-banner--info">
            <span>{notice}</span>
            <button type="button" className="btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}

        <section className="content-section p-5">
          <div className="barcode-filter-grid">
            <label className="form-group">
              <span className="form-label">Name, product, SKU, barcode, GRN</span>
              <input
                className="input-field"
                value={jobFilters.search}
                onChange={(event) => updateJobFilter('search', event.target.value)}
                placeholder="Search print entries"
              />
            </label>
            <label className="form-group">
              <span className="form-label">Source</span>
              <select className="input-field" value={jobFilters.sourceType} onChange={(event) => updateJobFilter('sourceType', event.target.value)}>
                <option value="">All sources</option>
                <option value="MANUAL">Manual</option>
                <option value="GRN">GRN</option>
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">Status</span>
              <select className="input-field" value={jobFilters.status} onChange={(event) => updateJobFilter('status', event.target.value)}>
                <option value="">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PRINTED">Printed</option>
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">From date</span>
              <input className="input-field" type="date" value={jobFilters.fromDate} onChange={(event) => updateJobFilter('fromDate', event.target.value)} />
            </label>
            <label className="form-group">
              <span className="form-label">To date</span>
              <input className="input-field" type="date" value={jobFilters.toDate} onChange={(event) => updateJobFilter('toDate', event.target.value)} />
            </label>
            <div className="barcode-filter-actions">
              <button type="button" className="btn-secondary" onClick={() => void loadJobs()} disabled={jobListLoading}>Refresh</button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasFilters}
                onClick={() => {
                  setJobFilters({ search: '', sourceType: '', status: '', fromDate: '', toDate: '' });
                  setJobPage(1);
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className="content-section">
          <div className="content-section-header">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Print entries</h2>
              <p className="text-xs text-gray-500">Open an entry to edit, print, or download its ZPL file.</p>
            </div>
          </div>
          <div className="barcode-entries-table-wrap">
            <table className="barcode-entries-table">
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Products</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Copies</th>
                  <th>Printed</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {jobListLoading ? (
                  <tr><td colSpan={8} className="barcode-empty">Loading print entries...</td></tr>
                ) : jobs.length === 0 ? (
                  <tr><td colSpan={8} className="barcode-empty">No barcode print entries found.</td></tr>
                ) : jobs.map((job) => {
                  const productNames = (job.items ?? []).slice(0, 3).map((item: any) => item.productNameSnapshot).join(', ');
                  const overflow = Math.max(0, (job.items?.length ?? 0) - 3);
                  return (
                    <tr key={job.id} onClick={() => void loadJob(job.id)}>
                      <td>
                        <strong>{job.grn?.invoiceReference ? `GRN ${job.grn.invoiceReference}` : job.sourceType}</strong>
                        <div className="text-xs text-gray-500 font-mono">{job.id.slice(0, 8)}</div>
                      </td>
                      <td>
                        <span>{productNames || 'No products'}</span>
                        {overflow > 0 && <span className="text-xs text-gray-500"> +{overflow} more</span>}
                      </td>
                      <td>{job.template?.name ?? 'Unsaved template'}</td>
                      <td><UiBadge tone={job.status === 'PRINTED' ? 'success' : 'info'}>{job.status}</UiBadge></td>
                      <td>{job.totalCopies}</td>
                      <td>{job.printRunCount} runs / {job.printedCount} labels</td>
                      <td>{new Date(job.createdAt).toLocaleString()}</td>
                      <td>
                        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                          <button type="button" className="btn-sm" onClick={() => void loadJob(job.id)}>Open</button>
                          <button type="button" className="btn-sm" onClick={() => void downloadJobZpl(job)} disabled={busy === `zpl-${job.id}`}>ZPL</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={jobPage}
            totalPages={jobTotalPages}
            pageSize={jobPageSize}
            total={jobTotal}
            onPageChange={setJobPage}
            onPageSizeChange={(size) => {
              setJobPageSize(size);
              setJobPage(1);
            }}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="barcode-print-page">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Barcode Printing</h1>
          <p className="page-subtitle">Design sheets, link product barcodes, generate variant labels, and track print runs.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => setMode('list')}>Entries</button>
          {currentJob && <UiBadge tone={currentJob.status === 'PRINTED' ? 'success' : 'info'}>{currentJob.status}</UiBadge>}
          <button type="button" className="btn-secondary" onClick={() => void savePrintJob()} disabled={busy === 'job'}>Save print</button>
          <button type="button" className="btn-secondary" onClick={() => downloadZpl()} disabled={rows.length === 0}>Download ZPL</button>
          <button type="button" className="btn-primary" onClick={() => void printLabels()} disabled={rows.length === 0 || Boolean(busy)}>Print labels</button>
        </div>
      </div>

      {notice && (
        <div className="ui-banner ui-banner--info">
          <span>{notice}</span>
          <button type="button" className="btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <div className="barcode-workspace">
        <div className="barcode-controls">
          <section className="content-section p-5">
            <div className="content-section-header !px-0 !pt-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Template</h2>
                <p className="text-xs text-gray-500">{template.printCount ?? 0} labels printed with this template</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setTemplate({ ...defaultTemplate, name: 'New template', id: undefined })}>New</button>
            </div>
            <div className="form-stack">
              <label className="form-group">
                <span className="form-label">Saved template</span>
                <select
                  className="input-field"
                  value={template.id ?? ''}
                  onChange={(event) => {
                    const selected = templates.find((item) => item.id === event.target.value);
                    if (selected) setTemplate(selected);
                  }}
                >
                  {!template.id && <option value="">Unsaved template</option>}
                  {templates.filter((item) => item.id).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">Template name</span>
                <input className="input-field" value={template.name} onChange={(event) => updateTemplate('name', event.target.value)} />
              </label>
              <div className="barcode-template-grid">
                {[
                  ['Page W', 'pageWidthMm'], ['Page H', 'pageHeightMm'], ['Top', 'marginTopMm'], ['Right', 'marginRightMm'],
                  ['Bottom', 'marginBottomMm'], ['Left', 'marginLeftMm'], ['Columns', 'columns'], ['Rows', 'rows'],
                  ['Label W', 'labelWidthMm'], ['Label H', 'labelHeightMm'], ['Gap X', 'gapXMm'], ['Gap Y', 'gapYMm'],
                  ['Pad T', 'paddingTopMm'], ['Pad R', 'paddingRightMm'], ['Pad B', 'paddingBottomMm'], ['Pad L', 'paddingLeftMm'],
                  ['Bars H', 'barcodeHeightMm'],
                ].map(([label, key]) => (
                  <label key={key} className="form-group">
                    <span className="form-label">{label} mm</span>
                    <input
                      className="input-field"
                      type="number"
                      min="0"
                      step={['columns', 'rows'].includes(key) ? '1' : '0.5'}
                      value={template[key as keyof BarcodeTemplate] as number}
                      onChange={(event) => updateTemplate(key as keyof BarcodeTemplate, event.target.value)}
                    />
                  </label>
                ))}
              </div>
              <div className="barcode-checkbox-grid">
                {[
                  ['Product name', 'showProductName'], ['Variant name', 'showVariantName'], ['Price', 'showPrice'],
                  ['SKU code', 'showSkuCode'], ['Barcode number', 'showBarcodeNumber'], ['Default template', 'isDefault'],
                ].map(([label, key]) => (
                  <label key={key} className="barcode-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(template[key as keyof BarcodeTemplate])}
                      onChange={(event) => updateTemplate(key as keyof BarcodeTemplate, event.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <button type="button" className="btn-primary self-start" onClick={() => void saveTemplate()} disabled={busy === 'template'}>
                Save template
              </button>
            </div>
          </section>

          <section className="content-section p-5">
            <div className="content-section-header !px-0 !pt-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Products</h2>
                <p className="text-xs text-gray-500">Add base product labels or variant labels.</p>
              </div>
            </div>
            <input
              className="input-field"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search product name, SKU, or barcode"
            />
            <div className="barcode-product-results">
              {products.map((sku) => (
                <div key={sku.id} className="barcode-product-row">
                  <div>
                    <strong>{sku.name}</strong>
                    <div className="text-xs text-gray-500">{sku.skuCode} - {sku.barcodes?.[0]?.barcode ?? 'No default barcode'}</div>
                  </div>
                  <div className="barcode-product-actions">
                    <button type="button" className="btn-sm" onClick={() => void addProductRow(sku)}>Add</button>
                    <button type="button" className="btn-sm" onClick={() => void addProductRow(sku, undefined, true)}>New barcode</button>
                    <button type="button" className="btn-sm" onClick={() => void loadVariants(sku.id)}>Variants</button>
                  </div>
                  {variantsBySku[sku.id]?.length > 0 && (
                    <div className="barcode-variant-list">
                      {variantsBySku[sku.id].map((variant) => (
                        <button
                          type="button"
                          key={variant.id}
                          className="btn-sm"
                          onClick={() => void addProductRow(sku, variant)}
                        >
                          {variant.name ?? variant.variantCode}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="content-section p-5">
            <div className="content-section-header !px-0 !pt-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Saved prints</h2>
                <p className="text-xs text-gray-500">Reload prior print entries and their counts.</p>
              </div>
            </div>
            <div className="barcode-job-list">
              {jobs.length === 0 && <UiText>No saved print entries yet.</UiText>}
              {jobs.map((job) => (
                <button type="button" key={job.id} className="barcode-job-button" onClick={() => void loadJob(job.id)}>
                  <span>
                    <strong>{job.grn?.invoiceReference ? `GRN ${job.grn.invoiceReference}` : job.sourceType}</strong>
                    <small>{new Date(job.createdAt).toLocaleString()}</small>
                  </span>
                  <span>{job.printRunCount} runs - {job.printedCount}/{job.totalCopies}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="barcode-main">
          <section className="content-section p-5">
            <div className="content-section-header !px-0 !pt-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Print rows</h2>
                <p className="text-xs text-gray-500">{rows.length} product rows - {totalCopies} labels - {cellsPerPage} labels per sheet</p>
              </div>
              {grnId && <button type="button" className="btn-secondary" onClick={() => void createFromGrn(grnId)} disabled={busy === 'grn'}>Reload GRN</button>}
            </div>
            <div className="barcode-row-table">
              {rows.length === 0 && <div className="barcode-empty">Search and add product barcodes, or open this screen from a GRN.</div>}
              {rows.map((row) => (
                <div key={row.localId} className="barcode-print-row">
                  <div className="min-w-0">
                    <strong>{row.productName}</strong>
                    <div className="text-xs text-gray-500">
                      {row.variantName && <span>{row.variantName} - </span>}
                      <span className="font-mono">{row.barcode}</span>
                    </div>
                  </div>
                  <input
                    className="input-field"
                    type="number"
                    min="1"
                    value={row.copies}
                    onChange={(event) => setRows((current) => current.map((item) => item.localId === row.localId ? { ...item, copies: Math.max(1, Number(event.target.value) || 1) } : item))}
                    aria-label="Copies"
                  />
                  <input
                    className="input-field"
                    value={aliasInputs[row.localId] ?? ''}
                    onChange={(event) => setAliasInputs((current) => ({ ...current, [row.localId]: event.target.value }))}
                    placeholder="Link another barcode"
                  />
                  <button type="button" className="btn-sm" onClick={() => void linkAlias(row)} disabled={!aliasInputs[row.localId]?.trim() || busy === `alias-${row.localId}`}>Link</button>
                  <button type="button" className="btn-sm" onClick={() => setRows((current) => current.filter((item) => item.localId !== row.localId))}>Remove</button>
                </div>
              ))}
            </div>
          </section>

          <section className="content-section p-5">
            <div className="content-section-header !px-0 !pt-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Preview</h2>
                <p className="text-xs text-gray-500">First sheet preview. Printing uses all copies across pages.</p>
              </div>
            </div>
            <div className="barcode-preview-frame">
              <LabelSheet rows={rows} template={template} />
            </div>
            <div className="hidden">
              <div ref={printRef}>
                <LabelSheet rows={rows} template={template} allPages />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
