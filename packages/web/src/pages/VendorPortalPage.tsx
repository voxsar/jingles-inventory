import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { vendorsApi, reportsApi } from '../api/client';
import DataTable from '../components/DataTable';

export default function VendorPortalPage() {
  const { user } = useAuthStore();
  const [products, setProducts] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.vendorId) return;
    Promise.all([
      vendorsApi.getProducts(user.vendorId),
      reportsApi.inventoryValuation(),
    ]).then(([prodRes, valRes]) => {
      setProducts(prodRes.data.data);
      setValuation(valRes.data.data);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [user?.vendorId]);

  const productColumns = [
    { key: 'skuCode', header: 'SKU Code', render: (r: any) => <span className="font-mono text-xs">{r.skuCode}</span> },
    { key: 'name', header: 'Name' },
    { key: 'category', header: 'Category', render: (r: any) => r.category ?? '—' },
    { key: 'unitOfMeasure', header: 'UoM' },
    { key: 'inventoryCount', header: 'Records', render: (r: any) => r._count?.inventoryRecords ?? 0 },
  ];

  const valuationColumns = [
    { key: 'skuCode', header: 'SKU Code' },
    { key: 'name', header: 'Name' },
    { key: 'totalQuantity', header: 'Total Qty', sortable: true },
  ];

  if (!user?.vendorId) {
    return (
      <div className="card text-center text-gray-500">
        <p>No vendor profile associated with your account. Contact an administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Vendor Portal</h1>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">My Products</h2>
        <DataTable columns={productColumns} data={products} isLoading={isLoading} emptyMessage="No products found" />
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Inventory Status</h2>
        <DataTable columns={valuationColumns} data={valuation} isLoading={isLoading} emptyMessage="No inventory data" />
      </div>
    </div>
  );
}
