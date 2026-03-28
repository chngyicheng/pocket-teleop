import { describe, it, expect } from 'vitest';
import { buildTwist, buildPing, parseMessage } from '../src/protocol.js';

describe('buildTwist', () => {
  it('produces correct JSON field names and values', () => {
    const raw = buildTwist(0.5, -0.25, 1.0);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['type']).toBe('twist');
    expect(parsed['linear_x']).toBe(0.5);
    expect(parsed['linear_y']).toBe(-0.25);
    expect(parsed['angular_z']).toBe(1.0);
  });

  it('includes exactly four keys — no extra fields', () => {
    const parsed = JSON.parse(buildTwist(0, 0, 0)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toHaveLength(4);
  });

  it('zero values serialise as 0, not omitted', () => {
    const parsed = JSON.parse(buildTwist(0, 0, 0)) as Record<string, unknown>;
    expect(parsed['linear_x']).toBe(0);
    expect(parsed['linear_y']).toBe(0);
    expect(parsed['angular_z']).toBe(0);
  });
});

describe('buildPing', () => {
  it('produces {"type":"ping"}', () => {
    const parsed = JSON.parse(buildPing()) as Record<string, unknown>;
    expect(parsed['type']).toBe('ping');
    expect(Object.keys(parsed)).toHaveLength(1);
  });
});

describe('parseMessage', () => {
  it('parses pong message', () => {
    const result = parseMessage('{"type":"pong"}');
    expect(result).toEqual({ type: 'pong' });
  });

  it('parses status message with connected=true', () => {
    const result = parseMessage('{"type":"status","connected":true,"robot_type":"diff_drive"}');
    expect(result).toEqual({ type: 'status', connected: true, robot_type: 'diff_drive' });
  });

  it('parses status message with connected=false', () => {
    const result = parseMessage('{"type":"status","connected":false,"robot_type":"ackermann"}');
    expect(result).toEqual({ type: 'status', connected: false, robot_type: 'ackermann' });
  });

  it('parses error message', () => {
    const result = parseMessage('{"type":"error","message":"already connected"}');
    expect(result).toEqual({ type: 'error', message: 'already connected' });
  });

  it('parses unknown message type as unknown with raw string preserved', () => {
    const raw = '{"type":"future_message","data":42}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('parses invalid JSON as unknown with raw string preserved', () => {
    const raw = 'not {{ valid json';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });
});
