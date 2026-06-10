#!/usr/bin/env node
/**
 * Captures the screenshots used by the in-app Help & Documentation page.
 *
 * Prerequisites:
 *  - backend running on http://localhost:3001 (pm2 start jingles-backend)
 *  - web dev server running on http://localhost:5173 (npm run dev:web)
 *  - playwright installed in packages/web (npx playwright install chromium)
 *
 * Usage: node scripts/capture-docs-screenshots.mjs
 *
 * Screenshots are written to packages/web/public/docs/ and shipped with the
 * web build, so re-run this script after significant UI changes and rebuild.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const requireWeb = createRequire(path.join(repoRoot, 'packages/web/package.json'));
const requireBackend = createRequire(path.join(repoRoot, 'packages/backend/package.json'));

const { chromium } = requireWeb('playwright');
const jwt = requireBackend('jsonwebtoken');

const BASE_URL = process.env.DOCS_BASE_URL ?? 'http://localhost:5173';
const API_URL = process.env.DOCS_API_URL ?? 'http://localhost:3001';
const OUT_DIR = path.join(repoRoot, 'packages/web/public/docs');
const VIEWPORT = { width: 1440, height: 900 };

function readEnvValue(file, key) {
	const content = readFileSync(file, 'utf8');
	const match = content.match(new RegExp(`^${key}=["']?([^"'\\n]+)["']?`, 'm'));
	return match?.[1];
}

async function fetchJson(url, token) {
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`${url} -> ${res.status}`);
	return res.json();
}

async function main() {
	const jwtSecret = readEnvValue(path.join(repoRoot, 'packages/backend/.env'), 'JWT_SECRET');
	if (!jwtSecret) throw new Error('JWT_SECRET not found in packages/backend/.env');

	// Identify an active admin account to browse as (token is generated locally,
	// no password needed). The user payload mirrors routes/auth.ts.
	const adminEmail = process.env.DOCS_ADMIN_EMAIL ?? 'admin@theredsun.org';
	const adminId = process.env.DOCS_ADMIN_ID ?? 'fa964faf-6d78-48df-8f31-f38ca8f6de16';
	const token = jwt.sign({ id: adminId, email: adminEmail, role: 'Admin' }, jwtSecret, { expiresIn: '1h' });

	mkdirSync(OUT_DIR, { recursive: true });

	const browser = await chromium.launch();
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
	await context.addInitScript(
		([storedToken]) => {
			window.localStorage.setItem('jingles_ui_theme', 'light');
			if (storedToken) window.localStorage.setItem('jingles_token', storedToken);
		},
		[token]
	);
	const page = await context.newPage();

	const capture = async (name, route, { settle = 1200, prepare } = {}) => {
		await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
		if (prepare) await prepare(page);
		await page.waitForTimeout(settle);
		await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
		console.log(`captured ${name}.png  (${route})`);
	};

	// Logged-out shot first (init script token applies to new documents, so use
	// a separate clean context for the login page).
	{
		const loginContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
		await loginContext.addInitScript(() => window.localStorage.setItem('jingles_ui_theme', 'light'));
		const loginPage = await loginContext.newPage();
		await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
		await loginPage.waitForTimeout(800);
		await loginPage.screenshot({ path: path.join(OUT_DIR, 'login.png') });
		console.log('captured login.png  (/login)');
		await loginContext.close();
	}

	await capture('dashboard', '/dashboard');
	await capture('navigation', '/dashboard', {
		prepare: async (p) => {
			// Open the command palette so the navigation shot shows it
			await p.keyboard.press('Control+KeyK').catch(() => {});
		},
		settle: 800,
	});
	await capture('inventory', '/inventory');
	await capture('products', '/skus', { settle: 2500 });
	await capture('grns', '/grns', { settle: 2000 });

	// GRN detail needs a real GRN id
	try {
		const grnList = await fetchJson(`${API_URL}/api/grns?page=1&pageSize=1`, token);
		const grnId = grnList?.data?.items?.[0]?.id ?? grnList?.data?.[0]?.id;
		if (grnId) await capture('grn-detail', `/grns/${grnId}`, { settle: 2000 });
	} catch (error) {
		console.warn('skipping grn-detail screenshot:', error.message);
	}

	await capture('prns', '/prns');
	await capture('stock-transfers', '/stock-transfers');
	await capture('pricing-overlays', '/pricing-overlays');
	await capture('batch-pricing', '/pricing', { settle: 2000 });
	await capture('categories', '/categories');
	await capture('tags', '/tags');
	await capture('suppliers', '/suppliers', { settle: 2000 });
	await capture('branches', '/branches');
	await capture('warehouse-3d', '/warehouse-3d', { settle: 3500 });
	await capture('ai-imports', '/imports');
	await capture('spreadsheet', '/spreadsheet');
	await capture('reports', '/reports?report=grn', { settle: 2500 });
	await capture('users', '/users');
	await capture('settings', '/settings');

	await browser.close();
	console.log(`\nDone. Screenshots in ${OUT_DIR}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
