import { describe, it, expect } from 'vitest';
import { buildTwist, buildPing, buildEstop, buildEstopReset, parseMessage } from '../src/protocol.js';

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

describe('buildEstop', () => {
  it('produces {"type":"estop"}', () => {
    const parsed = JSON.parse(buildEstop()) as Record<string, unknown>;
    expect(parsed['type']).toBe('estop');
    expect(Object.keys(parsed)).toHaveLength(1);
  });
});

describe('buildEstopReset', () => {
  it('produces {"type":"estop_reset"}', () => {
    const parsed = JSON.parse(buildEstopReset()) as Record<string, unknown>;
    expect(parsed['type']).toBe('estop_reset');
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

  it('parses estop_state engaged=true', () => {
    const result = parseMessage('{"type":"estop_state","engaged":true}');
    expect(result).toEqual({ type: 'estop_state', engaged: true });
  });

  it('parses estop_state engaged=false', () => {
    const result = parseMessage('{"type":"estop_state","engaged":false}');
    expect(result).toEqual({ type: 'estop_state', engaged: false });
  });

  it('estop_state with non-boolean engaged returns unknown', () => {
    const raw = '{"type":"estop_state","engaged":"yes"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('estop_state with missing engaged field returns unknown', () => {
    const raw = '{"type":"estop_state"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  // pose message tests
  it('parses pose message with map frame', () => {
    const result = parseMessage('{"type":"pose","frame":"map","x":1.5,"y":-0.3,"heading":0.785}');
    expect(result).toEqual({
      type: 'pose',
      frame: 'map',
      x: 1.5,
      y: -0.3,
      heading: 0.785,
    });
  });

  it('parses pose message with odom frame', () => {
    const result = parseMessage('{"type":"pose","frame":"odom","x":0,"y":0,"heading":0}');
    expect(result).toEqual({
      type: 'pose',
      frame: 'odom',
      x: 0,
      y: 0,
      heading: 0,
    });
  });

  it('pose message with missing x field returns unknown', () => {
    const raw = '{"type":"pose","frame":"map","y":-0.3,"heading":0.785}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('pose message with missing y field returns unknown', () => {
    const raw = '{"type":"pose","frame":"map","x":1.5,"heading":0.785}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('pose message with missing heading field returns unknown', () => {
    const raw = '{"type":"pose","frame":"map","x":1.5,"y":-0.3}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('pose message with missing frame field returns unknown', () => {
    const raw = '{"type":"pose","x":1.5,"y":-0.3,"heading":0.785}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('pose message with invalid frame value returns unknown', () => {
    const raw = '{"type":"pose","frame":"invalid","x":1.5,"y":-0.3,"heading":0.785}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('pose message with NaN x returns unknown', () => {
    const raw = '{"type":"pose","frame":"map","x":null,"y":-0.3,"heading":0.785}';
    const result = parseMessage(raw);
    expect(result.type).toBe('unknown');
  });

  it('pose message with non-finite heading returns unknown', () => {
    const raw = '{"type":"pose","frame":"map","x":1.5,"y":-0.3,"heading":"inf"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  // map message tests
  it('parses map message with valid cells', () => {
    const result = parseMessage(
      '{"type":"map","resolution":0.05,"width":200,"height":200,"origin_x":-5.0,"origin_y":-5.0,"cells":"u100f50o10"}'
    );
    expect(result).toEqual({
      type: 'map',
      resolution: 0.05,
      width: 200,
      height: 200,
      origin_x: -5.0,
      origin_y: -5.0,
      cells: 'u100f50o10',
    });
  });

  it('map message with resolution <= 0 returns unknown', () => {
    const raw = '{"type":"map","resolution":0,"width":200,"height":200,"origin_x":-5.0,"origin_y":-5.0,"cells":"u40000"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with negative resolution returns unknown', () => {
    const raw = '{"type":"map","resolution":-0.05,"width":200,"height":200,"origin_x":-5.0,"origin_y":-5.0,"cells":"u40000"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with zero width returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"width":0,"height":200,"origin_x":-5.0,"origin_y":-5.0,"cells":""}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with non-integer width returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"width":200.5,"height":200,"origin_x":-5.0,"origin_y":-5.0,"cells":"u40000"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with zero height returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"width":200,"height":0,"origin_x":-5.0,"origin_y":-5.0,"cells":""}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with non-integer height returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"width":200,"height":200.5,"origin_x":-5.0,"origin_y":-5.0,"cells":"u40000"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with non-finite origin_x returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"width":200,"height":200,"origin_x":null,"origin_y":-5.0,"cells":"u40000"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with non-finite origin_y returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"width":200,"height":200,"origin_x":-5.0,"origin_y":null,"cells":"u40000"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with non-string cells returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"width":200,"height":200,"origin_x":-5.0,"origin_y":-5.0,"cells":123}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with missing resolution returns unknown', () => {
    const raw = '{"type":"map","width":200,"height":200,"origin_x":-5.0,"origin_y":-5.0,"cells":"u40000"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with missing width returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"height":200,"origin_x":-5.0,"origin_y":-5.0,"cells":"u40000"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('map message with missing cells returns unknown', () => {
    const raw = '{"type":"map","resolution":0.05,"width":200,"height":200,"origin_x":-5.0,"origin_y":-5.0}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  // scan message tests
  it('parses scan message with valid ranges', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,2.0,1.8,2.1]}'
    );
    expect(result).toEqual({
      type: 'scan',
      angle_min: -1.57,
      angle_increment: 0.01,
      range_max: 10.0,
      ranges: [1.5, 2.0, 1.8, 2.1],
    });
  });

  it('parses scan message with empty ranges', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":0,"angle_increment":0.01,"range_max":10.0,"ranges":[]}'
    );
    expect(result).toEqual({
      type: 'scan',
      angle_min: 0,
      angle_increment: 0.01,
      range_max: 10.0,
      ranges: [],
    });
  });

  it('scan message with non-finite angle_min returns unknown', () => {
    const raw = '{"type":"scan","angle_min":null,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with non-finite angle_increment returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"angle_increment":null,"range_max":10.0,"ranges":[1.5]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with range_max <= 0 returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":0,"ranges":[1.5]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with non-finite range_max returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":null,"ranges":[1.5]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with ranges containing non-numbers returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,"bad",2.0]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with ranges containing NaN returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,null,2.0]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with non-array ranges returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":{"0":1.5}}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with missing angle_min returns unknown', () => {
    const raw = '{"type":"scan","angle_increment":0.01,"range_max":10.0,"ranges":[1.5]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with missing angle_increment returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"range_max":10.0,"ranges":[1.5]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with missing range_max returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"ranges":[1.5]}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('scan message with missing ranges returns unknown', () => {
    const raw = '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });
});
