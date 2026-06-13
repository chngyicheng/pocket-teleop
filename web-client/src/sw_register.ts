/**
 * Service Worker registration wrapper for app-shell precaching.
 * Only registers SW in production; silently skips in dev or when no SW support.
 */

export interface RegisterServiceWorkerOptions {
  /**
   * Whether to register the SW. Defaults to import.meta.env.PROD.
   */
  isProduction?: boolean;

  /**
   * Navigator object to use for registration. Defaults to global navigator.
   */
  nav?: {
    serviceWorker?: {
      register: (url: string) => Promise<unknown>;
    };
  };
}

/**
 * Register the service worker for app-shell precaching.
 *
 * @param opts - Configuration options (isProduction defaults to import.meta.env.PROD, nav defaults to navigator)
 * @returns Promise that resolves when registration attempt completes (or is skipped)
 *
 * - Only registers if isProduction === true AND nav?.serviceWorker?.register is a function
 * - Silently catches registration errors (weak network, unsupported browser, etc.)
 * - Real-time streams (WS, /whep, /video, /perf, etc.) are NOT cached by SW — only app shell
 */
export async function registerServiceWorker(
  opts?: RegisterServiceWorkerOptions
): Promise<void> {
  const isProduction = opts?.isProduction ?? (import.meta.env.PROD as boolean);
  const nav = opts?.nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);

  if (!isProduction) {
    return; // Skip in dev
  }

  if (!nav?.serviceWorker?.register || typeof nav.serviceWorker.register !== 'function') {
    return; // No SW support or nav override without registration function
  }

  try {
    await nav.serviceWorker.register('/sw.js');
  } catch (err) {
    // Silently catch: weak network, unsupported, offline, etc.
    // Log only in dev if needed, but don't disrupt app
  }
}
