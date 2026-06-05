/**
 * perf_beacon.ts — one-shot client→server timing report.
 *
 * After the first paint (double-rAF from main.tsx), POST Navigation + Paint
 * Timing to the auth-server /perf route so its log shows a real
 * "UI ready at +N ms" line per page load. Best-effort: never throws, never
 * blocks the app.
 *
 * readyMs ≈ time from navigation start to first paint after React mount — the
 * closest server-visible proxy for "operator can see the controls".
 */

export interface PerfPayload {
  /** ms from navigation start to when the beacon fired (≈ first paint post-mount). */
  readyMs: number;
  /** first-contentful-paint start time (ms), or null if unavailable. */
  fcpMs: number | null;
  /** DOMContentLoaded end (ms), or null. */
  domContentLoadedMs: number | null;
  /** Navigation responseEnd — HTML fully received (ms), or null. */
  responseEndMs: number | null;
  ua: string;
}

/** Gather timing into a flat payload. `now` is injectable for tests. */
export function collectPerf(now: number = performance.now()): PerfPayload {
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  const fcp = performance
    .getEntriesByType('paint')
    .find((p) => p.name === 'first-contentful-paint');
  return {
    readyMs: Math.round(now),
    fcpMs: fcp ? Math.round(fcp.startTime) : null,
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    responseEndMs: nav ? Math.round(nav.responseEnd) : null,
    ua: navigator.userAgent,
  };
}

/** Send the perf payload to /perf via sendBeacon (fallback: keepalive fetch). */
export function reportPerf(): void {
  try {
    const body = JSON.stringify(collectPerf());
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/perf', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/perf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    }
  } catch {
    // best-effort; a failed beacon must never disrupt the app
  }
}
