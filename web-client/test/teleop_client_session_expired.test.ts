/**
 * teleop_client_session_expired.test.ts — H6
 *
 * Hypothesis: WS close code 4001 (session expired) triggers logout without retry.
 *
 * The server sends close code 4001 with reason 'session expired' when the
 * operator's session times out. This should:
 * 1. Call onClose(4001, 'session expired')
 * 2. NOT schedule a reconnection (no onReconnecting fired, no scheduleRetry)
 * 3. NOT resume any motion state
 *
 * For other close codes (e.g., 1006 network error), normal retry should apply.
 *
 * Harness: Connection is mocked so we inject the 4001 close directly.
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

describe('teleop_client_session_expired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should call onClose for 4001 session expired without retrying', () => {
    const onClose = vi.fn();
    const onReconnecting = vi.fn();

    const client = new TeleopClient({
      retryIntervalMs: 5000,
      keepaliveIntervalMs: 200,
      onClose,
      onReconnecting,
    });

    client.connect('ws://localhost:9090/ws');

    // Server sends 4001 close (session expired)
    capturedCallbacks.onClose(4001, 'session expired');

    // onClose should fire with the 4001 code and reason
    expect(onClose).toHaveBeenCalledWith(4001, 'session expired');

    // No reconnection should be scheduled
    expect(onReconnecting).not.toHaveBeenCalled();

    // Advance timer beyond any possible retry window to confirm no reconnect
    vi.advanceTimersByTime(10000);
    expect(onReconnecting).not.toHaveBeenCalled();
  });

  it('should not retry on 4001 even after faking timers', () => {
    const onReconnecting = vi.fn();
    const client = new TeleopClient({
      retryIntervalMs: 1000,
      keepaliveIntervalMs: 200,
      onReconnecting,
    });

    client.connect('ws://localhost:9090/ws');
    capturedCallbacks.onClose(4001, 'session expired');

    // Run timers for several retry windows worth of time
    vi.advanceTimersByTime(30000);

    // No onReconnecting should have been called
    expect(onReconnecting).not.toHaveBeenCalled();
  });

  it('should still retry for non-4001 codes (e.g., 1006)', () => {
    const onReconnecting = vi.fn();

    const client = new TeleopClient({
      retryIntervalMs: 1000,
      keepaliveIntervalMs: 200,
      onReconnecting,
    });

    client.connect('ws://localhost:9090/ws');

    // Network error (1006) — should still trigger retry (onReconnecting called)
    capturedCallbacks.onClose(1006, 'abnormal closure');

    // Advance timer to trigger retry scheduling
    vi.advanceTimersByTime(1100);

    // onReconnecting should have been called
    expect(onReconnecting).toHaveBeenCalled();
  });

  it('should call cleanup (stopKeepalive, stopPublisher, gamepadHandler.stop) for 4001', () => {
    const client = new TeleopClient({
      retryIntervalMs: 5000,
      keepaliveIntervalMs: 200,
    });

    client.connect('ws://localhost:9090/ws');

    // Spy on private methods indirectly by checking keepalive state doesn't fire
    vi.advanceTimersByTime(500); // Let keepalive fire a few times

    const sendCountBefore = capturedSend.mock.calls.length;

    // Session expired
    capturedCallbacks.onClose(4001, 'session expired');

    // Advance timer — keepalive should NOT fire (it was stopped)
    vi.advanceTimersByTime(500);

    // send count should not increase (no pings sent after close)
    const sendCountAfter = capturedSend.mock.calls.length;
    expect(sendCountAfter).toBe(sendCountBefore);
  });
});
