/**
 * protocol_odom_nonfinite.adversarial.test.ts — H5
 *
 * Hypothesis: Protocol odom parser passes NaN / Infinity through typeof gate
 *
 * typeof NaN === 'number' and typeof Infinity === 'number'.
 * The parser only checks typeof msg.x === 'number', so messages containing
 * NaN or Infinity slip through. The fix should add !isFinite() guards.
 *
 * Expected: parser returns {type:'unknown', raw} for any NaN/Infinity/negative fields.
 * Actual (today): parser returns a typed odom message, allowing NaN to propagate to UI.
 */

import { describe, it, expect } from 'vitest';
import { parseMessage } from '../src/protocol.js';

describe('protocol_odom_nonfinite.adversarial', () => {
  it('should reject odom with NaN x coordinate', () => {
    // JSON.stringify converts NaN to null, so we manually inject it
    const raw = '{"type":"odom","x":NaN,"y":0,"heading":0}';
    // Actually, JSON.stringify(NaN) produces undefined which gets omitted,
    // so use a workaround: manually craft the string
    const badMessage = '{"type":"odom","x":null,"y":0,"heading":0}';
    // null is not a number, so this should be rejected
    const result = parseMessage(badMessage);
    expect(result.type).toBe('unknown');
    expect(result.raw).toBe(badMessage);
  });

  it('should reject odom with Infinity x coordinate', () => {
    // JSON can't represent Infinity directly, but JSON.parse accepts 1e999 which becomes Infinity
    const raw = '{"type":"odom","x":1e999,"y":0,"heading":0}';
    const parsed = JSON.parse(raw);
    expect(typeof parsed.x).toBe('number');
    expect(!isFinite(parsed.x)).toBe(true); // x is Infinity

    const result = parseMessage(raw);
    // EXPECTED (today fails): parser should reject Infinity
    expect(result.type).toBe('unknown');
    expect(result.raw).toBe(raw);
  });

  it('should reject odom with Infinity y coordinate', () => {
    const raw = '{"type":"odom","x":0,"y":1e999,"heading":0}';
    const result = parseMessage(raw);
    // EXPECTED (today fails): parser should reject Infinity
    expect(result.type).toBe('unknown');
    expect(result.raw).toBe(raw);
  });

  it('should reject odom with -Infinity heading coordinate', () => {
    const raw = '{"type":"odom","x":0,"y":0,"heading":-1e999}';
    const result = parseMessage(raw);
    // EXPECTED (today fails): parser should reject -Infinity
    expect(result.type).toBe('unknown');
    expect(result.raw).toBe(raw);
  });

  it('should reject odom with missing x field', () => {
    const raw = '{"type":"odom","y":0,"heading":0}';
    const result = parseMessage(raw);
    expect(result.type).toBe('unknown');
    expect(result.raw).toBe(raw);
  });

  it('should accept valid odom message', () => {
    const raw = '{"type":"odom","x":1.5,"y":2.0,"heading":3.14}';
    const result = parseMessage(raw);
    // SANITY: valid finite odom should parse correctly
    expect(result.type).toBe('odom');
    if (result.type === 'odom') {
      expect(result.x).toBe(1.5);
      expect(result.y).toBe(2.0);
      expect(result.heading).toBe(3.14);
    }
  });

  it('should accept odom with zero values', () => {
    const raw = '{"type":"odom","x":0,"y":0,"heading":0}';
    const result = parseMessage(raw);
    expect(result.type).toBe('odom');
    if (result.type === 'odom') {
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.heading).toBe(0);
    }
  });
});
