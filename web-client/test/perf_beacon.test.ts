import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collectPerf, reportPerf } from '../src/perf_beacon.js';

describe('collectPerf', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) => {
      if (type === 'navigation') {
        return [{ domContentLoadedEventEnd: 812.4, responseEnd: 120.9 }] as unknown as PerformanceEntryList;
      }
      if (type === 'paint') {
        return [{ name: 'first-contentful-paint', startTime: 640.6 }] as unknown as PerformanceEntryList;
      }
      return [] as unknown as PerformanceEntryList;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rounds the injected now into readyMs and pulls paint/nav timings', () => {
    const p = collectPerf(1234.7);
    expect(p.readyMs).toBe(1235);
    expect(p.fcpMs).toBe(641);
    expect(p.domContentLoadedMs).toBe(812);
    expect(p.responseEndMs).toBe(121);
    expect(p.ua).toBe(navigator.userAgent);
  });

  it('yields null timings when no navigation/paint entries exist', () => {
    (performance.getEntriesByType as ReturnType<typeof vi.fn>).mockReturnValue(
      [] as unknown as PerformanceEntryList,
    );
    const p = collectPerf(50);
    expect(p.readyMs).toBe(50);
    expect(p.fcpMs).toBeNull();
    expect(p.domContentLoadedMs).toBeNull();
    expect(p.responseEndMs).toBeNull();
  });
});

describe('reportPerf', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error cleanup injected stub
    delete navigator.sendBeacon;
  });

  it('POSTs to /perf via sendBeacon when available', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    // @ts-expect-error jsdom has no sendBeacon by default
    navigator.sendBeacon = sendBeacon;

    reportPerf();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe('/perf');
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe('application/json');
  });

  it('falls back to keepalive fetch when sendBeacon is absent', () => {
    // @ts-expect-error ensure no sendBeacon
    delete navigator.sendBeacon;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    reportPerf();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/perf');
    expect(init?.method).toBe('POST');
    expect(init?.keepalive).toBe(true);
  });

  it('never throws even if collection fails', () => {
    vi.spyOn(performance, 'getEntriesByType').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => reportPerf()).not.toThrow();
  });
});
