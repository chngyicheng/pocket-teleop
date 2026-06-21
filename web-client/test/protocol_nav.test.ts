import { describe, it, expect } from 'vitest';
import {
  buildNavGoal,
  buildNavPause,
  buildNavResume,
  buildNavCancel,
  parseMessage,
} from '../src/protocol.js';

describe('buildNavGoal', () => {
  it('produces correct JSON with x, y, heading', () => {
    const raw = buildNavGoal(10.5, -20.3, 1.57);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['type']).toBe('nav_goal');
    expect(parsed['x']).toBe(10.5);
    expect(parsed['y']).toBe(-20.3);
    expect(parsed['heading']).toBe(1.57);
  });

  it('includes exactly four keys', () => {
    const parsed = JSON.parse(buildNavGoal(0, 0, 0)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toHaveLength(4);
  });
});

describe('buildNavPause', () => {
  it('produces {"type":"nav_pause"}', () => {
    const parsed = JSON.parse(buildNavPause()) as Record<string, unknown>;
    expect(parsed['type']).toBe('nav_pause');
    expect(Object.keys(parsed)).toHaveLength(1);
  });
});

describe('buildNavResume', () => {
  it('produces {"type":"nav_resume"}', () => {
    const parsed = JSON.parse(buildNavResume()) as Record<string, unknown>;
    expect(parsed['type']).toBe('nav_resume');
    expect(Object.keys(parsed)).toHaveLength(1);
  });
});

describe('buildNavCancel', () => {
  it('produces {"type":"nav_cancel"}', () => {
    const parsed = JSON.parse(buildNavCancel()) as Record<string, unknown>;
    expect(parsed['type']).toBe('nav_cancel');
    expect(Object.keys(parsed)).toHaveLength(1);
  });
});

describe('parseMessage nav_state', () => {
  it('parses valid nav_state idle', () => {
    const result = parseMessage('{"type":"nav_state","state":"idle"}');
    expect(result).toEqual({ type: 'nav_state', state: 'idle' });
  });

  it('parses valid nav_state active', () => {
    const result = parseMessage('{"type":"nav_state","state":"active"}');
    expect(result).toEqual({ type: 'nav_state', state: 'active' });
  });

  it('parses valid nav_state paused', () => {
    const result = parseMessage('{"type":"nav_state","state":"paused"}');
    expect(result).toEqual({ type: 'nav_state', state: 'paused' });
  });

  it('returns unknown for invalid state value', () => {
    const result = parseMessage('{"type":"nav_state","state":"unknown_state"}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for missing state field', () => {
    const result = parseMessage('{"type":"nav_state"}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for non-string state', () => {
    const result = parseMessage('{"type":"nav_state","state":123}');
    expect(result.type).toBe('unknown');
  });
});

describe('parseMessage nav_path', () => {
  it('parses valid nav_path with points', () => {
    const result = parseMessage('{"type":"nav_path","points":[[1.0,2.0],[3.5,4.5]]}');
    expect(result).toEqual({
      type: 'nav_path',
      points: [
        [1.0, 2.0],
        [3.5, 4.5],
      ],
    });
  });

  it('parses valid empty nav_path', () => {
    const result = parseMessage('{"type":"nav_path","points":[]}');
    expect(result).toEqual({ type: 'nav_path', points: [] });
  });

  it('returns unknown if points is not array', () => {
    const result = parseMessage('{"type":"nav_path","points":"not_array"}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown if point element is not array', () => {
    const result = parseMessage('{"type":"nav_path","points":[{"x":1,"y":2}]}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown if point element has wrong length', () => {
    const result = parseMessage('{"type":"nav_path","points":[[1.0]]}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown if point element has more than 2 values', () => {
    const result = parseMessage('{"type":"nav_path","points":[[1.0,2.0,3.0]]}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown if first element is not finite', () => {
    const result = parseMessage('{"type":"nav_path","points":[[NaN,2.0]]}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown if second element is not finite', () => {
    const result = parseMessage('{"type":"nav_path","points":[[1.0,Infinity]]}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown if element is not number', () => {
    const result = parseMessage('{"type":"nav_path","points":[["1.0",2.0]]}');
    expect(result.type).toBe('unknown');
  });

  it('returns unknown if points field is missing', () => {
    const result = parseMessage('{"type":"nav_path"}');
    expect(result.type).toBe('unknown');
  });
});
