/**
 * network_readout.test.ts — networkReadoutModel unit tests
 *
 * Tests the pure function that computes network readout display tier
 * based on quality score (0-4 integer).
 */

import { describe, it, expect } from 'vitest';
import { networkReadoutModel, type SignalTier } from '../src/network_readout.js';

describe('networkReadoutModel', () => {
  // -------------------------------------------------------------------------
  // Null quality tests
  // -------------------------------------------------------------------------
  it('returns null quality and none tier when quality is null', () => {
    const result = networkReadoutModel(null);
    expect(result.quality).toBeNull();
    expect(result.tier).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Non-finite quality tests
  // -------------------------------------------------------------------------
  it('returns null quality and none tier when quality is NaN', () => {
    const result = networkReadoutModel(NaN);
    expect(result.quality).toBeNull();
    expect(result.tier).toBe('none');
  });

  it('returns null quality and none tier when quality is Infinity', () => {
    const result = networkReadoutModel(Infinity);
    expect(result.quality).toBeNull();
    expect(result.tier).toBe('none');
  });

  it('returns null quality and none tier when quality is -Infinity', () => {
    const result = networkReadoutModel(-Infinity);
    expect(result.quality).toBeNull();
    expect(result.tier).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Non-integer quality tests
  // -------------------------------------------------------------------------
  it('returns null quality and none tier when quality is 2.5 (non-integer)', () => {
    const result = networkReadoutModel(2.5);
    expect(result.quality).toBeNull();
    expect(result.tier).toBe('none');
  });

  it('returns null quality and none tier when quality is 1.1 (non-integer)', () => {
    const result = networkReadoutModel(1.1);
    expect(result.quality).toBeNull();
    expect(result.tier).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Quality score 0 → danger tier
  // -------------------------------------------------------------------------
  it('returns danger tier when quality is 0', () => {
    const result = networkReadoutModel(0);
    expect(result.quality).toBe(0);
    expect(result.tier).toBe('danger');
  });

  // -------------------------------------------------------------------------
  // Quality scores 1–2 → warn tier
  // -------------------------------------------------------------------------
  it('returns warn tier when quality is 1', () => {
    const result = networkReadoutModel(1);
    expect(result.quality).toBe(1);
    expect(result.tier).toBe('warn');
  });

  it('returns warn tier when quality is 2', () => {
    const result = networkReadoutModel(2);
    expect(result.quality).toBe(2);
    expect(result.tier).toBe('warn');
  });

  // -------------------------------------------------------------------------
  // Quality scores 3–4 → ok tier
  // -------------------------------------------------------------------------
  it('returns ok tier when quality is 3', () => {
    const result = networkReadoutModel(3);
    expect(result.quality).toBe(3);
    expect(result.tier).toBe('ok');
  });

  it('returns ok tier when quality is 4', () => {
    const result = networkReadoutModel(4);
    expect(result.quality).toBe(4);
    expect(result.tier).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Out-of-range integer values
  // -------------------------------------------------------------------------
  it('returns none tier when quality is -1 (out of range)', () => {
    const result = networkReadoutModel(-1);
    expect(result.quality).toBeNull();
    expect(result.tier).toBe('none');
  });

  it('returns none tier when quality is 5 (out of range)', () => {
    const result = networkReadoutModel(5);
    expect(result.quality).toBeNull();
    expect(result.tier).toBe('none');
  });
});
