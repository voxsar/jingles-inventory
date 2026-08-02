import { useEffect, useState } from 'react';
import voucherApi from '../api/voucherApi';
import { skusApi } from '../api/client';

export default function VouchersPage() {
  const [codes, setCodes] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [skuId, setSkuId] = useState('');
  const [value, setValue] = useState('');
  const [prefix, setPrefix] = useState('GV');
  const [error, setError] = useState('');

  const load = async () => {
    const [codeRes, skuRes] = await Promise.all([voucherApi.listCodes({ pageSize: 100 }), skusApi.list({ pageSize: 100 } as any)]);
    setCodes(codeRes.data?.data ?? []);
    const rows = skuRes.data?.data?.items ?? skuRes.data?.data ?? [];
    setSkus(rows.filter((sku: any) => sku.isVoucher));
  };

  useEffect(() => { void load().catch((e) => setError(e?.message ?? 'Failed to load vouchers')); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      await voucherApi.createCode({ skuId, value: Number(value), prefix });
      setValue(''); await load();
    } catch (e: any) { setError(e?.response?.data?.error ?? e?.message ?? 'Failed to create voucher'); }
  };

  return <div className="page-container">
    <div className="page-header"><div><h1 className="page-title">Gift Vouchers</h1><p className="page-subtitle">Issue, monitor, and manage voucher balances used by POS.</p></div></div>
    {error && <div className="alert-error">{error}</div>}
    <form className="card p-5 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4" onSubmit={create}>
      <select className="form-input" required value={skuId} onChange={(e) => setSkuId(e.target.value)}>
        <option value="">Voucher product</option>{skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode} — {sku.name}</option>)}
      </select>
      <input className="form-input" required min="0.01" step="0.01" type="number" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
      <input className="form-input" placeholder="Code prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
      <button className="btn-primary" type="submit" disabled={!skuId || !value}>Issue voucher</button>
      {skus.length === 0 && <p className="md:col-span-4 text-sm text-amber-700">Create a product marked as a voucher before issuing codes.</p>}
    </form>
    <div className="card overflow-x-auto"><table className="data-table"><thead><tr><th>Code</th><th>Product</th><th>Status</th><th>Original</th><th>Balance</th><th>Expires</th></tr></thead>
      <tbody>{codes.map((row) => <tr key={row.id}><td className="font-mono font-semibold">{row.code}</td><td>{row.sku?.name ?? row.skuId}</td><td>{row.status}</td><td>{row.originalValue?.toFixed?.(2) ?? row.originalValue} {row.currency}</td><td>{row.currentBalance?.toFixed?.(2) ?? row.currentBalance}</td><td>{row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : 'Never'}</td></tr>)}</tbody>
    </table>{codes.length === 0 && <div className="p-8 text-center text-gray-500">No voucher codes issued yet.</div>}</div>
  </div>;
}
