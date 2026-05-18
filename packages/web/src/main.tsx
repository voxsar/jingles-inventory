import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'material-icons/iconfont/material-icons.css';
import 'jsuites/dist/jsuites.css';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import './index.css';
import { branding } from './config/branding';

document.title = branding.appName;

const POLARIS_ASSET_BASE_URL =
  typeof window !== 'undefined' &&
  typeof window.electronAPI !== 'undefined' &&
  window.location.protocol === 'file:'
    ? 'jingles://vendor/polaris/'
    : new URL(/* @vite-ignore */ '../vendor/polaris/', import.meta.url).href;

const POLARIS_SCRIPT_URL = new URL('polaris.js', POLARIS_ASSET_BASE_URL).href;

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

async function ensurePolaris() {
  if (typeof window === 'undefined') {
    return;
  }

  window.__JINGLES_POLARIS_ASSET_BASE__ = POLARIS_ASSET_BASE_URL;

  if (window.customElements?.get('s-button')) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-polaris-loader="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Polaris runtime')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = POLARIS_SCRIPT_URL;
    script.dataset.polarisLoader = 'true';
    script.async = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load Polaris runtime')), { once: true });
    document.head.appendChild(script);
  });
}

void ensurePolaris()
  .catch((error) => {
    console.error('[UI] Failed to load Shopify Polaris runtime.', error);
  })
  .finally(() => {
    renderApp();
  });
