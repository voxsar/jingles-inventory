import { useState, useEffect } from 'react';
import axios from 'axios';

interface ProductImage {
	id: string;
	url: string;
	altText: string | null;
	isPrimary: boolean;
	sortOrder: number;
}

interface ImageGalleryManagerProps {
	skuId: string;
	images: ProductImage[];
	videoUrl: string | null;
	apiBaseUrl: string;
	authToken: string;
	onUpdate: () => void;
}

export default function ImageGalleryManager({
	skuId,
	images: initialImages,
	videoUrl: initialVideoUrl,
	apiBaseUrl,
	authToken,
	onUpdate,
}: ImageGalleryManagerProps) {
	const [images, setImages] = useState<ProductImage[]>(initialImages);
	const [videoUrl, setVideoUrl] = useState<string | null>(initialVideoUrl);
	const [isDeleting, setIsDeleting] = useState<string | null>(null);

	const resolveMediaUrl = (rawUrl: string) => {
		if (!rawUrl) return rawUrl;
		if (rawUrl.startsWith('/uploads/')) return `${window.location.origin}${rawUrl}`;
		if (/^https?:\/\//i.test(rawUrl)) {
			try {
				const parsed = new URL(rawUrl);
				if (parsed.pathname.startsWith('/uploads/')) {
					return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
				}
			} catch {
				return rawUrl;
			}
		}
		return `${apiBaseUrl}${rawUrl}`;
	};

	useEffect(() => {
		setImages(initialImages.sort((a, b) => a.sortOrder - b.sortOrder));
	}, [initialImages]);

	useEffect(() => {
		setVideoUrl(initialVideoUrl);
	}, [initialVideoUrl]);

	const setPrimary = async (imageId: string) => {
		try {
			await axios.put(
				`${apiBaseUrl}/api/uploads/images/${imageId}/primary`,
				{},
				{
					headers: { Authorization: `Bearer ${authToken}` },
				}
			);
			onUpdate();
		} catch (error: any) {
			console.error('Failed to set primary image:', error);
			alert(error.response?.data?.error || 'Failed to set primary image');
		}
	};

	const deleteImage = async (imageId: string) => {
		if (!confirm('Are you sure you want to delete this image?')) return;

		setIsDeleting(imageId);
		try {
			await axios.delete(`${apiBaseUrl}/api/uploads/images/${imageId}`, {
				headers: { Authorization: `Bearer ${authToken}` },
			});
			onUpdate();
		} catch (error: any) {
			console.error('Failed to delete image:', error);
			alert(error.response?.data?.error || 'Failed to delete image');
		} finally {
			setIsDeleting(null);
		}
	};

	const deleteVideo = async () => {
		if (!confirm('Are you sure you want to delete this video?')) return;

		try {
			await axios.delete(`${apiBaseUrl}/api/uploads/video/${skuId}`, {
				headers: { Authorization: `Bearer ${authToken}` },
			});
			onUpdate();
		} catch (error: any) {
			console.error('Failed to delete video:', error);
			alert(error.response?.data?.error || 'Failed to delete video');
		}
	};

	const moveImage = (index: number, direction: 'up' | 'down') => {
		const newImages = [...images];
		const targetIndex = direction === 'up' ? index - 1 : index + 1;

		if (targetIndex < 0 || targetIndex >= newImages.length) return;

		[newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]];

		// Update sort order
		const reorderedImages = newImages.map((img, idx) => ({ ...img, sortOrder: idx }));
		setImages(reorderedImages);

		// Save order to backend
		saveImageOrder(reorderedImages.map(img => img.id));
	};

	const saveImageOrder = async (imageIds: string[]) => {
		try {
			await axios.put(
				`${apiBaseUrl}/api/uploads/images/reorder`,
				{ imageIds },
				{
					headers: { Authorization: `Bearer ${authToken}` },
				}
			);
		} catch (error: any) {
			console.error('Failed to reorder images:', error);
			alert(error.response?.data?.error || 'Failed to reorder images');
			onUpdate(); // Reload to get correct order
		}
	};

	if (images.length === 0 && !videoUrl) {
		return (
			<div className="text-center py-8 text-gray-500">
				<p>No images or video uploaded yet</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Images Grid */}
			{images.length > 0 && (
				<div>
					<h4 className="font-medium text-gray-700 mb-3">Product Images</h4>
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
						{images.map((image, index) => (
							<div
								key={image.id}
								className="relative group border rounded-lg overflow-hidden bg-gray-50"
							>
								<img
									src={resolveMediaUrl(image.url)}
									alt={image.altText || 'Product image'}
									className="w-full h-48 object-cover"
								/>

								{/* Primary badge */}
								{image.isPrimary && (
									<div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded">
										Primary
									</div>
								)}

								{/* Controls overlay */}
								<div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center gap-2">
									<div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
										{!image.isPrimary && (
											<button
												onClick={() => setPrimary(image.id)}
												className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700"
												title="Set as primary"
											>
												Set Primary
											</button>
										)}
										<button
											onClick={() => deleteImage(image.id)}
											disabled={isDeleting === image.id}
											className="bg-red-600 text-white text-xs px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50"
											title="Delete"
										>
											{isDeleting === image.id ? 'Deleting...' : 'Delete'}
										</button>
									</div>
								</div>

								{/* Reorder buttons */}
								<div className="absolute bottom-2 right-2 flex gap-1">
									{index > 0 && (
										<button
											onClick={() => moveImage(index, 'up')}
											className="bg-white text-gray-700 p-1 rounded shadow hover:bg-gray-100"
											title="Move left"
										>
											<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
											</svg>
										</button>
									)}
									{index < images.length - 1 && (
										<button
											onClick={() => moveImage(index, 'down')}
											className="bg-white text-gray-700 p-1 rounded shadow hover:bg-gray-100"
											title="Move right"
										>
											<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
											</svg>
										</button>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Video Section */}
			{videoUrl && (
				<div>
					<h4 className="font-medium text-gray-700 mb-3">Product Video</h4>
					<div className="relative inline-block">
						<video
							src={resolveMediaUrl(videoUrl)}
							controls
							className="w-full max-w-md rounded-lg border"
						/>
						<button
							onClick={deleteVideo}
							className="absolute top-2 right-2 bg-red-600 text-white text-xs px-3 py-1 rounded hover:bg-red-700"
						>
							Delete Video
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
