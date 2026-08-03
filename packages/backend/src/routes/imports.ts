import fs from 'fs';
import path from 'path';
import { NextFunction, Router, Response } from 'express';
import multer from 'multer';
import { UserRole } from '@jingles/shared';
import prisma from '../prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPagination, paginatedPayload } from '../utils/pagination';
import logger from '../utils/logger';
import { getSupportedImportMimeType, isSupportedImportFile } from '../modules/imports/fileExtractor';
import { getImportsUploadRoot } from '../utils/runtimePaths';
import {
	approveImportJob,
	isImportEntityType,
	processImportJob,
	refreshImportJobStats,
	rejectImportRecords,
} from '../modules/imports/importService';

const router = Router();

router.use(authenticate);

const uploadDir = getImportsUploadRoot();

const upload = multer({
	storage: multer.diskStorage({
		destination: (_req, _file, cb) => cb(null, uploadDir),
		filename: (_req, file, cb) => {
			const ext = path.extname(file.originalname);
			const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 60) || 'import';
			cb(null, `${Date.now()}-${base}${ext}`);
		},
	}),
	limits: { fileSize: 20 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (isSupportedImportFile(file.originalname, file.mimetype)) {
			cb(null, true);
			return;
		}
		cb(new Error('Unsupported file type. Upload CSV, Excel, JSON, text, PDF, or image files.'));
	},
});

function acceptImportUpload(req: AuthRequest, res: Response, next: NextFunction) {
	upload.single('file')(req, res, (error: unknown) => {
		if (!error) {
			next();
			return;
		}

		if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
			res.status(413).json({ success: false, error: 'The selected file is larger than the 20 MB upload limit.' });
			return;
		}

		const message = error instanceof Error ? error.message : 'The selected file could not be uploaded.';
		res.status(400).json({ success: false, error: message });
	});
}

function canUploadImports(role: string | undefined) {
	return role === UserRole.Admin || role === UserRole.Manager || role === UserRole.Staff;
}

function canApproveImport(role: string | undefined, entityType: string) {
	if (entityType === 'supplier' || entityType === 'product') {
		return role === UserRole.Admin || role === UserRole.Manager;
	}

	return role === UserRole.Admin || role === UserRole.Manager || role === UserRole.Staff;
}

function buildRecordWhere(jobId: string, query: Record<string, any>) {
	const where: Record<string, any> = { jobId };
	const status = typeof query.status === 'string' ? query.status : undefined;
	const search = typeof query.search === 'string' ? query.search.trim() : '';

	if (status === 'Omitted') {
		where.recordStatus = 'Pending';
		where.isSelected = false;
	} else if (status === 'Pending' || status === 'Approved' || status === 'Rejected' || status === 'Failed') {
		where.recordStatus = status;
	}

	if (typeof query.selected === 'string') {
		where.isSelected = query.selected === 'true';
	}

	if (search) {
		where.OR = [
			{ summary: { contains: search, mode: 'insensitive' } },
			{ recordType: { contains: search, mode: 'insensitive' } },
		];
	}

	return where;
}

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const pagination = getPagination(req.query, 20);
		const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
		const status = typeof req.query.status === 'string' ? req.query.status : undefined;

		const where: Record<string, any> = {};
		if (entityType) where.entityType = entityType;
		if (status) where.status = status;

		const [items, total] = await Promise.all([
			prisma.importJob.findMany({
				where,
				skip: pagination.skip,
				take: pagination.take,
				orderBy: { createdAt: 'desc' },
				include: {
					creator: { select: { id: true, email: true, role: true } },
				},
			}),
			prisma.importJob.count({ where }),
		]);

		res.json({ success: true, data: paginatedPayload(items, total, pagination.page, pagination.pageSize) });
	} catch (error) {
		logger.error('List import jobs error', error);
		res.status(500).json({ success: false, error: 'Failed to load import jobs' });
	}
});

