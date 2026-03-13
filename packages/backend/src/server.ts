import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import vendorRoutes from './routes/vendors';
import skuRoutes from './routes/skus';
import locationRoutes from './routes/locations';
import inventoryRoutes from './routes/inventory';
import grnRoutes from './routes/grns';
import inspectionRoutes from './routes/inspections';
import auditLogRoutes from './routes/auditLogs';
import ocrRoutes from './routes/ocr';
import barcodeRoutes from './routes/barcode';
import reportsRoutes from './routes/reports';
import spaceRoutes from './routes/space';
import syncRoutes from './routes/sync';
import categoryRoutes from './routes/categories';
import settingsRoutes from './routes/settings';
import branchRoutes from './routes/branches';
import stockTransferRoutes from './routes/stockTransfers';

const app = express();

// Trust nginx proxy
app.set('trust proxy', 1);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});
app.use(limiter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/skus', skuRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/grns', grnRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/space', spaceRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app;

