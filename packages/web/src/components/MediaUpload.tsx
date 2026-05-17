import { useState, useRef, DragEvent } from 'react';
import axios from 'axios';

interface MediaUploadProps {
	skuId: string;
	variantId?: string | null;
	onUploadComplete: () => void;
	apiBaseUrl: string;
	authToken: string;
	allowVideo?: boolean;
	scopeLabel?: string;
}

interface UploadedImage {
	id: string;
	url: string;
	altText: string | null;
	isPrimary: boolean;
	sortOrder: number;
}

export default function MediaUpload({
	skuId,
	variantId = null,
	onUploadComplete,
	apiBaseUrl,
	authToken,
	allowVideo = true,
	scopeLabel = 'product',
}: MediaUploadProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDragEnter = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.currentTarget === e.target) {
			setIsDragging(false);
		}
	};

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		const files = Array.from(e.dataTransfer.files);
		handleFiles(files);
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const files = Array.from(e.target.files);
			handleFiles(files);
		}
	};

	const handleFiles = async (files: File[]) => {
		const imageFiles = files.filter(f => f.type.startsWith('image/'));
		const videoFiles = allowVideo ? files.filter(f => f.type.startsWith('video/')) : [];
		const blockedVideoFiles = allowVideo ? [] : files.filter(f => f.type.startsWith('video/'));

		if (blockedVideoFiles.length > 0) {
			alert('Video uploads are product-level only. Select Product media to upload a video.');
		}

		if (imageFiles.length === 0 && videoFiles.length === 0) {
			alert(allowVideo ? 'Please select image or video files' : 'Please select image files');
			return;
		}

		setIsUploading(true);

		try {
			// Upload images
			if (imageFiles.length > 0) {
				const formData = new FormData();
				imageFiles.forEach((file) => {
					formData.append('images', file);
					setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
				});
				if (variantId) {
					formData.append('variantId', variantId);
				}

				await axios.post(`${apiBaseUrl}/api/uploads/images/${skuId}`, formData, {
					headers: {
						'Content-Type': 'multipart/form-data',
						Authorization: `Bearer ${authToken}`,
					},
					onUploadProgress: (progressEvent) => {
						if (progressEvent.total) {
							const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
							imageFiles.forEach(file => {
								setUploadProgress(prev => ({ ...prev, [file.name]: percentCompleted }));
							});
						}
					},
				});
			}

			// Upload video (only one)
			if (videoFiles.length > 0) {
				const videoFile = videoFiles[0]; // Only take the first video
				const formData = new FormData();
				formData.append('video', videoFile);
				setUploadProgress(prev => ({ ...prev, [videoFile.name]: 0 }));

				await axios.post(`${apiBaseUrl}/api/uploads/video/${skuId}`, formData, {
					headers: {
						'Content-Type': 'multipart/form-data',
						Authorization: `Bearer ${authToken}`,
					},
					onUploadProgress: (progressEvent) => {
						if (progressEvent.total) {
							const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
							setUploadProgress(prev => ({ ...prev, [videoFile.name]: percentCompleted }));
						}
					},
				});

				if (videoFiles.length > 1) {
					alert('Only one video can be uploaded per product. The first video was uploaded.');
				}
			}

			setUploadProgress({});
			onUploadComplete();
		} catch (error: any) {
			console.error('Upload failed:', error);
			alert(error.response?.data?.error || 'Upload failed');
		} finally {
			setIsUploading(false);
		}
	};

	const openFileDialog = () => {
		fileInputRef.current?.click();
	};

	return (
		<div>
			<div
				className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging
						? 'border-blue-500 bg-blue-50'
						: 'border-gray-300 hover:border-gray-400'
					} ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
				onDragEnter={handleDragEnter}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
				onClick={openFileDialog}
			>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept={allowVideo ? 'image/*,video/*' : 'image/*'}
					onChange={handleFileSelect}
					className="hidden"
				/>

				<div className="flex flex-col items-center gap-2">
					<svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
					</svg>

					{isUploading ? (
						<div>
							<p className="text-lg font-medium text-gray-700">Uploading...</p>
							<div className="mt-4 space-y-2 text-left max-w-md mx-auto">
								{Object.entries(uploadProgress).map(([filename, progress]) => (
									<div key={filename} className="text-sm">
										<div className="flex justify-between text-gray-600 mb-1">
											<span className="truncate max-w-xs">{filename}</span>
											<span>{progress}%</span>
										</div>
										<div className="w-full bg-gray-200 rounded-full h-2">
											<div
												className="bg-blue-600 h-2 rounded-full transition-all"
												style={{ width: `${progress}%` }}
											/>
										</div>
									</div>
								))}
							</div>
						</div>
					) : (
						<>
							<p className="text-lg font-medium text-gray-700">
								Drag & drop files here
							</p>
							<p className="text-sm text-gray-500">
								or click to browse for {scopeLabel} media
							</p>
							<p className="text-xs text-gray-400 mt-2">
								{allowVideo
									? 'Supports: Images (JPG, PNG, GIF, WebP) and Videos (MP4, WebM, MOV, AVI)'
									: 'Supports: Images (JPG, PNG, GIF, WebP)'}
							</p>
							<p className="text-xs text-gray-400">
								Max file size: 50MB
							</p>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
