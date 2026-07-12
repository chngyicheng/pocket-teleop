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
      robot_length: 0,
      robot_width: 0,
      disconnect_action: 'stop',
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
      robot_length: 0,
      robot_width: 0,
      disconnect_action: 'stop',
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
      robot_length: 0,
      robot_width: 0,
      disconnect_action: 'stop',
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

  it('status message with valid robot_length and robot_width', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","robot_length":0.281,"robot_width":0.306}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.robot_length).toBe(0.281);
      expect(result.robot_width).toBe(0.306);
    }
  });

  it('status message with missing robot_length defaults to 0', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","robot_width":0.306}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.robot_length).toBe(0);
      expect(result.robot_width).toBe(0.306);
    }
  });

  it('status message with missing robot_width defaults to 0', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","robot_length":0.281}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.robot_length).toBe(0.281);
      expect(result.robot_width).toBe(0);
    }
  });

  it('status message with negative robot_length defaults to 0', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","robot_length":-0.5,"robot_width":0.306}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.robot_length).toBe(0);
      expect(result.robot_width).toBe(0.306);
    }
  });

  it('status message with robot_length = 0 defaults to 0', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","robot_length":0,"robot_width":0.306}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.robot_length).toBe(0);
    }
  });

  it('status message with NaN robot_length defaults to 0', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","robot_length":null,"robot_width":0.306}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.robot_length).toBe(0);
    }
  });

  it('status message with string robot_length defaults to 0', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","robot_length":"0.281","robot_width":0.306}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.robot_length).toBe(0);
      expect(result.robot_width).toBe(0.306);
    }
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

  // scan message with pose tests
  it('scan message with complete pose (map frame)', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,2.0],"pose_frame":"map","pose_x":1.5,"pose_y":-0.3,"pose_heading":0.785}'
    );
    expect(result.type).toBe('scan');
    if (result.type === 'scan') {
      expect(result.angle_min).toBe(-1.57);
      expect(result.angle_increment).toBe(0.01);
      expect(result.range_max).toBe(10.0);
      expect(result.ranges).toEqual([1.5, 2.0]);
      expect(result.pose).toEqual({
        frame: 'map',
        x: 1.5,
        y: -0.3,
        heading: 0.785,
      });
    }
  });

  it('scan message with complete pose (odom frame)', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":0,"angle_increment":0.01,"range_max":10.0,"ranges":[],"pose_frame":"odom","pose_x":0,"pose_y":0,"pose_heading":0}'
    );
    expect(result.type).toBe('scan');
    if (result.type === 'scan') {
      expect(result.pose).toEqual({
        frame: 'odom',
        x: 0,
        y: 0,
        heading: 0,
      });
    }
  });

  it('scan message missing pose_heading still parses scan (backward compatible)', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,2.0],"pose_frame":"map","pose_x":1.5,"pose_y":-0.3}'
    );
    expect(result.type).toBe('scan');
    if (result.type === 'scan') {
      expect(result.angle_min).toBe(-1.57);
      expect(result.ranges).toEqual([1.5, 2.0]);
      expect(result.pose).toBeUndefined();
    }
  });

  it('scan message with invalid pose_frame (not map/odom) has no pose', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,2.0],"pose_frame":"world","pose_x":1.5,"pose_y":-0.3,"pose_heading":0.785}'
    );
    expect(result.type).toBe('scan');
    if (result.type === 'scan') {
      expect(result.angle_min).toBe(-1.57);
      expect(result.ranges).toEqual([1.5, 2.0]);
      expect(result.pose).toBeUndefined();
    }
  });

  it('scan message with non-finite pose_x has no pose', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,2.0],"pose_frame":"map","pose_x":null,"pose_y":-0.3,"pose_heading":0.785}'
    );
    expect(result.type).toBe('scan');
    if (result.type === 'scan') {
      expect(result.angle_min).toBe(-1.57);
      expect(result.pose).toBeUndefined();
    }
  });

  it('scan message with non-finite pose_y has no pose', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,2.0],"pose_frame":"map","pose_x":1.5,"pose_y":"inf","pose_heading":0.785}'
    );
    expect(result.type).toBe('scan');
    if (result.type === 'scan') {
      expect(result.angle_min).toBe(-1.57);
      expect(result.pose).toBeUndefined();
    }
  });

  it('scan message with non-finite pose_heading has no pose', () => {
    const result = parseMessage(
      '{"type":"scan","angle_min":-1.57,"angle_increment":0.01,"range_max":10.0,"ranges":[1.5,2.0],"pose_frame":"map","pose_x":1.5,"pose_y":-0.3,"pose_heading":null}'
    );
    expect(result.type).toBe('scan');
    if (result.type === 'scan') {
      expect(result.angle_min).toBe(-1.57);
      expect(result.pose).toBeUndefined();
    }
  });

  // disconnect_action tests
  it('status message with disconnect_action="hold" parses correctly', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","disconnect_action":"hold"}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.disconnect_action).toBe('hold');
    }
  });

  it('status message with disconnect_action="return_home" parses correctly', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","disconnect_action":"return_home"}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.disconnect_action).toBe('return_home');
    }
  });

  it('status message with disconnect_action="continue" parses correctly', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","disconnect_action":"continue"}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.disconnect_action).toBe('continue');
    }
  });

  it('status message missing disconnect_action defaults to "stop"', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns"}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.disconnect_action).toBe('stop');
    }
  });

  it('status message with disconnect_action=null defaults to "stop"', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Bot","robot_namespace":"ns","disconnect_action":null}'
    );
    expect(result.type).toBe('status');
    if (result.type === 'status') {
      expect(result.disconnect_action).toBe('stop');
    }
  });

  // battery message tests
  it('parses battery message with valid percentage, voltage, current, charging', () => {
    const result = parseMessage(
      '{"type":"battery","percentage":85,"voltage":24.5,"current":10.2,"charging":false}'
    );
    expect(result).toEqual({
      type: 'battery',
      percentage: 85,
      voltage: 24.5,
      current: 10.2,
      charging: false,
    });
  });

  it('parses battery message with percentage=null (JSON null for NaN from robot)', () => {
    const result = parseMessage(
      '{"type":"battery","percentage":null,"voltage":24.5,"current":10.2,"charging":true}'
    );
    expect(result.type).toBe('battery');
    if (result.type === 'battery') {
      expect(result.percentage).toBeNull();
      expect(result.voltage).toBe(24.5);
      expect(result.current).toBe(10.2);
      expect(result.charging).toBe(true);
    }
  });

  it('battery message with non-boolean charging returns unknown', () => {
    const raw = '{"type":"battery","percentage":85,"voltage":24.5,"current":10.2,"charging":"yes"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('parses battery message with zero percentage', () => {
    const result = parseMessage(
      '{"type":"battery","percentage":0,"voltage":20.0,"current":0,"charging":false}'
    );
    expect(result.type).toBe('battery');
    if (result.type === 'battery') {
      expect(result.percentage).toBe(0);
    }
  });

  it('parses battery message with 100 percentage', () => {
    const result = parseMessage(
      '{"type":"battery","percentage":100,"voltage":25.2,"current":0,"charging":false}'
    );
    expect(result.type).toBe('battery');
    if (result.type === 'battery') {
      expect(result.percentage).toBe(100);
    }
  });

  it('battery message with non-finite percentage (not null) defaults to null', () => {
    const result = parseMessage(
      '{"type":"battery","percentage":"invalid","voltage":24.5,"current":10.2,"charging":false}'
    );
    expect(result.type).toBe('battery');
    if (result.type === 'battery') {
      expect(result.percentage).toBeNull();
    }
  });

  it('battery message with non-finite voltage defaults to null', () => {
    const result = parseMessage(
      '{"type":"battery","percentage":85,"voltage":"invalid","current":10.2,"charging":false}'
    );
    expect(result.type).toBe('battery');
    if (result.type === 'battery') {
      expect(result.voltage).toBeNull();
    }
  });

  it('battery message with non-finite current defaults to null', () => {
    const result = parseMessage(
      '{"type":"battery","percentage":85,"voltage":24.5,"current":"invalid","charging":false}'
    );
    expect(result.type).toBe('battery');
    if (result.type === 'battery') {
      expect(result.current).toBeNull();
    }
  });

  it('battery message with missing charging field returns unknown', () => {
    const raw = '{"type":"battery","percentage":85,"voltage":24.5,"current":10.2}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('parses battery message with negative voltage (discharge)', () => {
    const result = parseMessage(
      '{"type":"battery","percentage":85,"voltage":24.5,"current":-15.0,"charging":false}'
    );
    expect(result.type).toBe('battery');
    if (result.type === 'battery') {
      expect(result.current).toBe(-15.0);
    }
  });

  // nav_state message tests
  it('parses nav_state message with idle', () => {
    const result = parseMessage('{"type":"nav_state","state":"idle"}');
    expect(result).toEqual({ type: 'nav_state', state: 'idle' });
  });

  it('parses nav_state message with active', () => {
    const result = parseMessage('{"type":"nav_state","state":"active"}');
    expect(result).toEqual({ type: 'nav_state', state: 'active' });
  });

  it('parses nav_state message with paused', () => {
    const result = parseMessage('{"type":"nav_state","state":"paused"}');
    expect(result).toEqual({ type: 'nav_state', state: 'paused' });
  });

  it('parses nav_state message with succeeded', () => {
    const result = parseMessage('{"type":"nav_state","state":"succeeded"}');
    expect(result).toEqual({ type: 'nav_state', state: 'succeeded' });
  });

  it('parses nav_state message with failed', () => {
    const result = parseMessage('{"type":"nav_state","state":"failed"}');
    expect(result).toEqual({ type: 'nav_state', state: 'failed' });
  });

  it('nav_state message with invalid state "bogus" returns unknown', () => {
    const raw = '{"type":"nav_state","state":"bogus"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('nav_state message with invalid state "unknown_state" returns unknown', () => {
    const raw = '{"type":"nav_state","state":"unknown_state"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('nav_state message with missing state returns unknown', () => {
    const raw = '{"type":"nav_state"}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });

  it('nav_state message with non-string state returns unknown', () => {
    const raw = '{"type":"nav_state","state":123}';
    const result = parseMessage(raw);
    expect(result).toEqual({ type: 'unknown', raw });
  });
});
