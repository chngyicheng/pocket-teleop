/**
 * input_shaping.test.ts — deadzone + cubic curve pure-function tests
 *
 * Verifies shapeAxis: handles deadzone discontinuity, preserves full scale,
 * applies cubic curve for fine low-speed control.
 */

import { describe, it, expect } from 'vitest';
import { shapeAxis } from '../src/input_shaping.js';

describe('shapeAxis (deadzone + cubic curve)', () => {
  // -------------------------------------------------------------------------
  // Deadzone tests — values below 0.1 must return 0 (no creep)
  // -------------------------------------------------------------------------
  it('returns 0 for values below deadzone (0.1)', () => {
    expect(shapeAxis(0)).toBe(0);
    expect(shapeAxis(0.05)).toBe(0);
    expect(shapeAxis(-0.05)).toBe(0);
    expect(shapeAxis(0.09)).toBe(0);
    expect(shapeAxis(-0.09)).toBe(0);
  });

  it('returns ~0 just above deadzone boundary', () => {
    // Just above boundary: (0.11 - 0.1) / 0.9 = 0.01/0.9 ≈ 0.0111, 0.0111^3 ≈ 1.37e-6
    expect(Math.abs(shapeAxis(0.11))).toBeLessThan(0.001);
    expect(Math.abs(shapeAxis(-0.11))).toBeLessThan(0.001);
  });

  // -------------------------------------------------------------------------
  // Full-scale preservation — keyboard/max input unchanged
  // -------------------------------------------------------------------------
  it('preserves full scale (1 and -1)', () => {
    expect(shapeAxis(1)).toBe(1);
    expect(shapeAxis(-1)).toBe(-1);
  });

  // -------------------------------------------------------------------------
  // Cubic curve — fine control near zero, ramps up smoothly
  // -------------------------------------------------------------------------
  it('applies cubic curve: rescaled=(0.55-0.1)/0.9=0.5, 0.5^3=0.125', () => {
    expect(shapeAxis(0.55)).toBeCloseTo(0.125, 5);
  });

  it('applies cubic curve: rescaled=(0.7-0.1)/0.9=2/3, (2/3)^3≈0.296', () => {
    expect(shapeAxis(0.7)).toBeCloseTo(0.296296, 5);
  });

  // -------------------------------------------------------------------------
  // Sign symmetry — shapeAxis(-x) === -shapeAxis(x)
  // -------------------------------------------------------------------------
  it('preserves sign (negatives symmetric)', () => {
    expect(shapeAxis(-0.55)).toBeCloseTo(-shapeAxis(0.55), 5);
    expect(shapeAxis(-0.7)).toBeCloseTo(-shapeAxis(0.7), 5);
  });

  // -------------------------------------------------------------------------
  // Monotonicity — larger inputs always yield larger outputs
  // -------------------------------------------------------------------------
  it('is monotonically increasing', () => {
    expect(shapeAxis(0.8)).toBeGreaterThan(shapeAxis(0.5));
    expect(shapeAxis(0.5)).toBeGreaterThan(0);
    expect(shapeAxis(0.9)).toBeGreaterThan(shapeAxis(0.8));
  });

  // -------------------------------------------------------------------------
  // Additional coverage — intermediate values
  // -------------------------------------------------------------------------
  it('handles intermediate values correctly', () => {
    // Cubic curve: input 0.3 yields small output
    const v03 = shapeAxis(0.3);
    expect(v03).toBeGreaterThan(0.005);
    expect(v03).toBeLessThan(0.015);

    // Input 0.5 yields larger output
    const v05 = shapeAxis(0.5);
    expect(v05).toBeGreaterThan(0.08);
    expect(v05).toBeLessThan(0.09);
  });
});
