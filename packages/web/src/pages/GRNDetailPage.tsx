import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { grnsApi } from '../api/client';
import { GRNStatus, DamageClassification } from '@jingles/shared';

export default function GRNDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [grn, setGrn] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [inspectingLineId, setInspectingLineId] = useState<string | null>(null);
	const [inspectionForm, setInspectionForm] = useState({
		approvedQuantity: 0,
		rejectedQuantity: 0,
		damageClassification: '',
		remarks: '',
	});

	const loadGRN = async () => {
		if (!id) return;
		try {
			const res = await grnsApi.get(id);
			// Handle both direct object response and nested { data: {...} } structure
			const grnData = res.data?.data ?? res.data;
			setGrn(grnData);
		} catch (err) {
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => { loadGRN(); }, [id]);

	const handleSubmit = async () => {
		if (!id || !confirm('Submit this GRN? This will create Uninspected inventory records.')) return;
		try {
			await grnsApi.submit(id);
			await loadGRN();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Submit failed');
		}
	};

	const handleInspect = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!id || !inspectingLineId) return;
		try {
			await grnsApi.inspect(id, { grnLineId: inspectingLineId, ...inspectionForm });
			setInspectingLineId(null);
			setInspectionForm({ approvedQuantity: 0, rejectedQuantity: 0, damageClassification: '', remarks: '' });
			await loadGRN();
		} catch (err: any) {
			alert(err.response?.data?.error ?? 'Inspection failed');
		}
	};

	if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
	if (!grn) return <div className="card text-center text-gray-500">GRN not found</div>;

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<button onClick={() => navigate('/grns')} className="text-gray-500 hover:text-gray-700">← Back</button>
				<h1 className="text-2xl font-bold text-gray-900">GRN Detail</h1>
				<span className={`px-2 py-1 text-sm font-medium rounded-full ${grn.status === GRNStatus.Closed ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>
					{grn.status}
				</span>
			</div>

			<div className="card">
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div><span className="text-gray-500">Supplier:</span> <strong>{grn.supplier?.name}</strong></div>
					<div><span className="text-gray-500">Invoice Ref:</span> <strong>{grn.invoiceReference ?? '—'}</strong></div>
					<div><span className="text-gray-500">Created By:</span> <strong>{grn.creator?.email}</strong></div>
					<div><span className="text-gray-500">Created At:</span> <strong>{new Date(grn.createdAt).toLocaleString()}</strong></div>
					{grn.deliveryDate && <div><span className="text-gray-500">Delivery Date:</span> <strong>{new Date(grn.deliveryDate).toLocaleDateString()}</strong></div>}
					{grn.notes && <div className="col-span-2"><span className="text-gray-500">Notes:</span> <strong>{grn.notes}</strong></div>}
				</div>

				{grn.status === GRNStatus.Draft && (
					<button onClick={handleSubmit} className="btn-primary mt-4">Submit GRN</button>
				)}
			</div>

			<div className="card">
				<h2 className="text-lg font-semibold mb-4">GRN Lines</h2>
				<div className="space-y-4">
					{grn.lines?.map((line: any) => (
						<div key={line.id} className="border border-gray-200 rounded-lg p-4">
							<div className="flex items-center justify-between">
								<div>
									<span className="font-medium">{line.sku?.name}</span>
									<span className="text-xs text-gray-500 ml-2">{line.sku?.skuCode}</span>
								</div>
								<div className="flex items-center gap-4 text-sm">
									<span>Expected: <strong>{line.expectedQuantity}</strong></span>
									<span>Received: <strong>{line.receivedQuantity}</strong></span>
									{line.batchReference && <span className="text-gray-500">Batch: {line.batchReference}</span>}
									{grn.status !== GRNStatus.Draft && line.inspectionRecords?.length === 0 && (
										<button
											onClick={() => { setInspectingLineId(line.id); setInspectionForm({ ...inspectionForm, approvedQuantity: line.receivedQuantity }); }}
											className="text-primary-600 text-xs hover:underline"
										>
											Inspect
										</button>
									)}
								</div>
							</div>

							{line.inspectionRecords?.length > 0 && (
								<div className="mt-3 pt-3 border-t border-gray-100">
									<p className="text-xs text-gray-500 mb-2">Inspection Records:</p>
									{line.inspectionRecords.map((ir: any) => (
										<div key={ir.id} className="flex gap-4 text-sm">
											<span className="text-green-600">✓ Approved: {ir.approvedQuantity}</span>
											<span className="text-red-600">✗ Rejected: {ir.rejectedQuantity}</span>
											{ir.damageClassification && <span className="text-orange-600">Damage: {ir.damageClassification}</span>}
											<span className="text-gray-500">by {ir.inspector?.email}</span>
										</div>
									))}
								</div>
							)}

							{inspectingLineId === line.id && (
								<form onSubmit={handleInspect} className="mt-3 pt-3 border-t border-gray-100 space-y-3">
									<div className="grid grid-cols-2 gap-3">
										<div>
											<label className="block text-xs font-medium text-gray-700 mb-1">Approved Qty</label>
											<input type="number" min="0" value={inspectionForm.approvedQuantity} onChange={e => setInspectionForm(f => ({ ...f, approvedQuantity: parseInt(e.target.value) }))} className="input-field" required />
										</div>
										<div>
											<label className="block text-xs font-medium text-gray-700 mb-1">Rejected Qty</label>
											<input type="number" min="0" value={inspectionForm.rejectedQuantity} onChange={e => setInspectionForm(f => ({ ...f, rejectedQuantity: parseInt(e.target.value) }))} className="input-field" />
										</div>
										<div>
											<label className="block text-xs font-medium text-gray-700 mb-1">Damage Classification</label>
											<select value={inspectionForm.damageClassification} onChange={e => setInspectionForm(f => ({ ...f, damageClassification: e.target.value }))} className="input-field">
												<option value="">None</option>
												{Object.values(DamageClassification).map(d => <option key={d} value={d}>{d}</option>)}
											</select>
										</div>
										<div>
											<label className="block text-xs font-medium text-gray-700 mb-1">Remarks</label>
											<input type="text" value={inspectionForm.remarks} onChange={e => setInspectionForm(f => ({ ...f, remarks: e.target.value }))} className="input-field" />
										</div>
									</div>
									<div className="flex gap-2">
										<button type="submit" className="btn-primary text-sm">Save Inspection</button>
										<button type="button" onClick={() => setInspectingLineId(null)} className="btn-secondary text-sm">Cancel</button>
									</div>
								</form>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
