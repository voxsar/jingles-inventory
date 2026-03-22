import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { processInvoiceFile } from '../modules/ocr/ocrProcessor';
import logger from '../utils/logger';

const upload = multer({
  dest: '/tmp/ocr-uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only image, PDF, and text files are allowed'));
  },
});

const router = Router();

router.use(authenticate);

router.post('/invoice', upload.single('invoice'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const result = await processInvoiceFile(req.file.path);

    fs.unlink(req.file.path, () => {});

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (req.file) fs.unlink(req.file.path, () => {});
    if (error.message?.startsWith('Unsupported file type')) {
      res.status(422).json({ success: false, error: error.message });
      return;
    }
    logger.error('OCR error', error);
    res.status(500).json({ success: false, error: error.message ?? 'OCR processing failed' });
  }
});

export default router;
