import { useEffect, useMemo, useState } from 'react';
import { customersApi } from '../api/client';
import PaginatedDataTable from '../components/PaginatedDataTable';
import { UiBadge, UiBanner } from '../components/UiPrimitives';

type CustomerSummary = {
  id: string;
  code: string | null;
  name: string;
  tier: string;
  email: string | null;
  phone: string | null;
  creditLimit: number;
  creditBalance: number;
  availableCredit: number;
};

type CustomerDetail = {
  customer: CustomerSummary & { notes?: string | null };
  sales: Array<{
    id: string;
    receiptNumber: string;
    status: string;
    total: number;
    createdAt: string;
  }>;
  creditPayments: Array<{
    id: string;
    amount: number;
    method: string;
    note?: string | null;
    terminalId?: string | null;
    createdAt: string;
  }>;
};

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });
const formatMoney = (value: number) => money.format(Number(value) || 0);
const formatDate = (value: string) => new Date(value).toLocaleString();

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    customersApi.list()
      .then((response) => {
        if (!active) return;
        const items = response.data as CustomerSummary[];
        setCustomers(items);
        setSelectedId((current) => current ?? items[0]?.id ?? null);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error ?? 'Failed to load customers');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setError('');
    customersApi.get(selectedId)
      .then((response) => {
        if (active) setDetail(response.data as CustomerDetail);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error ?? 'Failed to load customer account');
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => { active = false; };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) => [customer.name, customer.code, customer.email, customer.phone]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [customers, search]);

  const columns = [
    { key: 'name', header: 'Customer', sortable: true, render: (row: CustomerSummary) => (
      <div><div className="font-medium text-gray-900">{row.name}</div><div className="text-xs text-gray-500">{row.code ?? row.id}</div></div>
    ) },
    { key: 'tier', header: 'Tier', render: (row: CustomerSummary) => <UiBadge tone="info">{row.tier}</UiBadge> },
    { key: 'creditLimit', header: 'Limit', align: 'right' as const, render: (row: CustomerSummary) => formatMoney(row.creditLimit) },
    { key: 'creditBalance', header: 'Balance', align: 'right' as const, render: (row: CustomerSummary) => formatMoney(row.creditBalance) },
    { key: 'availableCredit', header: 'Available', align: 'right' as const, render: (row: CustomerSummary) => formatMoney(row.availableCredit) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Read-only customer credit accounts mirrored from Jingles POS</p>
        </div>
        <UiBadge tone="info">Read only</UiBadge>
      </div>

      {error && <UiBanner tone="critical">{error}</UiBanner>}

      <div className="content-section">
        <div className="filter-bar">
          <input
            type="search"
            className="filter-input-wide"
            placeholder="Search by name, code, email, or phone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <PaginatedDataTable
          columns={columns}
          data={filtered}
          isLoading={loading}
          emptyMessage="No customer accounts have synced from POS yet"
          onRowClick={(customer) => setSelectedId(customer.id)}
        />
      </div>

      {(detailLoading || detail) && (
        <div className="content-section p-5">
          {detailLoading && <p className="text-sm text-gray-500">Loading customer account...</p>}
          {!detailLoading && detail && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{detail.customer.name}</h2>
                  <p className="text-sm text-gray-500">
                    {[detail.customer.code, detail.customer.tier, detail.customer.phone, detail.customer.email].filter(Boolean).join(' · ')}
                  </p>
                  {detail.customer.notes && <p className="mt-2 text-sm text-gray-600">{detail.customer.notes}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                  ['Credit limit', detail.customer.creditLimit],
                  ['Balance owed', detail.customer.creditBalance],
                  ['Available credit', detail.customer.availableCredit],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
                    <div className="mt-1 text-xl font-semibold text-gray-900">{formatMoney(Number(value))}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <section>
                  <h3 className="mb-2 font-semibold text-gray-900">Payment ledger</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Note</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {detail.creditPayments.map((payment) => <tr key={payment.id}><td className="px-3 py-2 whitespace-nowrap">{formatDate(payment.createdAt)}</td><td className="px-3 py-2">{payment.method}</td><td className="px-3 py-2">{payment.note ?? '—'}</td><td className="px-3 py-2 text-right font-medium">{formatMoney(payment.amount)}</td></tr>)}
                        {detail.creditPayments.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No payments recorded</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 font-semibold text-gray-900">Order history</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Receipt</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {detail.sales.map((sale) => <tr key={sale.id}><td className="px-3 py-2 whitespace-nowrap">{formatDate(sale.createdAt)}</td><td className="px-3 py-2">{sale.receiptNumber}</td><td className="px-3 py-2"><UiBadge tone={sale.status === 'COMPLETED' ? 'success' : undefined}>{sale.status}</UiBadge></td><td className="px-3 py-2 text-right font-medium">{formatMoney(sale.total)}</td></tr>)}
                        {detail.sales.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No orders recorded</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
