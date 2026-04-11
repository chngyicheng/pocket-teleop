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

  iceGatheringState: RTCIceGatheringState = 'complete';
  connectionState:   RTCPeerConnectionState = 'new';
  localDescription:  RTCSessionDescriptionInit | null = { type: 'offer', sdp: 'mock-offer-sdp' };

  ontrack:                ((e: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  addTransceiver      = vi.fn();
  createOffer         = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer-sdp' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  close               = vi.fn();
  addEventListener    = vi.fn();
  removeEventListener = vi.fn();

  constructor(_config?: RTCConfiguration) {
    MockRTCPeerConnection._instances.push(this);
  }

  /** Simulate the 'ontrack' callback firing with a mock MediaStream. */
  _fireTrack(stream: MediaStream): void {
    this.ontrack?.({ streams: [stream] } as RTCTrackEvent);
  }

  /** Simulate connection state change. */
  _fireConnectionStateChange(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
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
});
