import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';

// The publisher applies a slew-rate (acceleration) limiter so the robot never
// jerks when a source commands a large velocity step. Accel ~0.5 s to full
// (0.1/tick at 20 Hz), decel ~0.2 s (0.25/tick); E-STOP bypasses to instant 0.
describe('TeleopClient velocity slew-rate limiter', () => {
  let published: Array<{ lx: number; ly: number; az: number; source: string }>;
  let client: TeleopClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', class MockWebSocket {
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    });
    published = [];
    client = new TeleopClient({
      onPublish: (lx, ly, az, source) => published.push({ lx, ly, az, source }),
      publishIntervalMs: 50,
    });
    client.connect('ws://test');
  });

  afterEach(() => {
    client.disconnect();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const tick = (n = 1) => { for (let i = 0; i < n; i++) vi.advanceTimersByTime(50); };

  it('ramps up gradually (~0.1/tick), it does not jump to the target', () => {
    client.sendTwist(1, 0, 0, 'gamepad');
    tick(1);
    expect(published.length).toBeGreaterThan(0);
    expect(published[0].lx).toBeCloseTo(0.1, 5);
    expect(published[0].source).toBe('gamepad');
    tick(1);
    expect(published[1].lx).toBeCloseTo(0.2, 5);
  });

  it('first published step after a big jump is bounded by the accel step', () => {
    client.sendTwist(1, 0, 0, 'gamepad');
    tick(1);
    expect(published[0].lx).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('reaches full speed after ~10 ticks and holds there', () => {
    client.sendTwist(1, 0, 0, 'gamepad');
    tick(12);
    expect(published[published.length - 1].lx).toBeCloseTo(1.0, 5);
  });

  it('ramps down sharply on release (~0.25/tick) and ends with a terminal zero', () => {
    client.sendTwist(1, 0, 0, 'gamepad');
    tick(12); // reach full
    published.length = 0;
    client.sendTwist(0, 0, 0, 'gamepad'); // release
    tick(1);
    expect(published[0].lx).toBeCloseTo(0.75, 5);
    tick(3); // 0.5, 0.25, 0.0
    expect(published[published.length - 1].lx).toBe(0);
  });

  it('goes silent once at rest (one terminal zero, then idle)', () => {
    client.sendTwist(1, 0, 0, 'gamepad');
    tick(12);
    client.sendTwist(0, 0, 0, 'gamepad');
    tick(10); // ramp down and settle to rest
    published.length = 0;
    tick(5); // already at rest — must not keep publishing
    expect(published.length).toBe(0);
  });

  it('E-STOP zeroes instantly with no ramp-down', () => {
    client.sendTwist(1, 0, 0, 'gamepad');
    tick(12); // full speed
    published.length = 0;
    client.engageEstop();
    tick(3);
    expect(published.length).toBe(0); // motion suppressed immediately, no decel tail
  });

  it('ramps each axis independently', () => {
    client.sendTwist(1, 0, 1, 'gamepad');
    tick(1);
    expect(published[0].lx).toBeCloseTo(0.1, 5);
    expect(published[0].az).toBeCloseTo(0.1, 5);
    expect(published[0].ly).toBe(0);
  });

  it('on direction reversal, ramps down through zero before building reverse speed', () => {
    client.sendTwist(1, 0, 0, 'gamepad');
    tick(12); // +1
    client.sendTwist(-1, 0, 0, 'gamepad'); // reverse target
    tick(20);
    const vals = published.map((p) => p.lx);
    expect(Math.min(...vals)).toBeCloseTo(-1.0, 5); // reaches full reverse
    expect(vals.some((v) => Math.abs(v) < 0.13)).toBe(true); // passed through ~0
  });
});
