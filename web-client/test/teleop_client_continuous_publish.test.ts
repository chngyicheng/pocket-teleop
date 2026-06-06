/**
 * teleop_client_continuous_publish.test.ts — BUG 1 regression guard
 *
 * Verifies that TeleopClient publishes cmd_vel continuously (20 Hz) while a
 * joystick is held, sends a burst of zero-twists on release, then goes silent.
 *
 * TDD: these tests MUST be written (and red) before the implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';
import { shapeAxis } from '../src/input_shaping.js';

// ---------------------------------------------------------------------------
// Connection mock — captures the send spy so tests can inspect outbound msgs.
// The mock constructor receives the callbacks object (onMessage/onOpen/etc)
// and exposes a controllable `send` function.
// ---------------------------------------------------------------------------

let capturedSend: ReturnType<typeof vi.fn>;

vi.mock('../src/connection.js', () => ({
  Connection: vi.fn().mockImplementation(() => {
    capturedSend = vi.fn();
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      send: (...args: unknown[]) => capturedSend(...args),
    };
  }),
}));

// ---------------------------------------------------------------------------
// Helper — count outbound messages whose parsed type === 'twist'
// ---------------------------------------------------------------------------
function twistSendCount(): number {
  return capturedSend.mock.calls.filter(([msg]) => {
    try {
      return (JSON.parse(msg as string) as { type: string }).type === 'twist';
    } catch {
      return false;
    }
  }).length;
}

// Return all twist payloads, in order
function twistSends(): Array<{ linear_x: number; linear_y: number; angular_z: number }> {
  return capturedSend.mock.calls
    .map(([msg]) => {
      try {
        const p = JSON.parse(msg as string) as { type: string; linear_x: number; linear_y: number; angular_z: number };
        return p.type === 'twist' ? p : null;
      } catch {
        return null;
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeleopClient continuous publish (BUG 1)', () => {
  let client: TeleopClient;

  beforeEach(() => {
    vi.useFakeTimers();
    // Recreate client fresh; the Connection mock is reset automatically because
    // vi.mock factory re-runs per instantiation.
    client = new TeleopClient({ publishIntervalMs: 50, keepaliveIntervalMs: 200 });
    client.connect('ws://localhost:9090/ws');
    // Clear any sends that happened during connect() before test body runs
    capturedSend.mockClear();
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // TEST 1 — republish while held (with shaping applied)
  // -------------------------------------------------------------------------
  it('republishes the same twist continuously while a non-zero command is held', () => {
    // One explicit send sets the repeat state
    client.sendTwist(0.5, 0, 0);
    capturedSend.mockClear(); // clear the immediate send, count only timer-driven repeats

    // Advance 200 ms → 4 ticks at 50 ms each
    vi.advanceTimersByTime(200);

    // Expect at least 3 twist sends, all carrying shaped linear_x
    const shaped = shapeAxis(0.5);
    expect(shaped).toBeGreaterThan(0); // shape(0.5) yields non-zero cubic output
    const sends = twistSends();
    expect(sends.length).toBeGreaterThanOrEqual(3);
    for (const s of sends) {
      expect(s.linear_x).toBeCloseTo(shaped, 5);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 2 — stop burst then silence on release
  // -------------------------------------------------------------------------
  it('sends a burst of zero-twists after release then goes completely silent', () => {
    // Simulate sending a non-zero twist (held)
    client.sendTwist(0.5, 0, 0);
    vi.advanceTimersByTime(100); // some ticks while held

    // Release — send explicit zero
    capturedSend.mockClear();
    client.sendTwist(0, 0, 0);
    capturedSend.mockClear(); // clear the immediate zero send

    // Advance 600 ms → covers the full stop-burst window (STOP_REPEATS * 50ms = 500ms)
    vi.advanceTimersByTime(600);
    const stopBurstSends = twistSends();

    // Must have sent at least STOP_REPEATS zero-twists
    // (STOP_REPEATS = 10, each carrying linear_x/y/az = 0)
    expect(stopBurstSends.length).toBeGreaterThanOrEqual(10);
    for (const s of stopBurstSends) {
      expect(s.linear_x).toBe(0);
      expect(s.linear_y).toBe(0);
      expect(s.angular_z).toBe(0);
    }

    // After the burst exhausts, publisher must go silent.
    // Reset counter and advance 400 ms more — expect NO further twist sends.
    capturedSend.mockClear();
    vi.advanceTimersByTime(400);

    const afterSilence = twistSendCount();
    expect(afterSilence).toBe(0);
  });

  // -------------------------------------------------------------------------
  // TEST 3 — silent when no input
  // -------------------------------------------------------------------------
  it('sends zero twist messages when no sendTwist has been called', () => {
    // Fresh connect, no sendTwist calls at all
    capturedSend.mockClear();

    // Advance 1000 ms — only keepalive pings should fire, never twists
    vi.advanceTimersByTime(1000);

    expect(twistSendCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // TEST 4 — deadzone suppresses creep (no republish)
  // -------------------------------------------------------------------------
  it('suppresses republish when input is below deadzone', () => {
    // Send a value below deadzone (0.05 < 0.1); shapeAxis(0.05) returns 0
    client.sendTwist(0.05, 0, 0);
    capturedSend.mockClear(); // clear the immediate send

    // Advance 200 ms — publisher should send zero-burst (from stop-repeats)
    // because shapeAxis(0.05) === 0, so the repeat state is null and zeroFramesLeft
    // is set to STOP_REPEATS.
    vi.advanceTimersByTime(600); // enough to cover stop-burst window

    const sends = twistSends();
    // All sends must be zeros (from the stop-burst, not from creep-republish)
    for (const s of sends) {
      expect(s.linear_x).toBe(0);
      expect(s.linear_y).toBe(0);
      expect(s.angular_z).toBe(0);
    }
  });
});
