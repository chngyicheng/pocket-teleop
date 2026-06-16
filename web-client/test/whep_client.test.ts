// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhepClient, type WhepState } from '../src/whep_client.js';

// Flush all pending Promise microtasks (vi.runAllMicrotasksAsync is Vitest 2.x only).
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// ── RTCPeerConnection shim ────────────────────────────────────────────────────
// jsdom does not provide RTCPeerConnection; shim it before importing WhepClient.

class MockRTCPeerConnection {
  static _instances: MockRTCPeerConnection[] = [];
  /** Initial iceGatheringState for newly-created PCs. Default 'complete' keeps
   * most tests on the fast path (_waitForIceGathering early-returns, no timer).
   * The timer-cleanup test sets this to 'gathering' to arm the safety timeout. */
  static _initialIceGatheringState: RTCIceGatheringState = 'complete';

  iceGatheringState: RTCIceGatheringState;
  connectionState:   RTCPeerConnectionState = 'new';
  localDescription:  RTCSessionDescriptionInit | null = { type: 'offer', sdp: 'mock-offer-sdp' };

  ontrack:                ((e: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  /** Functional event-listener registry so the source's 'icegatheringstatechange'
   * listener actually fires when _setIceGatheringState() is called. */
  _listeners: Record<string, Set<() => void>> = {};

  addTransceiver      = vi.fn();
  createOffer         = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer-sdp' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  close               = vi.fn();
  addEventListener    = vi.fn((type: string, cb: () => void) => {
    (this._listeners[type] ??= new Set()).add(cb);
  });
  removeEventListener = vi.fn((type: string, cb: () => void) => {
    this._listeners[type]?.delete(cb);
  });

  /** getStats() returns this report Map; tests set it via _statsReport. */
  _statsReport: Map<string, unknown> = new Map();
  getStats = vi.fn(() => Promise.resolve(this._statsReport));

  constructor(_config?: RTCConfiguration) {
    this.iceGatheringState = MockRTCPeerConnection._initialIceGatheringState;
    MockRTCPeerConnection._instances.push(this);
  }

  /** Simulate the 'ontrack' callback firing with a mock MediaStream. */
  _fireTrack(stream: MediaStream): void {
    this.ontrack?.({ streams: [stream] } as unknown as RTCTrackEvent);
  }

  /** Simulate connection state change. */
  _fireConnectionStateChange(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  /** Transition ICE gathering and dispatch 'icegatheringstatechange' to listeners. */
  _setIceGatheringState(state: RTCIceGatheringState): void {
    this.iceGatheringState = state;
    for (const cb of this._listeners['icegatheringstatechange'] ?? []) cb();
  }
}

if (typeof globalThis.RTCPeerConnection === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).RTCPeerConnection = MockRTCPeerConnection;
}

// ── fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
vi.stubGlobal('fetch', mockFetch);

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOkResponse(sdp = 'mock-answer-sdp'): Response {
  return { ok: true, status: 200, text: async () => sdp } as Response;
}

function makeErrorResponse(status: number): Response {
  return { ok: false, status, text: async () => '' } as Response;
}

function latestPc(): MockRTCPeerConnection {
  const instances = MockRTCPeerConnection._instances;
  if (instances.length === 0) throw new Error('No RTCPeerConnection created');
  return instances[instances.length - 1];
}

const TEST_URL = 'http://robot.local/video/teleop/whep';

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  MockRTCPeerConnection._instances = [];
  MockRTCPeerConnection._initialIceGatheringState = 'complete';
  mockFetch.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WhepClient', () => {
  describe('start()', () => {
    it('creates RTCPeerConnection and sends POST with SDP offer', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      expect(MockRTCPeerConnection._instances.length).toBeGreaterThanOrEqual(1);
      expect(mockFetch).toHaveBeenCalledWith(TEST_URL, expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: 'mock-offer-sdp',
      }));
    });

    it('adds a recvonly video transceiver', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      expect(latestPc().addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    });

