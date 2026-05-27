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
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Test Bot","robot_namespace":"test_ns"}'
    );
    expect(result).toEqual({
      type: 'status',
      connected: true,
      robot_type: 'diff_drive',
      robot_name: 'Test Bot',
      robot_namespace: 'test_ns',
    });
  });

  it('parses status message with connected=false', () => {
    const result = parseMessage(
      '{"type":"status","connected":false,"robot_type":"ackermann","robot_name":"","robot_namespace":""}'
    );
    expect(result).toEqual({
      type: 'status',
      connected: false,
      robot_type: 'ackermann',
      robot_name: '',
      robot_namespace: '',
    });
  });

  it('status message without robot_name or robot_namespace defaults to empty string', () => {
    const result = parseMessage('{"type":"status","connected":true,"robot_type":"diff_drive"}');
    expect(result).toEqual({
      type: 'status',
      connected: true,
      robot_type: 'diff_drive',
      robot_name: '',
      robot_namespace: '',
    });
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

  it('parses odom message', () => {
    const msg = JSON.stringify({ type: 'odom', x: 1.5, y: -0.3, heading: 0.785 });
    expect(parseMessage(msg)).toEqual({ type: 'odom', x: 1.5, y: -0.3, heading: 0.785 });
  });

  it('ignores odom with missing fields — falls through to unknown', () => {
    const msg = JSON.stringify({ type: 'odom', x: 1.5 });
    const result = parseMessage(msg);
    expect(result.type).not.toBe('odom');
  });

  it('status message without connected field returns unknown', () => {
    const result = parseMessage(
      '{"type":"status","robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns"}'
    );
    expect(result.type).toBe('unknown');
  });

  it('status message with non-boolean connected field returns unknown', () => {
    const result = parseMessage(
      '{"type":"status","connected":"yes","robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns"}'
    );
    expect(result.type).toBe('unknown');
  });
});
