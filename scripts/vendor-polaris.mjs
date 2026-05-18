import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const vendorRoot = path.join(repoRoot, 'packages', 'web', 'public', 'vendor', 'polaris');

const POLARIS_SCRIPT_URL = 'https://cdn.shopify.com/shopifycloud/polaris.js';
const FONT_STYLESHEET_URL = 'https://cdn.shopify.com/static/fonts/inter/v4/styles.css';
const ICON_BASE_URL = 'https://cdn.shopify.com/shopifycloud/admin-ui-foundations/icons/';
const INTERNAL_ICON_BASE_URL = 'https://cdn.shopify.com/shopifycloud/admin-ui-foundations/internal-only/';

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

function extractQuotedEntries(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Could not find start marker ${startMarker}`);
  }

  const end = source.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`Could not find end marker ${endMarker}`);
  }

  const body = source.slice(start + startMarker.length, end);
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function patchPolarisSource(source) {
  return source
    .replaceAll(
      `"${ICON_BASE_URL}"`,
      '((globalThis.__JINGLES_POLARIS_ASSET_BASE__??"./")+"admin-ui-foundations/icons/")'
    )
    .replaceAll(
      `"${INTERNAL_ICON_BASE_URL}"`,
      '((globalThis.__JINGLES_POLARIS_ASSET_BASE__??"./")+"admin-ui-foundations/internal-only/")'
    )
    .replaceAll(
      `"${FONT_STYLESHEET_URL}"`,
      '((globalThis.__JINGLES_POLARIS_ASSET_BASE__??"./")+"fonts/inter/v4/styles.css")'
    );
}

async function withConcurrency(items, limit, worker) {
  const active = new Set();

  for (const item of items) {
    const job = Promise.resolve().then(() => worker(item));
    active.add(job);

    const cleanup = () => active.delete(job);
    job.then(cleanup, cleanup);

    if (active.size >= limit) {
      await Promise.race(active);
    }
  }

  await Promise.all(active);
}

async function downloadFiles(files) {
  await withConcurrency(files, 16, async ({ url, targetPath }) => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    const bytes = await fetchBytes(url);
    await writeFile(targetPath, bytes);
  });
}

async function main() {
  await mkdir(vendorRoot, { recursive: true });

  const polarisSource = await fetchText(POLARIS_SCRIPT_URL);
  const patchedPolarisSource = patchPolarisSource(polarisSource);

  const iconEntries = extractQuotedEntries(polarisSource, 'Ni=[', '],Pi={}');
  const internalIconEntries = extractQuotedEntries(polarisSource, 'un=[', '],bn={}');

  const iconFiles = iconEntries.map((entry) => {
    const [, hash] = entry.split(' ');
    return {
      url: `${ICON_BASE_URL}${hash}.svg`,
      targetPath: path.join(vendorRoot, 'admin-ui-foundations', 'icons', `${hash}.svg`),
    };
  });

  const internalIconFiles = internalIconEntries.map((entry) => {
    const [, hash] = entry.split(' ');
    return {
      url: `${INTERNAL_ICON_BASE_URL}${hash}.svg`,
      targetPath: path.join(vendorRoot, 'admin-ui-foundations', 'internal-only', `${hash}.svg`),
    };
  });

  const fontStylesheet = await fetchText(FONT_STYLESHEET_URL);
  const fontFileNames = [...fontStylesheet.matchAll(/url\('([^']+)'\)/g)].map((match) => match[1]);
  const fontFiles = fontFileNames.map((fileName) => ({
    url: new URL(fileName, FONT_STYLESHEET_URL).toString(),
    targetPath: path.join(vendorRoot, 'fonts', 'inter', 'v4', fileName),
  }));

  await downloadFiles([...iconFiles, ...internalIconFiles, ...fontFiles]);
  await writeFile(
    path.join(vendorRoot, 'fonts', 'inter', 'v4', 'styles.css'),
    fontStylesheet,
    'utf8'
  );
  await writeFile(path.join(vendorRoot, 'polaris.js'), patchedPolarisSource, 'utf8');

  const manifestPath = path.join(vendorRoot, 'manifest.json');
  let previousManifest = null;
  try {
    previousManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    previousManifest = null;
  }

  const manifest = {
    downloadedAt: new Date().toISOString(),
    source: {
      polarisScriptUrl: POLARIS_SCRIPT_URL,
      fontStylesheetUrl: FONT_STYLESHEET_URL,
      iconBaseUrl: ICON_BASE_URL,
      internalIconBaseUrl: INTERNAL_ICON_BASE_URL,
    },
    counts: {
      icons: iconFiles.length,
      internalIcons: internalIconFiles.length,
      fontFiles: fontFiles.length,
    },
    previousDownloadedAt: previousManifest?.downloadedAt ?? null,
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(
    `Vendored Polaris locally to ${path.relative(repoRoot, vendorRoot)} ` +
      `(${iconFiles.length + internalIconFiles.length} icons, ${fontFiles.length} font files).`
  );
}

await main();
