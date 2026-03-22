/**
 * White-label branding configuration.
 *
 * Override any value by setting the corresponding VITE_* environment variable
 * before building (or in a .env.local file for development).
 *
 * Available variables:
 *   VITE_APP_NAME          – Full application name  (default: "Jingles Inventory")
 *   VITE_APP_SHORT_NAME    – Short name shown in the sidebar  (default: "Jingles")
 *   VITE_APP_LOGO_EMOJI    – Emoji used as the app logo  (default: "🎵")
 *   VITE_APP_HEADER_TITLE  – Title shown in the top navigation bar
 *                            (default: "<VITE_APP_NAME> Management")
 *   VITE_TOKEN_KEY         – localStorage key used to store the auth token
 *                            (default: "jingles_token"). Change only when deploying
 *                            a new instance to avoid sharing tokens between apps.
 */

const appName = (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'Jingles Inventory';

// `as const` makes the object readonly — values remain typed as `string` because
// they originate from runtime env vars, not from literal assignments.
export const branding = {
  appName,
  appShortName: (import.meta.env.VITE_APP_SHORT_NAME as string | undefined) ?? 'Jingles',
  appLogoEmoji: (import.meta.env.VITE_APP_LOGO_EMOJI as string | undefined) ?? '🎵',
  appHeaderTitle: (import.meta.env.VITE_APP_HEADER_TITLE as string | undefined) ?? `${appName} Management`,
  tokenStorageKey: (import.meta.env.VITE_TOKEN_KEY as string | undefined) ?? 'jingles_token',
} as const;
