import { useEffect, useState } from 'react';
import { pricingOverlaysApi } from '../api/client';

interface EffectivePricePreviewProps {
  skuId: string;
  variantId?: string | null;
  batchId?: string | null;
  basePrice: number;
  quantity?: number;
  priceType?: 'cost' | 'selling' | 'wholesale' | 'bulk';
  customerGroup?: string;
  customerType?: string;
  branchId?: string;
}

export default function EffectivePricePreview({
  skuId,
  variantId,
  batchId,
  basePrice,
  quantity = 1,
  priceType = 'selling',
  customerGroup,
  customerType,
  branchId,
}: EffectivePricePreviewProps) {
  const [resolvedPrice, setResolvedPrice] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadResolvedPrice();
  }, [skuId, variantId, batchId, basePrice, quantity, priceType, customerGroup, customerType, branchId]);

  const loadResolvedPrice = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await pricingOverlaysApi.resolvePrice({
        skuId,
        variantId,
        batchId,
        quantity,
        priceType,
        customerGroup,
        customerType,
        branchId,
      });
      const data = res.data?.data ?? res.data;
      setResolvedPrice(data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to resolve price');
      setResolvedPrice(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border border-gray-200 rounded p-3 bg-gray-50">
        <div className="text-sm text-gray-600">Loading price preview...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 rounded p-3 bg-red-50">
        <div className="text-sm text-red-600">{error}</div>
      </div>
    );
  }

  if (!resolvedPrice) {
    return null;
  }

  const hasOverlays = resolvedPrice.appliedOverlays && resolvedPrice.appliedOverlays.length > 0;
  const priceChanged = Math.abs(resolvedPrice.finalPrice - resolvedPrice.basePrice) > 0.01;

  return (
    <div className="border border-gray-200 rounded p-3 bg-white">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Effective Price</div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-gray-900">
              {resolvedPrice.currency} {resolvedPrice.finalPrice.toFixed(2)}
            </span>
            {priceChanged && (
              <span className="text-sm text-gray-500 line-through">
                {resolvedPrice.currency} {resolvedPrice.basePrice.toFixed(2)}
              </span>
            )}
          </div>

          {hasOverlays && (
            <div className="mt-2">
              <button
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <span>{resolvedPrice.appliedOverlays.length} overlay{resolvedPrice.appliedOverlays.length !== 1 ? 's' : ''} applied</span>
                <span>{isExpanded ? '▼' : '▶'}</span>
              </button>
            </div>
          )}
        </div>

        {priceChanged && (
          <div className="text-right">
            <div className="text-xs text-gray-500">Adjustment</div>
            <div className={`text-lg font-semibold ${resolvedPrice.finalPrice < resolvedPrice.basePrice ? 'text-green-600' : 'text-red-600'}`}>
              {resolvedPrice.finalPrice < resolvedPrice.basePrice ? '−' : '+'}
              {Math.abs(resolvedPrice.finalPrice - resolvedPrice.basePrice).toFixed(2)}
            </div>
            <div className="text-xs text-gray-500">
              ({((Math.abs(resolvedPrice.finalPrice - resolvedPrice.basePrice) / resolvedPrice.basePrice) * 100).toFixed(1)}%)
            </div>
          </div>
        )}
      </div>

      {/* Overlay Details */}
      {isExpanded && hasOverlays && (
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
          <div className="text-xs font-medium text-gray-700 mb-2">Applied Overlays:</div>
          {resolvedPrice.appliedOverlays.map((overlay: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
              <div>
                <div className="font-medium text-gray-900">{overlay.overlayName}</div>
                <div className="text-xs text-gray-500">
                  {overlay.type.replace('_', ' ')} • Value: {overlay.value}
                </div>
              </div>
              <div className={`font-mono text-sm ${overlay.adjustment < 0 ? 'text-green-600' : 'text-red-600'}`}>
                {overlay.adjustment < 0 ? '−' : '+'}
                {Math.abs(overlay.adjustment).toFixed(2)}
              </div>
            </div>
          ))}

          {resolvedPrice.warnings && resolvedPrice.warnings.length > 0 && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
              <div className="text-xs font-medium text-yellow-800 mb-1">Warnings:</div>
              {resolvedPrice.warnings.map((warning: string, idx: number) => (
                <div key={idx} className="text-xs text-yellow-700">{warning}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {!hasOverlays && (
        <div className="mt-2 text-xs text-gray-500">
          No active overlays apply to this product
        </div>
      )}
    </div>
  );
}
