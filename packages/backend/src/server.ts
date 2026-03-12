import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/skus', skuRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/grns', grnRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/audit-logs', auditLogRoutes);

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app;
