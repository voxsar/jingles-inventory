import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { vendorsApi, reportsApi } from '../api/client';
import PaginatedDataTable from '../components/PaginatedDataTable';
import { UiText } from '../components/UiPrimitives';
import { formatQuantity } from '../utils/quantity';

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
			const prodData = prodRes.data?.data ?? prodRes.data ?? [];
			const valData = valRes.data?.data ?? valRes.data ?? [];
			setProducts(Array.isArray(prodData) ? prodData : []);
			setValuation(Array.isArray(valData) ? valData : []);
			setIsLoading(false);
		}).catch(() => setIsLoading(false));
	}, [user?.vendorId]);

	const productColumns = [
		{ key: 'skuCode', header: 'SKU Code', render: (r: any) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.skuCode}</span> },
		{ key: 'name', header: 'Name' },
		{ key: 'category', header: 'Category', render: (r: any) => r.category ?? '—' },
		{ key: 'unitOfMeasure', header: 'UoM' },
		{ key: 'inventoryCount', header: 'Records', render: (r: any) => r._count?.inventoryRecords ?? 0 },
	];

	const valuationColumns = [
		{ key: 'skuCode', header: 'SKU Code' },
		{ key: 'name', header: 'Name' },
		{ key: 'totalQuantity', header: 'Total Qty', sortable: true, render: (r: any) => formatQuantity(r.totalQuantity) },
	];

	if (!user?.vendorId) {
		return (
			<section className="card">
				<UiText>No vendor profile associated with your account. Contact an administrator.</UiText>
			</section>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="page-header">
				<div className="page-header-left">
					<h1 className="page-title">Vendor Portal</h1>
					<p className="page-subtitle">Monitor assigned products and current inventory status.</p>
				</div>
			</div>

			<section className="content-section">
				<div className="content-section-header">
					<h2 className="section-title">My Products</h2>
				</div>
				<PaginatedDataTable columns={productColumns} data={products} isLoading={isLoading} emptyMessage="No products found" />
			</section>

			<section className="content-section">
				<div className="content-section-header">
					<h2 className="section-title">Inventory Status</h2>
				</div>
				<PaginatedDataTable columns={valuationColumns} data={valuation} isLoading={isLoading} emptyMessage="No inventory data" />
			</section>
		</div>
	);
}
