/**
 * teleop_client_continuous_publish.test.ts — BUG 1 regression guard
 *
 * Verifies that TeleopClient publishes cmd_vel continuously (20 Hz) while a
 * joystick is held, decelerates smoothly to a terminal zero on release (the
 * slew limiter replaced the old fixed zero-burst), then goes silent.
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
  // TEST 2 — decelerate to zero on release, ending with a terminal zero, then silence
  // -------------------------------------------------------------------------
  it('ramps down to a terminal zero after release then goes completely silent', () => {
    // Hold full speed and let the slew limiter ramp up.
    client.sendTwist(1, 0, 0);
    vi.advanceTimersByTime(700); // reach full

    // Release — the publisher now decelerates smoothly (the old fixed zero-burst
    // is replaced by the decel ramp), ending with exactly one zero, then silence.
    capturedSend.mockClear();
    client.sendTwist(0, 0, 0);

    vi.advanceTimersByTime(600); // cover the decel ramp
    const sends = twistSends();
    expect(sends.length).toBeGreaterThan(0);

    // Decel is monotonic non-increasing and lands on exactly zero.
    for (let i = 1; i < sends.length; i++) {
      expect(sends[i].linear_x).toBeLessThanOrEqual(sends[i - 1].linear_x + 1e-9);
    }
    expect(sends[sends.length - 1].linear_x).toBe(0);
    // Decel (~0.25/tick) is sharper than accel: reaches rest within ~6 ticks.
    expect(sends.length).toBeLessThanOrEqual(6);

    // After settling to rest the publisher must go silent.
    capturedSend.mockClear();
    vi.advanceTimersByTime(400);
    expect(twistSendCount()).toBe(0);
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
    capturedSend.mockClear();

    // shapeAxis(0.05) === 0, so the target is zero and currentTwist never leaves
    // rest — the publisher stays silent (no creep republish).
    vi.advanceTimersByTime(600);

    const sends = twistSends();
    // Any send that does occur must be zero (never a creep-republish).
    for (const s of sends) {
      expect(s.linear_x).toBe(0);
      expect(s.linear_y).toBe(0);
      expect(s.angular_z).toBe(0);
    }
  });
});
