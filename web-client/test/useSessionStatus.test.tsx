/**
 * useSessionStatus.test.tsx — tests for session idle timeout hook
 *
 * Tests:
 * 1. Poll returns large remainingMs -> showWarning false
 * 2. Poll returns < 5 min -> showWarning true
 * 3. Poll returns 401 -> redirect to /auth/login
 * 4. Two rapid pointerdown -> heartbeat fetch fires once (throttled)
 * 5. keepAlive() -> heartbeat + re-poll immediate
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSessionStatus } from '../src/hooks/useSessionStatus.js';

describe('useSessionStatus', () => {
  let fetchStub: ReturnType<typeof vi.fn>;
  let originalFetch: typeof global.fetch;
  let originalLocation: Location;

  beforeEach(() => {
    vi.useFakeTimers();

    originalFetch = global.fetch;
    fetchStub = vi.fn();
    global.fetch = fetchStub as typeof fetch;

    // Mock location.replace since jsdom location is read-only
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        replace: vi.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('Poll returns large remainingMs -> showWarning false', async () => {
    const largeRemaining = 10 * 60 * 1000; // 10 min
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ remainingMs: largeRemaining }),
    });

    const { result } = renderHook(() =>
      useSessionStatus({
        pollIntervalMs: 100,
        warnThresholdMs: 5 * 60 * 1000,
      })
    );

    // Let pending promises resolve
    await vi.runOnlyPendingTimersAsync();

    expect(result.current.remainingMs).toBe(largeRemaining);
    expect(result.current.showWarning).toBe(false);
  });

  it('Poll returns < 5 min -> showWarning true', async () => {
    const smallRemaining = 4 * 60 * 1000 - 1; // Just under 4 min
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ remainingMs: smallRemaining }),
    });

    const { result } = renderHook(() =>
      useSessionStatus({
        pollIntervalMs: 100,
        warnThresholdMs: 5 * 60 * 1000,
      })
    );

    await vi.runOnlyPendingTimersAsync();

    expect(result.current.remainingMs).toBe(smallRemaining);
    expect(result.current.showWarning).toBe(true);
  });

  it('Poll returns 401 -> redirect to /auth/login', async () => {
    fetchStub.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    renderHook(() =>
      useSessionStatus({
        pollIntervalMs: 100,
        warnThresholdMs: 5 * 60 * 1000,
      })
    );

    await vi.runOnlyPendingTimersAsync();

    expect(window.location.replace).toHaveBeenCalledWith('/auth/login');
  });

  it('Two rapid pointerdown -> heartbeat fetch fires once (throttled)', async () => {
    const sessionRemaining = 10 * 60 * 1000;
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ remainingMs: sessionRemaining }),
    });

    const { result } = renderHook(() =>
      useSessionStatus({
        pollIntervalMs: 1000,
        heartbeatMinGapMs: 100,
        warnThresholdMs: 5 * 60 * 1000,
      })
    );

    // Let initial poll complete
    await vi.runOnlyPendingTimersAsync();

    expect(result.current.remainingMs).toBe(sessionRemaining);

    const initialFetchCount = fetchStub.mock.calls.length;

    // Simulate two rapid pointerdowns synchronously (both within same throttle window)
    window.dispatchEvent(new PointerEvent('pointerdown'));
    window.dispatchEvent(new PointerEvent('pointerdown'));

    // Let heartbeat resolve
    await vi.runOnlyPendingTimersAsync();

    // Exactly one heartbeat POST despite two pointerdowns
    const heartbeatCalls = fetchStub.mock.calls.filter(
      ([url]) => url === '/auth/heartbeat'
    );
    expect(heartbeatCalls).toHaveLength(1);
    expect(fetchStub.mock.calls.length).toBeGreaterThan(initialFetchCount);
  });

  it('Sustained active signal -> heartbeats keep flowing at the throttle rate', async () => {
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ remainingMs: 10 * 60 * 1000 }),
    });

    renderHook(() =>
      useSessionStatus({
        pollIntervalMs: 100_000, // park polling out of the way
        heartbeatMinGapMs: 100,
        active: true, // held the whole time, never transitions
      })
    );

    // Initial transition heartbeat
    await vi.runOnlyPendingTimersAsync();

    // Three throttle windows pass with `active` still true
    await vi.advanceTimersByTimeAsync(350);

    const heartbeatCalls = fetchStub.mock.calls.filter(
      ([url]) => url === '/auth/heartbeat'
    );
    expect(heartbeatCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('keepAlive() -> heartbeat + re-poll immediate', async () => {
    const sessionRemaining = 10 * 60 * 1000;
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ remainingMs: sessionRemaining }),
    });

    const { result } = renderHook(() =>
      useSessionStatus({
        pollIntervalMs: 1000,
        heartbeatMinGapMs: 100,
        warnThresholdMs: 5 * 60 * 1000,
      })
    );

    // Let initial poll complete
    await vi.runOnlyPendingTimersAsync();

    expect(result.current.remainingMs).toBe(sessionRemaining);

    const initialFetchCount = fetchStub.mock.calls.length;

    // Call keepAlive
    result.current.keepAlive();
    await vi.runOnlyPendingTimersAsync();

    // Should fire heartbeat + re-poll (2 additional fetches)
    const afterKeepAlive = fetchStub.mock.calls.length;
    expect(afterKeepAlive).toBeGreaterThan(initialFetchCount);
  });
});