router.post('/', acceptImportUpload, async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		if (!canUploadImports(req.user?.role)) {
			if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
			res.status(403).json({ success: false, error: 'You do not have permission to create import jobs.' });
			return;
		}

		if (!req.file) {
			res.status(400).json({ success: false, error: 'No import file was uploaded.' });
			return;
		}

		const entityType = typeof req.body.entityType === 'string' ? req.body.entityType : '';
		if (!isImportEntityType(entityType)) {
			if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
			res.status(400).json({ success: false, error: 'Invalid import entity type.' });
			return;
		}

		const job = await prisma.importJob.create({
			data: {
				entityType,
				status: 'Processing',
				filename: req.file.originalname,
				mimeType: getSupportedImportMimeType(req.file.originalname, req.file.mimetype),
				filePath: req.file.path,
				createdBy: req.user?.id,
			},
		});

		setImmediate(() => {
			processImportJob(job.id).catch((error) => {
				logger.error('Background import job failed', error);
			});
		});

		res.status(202).json({ success: true, data: job });
	} catch (error: any) {
		if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
		logger.error('Create import job error', error);
		res.status(500).json({ success: false, error: error.message ?? 'Failed to create import job' });
	}
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const job = await prisma.importJob.findUnique({
			where: { id: req.params.id },
			include: {
				creator: { select: { id: true, email: true, role: true } },
			},
		});

		if (!job) {
			res.status(404).json({ success: false, error: 'Import job not found.' });
			return;
		}

		const [pendingCount, failedCount] = await Promise.all([
			prisma.importRecord.count({
				where: { jobId: job.id, recordStatus: 'Pending', isSelected: true },
			}),
			prisma.importRecord.count({
				where: { jobId: job.id, recordStatus: 'Failed' },
			}),
		]);

		res.json({
			success: true,
			data: {
				...job,
				pendingCount,
				failedCount,
			},
		});
	} catch (error) {
		logger.error('Get import job error', error);
		res.status(500).json({ success: false, error: 'Failed to load import job' });
	}
});

router.get('/:id/records', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const pagination = getPagination(req.query, 20);
		const where = buildRecordWhere(req.params.id, req.query as Record<string, any>);

		const [items, total] = await Promise.all([
			prisma.importRecord.findMany({
				where,
				skip: pagination.skip,
				take: pagination.take,
				orderBy: { sourceIndex: 'asc' },
			}),
			prisma.importRecord.count({ where }),
		]);

		res.json({ success: true, data: paginatedPayload(items, total, pagination.page, pagination.pageSize) });
	} catch (error) {
		logger.error('List import records error', error);
		res.status(500).json({ success: false, error: 'Failed to load import records' });
	}
});

router.patch('/:id/records/selection', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { selected, recordIds, search, status } = req.body as {
			selected: boolean;
			recordIds?: string[];
			search?: string;
			status?: string;
		};

		if (typeof selected !== 'boolean') {
			res.status(400).json({ success: false, error: 'selected must be a boolean.' });
			return;
		}

		const baseWhere = buildRecordWhere(req.params.id, { search, status });
		const where = {
			...baseWhere,
			...(Array.isArray(recordIds) && recordIds.length > 0 ? { id: { in: recordIds } } : {}),
			recordStatus: 'Pending',
		};

		await prisma.importRecord.updateMany({
			where,
			data: { isSelected: selected },
		});
		await refreshImportJobStats(req.params.id);

		res.json({ success: true });
	} catch (error) {
		logger.error('Update import selection error', error);
		res.status(500).json({ success: false, error: 'Failed to update import selection' });
	}
});

router.post('/:id/approve', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const job = await prisma.importJob.findUnique({ where: { id: req.params.id } });
		if (!job) {
			res.status(404).json({ success: false, error: 'Import job not found.' });
			return;
		}

		if (!canApproveImport(req.user?.role, job.entityType)) {
			res.status(403).json({ success: false, error: 'You do not have permission to approve this import.' });
			return;
		}

		const result = await approveImportJob(job.id, req.user!.id);
		res.json({ success: true, data: result });
	} catch (error: any) {
		logger.error('Approve import job error', error);
		res.status(500).json({ success: false, error: error.message ?? 'Failed to approve import job' });
	}
});

router.post('/:id/reject', async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const job = await prisma.importJob.findUnique({ where: { id: req.params.id } });
		if (!job) {
			res.status(404).json({ success: false, error: 'Import job not found.' });
			return;
		}

		if (!canApproveImport(req.user?.role, job.entityType)) {
			res.status(403).json({ success: false, error: 'You do not have permission to reject this import.' });
			return;
		}

		const count = await rejectImportRecords(
			job.id,
			Array.isArray(req.body?.recordIds) ? req.body.recordIds : undefined,
			Boolean(req.body?.selectedOnly),
		);
		res.json({ success: true, data: { rejectedCount: count } });
	} catch (error: any) {
		logger.error('Reject import job error', error);
		res.status(500).json({ success: false, error: error.message ?? 'Failed to reject import job' });
	}
});

export default router;
