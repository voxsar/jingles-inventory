import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { grnsApi, vendorsApi, skusApi } from '../api/client';
import { GRNStatus } from '@jingles/shared';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';

const STATUS_TONES: Record<string, string> = {
  [GRNStatus.Draft]: '',
  [GRNStatus.Submitted]: 'info',
  [GRNStatus.PartiallyInspected]: 'warning',
  [GRNStatus.FullyInspected]: 'success',
  [GRNStatus.Closed]: '',
};

const PAGE_SIZE = 20;

export default function GRNPage() {
  const [grns, setGrns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [editingGrn, setEditingGrn] = useState<any>(null);
  const [editForm, setEditForm] = useState({ supplierId: '', invoiceReference: '', expectedDeliveryDate: '', notes: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const getTodayString = () => new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    supplierId: '',
    invoiceReference: '',
    expectedDeliveryDate: getTodayString(),
    notes: '',
    lines: [{ skuId: '', expectedQuantity: 1, batchReference: '' }],
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      const [grnRes, vendorRes] = await Promise.all([
        grnsApi.list(params),
        vendorsApi.list(),
      ]);
      const grnData = grnRes.data?.data?.items ?? grnRes.data?.data ?? grnRes.data ?? [];
      setGrns(Array.isArray(grnData) ? grnData : []);
      setTotal(grnRes.data?.data?.total ?? 0);
      setTotalPages(grnRes.data?.data?.totalPages ?? 1);
      setVendors(vendorRes.data?.data?.items ?? vendorRes.data?.data ?? vendorRes.data ?? []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadData(); }, [page, pageSize, debouncedSearch, statusFilter, supplierFilter]);

  useEffect(() => {
    if (!showForm) return;
    const params: Record<string, string> = { pageSize: '50' };
    if (skuSearch) params.search = skuSearch;
    skusApi.list(params).then((res) => {
      setSkus(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    }).catch(() => {});
  }, [showForm, skuSearch]);

  const handleSkuSearchChange = (value: string) => {
    setSkuSearch(value);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 300);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await grnsApi.create(form);
      setShowForm(false);
      setForm({ supplierId: '', invoiceReference: '', expectedDeliveryDate: getTodayString(), notes: '', lines: [{ skuId: '', expectedQuantity: 1, batchReference: '' }] });
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to create GRN');
    }
  };

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { skuId: '', expectedQuantity: 1, batchReference: '' }] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: string, value: any) => setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));

  const openEdit = (grn: any) => {
    setEditingGrn(grn);
    setEditForm({
      supplierId: grn.supplierId ?? '',
      invoiceReference: grn.invoiceReference ?? '',
      expectedDeliveryDate: grn.expectedDeliveryDate ? grn.expectedDeliveryDate.split('T')[0] : getTodayString(),
      notes: grn.notes ?? '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingGrn) return;
    setIsSavingEdit(true);
    try {
      await grnsApi.update(editingGrn.id, editForm);
      setEditingGrn(null);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update GRN');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const columns = [
    { key: 'id', header: 'GRN ID', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.id.slice(0, 8)}…</span> },
    { key: 'supplier', header: 'Supplier', sortable: true, render: (r: any) => r.supplier?.name },
    { key: 'invoiceReference', header: 'Invoice Ref', render: (r: any) => r.invoiceReference ?? <s-text>—</s-text> },
    {
      key: 'status', header: 'Status', render: (r: any) => {
        const tone = STATUS_TONES[r.status] ?? '';
        return tone ? <s-badge tone={tone as any}>{r.status}</s-badge> : <s-badge>{r.status}</s-badge>;
      }
    },
    { key: 'linesCount', header: 'Lines', align: 'right' as const, render: (r: any) => <span style={{ fontWeight: 600 }}>{r.lines?.length ?? 0}</span> },
    { key: 'createdAt', header: 'Created', sortable: true, render: (r: any) => <s-text>{new Date(r.createdAt).toLocaleDateString()}</s-text> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
          {r.status === GRNStatus.Draft && (
            <s-button  onClick={() => openEdit(r)}>Edit</s-button>
          )}
          <s-button  onClick={() => navigate(`/grns/${r.id}`)}>View</s-button>
        </div>
      ),
    },
  ];

  const hasFilters = searchTerm || statusFilter || supplierFilter;

  return (
    <>
      <s-stack direction="inline" gap="base">
        <div>
          <s-heading>📋 Goods Receipt Notes</s-heading>
          <s-text>{total.toLocaleString()} GRNs total</s-text>
        </div>
        <s-button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New GRN'}
        </s-button>
      </s-stack>

      {showForm && (
        <s-section heading="➕ Create GRN">
          <form onSubmit={handleCreate}>
            <s-stack gap="base">
              <s-stack direction="inline" gap="base">
                <s-select label="Supplier *" value={form.supplierId} onChange={(e: any) => setForm((f) => ({ ...f, supplierId: e.currentTarget.value }))}>
                  <s-option value="">Select supplier</s-option>
                  {vendors.map((v: any) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
                </s-select>
                <s-text-field label="Invoice Reference" value={form.invoiceReference} placeholder="e.g. INV-2024-001" onChange={(e: any) => setForm((f) => ({ ...f, invoiceReference: e.currentTarget.value }))} />
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-text-field label="Expected Delivery" type="date" value={form.expectedDeliveryDate} onChange={(e: any) => setForm((f) => ({ ...f, expectedDeliveryDate: e.currentTarget.value }))} />
                <s-text-field label="Notes" value={form.notes} placeholder="Optional notes..." onChange={(e: any) => setForm((f) => ({ ...f, notes: e.currentTarget.value }))} />
              </s-stack>
              <div>
                <s-stack direction="inline" gap="base">
                  <s-text>Line Items</s-text>
                  <s-button  type="button" onClick={addLine}>+ Add Line</s-button>
                </s-stack>
                <s-search-field label="Filter products" label-visibility="hidden" value={skuSearch} placeholder="Filter products by name or code..." onChange={(e: any) => handleSkuSearchChange(e.currentTarget.value)} />
                <s-stack gap="base">
                  {form.lines.map((line, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', background: '#f6f6f7', borderRadius: '6px' }}>
                      <s-select label="Product" label-visibility="hidden" value={line.skuId} onChange={(e: any) => updateLine(i, 'skuId', e.currentTarget.value)}>
                        <s-option value="">Select product</s-option>
                        {skus.map((s: any) => <s-option key={s.id} value={s.id}>{s.skuCode} – {s.name}</s-option>)}
                      </s-select>
                      <s-text-field label="Qty" label-visibility="hidden" type="number" value={String(line.expectedQuantity)} placeholder="Qty" onChange={(e: any) => updateLine(i, 'expectedQuantity', parseInt(e.currentTarget.value))} />
                      <s-text-field label="Batch ref" label-visibility="hidden" value={line.batchReference} placeholder="Batch ref" onChange={(e: any) => updateLine(i, 'batchReference', e.currentTarget.value)} />
                      {form.lines.length > 1 && <s-button  type="button" onClick={() => removeLine(i)}>✕</s-button>}
                    </div>
                  ))}
                </s-stack>
              </div>
              <s-stack direction="inline" gap="base">
                <s-button variant="primary" type="submit">Create GRN</s-button>
                <s-button type="button" onClick={() => setShowForm(false)}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </form>
        </s-section>
      )}

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-search-field label="Search" label-visibility="hidden" value={searchTerm} placeholder="Search invoice ref, supplier..." onChange={(e: any) => handleSearchChange(e.currentTarget.value)} />
          <s-select label="Status" label-visibility="hidden" value={statusFilter} onChange={(e: any) => { setStatusFilter(e.currentTarget.value); setPage(1); }}>
            <s-option value="">All Statuses</s-option>
            {Object.values(GRNStatus).map((s) => <s-option key={s} value={s}>{s}</s-option>)}
          </s-select>
          <s-select label="Supplier" label-visibility="hidden" value={supplierFilter} onChange={(e: any) => { setSupplierFilter(e.currentTarget.value); setPage(1); }}>
            <s-option value="">All Suppliers</s-option>
            {vendors.map((v: any) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
          </s-select>
          {hasFilters && <s-button  onClick={() => { setSearchTerm(''); setDebouncedSearch(''); setStatusFilter(''); setSupplierFilter(''); setPage(1); }}>Clear filters</s-button>}
        </s-stack>

        <DataTable
          columns={columns}
          data={grns}
          isLoading={isLoading}
          emptyMessage="No GRNs found"
          emptyIcon="📋"
          onRowClick={(row) => navigate(`/grns/${row.id}`)}
        />

        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </s-section>

      {editingGrn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={(e) => e.target === e.currentTarget && setEditingGrn(null)}>
          <div style={{ background: 'white', borderRadius: '8px', width: '100%', maxWidth: '512px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e1e3e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <s-heading>Edit GRN</s-heading>
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6d7175' }}>{editingGrn.id.slice(0, 8)}…</span>
              </div>
              <button onClick={() => setEditingGrn(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6d7175' }}>✕</button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <s-stack gap="base">
                <s-select label="Supplier" value={editForm.supplierId} onChange={(e: any) => setEditForm((f) => ({ ...f, supplierId: e.currentTarget.value }))}>
                  <s-option value="">Select supplier</s-option>
                  {vendors.map((v: any) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
                </s-select>
                <s-text-field label="Invoice Reference" value={editForm.invoiceReference} onChange={(e: any) => setEditForm((f) => ({ ...f, invoiceReference: e.currentTarget.value }))} />
                <s-text-field label="Expected Delivery Date" type="date" value={editForm.expectedDeliveryDate} onChange={(e: any) => setEditForm((f) => ({ ...f, expectedDeliveryDate: e.currentTarget.value }))} />
                <s-text-field label="Notes" value={editForm.notes} onChange={(e: any) => setEditForm((f) => ({ ...f, notes: e.currentTarget.value }))} />
              </s-stack>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e1e3e5', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <s-button onClick={() => setEditingGrn(null)}>Cancel</s-button>
              <s-button variant="primary" onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit ? '⏳ Saving…' : '💾 Save'}
              </s-button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


