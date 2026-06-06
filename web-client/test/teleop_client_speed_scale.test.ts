/**
 * teleop_client_speed_scale.test.ts — speed scaling at send time
 *
 * Verifies that TeleopClient applies maxLinear/maxAngular scaling factors
 * at the choke point (immediate send + continuous publisher ticks), without
 * pre-scaling the stored repeatTwist state. Changing maxSpeed mid-hold takes
 * effect on the next tick; onTwist emits shaped-normalized values (un-scaled).
 *
 * TDD: write red, then implement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';
import { shapeAxis } from '../src/input_shaping.js';

// ---------------------------------------------------------------------------
// Connection mock — captures the send spy.
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
// Helper — extract twist payloads
// ---------------------------------------------------------------------------

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

describe('TeleopClient speed scaling', () => {
  let client: TeleopClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new TeleopClient({ publishIntervalMs: 50, keepaliveIntervalMs: 200 });
    client.connect('ws://localhost:9090/ws');
    capturedSend.mockClear();
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // TEST 1 — immediate send with linear scaling
  // -------------------------------------------------------------------------
  it('applies linear maxLinear scaling to immediate sendTwist', () => {
    client.setMaxSpeed(0.5, 1.0);

    client.sendTwist(1, 0, 0);

    const shaped = shapeAxis(1);
    const expected = shaped * 0.5;

    const sends = twistSends();
    expect(sends.length).toBeGreaterThan(0);
    const [first] = sends;
    expect(first.linear_x).toBeCloseTo(expected, 5);
  });

  // -------------------------------------------------------------------------
  // TEST 2 — immediate send with angular scaling
  // -------------------------------------------------------------------------
  it('applies angular maxAngular scaling to immediate sendTwist', () => {
    client.setMaxSpeed(1.0, 3.0);

    client.sendTwist(0, 0, 1);

    const shaped = shapeAxis(1);
    const expected = shaped * 3.0;

    const sends = twistSends();
    expect(sends.length).toBeGreaterThan(0);
    const [first] = sends;
    expect(first.angular_z).toBeCloseTo(expected, 5);
  });

  // -------------------------------------------------------------------------
  // TEST 3 — publisher tick scaling (held)
  // -------------------------------------------------------------------------
  it('applies scaling to publisher ticks while held', () => {
    client.setMaxSpeed(2.0, 1.0);

    client.sendTwist(0.5, 0, 0);
    capturedSend.mockClear(); // clear immediate send

    vi.advanceTimersByTime(150); // 3 ticks at 50 ms each

    const sends = twistSends();
    expect(sends.length).toBeGreaterThanOrEqual(2);

    const shaped = shapeAxis(0.5);
    const expected = shaped * 2.0;

    for (const s of sends) {
      expect(s.linear_x).toBeCloseTo(expected, 5);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 4 — mid-hold speed change takes effect next tick
  // -------------------------------------------------------------------------
  it('applies new maxSpeed on next tick when changed mid-hold', () => {
    client.setMaxSpeed(1.0, 1.0);
    client.sendTwist(0.5, 0, 0);
    capturedSend.mockClear();

    // One tick at old scale
    vi.advanceTimersByTime(50);
    const firstTick = twistSends()[0];
    const shaped = shapeAxis(0.5);
    expect(firstTick.linear_x).toBeCloseTo(shaped * 1.0, 5);

    // Change max speed while held
    capturedSend.mockClear();
    client.setMaxSpeed(2.0, 1.0);

    // Next tick should use new scale
    vi.advanceTimersByTime(50);
    const secondTick = twistSends()[0];
    expect(secondTick.linear_x).toBeCloseTo(shaped * 2.0, 5);
  });

  // -------------------------------------------------------------------------
  // TEST 5 — onTwist emits shaped-normalized (un-scaled) values
  // -------------------------------------------------------------------------
  it('emits shaped-normalized (un-scaled) values to onTwist callback', () => {
    const onTwist = vi.fn();
    const clientWithCallback = new TeleopClient({
      publishIntervalMs: 50,
      keepaliveIntervalMs: 200,
      onTwist,
    });
    clientWithCallback.connect('ws://localhost:9090/ws');
    clientWithCallback.setMaxSpeed(0.5, 1.0);

    clientWithCallback.sendTwist(1, 0, 0);

    const shaped = shapeAxis(1);
    expect(onTwist).toHaveBeenCalledWith(shaped, 0, 0); // should NOT be scaled
    expect(onTwist).not.toHaveBeenCalledWith(shaped * 0.5, 0, 0);

    clientWithCallback.disconnect();
  });

  // -------------------------------------------------------------------------
  // TEST 6 — both linear and angular scaling together
  // -------------------------------------------------------------------------
  it('applies both linear and angular scaling independently', () => {
    client.setMaxSpeed(0.5, 2.0);

    client.sendTwist(0.8, 0.8, 0.8);

    const shaped = shapeAxis(0.8);
    const sends = twistSends();
    const [first] = sends;

    expect(first.linear_x).toBeCloseTo(shaped * 0.5, 5);
    expect(first.linear_y).toBeCloseTo(shaped * 0.5, 5);
    expect(first.angular_z).toBeCloseTo(shaped * 2.0, 5);
  });

  // -------------------------------------------------------------------------
  // TEST 7 — zero send is unaffected by scale
  // -------------------------------------------------------------------------
  it('sends zero-twist correctly regardless of scale', () => {
    client.setMaxSpeed(0.5, 1.0);

    client.sendTwist(0, 0, 0);

    const sends = twistSends();
    for (const s of sends) {
      expect(s.linear_x).toBe(0);
      expect(s.linear_y).toBe(0);
      expect(s.angular_z).toBe(0);
    }
  });
});