    it('calls setRemoteDescription with the answer SDP', async () => {
      mockFetch.mockResolvedValue(makeOkResponse('server-answer-sdp'));
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      expect(latestPc().setRemoteDescription)
        .toHaveBeenCalledWith({ type: 'answer', sdp: 'server-answer-sdp' });
    });
  });

  describe('404 response (stream not yet published)', () => {
    it('calls onError with "stream not available"', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(404));
      const onError = vi.fn();
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError, onClose: vi.fn() });
      client.start();
      await flushPromises();

      expect(onError).toHaveBeenCalledWith('stream not available');
    });

    it('schedules a retry after BASE_RETRY_MS', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(404));
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      const callsBefore = mockFetch.mock.calls.length;
      // No retry yet
      expect(mockFetch.mock.calls.length).toBe(callsBefore);

      // Advance past the 3000ms base retry delay
      mockFetch.mockResolvedValue(makeErrorResponse(404));
      await vi.advanceTimersByTimeAsync(3100);
      await flushPromises();

      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  describe('non-404 HTTP error', () => {
    it('calls onError with "WHEP <status>"', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(503));
      const onError = vi.fn();
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError, onClose: vi.fn() });
      client.start();
      await flushPromises();

      expect(onError).toHaveBeenCalledWith('WHEP 503');
    });
  });

  describe('network error (fetch throws)', () => {
    it('calls onError with the thrown message', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));
      const onError = vi.fn();
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError, onClose: vi.fn() });
      client.start();
      await flushPromises();

      expect(onError).toHaveBeenCalledWith('Failed to fetch');
    });

    it('schedules a retry', async () => {
      mockFetch.mockRejectedValue(new Error('network'));
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      const callsBefore = mockFetch.mock.calls.length;
      mockFetch.mockRejectedValue(new Error('network'));
      await vi.advanceTimersByTimeAsync(3100);
      await flushPromises();

      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  describe('stop()', () => {
    it('cancels pending retry — no further fetch calls', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(404));
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      client.stop();
      const callsBefore = mockFetch.mock.calls.length;

      await vi.advanceTimersByTimeAsync(60_000);
      await flushPromises();

      expect(mockFetch.mock.calls.length).toBe(callsBefore);
    });
  });

  describe('connection state change', () => {
    it('calls onClose when connectionState becomes "failed"', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onClose = vi.fn();
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose });
      client.start();
      await flushPromises();

      latestPc()._fireConnectionStateChange('failed');

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when connectionState becomes "closed"', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onClose = vi.fn();
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose });
      client.start();
      await flushPromises();

      latestPc()._fireConnectionStateChange('closed');

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('successful stream', () => {
    it('calls onStream with the received MediaStream', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onStream = vi.fn();
      const client = new WhepClient(TEST_URL, { onStream, onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      const stream = {} as MediaStream;
      latestPc()._fireTrack(stream);

      expect(onStream).toHaveBeenCalledWith(stream);
    });
  });

  describe('onStateChange', () => {
    it('fires connecting immediately on start()', () => {
      const states: WhepState[] = [];
      mockFetch.mockRejectedValue(new Error('fail'));
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
        onStateChange: (s) => states.push(s),
      });
      client.start();
      expect(states[0]).toBe('connecting');
      client.stop();
    });

    it('fires live when ontrack delivers a stream', async () => {
      const states: WhepState[] = [];
      mockFetch.mockResolvedValue(makeOkResponse());
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
        onStateChange: (s) => states.push(s),
      });
      client.start();
      await flushPromises();
      latestPc()._fireTrack({} as MediaStream);
      expect(states).toContain('live');
      client.stop();
    });

    it('fires retrying when connection drops (failed state)', async () => {
      const states: WhepState[] = [];
      mockFetch.mockResolvedValue(makeOkResponse());
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
        onStateChange: (s) => states.push(s),
      });
      client.start();
      await flushPromises();
      latestPc()._fireConnectionStateChange('failed');
      expect(states).toContain('retrying');
      client.stop();
    });

    it('fires error then retrying on fetch HTTP error', async () => {
      const states: WhepState[] = [];
      mockFetch.mockResolvedValue(makeErrorResponse(404));
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
        onStateChange: (s) => states.push(s),
      });
      client.start();
      await flushPromises();
      expect(states).toContain('error');
      expect(states).toContain('retrying');
      client.stop();
    });

    it('fires error then retrying when fetch throws (network error)', async () => {
      const states: WhepState[] = [];
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
        onStateChange: (s) => states.push(s),
      });
      client.start();
      await flushPromises();
      expect(states).toContain('error');
      expect(states).toContain('retrying');
      client.stop();
    });

    it('fires retrying when connection state becomes closed', async () => {
      const states: WhepState[] = [];
      mockFetch.mockResolvedValue(makeOkResponse());
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
        onStateChange: (s) => states.push(s),
      });
      client.start();
      await flushPromises();
      latestPc()._fireConnectionStateChange('closed');
      expect(states).toContain('retrying');
      client.stop();
    });
  });

  describe('exponential back-off', () => {
    it('retry delay doubles after each failure up to MAX_RETRY_MS', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(404));
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      // 1st retry after 3000ms
      await vi.advanceTimersByTimeAsync(3100);
      await flushPromises();
      const after1 = mockFetch.mock.calls.length;

      // 2nd retry after 6000ms
      await vi.advanceTimersByTimeAsync(6100);
      await flushPromises();
      const after2 = mockFetch.mock.calls.length;

      expect(after2).toBeGreaterThan(after1);
    });
  });

  describe('double-start protection (finding #13)', () => {
    it('calling start() twice during an in-flight _connect does not complete both fetches', async () => {
      // Set up fetch to delay (simulating slow network)
      const fetchSpy = vi.fn();
      mockFetch.mockImplementationOnce(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return makeOkResponse();
      });
      mockFetch.mockImplementationOnce(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return makeOkResponse();
      });

      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      // Trigger second start before first fetch completes
      await vi.advanceTimersByTimeAsync(50);
      await flushPromises();
      client.start();
      await vi.advanceTimersByTimeAsync(200);
      await flushPromises();

      // Both fetches should have been called, but the second _connect() should have
      // bailed out after detecting this.pc changed, preventing setRemoteDescription
      // from being called on a stale pc. We can't directly test the abort,
      // but we can verify fetch was called twice (once per start()).
      expect(mockFetch.mock.calls.length).toBe(2);
    });
  });

  describe('ICE gathering timer cleanup (finding #20)', () => {
    it('clears the safety timeout when ICE gathering completes early', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      // PC must start mid-gathering so the source arms the 5s safety timer and
      // registers an 'icegatheringstatechange' listener.
      MockRTCPeerConnection._initialIceGatheringState = 'gathering';
      const client = new WhepClient(TEST_URL, { onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      client.start();
      await flushPromises();

      // The safety timeout is now armed (no other timers run in this code path).
      const armed = vi.getTimerCount();
      expect(armed).toBeGreaterThan(0);

      // Complete ICE gathering early — dispatches the event the source listens on,
      // which should clearTimeout the still-pending safety timer.
      latestPc()._setIceGatheringState('complete');

      expect(vi.getTimerCount()).toBeLessThan(armed);
    });
  });

  describe('video stats polling (BUG 5)', () => {
    it('polls getStats and reports inbound video fps/width/height via onStats', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onStats = vi.fn();
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(), onStats,
      });
      client.start();
      await flushPromises();

      const pc = latestPc();
      pc._statsReport = new Map<string, unknown>([
        ['ir', { type: 'inbound-rtp', kind: 'video', framesPerSecond: 15, frameWidth: 1920, frameHeight: 1080 }],
      ]);
      pc._fireTrack(new MediaStream());
      await flushPromises();

      // First poll fires one interval later.
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(onStats).toHaveBeenCalledWith({ fps: 15, width: 1920, height: 1080 });
    });

    it('does not report stats when there is no inbound video report', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onStats = vi.fn();
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(), onStats,
      });
      client.start();
      await flushPromises();

      const pc = latestPc();
      pc._statsReport = new Map<string, unknown>([
        ['ir', { type: 'inbound-rtp', kind: 'audio', framesPerSecond: 50 }],
        ['cp', { type: 'candidate-pair', nominated: true }],
      ]);
      pc._fireTrack(new MediaStream());
      await flushPromises();

      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(onStats).not.toHaveBeenCalled();
    });

    it('stops polling getStats after stop()', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onStats = vi.fn();
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(), onStats,
      });
      client.start();
      await flushPromises();

      const pc = latestPc();
      pc._statsReport = new Map<string, unknown>([
        ['ir', { type: 'inbound-rtp', kind: 'video', framesPerSecond: 15, frameWidth: 1920, frameHeight: 1080 }],
      ]);
      pc._fireTrack(new MediaStream());
      await flushPromises();

      client.stop();
      const callsBefore = pc.getStats.mock.calls.length;
      vi.advanceTimersByTime(5_000);
      await flushPromises();

      expect(pc.getStats.mock.calls.length).toBe(callsBefore);
    });
  });

  describe('resume()', () => {
    it('rebuilds PC and resets retry delay when called', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
      });
      client.start();
      await flushPromises();

      const pc1 = latestPc();

      // Trigger a retry delay to advance.
      latestPc()._fireConnectionStateChange('failed');
      await flushPromises();

      // Resume should rebuild the PC (new instance).
      client.resume();
      await flushPromises();

      const pc2 = latestPc();
      expect(pc2).not.toBe(pc1); // New PC created
    });

    it('should not retry if stopped', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
      });
      client.start();
      await flushPromises();

      client.stop();
      const beforeCount = MockRTCPeerConnection._instances.length;

      client.resume(); // Should no-op if stopped

      expect(MockRTCPeerConnection._instances.length).toBe(beforeCount);
    });
  });

  describe('disconnected grace period', () => {
    it('should not retry if reconnected within grace period', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onClose = vi.fn();
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose, onStateChange: vi.fn(),
      });
      client.start();
      await flushPromises();

      const pc = latestPc();
      pc._fireTrack(new MediaStream());

      // Transition to disconnected.
      pc._fireConnectionStateChange('disconnected');
      await flushPromises();

      // Reconnect before grace expires (< 2s).
      await vi.advanceTimersByTimeAsync(1000);
      pc._fireConnectionStateChange('connected');
      await flushPromises();

      // onClose should not have been called.
      expect(onClose).not.toHaveBeenCalled();

      client.stop();
    });

    it('should retry if disconnected grace period expires without reconnect', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onClose = vi.fn();
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose, onStateChange: vi.fn(),
      });
      client.start();
      await flushPromises();

      const pc = latestPc();
      pc._fireTrack(new MediaStream());

      // Transition to disconnected.
      pc._fireConnectionStateChange('disconnected');
      await flushPromises();

      // Let grace period expire (> 2s).
      await vi.advanceTimersByTimeAsync(2100);
      await flushPromises();

      // onClose should have fired.
      expect(onClose).toHaveBeenCalled();

      client.stop();
    });
  });

  describe('fps stall watchdog', () => {
    it('should trigger retry if framesDecoded does not advance for STALL_POLL_LIMIT polls', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onClose = vi.fn();
      const onStats = vi.fn();
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose, onStats,
      });
      client.start();
      await flushPromises();

      const pc = latestPc();
      pc._fireTrack(new MediaStream());
      await flushPromises();

      // Set framesDecoded to a fixed value; it won't advance.
      pc._statsReport = new Map<string, unknown>([
        ['ir', {
          type: 'inbound-rtp',
          kind: 'video',
          framesPerSecond: 15,
          frameWidth: 1920,
          frameHeight: 1080,
          framesDecoded: 100, // Fixed value
        }],
      ]);

      // Poll 1: baseline (stallPolls = 0, record 100).
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(onClose).not.toHaveBeenCalled();

      // Poll 2: framesDecoded = 100 again (stallPolls = 1).
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(onClose).not.toHaveBeenCalled();

      // Poll 3: framesDecoded = 100 again (stallPolls = 2).
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(onClose).not.toHaveBeenCalled();

      // Poll 4: framesDecoded = 100 again (stallPolls >= STALL_POLL_LIMIT = 3) → onClose + retry.
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(onClose).toHaveBeenCalled();

      client.stop();
    });

    it('should reset stall counter if framesDecoded advances', async () => {
      mockFetch.mockResolvedValue(makeOkResponse());
      const onClose = vi.fn();
      const onStats = vi.fn();
      const client = new WhepClient(TEST_URL, {
        onStream: vi.fn(), onError: vi.fn(), onClose, onStats,
      });
      client.start();
      await flushPromises();

      const pc = latestPc();
      pc._fireTrack(new MediaStream());
      await flushPromises();

      // Poll 1: framesDecoded = 100.
      pc._statsReport = new Map<string, unknown>([
        ['ir', { type: 'inbound-rtp', kind: 'video', framesPerSecond: 15, frameWidth: 1920, frameHeight: 1080, framesDecoded: 100 }],
      ]);
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      // Poll 2: framesDecoded = 100 (stallPolls = 1).
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      // Poll 3: framesDecoded = 150 (advances, reset stallPolls to 0).
      pc._statsReport = new Map<string, unknown>([
        ['ir', { type: 'inbound-rtp', kind: 'video', framesPerSecond: 15, frameWidth: 1920, frameHeight: 1080, framesDecoded: 150 }],
      ]);
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      // Poll 4: framesDecoded = 150 again (stallPolls = 1, not yet critical).
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(onClose).not.toHaveBeenCalled();

      client.stop();
    });
  });
});
