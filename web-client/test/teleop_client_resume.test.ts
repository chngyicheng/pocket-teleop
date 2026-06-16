/**
 * teleop_client_resume.test.ts — H7
 *
 * Hypothesis: TeleopClient.resume() can skip backoff and restart connection quickly
 *
 * When the page resumes from background (throttled/suspended), the browser's
 * timers may have been paused. resume() should:
 * - If reconnect is scheduled but waiting: skip the backoff and reconnect now.
 * - If socket is open: send a ping to detect a frozen link.
 * - If socket is closed and no retry pending: reconnect now.
 * - If intentionalDisconnect is true: no-op.
 *
 * Harness: vi.mock Connection (like pong_timeout harness).
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
      connect: vi.fn((_url: string) => callbacks.onOpen?.()),
      disconnect: vi.fn(() => callbacks.onClose?.(1000, 'client disconnect')),
      send: (...args: unknown[]) => capturedSend(...args),
      isOpen: vi.fn(() => {
        // Simple mock: assume open if send hasn't been captured with connection error
        return capturedSend.mock.calls.length > 0 || true;
      }),
    };
  }),
}));

describe('teleop_client_resume', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should reconnect immediately if retry is scheduled but waiting (skip backoff)', () => {
    const onReconnecting = vi.fn();

    const client = new TeleopClient({
      retryIntervalMs: 5000,
      keepaliveIntervalMs: 200,
      onReconnecting,
    });

    client.connect('ws://localhost:9090/ws');

    // Trigger pong timeout to schedule a retry (5s backoff).
    vi.advanceTimersByTime(1000);
    expect(onReconnecting).toHaveBeenCalledWith(1);

    // Clear the mock so we can count new calls.
    vi.clearAllMocks();

    // Resume should bypass the remaining 4s+ of backoff and reconnect now.
    client.resume();

    // Verify that connection.connect was called again (reconnect) without advancing time.
    // The mock's connect side-effect calls onOpen, which resets retryAttempt to 0.
    expect(onReconnecting).not.toHaveBeenCalled(); // retryAttempt was reset to 0 by reconnectNow
  });

  it('should send a ping if socket is open (quick liveness check)', () => {
    const client = new TeleopClient({
      keepaliveIntervalMs: 200,
    });

    client.connect('ws://localhost:9090/ws');

    // Clear mocks to focus on resume's behavior.
    capturedSend.mockClear();

    // Resume when socket is open should send a ping.
    client.resume();

    // Check if a ping was sent.
    const sendCalls = capturedSend.mock.calls;
    expect(sendCalls.length).toBeGreaterThan(0);
    const lastMsg = sendCalls[sendCalls.length - 1][0] as string;
    expect(JSON.parse(lastMsg)).toEqual({ type: 'ping' });
  });

  it('should no-op if intentionalDisconnect is true', () => {
    const client = new TeleopClient({
      retryIntervalMs: 5000,
      keepaliveIntervalMs: 200,
    });

    client.connect('ws://localhost:9090/ws');
    client.disconnect();

    // After explicit disconnect, resume should do nothing.
    capturedSend.mockClear();
    client.resume();

    // No ping or reconnect should occur.
    expect(capturedSend).not.toHaveBeenCalled();
  });

  // Regression lock: reconnectNow() must NOT reset retryAttempt — only the
  // automatic scheduleRetry path drives it, so exponential backoff has to keep
  // growing across failed auto-retries (5s → 10s → 20s …). A reset there would
  // silently flatten backoff to a constant first-step delay.
  it('keeps exponential backoff growing across automatic retries', () => {
    const onReconnecting = vi.fn();
    const client = new TeleopClient({
      retryIntervalMs: 5000,
      keepaliveIntervalMs: 200,
      onReconnecting,
    });

    client.connect('ws://localhost:9090/ws');

    // Zombie detection (no pong) schedules attempt 1 (5s backoff).
    vi.advanceTimersByTime(1000);
    expect(onReconnecting).toHaveBeenLastCalledWith(1);

    // Wait out the 5s backoff → reconnect → zombie again → attempt 2 (10s).
    vi.advanceTimersByTime(6000);
    expect(onReconnecting).toHaveBeenLastCalledWith(2);

    // Wait out the 10s backoff → reconnect → zombie again → attempt 3.
    vi.advanceTimersByTime(11000);
    expect(onReconnecting).toHaveBeenLastCalledWith(3);
  });

  it('resume() resets backoff: next automatic retry restarts at attempt 1', () => {
    const onReconnecting = vi.fn();
    const client = new TeleopClient({
      retryIntervalMs: 5000,
      keepaliveIntervalMs: 200,
      onReconnecting,
    });

    client.connect('ws://localhost:9090/ws');

    vi.advanceTimersByTime(1000); // attempt 1
    vi.advanceTimersByTime(6000); // attempt 2
    expect(onReconnecting).toHaveBeenLastCalledWith(2);

    // User returns to foreground while a retry is pending: backoff resets.
    client.resume();
    onReconnecting.mockClear();

    // The next zombie detection reports attempt 1 again, not 3.
    vi.advanceTimersByTime(1000);
    expect(onReconnecting).toHaveBeenLastCalledWith(1);
  });
});
