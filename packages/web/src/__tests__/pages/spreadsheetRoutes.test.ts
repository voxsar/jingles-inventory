import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Spreadsheet hub navigates straight to `entity.path`. When a tile has no
 * matching route the router falls through to the catch-all and silently sends
 * the user to the dashboard, which reads as a broken page rather than a missing
 * one. Keep the two lists in step.
 */
const readSource = (relativePath: string) =>
	readFileSync(resolve(__dirname, '../..', relativePath), 'utf8');

const tilePaths = () => {
	const source = readSource('pages/SpreadsheetPage.tsx');
	return [...source.matchAll(/path:\s*'(\/spreadsheet\/[^']+)'/g)].map((match) => match[1]);
};

const routedPaths = () => {
	const source = readSource('App.tsx');
	return [...source.matchAll(/path="(spreadsheet\/[^"]+)"/g)].map((match) => `/${match[1]}`);
};

describe('spreadsheet hub routing', () => {
	it('finds tiles and routes to compare', () => {
		expect(tilePaths().length).toBeGreaterThan(0);
		expect(routedPaths().length).toBeGreaterThan(0);
	});

	it('registers a route for every entity tile', () => {
		const routes = new Set(routedPaths());
		const missing = tilePaths().filter((path) => !routes.has(path));

		expect(missing, `Spreadsheet tiles without a route: ${missing.join(', ')}`).toEqual([]);
	});

	it('does not route to spreadsheets the hub never links', () => {
		const tiles = new Set(tilePaths());
		const orphaned = routedPaths().filter((path) => !tiles.has(path));

		expect(orphaned, `Spreadsheet routes with no tile: ${orphaned.join(', ')}`).toEqual([]);
	});
});
