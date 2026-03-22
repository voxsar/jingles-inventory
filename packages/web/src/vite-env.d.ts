/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_APP_NAME?: string;
	readonly VITE_APP_SHORT_NAME?: string;
	readonly VITE_APP_LOGO_EMOJI?: string;
	readonly VITE_APP_HEADER_TITLE?: string;
	readonly VITE_TOKEN_KEY?: string;
	readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
