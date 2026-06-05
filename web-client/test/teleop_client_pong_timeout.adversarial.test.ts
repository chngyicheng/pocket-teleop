/**
 * teleop_client_pong_timeout.adversarial.test.ts — H6
 *
 * Hypothesis: TeleopClient never detects a zombie pong stream
 *
 * Keepalive fires buildPing() every 200ms but only reads pong replies.
 * There was no "pong overdue" detector. If the server stops responding,
 * pingSentAt keeps advancing and the next stale pong reports tiny latency,
 * hiding the outage. The fix tracks consecutive missed pongs and tears the
 * link down (onClose + reconnect) after maxMissedPongs.
 *
 * Expected: after 3+ missed pongs, onClose fires.
 * Actual (before fix): no callback; connection stayed live despite no replies.
 *
 * Harness note: the Connection class is mocked with vi.mock (the project's
 * standard pattern, mirroring teleop_client_continuous_publish.test.ts) so the
 * REAL TeleopClient.connect runs — and therefore startKeepalive actually fires.
 * The mock's connect/disconnect invoke the registered callbacks, and captured
 * `send` lets a test reply with a pong on demand.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';

let capturedSend: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedCallbacks: any;

vi.mock('../src/connection.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Connection: vi.fn().mockImplementation((callbacks: any) => {
    capturedSend = vi.fn();
    capturedCallbacks = callbacks;
    return {
      connect: vi.fn(() => callbacks.onOpen?.()),
      disconnect: vi.fn(() => callbacks.onClose?.(1000, 'client disconnect')),
      send: (...args: unknown[]) => capturedSend(...args),
    };
  }),
}));

describe('teleop_client_pong_timeout.adversarial', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Note: do NOT restoreAllMocks here — it would reset the vi.mock factory's
    // mockImplementation, breaking the Connection mock for later tests.
    vi.clearAllMocks();
  });

  it('should call onClose when pong stream times out after multiple missed pings', () => {
    const onClose = vi.fn();

    const client = new TeleopClient({
      retryIntervalMs: 5000,
      keepaliveIntervalMs: 200,
      onClose,
    });

    client.connect('ws://localhost:9090/ws');

    // Five keepalive cycles (200ms each). Pings go out; no pong ever returns,
    // so missedPongs reaches the threshold (3) and onClose fires.
    vi.advanceTimersByTime(1000);

    expect(onClose).toHaveBeenCalled();
  });

  it('should not report latency when no pong replies arrive', () => {
    const onLatency = vi.fn();
    const onPong = vi.fn();

    const client = new TeleopClient({
      keepaliveIntervalMs: 200,
      onLatency,
      onPong,
    });

    client.connect('ws://localhost:9090/ws');
    vi.advanceTimersByTime(1000);

    // No pong messages arrived, so latency is never measured and onPong never fires.
    expect(onLatency).not.toHaveBeenCalled();
    expect(onPong).not.toHaveBeenCalled();
  });

  it('should be resilient to normal pong replies (sanity check)', () => {
    const onLatency = vi.fn();
    const onPong = vi.fn();
    const onClose = vi.fn();

    const client = new TeleopClient({
      keepaliveIntervalMs: 200,
      onLatency,
      onPong,
      onClose,
    });

    // Reply to every outbound ping with an immediate pong via the registered
    // onMessage callback — the link stays healthy.
    capturedSend.mockImplementation((msg: string) => {
      if ((JSON.parse(msg) as { type: string }).type === 'ping') {
        capturedCallbacks.onMessage(JSON.stringify({ type: 'pong' }));
      }
    });

    client.connect('ws://localhost:9090/ws');
    vi.advanceTimersByTime(1000);

    expect(onClose).not.toHaveBeenCalled();
    expect(onPong.mock.calls.length).toBeGreaterThan(0);
  });
});
