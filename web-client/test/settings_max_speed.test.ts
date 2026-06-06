/**
 * settings_max_speed.test.ts — max speed persistence and clamping
 *
 * Verifies that loadMaxSpeed / saveMaxSpeed work correctly:
 * - round-trip save → load
 * - clamping to limits
 * - defaults when absent or corrupt
 * - try/catch swallowing
 *
 * TDD: write red, then implement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadMaxSpeed, saveMaxSpeed, SPEED_LIMITS, clampLinear, clampAngular } from '../src/settings.js';

describe('settings max speed', () => {
  beforeEach(() => {
    // Stub localStorage for each test
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // TEST 1 — clamping helpers exist
  // -------------------------------------------------------------------------
  it('exports clampLinear and clampAngular functions', () => {
    expect(typeof clampLinear).toBe('function');
    expect(typeof clampAngular).toBe('function');
  });

  // -------------------------------------------------------------------------
  // TEST 2 — clampLinear within bounds
  // -------------------------------------------------------------------------
  it('clampLinear clamps to [0.1, 2.0] and rounds to 1 decimal', () => {
    expect(clampLinear(0.05)).toBe(0.1); // below min
    expect(clampLinear(0.1)).toBe(0.1); // at min
    expect(clampLinear(1.0)).toBe(1.0); // middle
    expect(clampLinear(2.0)).toBe(2.0); // at max
    expect(clampLinear(3.0)).toBe(2.0); // above max
    expect(clampLinear(1.234)).toBeCloseTo(1.2, 1); // rounding
  });

  // -------------------------------------------------------------------------
  // TEST 3 — clampAngular within bounds
  // -------------------------------------------------------------------------
  it('clampAngular clamps to [0.1, 3.0] and rounds to 1 decimal', () => {
    expect(clampAngular(0.05)).toBe(0.1); // below min
    expect(clampAngular(0.1)).toBe(0.1); // at min
    expect(clampAngular(1.5)).toBe(1.5); // middle
    expect(clampAngular(3.0)).toBe(3.0); // at max
    expect(clampAngular(4.0)).toBe(3.0); // above max
    expect(clampAngular(1.567)).toBeCloseTo(1.6, 1); // rounding
  });

  // -------------------------------------------------------------------------
  // TEST 4 — SPEED_LIMITS constant
  // -------------------------------------------------------------------------
  it('exports SPEED_LIMITS constant with correct bounds', () => {
    expect(SPEED_LIMITS.linMin).toBe(0.1);
    expect(SPEED_LIMITS.linMax).toBe(2.0);
    expect(SPEED_LIMITS.angMin).toBe(0.1);
    expect(SPEED_LIMITS.angMax).toBe(3.0);
    expect(SPEED_LIMITS.step).toBe(0.1);
  });

  // -------------------------------------------------------------------------
  // TEST 5 — default when absent
  // -------------------------------------------------------------------------
  it('returns default {maxLinear: 1.0, maxAngular: 1.0} when localStorage is empty', () => {
    const result = loadMaxSpeed();
    expect(result.maxLinear).toBe(1.0);
    expect(result.maxAngular).toBe(1.0);
  });

  // -------------------------------------------------------------------------
  // TEST 6 — round-trip save and load
  // -------------------------------------------------------------------------
  it('saves and loads max speed values correctly', () => {
    const original = { maxLinear: 0.5, maxAngular: 2.0 };
    saveMaxSpeed(original);

    const loaded = loadMaxSpeed();
    expect(loaded.maxLinear).toBe(0.5);
    expect(loaded.maxAngular).toBe(2.0);
  });

  // -------------------------------------------------------------------------
  // TEST 7 — clamping on save
  // -------------------------------------------------------------------------
  it('clamps values before saving', () => {
    saveMaxSpeed({ maxLinear: 3.0, maxAngular: 5.0 }); // exceeds limits

    const loaded = loadMaxSpeed();
    expect(loaded.maxLinear).toBe(2.0); // clamped to max
    expect(loaded.maxAngular).toBe(3.0); // clamped to max
  });

  // -------------------------------------------------------------------------
  // TEST 8 — clamping on load when stored values exceed limits
  // -------------------------------------------------------------------------
  it('clamps values when loading if they exceed limits', () => {
    // Directly set localStorage to simulate an old/corrupt value
    (localStorage as any).setItem('pocket-teleop.max-speed', JSON.stringify({ maxLinear: 3.0, maxAngular: 5.0 }));

    const loaded = loadMaxSpeed();
    expect(loaded.maxLinear).toBe(2.0);
    expect(loaded.maxAngular).toBe(3.0);
  });

  // -------------------------------------------------------------------------
  // TEST 9 — default when corrupt JSON
  // -------------------------------------------------------------------------
  it('returns default when stored JSON is invalid', () => {
    (localStorage as any).setItem('pocket-teleop.max-speed', '{invalid json}');

    const loaded = loadMaxSpeed();
    expect(loaded.maxLinear).toBe(1.0);
    expect(loaded.maxAngular).toBe(1.0);
  });

  // -------------------------------------------------------------------------
  // TEST 10 — default when missing keys
  // -------------------------------------------------------------------------
  it('returns default when stored object is missing keys', () => {
    (localStorage as any).setItem('pocket-teleop.max-speed', JSON.stringify({ maxLinear: 0.5 })); // missing maxAngular

    const loaded = loadMaxSpeed();
    // Should treat as corrupt and default
    expect(loaded.maxLinear).toBe(1.0);
    expect(loaded.maxAngular).toBe(1.0);
  });

  // -------------------------------------------------------------------------
  // TEST 11 — clamping prevents below-min on load
  // -------------------------------------------------------------------------
  it('clamps below-min values on load', () => {
    (localStorage as any).setItem('pocket-teleop.max-speed', JSON.stringify({ maxLinear: 0.05, maxAngular: 0.05 }));

    const loaded = loadMaxSpeed();
    expect(loaded.maxLinear).toBe(0.1);
    expect(loaded.maxAngular).toBe(0.1);
  });

  // -------------------------------------------------------------------------
  // TEST 12 — localStorage exception handling on save
  // -------------------------------------------------------------------------
  it('silently ignores localStorage.setItem exceptions', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error('quota exceeded'); },
      getItem: () => null,
      removeItem: () => {},
    });

    // Should not throw
    expect(() => saveMaxSpeed({ maxLinear: 1.0, maxAngular: 1.0 })).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // TEST 13 — localStorage exception handling on load
  // -------------------------------------------------------------------------
  it('silently ignores localStorage.getItem exceptions and returns default', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('not available'); },
      setItem: () => {},
      removeItem: () => {},
    });

    const loaded = loadMaxSpeed();
    expect(loaded.maxLinear).toBe(1.0);
    expect(loaded.maxAngular).toBe(1.0);
  });

  // -------------------------------------------------------------------------
  // TEST 14 — negative values clamped to min
  // -------------------------------------------------------------------------
  it('clamps negative values to minimum', () => {
    expect(clampLinear(-1.0)).toBe(0.1);
    expect(clampAngular(-5.0)).toBe(0.1);
  });
});
