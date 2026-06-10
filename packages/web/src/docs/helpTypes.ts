export type HelpGroup =
	| 'Getting Started'
	| 'Workspace'
	| 'Operations'
	| 'Catalog'
	| 'Locations'
	| 'Tools'
	| 'Desktop';

export interface HelpAction {
	title: string;
	steps: string[];
}

export interface HelpSection {
	/** Slug used for anchors and screenshot file names (docs/<id>.png) */
	id: string;
	title: string;
	group: HelpGroup;
	/** In-app route this section documents; rendered as an "Open page" link */
	route?: string;
	intro: string;
	/** Screenshot file name inside the public docs/ folder */
	screenshot?: string;
	actions: HelpAction[];
	tips?: string[];
	/** Roles that can access the page, when restricted */
	roles?: string[];
}

/**
 * Resolve a docs asset for both deployments:
 * - Web build is served from the site root, so absolute /docs/... always works
 *   regardless of the current route.
 * - The Electron build loads index.html from disk (file://) with a HashRouter,
 *   so a relative path resolves correctly against the app bundle.
 */
export const docsAssetUrl = (file: string): string =>
	typeof window !== 'undefined' && window.location.protocol === 'file:'
		? `./docs/${file}`
		: `/docs/${file}`;
