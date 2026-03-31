import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';
import logger from '../utils/logger';

// Configure multer for file uploads
const storage = multer.diskStorage({
	destination: (_req, _file, cb) => {
		const uploadDir = path.join(process.cwd(), 'uploads', 'products');
		if (!fs.existsSync(uploadDir)) {
			fs.mkdirSync(uploadDir, { recursive: true });
		}
		cb(null, uploadDir);
	},
	filename: (_req, file, cb) => {
		const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
		const ext = path.extname(file.originalname);
		cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
	},
});

const upload = multer({
	storage,
	limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
	fileFilter: (_req, file, cb) => {
		const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
		const videoTypes = ['.mp4', '.webm', '.mov', '.avi'];
		const ext = path.extname(file.originalname).toLowerCase();

		if (imageTypes.includes(ext) || videoTypes.includes(ext)) {
			cb(null, true);
		} else {
			cb(new Error('Only image (jpg, jpeg, png, gif, webp) and video (mp4, webm, mov, avi) files are allowed'));
		}
	},
});

const router = Router();

router.use(authenticate);

// Upload image(s) for a SKU
router.post('/images/:skuId', upload.array('images', 10), async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { skuId } = req.params;
		const files = req.files as Express.Multer.File[];

		if (!files || files.length === 0) {
			res.status(400).json({ success: false, error: 'No files uploaded' });
			return;
		}

		// Check if SKU exists
		const sku = await prisma.sKU.findUnique({ where: { id: skuId } });
		if (!sku) {
			// Clean up uploaded files
			files.forEach(file => fs.unlinkSync(file.path));
			res.status(404).json({ success: false, error: 'SKU not found' });
			return;
		}

		// Get current max sortOrder
		const maxSort = await prisma.productImage.findFirst({
			where: { skuId },
			orderBy: { sortOrder: 'desc' },
			select: { sortOrder: true },
		});

		const startOrder = (maxSort?.sortOrder ?? -1) + 1;

		// Check if SKU already has a primary image
		const hasPrimary = await prisma.productImage.findFirst({
			where: { skuId, isPrimary: true },
		});

		// Create image records
		const images = await Promise.all(
			files.map(async (file, index) => {
				const url = `/uploads/products/${file.filename}`;
				const isPrimary = !hasPrimary && index === 0; // First image becomes primary if none exists

				return prisma.productImage.create({
					data: {
						skuId,
						url,
						altText: file.originalname,
						isPrimary,
						sortOrder: startOrder + index,
					},
				});
			})
		);

		logger.info(`Uploaded ${images.length} images for SKU ${skuId} by user ${req.user?.id}`);
		res.json({ success: true, data: images });
	} catch (error: any) {
		logger.error('Image upload failed:', error);

		// Clean up files on error
		const files = req.files as Express.Multer.File[];
		if (files) {
			files.forEach(file => {
				if (fs.existsSync(file.path)) {
					fs.unlinkSync(file.path);
				}
			});
		}

		if (error.message?.includes('Only image')) {
			res.status(400).json({ success: false, error: error.message });
		} else {
			res.status(500).json({ success: false, error: 'Failed to upload images' });
		}
	}
});

// Set primary image
router.put('/images/:imageId/primary', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { imageId } = req.params;

		const image = await prisma.productImage.findUnique({
			where: { id: imageId },
			select: { skuId: true },
		});

		if (!image) {
			res.status(404).json({ success: false, error: 'Image not found' });
			return;
		}

		// Transaction to unset all primary flags and set new one
		await prisma.$transaction([
			prisma.productImage.updateMany({
				where: { skuId: image.skuId },
				data: { isPrimary: false },
			}),
			prisma.productImage.update({
				where: { id: imageId },
				data: { isPrimary: true },
			}),
		]);

		logger.info(`Set primary image ${imageId} by user ${req.user?.id}`);
		res.json({ success: true });
	} catch (error: any) {
		logger.error('Failed to set primary image:', error);
		res.status(500).json({ success: false, error: 'Failed to set primary image' });
	}
});

