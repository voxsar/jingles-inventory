import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import type { Server } from 'http';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import vendorRoutes from './routes/vendors';
import skuRoutes from './routes/skus';
import floorRoutes from './routes/floors';
import shelfRoutes from './routes/shelves';
import rackRoutes from './routes/racks';
import boxRoutes from './routes/boxes';
import inventoryRoutes from './routes/inventory';
import grnRoutes from './routes/grns';
import prnRoutes from './routes/prns';
import auditLogRoutes from './routes/auditLogs';
import ocrRoutes from './routes/ocr';
import barcodeRoutes from './routes/barcode';
import reportsRoutes from './routes/reports';
import dashboardRoutes from './routes/dashboard';
import spaceRoutes from './routes/space';
import syncRoutes from './routes/sync';
import runtimeRoutes from './routes/runtime';
import categoryRoutes from './routes/categories';
import settingsRoutes from './routes/settings';
import branchRoutes from './routes/branches';
import stockTransferRoutes from './routes/stockTransfers';
import attributeRoutes from './routes/attributes';
import variantRoutes from './routes/variants';
import uploadRoutes from './routes/uploads';
import batchRoutes from './routes/batches';
import pricingOverlayRoutes from './routes/pricing-overlays';
import tagRoutes from './routes/tags';
import userRoutes from './routes/users';
import importRoutes from './routes/imports';
import posRoutes from './routes/pos';
import voucherRoutes from './routes/vouchers';
import legacySyncRoutes from './routes/legacySync';
import deviceRoutes from './routes/devices';
import { stockCountRouter, stockCountRunRouter } from './routes/stockCounts';
import { preloadStatusCache } from './modules/statuses/statusLookup';
import { startReplicaRealtime } from './sync/realtime';
import { getStorageRoot } from './utils/runtimePaths';

export function createApp() {
	const app = express();
	const configuredCorsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
	const allowedCorsOrigins = new Set(['null', ...configuredCorsOrigins]);

	// Trust nginx proxy
	app.set('trust proxy', 1);

	app.use(
		cors({
			origin: (origin, callback) => {
				if (!origin || allowedCorsOrigins.has(origin)) {
					callback(null, true);
					return;
				}

				callback(new Error(`CORS blocked for origin ${origin}`));
			},
			credentials: true,
		})
	);
	// Mounted before the global JSON parser so the desktop legacy-sync app can
	// push larger payloads (the router has its own body limit).
	app.use('/api/legacy-sync', legacySyncRoutes);

	app.use(express.json());

	// Serve uploaded files statically
	app.use('/uploads', express.static(path.join(getStorageRoot(), 'uploads')));

	const limiter = rateLimit({
		windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
		limit: Number(process.env.RATE_LIMIT_MAX ?? 1000),
		standardHeaders: true,
		legacyHeaders: false,
		validate: { xForwardedForHeader: false },
	});
	app.use(limiter);

	app.get('/health', (_req, res) => res.json({ status: 'ok' }));

	app.use('/api/auth', authRoutes);
	app.use('/api/vendors', vendorRoutes);
	app.use('/api/skus', skuRoutes);
	app.use('/api/skus/:skuId/variants', variantRoutes);
	app.use('/api/floors', floorRoutes);
	app.use('/api/shelves', shelfRoutes);
	app.use('/api/racks', rackRoutes);
	app.use('/api/boxes', boxRoutes);
	app.use('/api/inventory', inventoryRoutes);
	app.use('/api/grns', grnRoutes);
	app.use('/api/prns', prnRoutes);
	app.use('/api/audit-logs', auditLogRoutes);
	app.use('/api/ocr', ocrRoutes);
	app.use('/api/barcode', barcodeRoutes);
	app.use('/api/reports', reportsRoutes);
	app.use('/api/dashboard', dashboardRoutes);
	app.use('/api/space', spaceRoutes);
	app.use('/api/sync', syncRoutes);
	app.use('/api/runtime', runtimeRoutes);
	app.use('/api/categories', categoryRoutes);
	app.use('/api/settings', settingsRoutes);
	app.use('/api/branches', branchRoutes);
	app.use('/api/stock-transfers', stockTransferRoutes);
	app.use('/api/attributes', attributeRoutes);
	app.use('/api/uploads', uploadRoutes);
	app.use('/api/batches', batchRoutes);
	app.use('/api/pricing-overlays', pricingOverlayRoutes);
	app.use('/api/tags', tagRoutes);
	app.use('/api/users', userRoutes);
	app.use('/api/imports', importRoutes);
	app.use('/api/pos', posRoutes);
	app.use('/api/vouchers', voucherRoutes);
	app.use('/api/devices', deviceRoutes);
	app.use('/api/stock-count-runs', stockCountRunRouter);
	app.use('/api/stock-count', stockCountRouter);

	app.use(errorHandler);

	return app;
}

export const app = createApp();

let activeServer: Server | null = null;

export async function startServer(
	port = Number(process.env.PORT ?? 3001),
	host = process.env.HOST?.trim() || undefined
) {
	if (activeServer) {
		return activeServer;
	}

	await new Promise<void>((resolve, reject) => {
		const onListening = async () => {
			activeServer = server;
			logger.info(`Server running on ${host ?? 'default interface'}:${port}`);
			try {
				await preloadStatusCache();
			} catch (err) {
				logger.error('Failed to preload status cache', err);
			}
			try {
				await startReplicaRealtime(server);
			} catch (err) {
				logger.error('Failed to initialize replica realtime sync', err);
			}
			resolve();
		};
		const server = host ? app.listen(port, host, onListening) : app.listen(port, onListening);

		server.on('error', reject);
	});

	return activeServer!;
}

const shouldAutoStart =
	process.env.NODE_ENV !== 'test' &&
	(process.env.JINGLES_SERVER_AUTOSTART ?? 'true').trim().toLowerCase() !== 'false';

if (shouldAutoStart) {
	void startServer().catch((error) => {
		logger.error('Failed to start server', error);
		process.exitCode = 1;
	});
}

export default app;
