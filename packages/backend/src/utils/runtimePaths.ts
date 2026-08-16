import fs from 'fs';
import path from 'path';

export function isLocalReplicaMode() {
  const value = process.env.JINGLES_LOCAL_SQLITE?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function getStorageRoot() {
  return process.env.JINGLES_STORAGE_ROOT?.trim() || process.cwd();
}

export function ensureDirectory(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
}

export function getUploadsRoot() {
  return ensureDirectory(path.join(getStorageRoot(), 'uploads'));
}

export function getProductsUploadRoot() {
  return ensureDirectory(path.join(getUploadsRoot(), 'products'));
}

export function getImportsUploadRoot() {
  return ensureDirectory(path.join(getUploadsRoot(), 'imports'));
}

export function getOcrUploadRoot() {
  return ensureDirectory(path.join(getUploadsRoot(), 'ocr'));
}

export function getBarcodeUploadRoot() {
  return ensureDirectory(path.join(getUploadsRoot(), 'barcode'));
}

export function getUpstreamServerUrl() {
  const rawValue =
    process.env.JINGLES_UPSTREAM_SERVER_URL?.trim() ||
    process.env.ELECTRON_UPSTREAM_SERVER_URL?.trim() ||
    process.env.VITE_API_BASE_URL?.trim() ||
    '';

  return rawValue.replace(/\/+$/, '') || null;
}
