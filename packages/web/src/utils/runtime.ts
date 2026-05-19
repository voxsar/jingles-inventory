function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function isElectronUserAgent() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /\bElectron\/\d+/i.test(navigator.userAgent);
}

function getDesktopApiBaseUrl() {
  if (!isDesktopRuntime()) {
    return null;
  }

  const backendUrl = window.electronAPI?.app?.backendUrl?.trim();
  if (backendUrl) {
    return trimTrailingSlash(backendUrl);
  }

  return 'http://127.0.0.1:3630';
}

export function isDesktopRuntime() {
  return (
    typeof window !== 'undefined' &&
    (
      window.location.protocol === 'file:' ||
      typeof window.electronAPI !== 'undefined' ||
      isElectronUserAgent()
    )
  );
}

export function getApiBaseUrl() {
  const desktopApiBaseUrl = getDesktopApiBaseUrl();
  if (desktopApiBaseUrl) {
    return desktopApiBaseUrl;
  }

  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredApiBaseUrl) {
    if (import.meta.env.DEV) {
      return '';
    }

    return trimTrailingSlash(configuredApiBaseUrl);
  }

  return '';
}

export function resolveBackendUrl(rawUrl: string, apiBaseUrl = getApiBaseUrl()) {
  if (!rawUrl) {
    return rawUrl;
  }

  const normalizedApiBaseUrl = trimTrailingSlash(apiBaseUrl);

  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      if (
        normalizedApiBaseUrl &&
        (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/uploads/'))
      ) {
        return `${normalizedApiBaseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }

      return rawUrl;
    } catch {
      return rawUrl;
    }
  }

  if (rawUrl.startsWith('/')) {
    return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}${rawUrl}` : rawUrl;
  }

  return normalizedApiBaseUrl
    ? `${normalizedApiBaseUrl}/${rawUrl.replace(/^\/+/, '')}`
    : rawUrl;
}

export function redirectToLogin() {
  if (typeof window === 'undefined') {
    return;
  }

  if (isDesktopRuntime()) {
    window.location.hash = '#/login';
    return;
  }

  window.location.assign('/login');
}

export function clearDesktopAuthCache() {
  if (!isDesktopRuntime()) {
    return;
  }

  void window.electronAPI?.app?.clearAuthCache?.();
}

export function persistDesktopAuthCache(token: string, user: unknown) {
  if (!isDesktopRuntime()) {
    return;
  }

  void window.electronAPI?.app?.setAuthCache?.({ token, user });
}
