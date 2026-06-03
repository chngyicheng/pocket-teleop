/**
 * teleop_client_pong_timeout.adversarial.test.ts — H6
 *
 * Hypothesis: TeleopClient never detects a zombie pong stream
 *
 * Keepalive fires buildPing() every 200ms but only reads pong replies.
 * There is no "pong overdue" detector. If the server stops responding,
 * pingSentAt keeps advancing and the next stale pong reports tiny latency,
 * hiding the outage. The fix should track consecutive missed pongs and
 * trigger onClose or reconnection after a threshold.
 *
 * Expected: after 3+ missed pongs, onClose fires or connection disconnects.
 * Actual (today): no callback; connection stays live despite no pong replies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeleopClient, type TeleopClientOptions } from '../src/teleop_client.js';

describe('teleop_client_pong_timeout.adversarial', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call onClose when pong stream times out after multiple missed pings', () => {
    const onClose = vi.fn();
    const onLatency = vi.fn();

    const client = new TeleopClient({
      retryIntervalMs: 5000,
      keepaliveIntervalMs: 200,
      onClose,
      onLatency,
    });

    // Spy on the internal connection.send to verify pings are sent
    const originalConnect = client.connect;
    let mockConnection: any;
    let sendSpy = vi.fn();

    // Mock the connection by overriding connect behavior
    vi.spyOn(client, 'connect').mockImplementation(function (url: string) {
      // Create a minimal mock that doesn't actually connect
      // but allows us to spy on send calls
      const self = this as any;
      if (!mockConnection) {
        mockConnection = {
          send: sendSpy,
        };
        self.connection = mockConnection;
      }
      // Manually trigger onOpen to start keepalive
      self.connection.onOpen?.();
    });

    // Connect and start keepalive
    client.connect('ws://localhost:9090/ws');

    // Advance time to trigger 5 keepalive cycles (200ms each = 1000ms)
    // During this time, pings are sent but no pongs arrive
    vi.advanceTimersByTime(1000);

    // EXPECTED (today fails): onClose should have been called to indicate zombie connection
    // If the implementation had pong timeout detection, it would have called onClose
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

    // Mock connection.send
    let sendSpy = vi.fn();
    vi.spyOn(client, 'connect').mockImplementation(function (url: string) {
      const self = this as any;
      if (!self.connection) {
        self.connection = { send: sendSpy };
      }
      self.connection.onOpen?.();
    });

    client.connect('ws://localhost:9090/ws');

    // Advance 5 keepalive cycles (1000ms)
    vi.advanceTimersByTime(1000);

    // No pong messages received, so onLatency should not have been called
    // EXPECTED (today may fail): onLatency should be 0 or very few calls (only from stale pongs)
    // If there's a proper timeout, it wouldn't keep reporting latency
    const callCount = onLatency.mock.calls.length;
    expect(callCount).toBeLessThanOrEqual(1); // At most 1 stale pong if one arrives late

    // onPong should definitely not be called
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

    // Set up a connection that replies to pings with pongs
    vi.spyOn(client, 'connect').mockImplementation(function (url: string) {
      const self = this as any;
      let pongSentAt = 0;

      self.connection = {
        send: vi.fn((msg: string) => {
          const parsed = JSON.parse(msg);
          if (parsed.type === 'ping') {
            // Simulate server immediately replying with pong
            pongSentAt = Date.now();
            setTimeout(() => {
              self.connection.onMessage?.(JSON.stringify({ type: 'pong' }));
            }, 0);
          }
        }),
      };
      self.connection.onOpen?.();
    });

    client.connect('ws://localhost:9090/ws');

    // Advance time for several keepalive cycles with pong replies
    vi.advanceTimersByTime(1000);

    // With proper pong replies, onClose should not be called
    expect(onClose).not.toHaveBeenCalled();

    // Pongs should have been received
    expect(onPong.mock.calls.length).toBeGreaterThan(0);
  });
});