// Delete image
router.delete('/images/:imageId', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { imageId } = req.params;

		const image = await prisma.productImage.findUnique({
			where: { id: imageId },
		});

		if (!image) {
			res.status(404).json({ success: false, error: 'Image not found' });
			return;
		}

		// Delete image record
		await prisma.productImage.delete({
			where: { id: imageId },
		});

		// Delete physical file
		const filePath = path.join(process.cwd(), image.url);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}

		// If this was primary, make the first remaining image primary
		if (image.isPrimary) {
			const firstImage = await prisma.productImage.findFirst({
				where: { skuId: image.skuId },
				orderBy: { sortOrder: 'asc' },
			});

			if (firstImage) {
				await prisma.productImage.update({
					where: { id: firstImage.id },
					data: { isPrimary: true },
				});
			}
		}

		logger.info(`Deleted image ${imageId} by user ${req.user?.id}`);
		res.json({ success: true });
	} catch (error: any) {
		logger.error('Failed to delete image:', error);
		res.status(500).json({ success: false, error: 'Failed to delete image' });
	}
});

// Update image order
router.put('/images/reorder', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { imageIds } = req.body; // Array of image IDs in desired order

		if (!Array.isArray(imageIds)) {
			res.status(400).json({ success: false, error: 'imageIds must be an array' });
			return;
		}

		// Update sort order for each image
		await prisma.$transaction(
			imageIds.map((id, index) =>
				prisma.productImage.update({
					where: { id },
					data: { sortOrder: index },
				})
			)
		);

		logger.info(`Reordered ${imageIds.length} images by user ${req.user?.id}`);
		res.json({ success: true });
	} catch (error: any) {
		logger.error('Failed to reorder images:', error);
		res.status(500).json({ success: false, error: 'Failed to reorder images' });
	}
});

// Upload video for a SKU
router.post('/video/:skuId', upload.single('video'), async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { skuId } = req.params;
		const file = req.file;

		if (!file) {
			res.status(400).json({ success: false, error: 'No file uploaded' });
			return;
		}

		// Check if SKU exists
		const sku = await prisma.sKU.findUnique({ where: { id: skuId } });
		if (!sku) {
			// Clean up uploaded file
			fs.unlinkSync(file.path);
			res.status(404).json({ success: false, error: 'SKU not found' });
			return;
		}

		// If SKU already has a video, delete the old one
		if (sku.videoUrl) {
			const oldVideoPath = path.join(process.cwd(), sku.videoUrl);
			if (fs.existsSync(oldVideoPath)) {
				fs.unlinkSync(oldVideoPath);
			}
		}

		// Update SKU with new video URL
		const videoUrl = `/uploads/products/${file.filename}`;
		await prisma.sKU.update({
			where: { id: skuId },
			data: { videoUrl },
		});

		logger.info(`Uploaded video for SKU ${skuId} by user ${req.user?.id}`);
		res.json({ success: true, data: { videoUrl } });
	} catch (error: any) {
		logger.error('Video upload failed:', error);

		// Clean up file on error
		if (req.file && fs.existsSync(req.file.path)) {
			fs.unlinkSync(req.file.path);
		}

		if (error.message?.includes('Only')) {
			res.status(400).json({ success: false, error: error.message });
		} else {
			res.status(500).json({ success: false, error: 'Failed to upload video' });
		}
	}
});

// Delete video
router.delete('/video/:skuId', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { skuId } = req.params;

		const sku = await prisma.sKU.findUnique({
			where: { id: skuId },
			select: { videoUrl: true },
		});

		if (!sku) {
			res.status(404).json({ success: false, error: 'SKU not found' });
			return;
		}

		if (!sku.videoUrl) {
			res.status(404).json({ success: false, error: 'No video found for this SKU' });
			return;
		}

		// Delete physical file
		const filePath = path.join(process.cwd(), sku.videoUrl);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}

		// Remove video URL from SKU
		await prisma.sKU.update({
			where: { id: skuId },
			data: { videoUrl: null },
		});

		logger.info(`Deleted video for SKU ${skuId} by user ${req.user?.id}`);
		res.json({ success: true });
	} catch (error: any) {
		logger.error('Failed to delete video:', error);
		res.status(500).json({ success: false, error: 'Failed to delete video' });
	}
});

export default router;
