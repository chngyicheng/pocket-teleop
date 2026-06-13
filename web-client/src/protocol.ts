export type InboundMessage =
  | { type: 'pong' }
  | { type: 'status'; connected: boolean; robot_type: string; robot_name: string; robot_namespace: string; robot_length: number; robot_width: number }
  | { type: 'error'; message: string }
  | { type: 'odom'; x: number; y: number; heading: number }
  | { type: 'estop_state'; engaged: boolean }
  | { type: 'pose'; frame: 'map' | 'odom'; x: number; y: number; heading: number }
  | { type: 'map'; resolution: number; width: number; height: number; origin_x: number; origin_y: number; cells: string }
  | { type: 'scan'; angle_min: number; angle_increment: number; range_max: number; ranges: number[] }
  | { type: 'unknown'; raw: string };

export function buildTwist(lx: number, ly: number, az: number): string {
  return JSON.stringify({ type: 'twist', linear_x: lx, linear_y: ly, angular_z: az });
}

export function buildPing(): string {
  return JSON.stringify({ type: 'ping' });
}

export function buildEstop(): string {
  return JSON.stringify({ type: 'estop' });
}

export function buildEstopReset(): string {
  return JSON.stringify({ type: 'estop_reset' });
}

export function parseMessage(raw: string): InboundMessage {
  try {
    const msg = JSON.parse(raw) as Record<string, unknown>;
    if (msg['type'] === 'pong') {
      return { type: 'pong' };
    }
    if (msg['type'] === 'status') {
      if (typeof msg['connected'] !== 'boolean') {
        return { type: 'unknown', raw };
      }
      const robot_length = typeof msg['robot_length'] === 'number' && Number.isFinite(msg['robot_length']) && msg['robot_length'] > 0
        ? msg['robot_length']
        : 0;
      const robot_width = typeof msg['robot_width'] === 'number' && Number.isFinite(msg['robot_width']) && msg['robot_width'] > 0
        ? msg['robot_width']
        : 0;
      return {
        type:            'status',
        connected:       msg['connected'],
        robot_type:      msg['robot_type']      as string,
        robot_name:      (msg['robot_name']      as string | undefined) ?? '',
        robot_namespace: (msg['robot_namespace'] as string | undefined) ?? '',
        robot_length,
        robot_width,
      };
    }
    if (msg['type'] === 'error') {
      return { type: 'error', message: msg['message'] as string };
    }
    if (msg['type'] === 'odom' &&
        typeof msg['x'] === 'number' && Number.isFinite(msg['x']) &&
        typeof msg['y'] === 'number' && Number.isFinite(msg['y']) &&
        typeof msg['heading'] === 'number' && Number.isFinite(msg['heading'])) {
      return { type: 'odom', x: msg['x'], y: msg['y'], heading: msg['heading'] };
    }
    if (msg['type'] === 'estop_state') {
      if (typeof msg['engaged'] !== 'boolean') {
        return { type: 'unknown', raw };
      }
      return { type: 'estop_state', engaged: msg['engaged'] };
    }
    if (msg['type'] === 'pose') {
      const frame = msg['frame'];
      if ((frame !== 'map' && frame !== 'odom') ||
          typeof msg['x'] !== 'number' || !Number.isFinite(msg['x']) ||
          typeof msg['y'] !== 'number' || !Number.isFinite(msg['y']) ||
          typeof msg['heading'] !== 'number' || !Number.isFinite(msg['heading'])) {
        return { type: 'unknown', raw };
      }
      return {
        type: 'pose',
        frame: frame as 'map' | 'odom',
        x: msg['x'],
        y: msg['y'],
        heading: msg['heading'],
      };
    }
    if (msg['type'] === 'map') {
      const resolution = msg['resolution'];
      const width = msg['width'];
      const height = msg['height'];
      const origin_x = msg['origin_x'];
      const origin_y = msg['origin_y'];
      const cells = msg['cells'];
      if (typeof resolution !== 'number' || !Number.isFinite(resolution) || resolution <= 0 ||
          !Number.isInteger(width) || width <= 0 ||
          !Number.isInteger(height) || height <= 0 ||
          typeof origin_x !== 'number' || !Number.isFinite(origin_x) ||
          typeof origin_y !== 'number' || !Number.isFinite(origin_y) ||
          typeof cells !== 'string') {
        return { type: 'unknown', raw };
      }
      return {
        type: 'map',
        resolution,
        width,
        height,
        origin_x,
        origin_y,
        cells,
      };
    }
    if (msg['type'] === 'scan') {
      const angle_min = msg['angle_min'];
      const angle_increment = msg['angle_increment'];
      const range_max = msg['range_max'];
      const ranges = msg['ranges'];
      if (typeof angle_min !== 'number' || !Number.isFinite(angle_min) ||
          typeof angle_increment !== 'number' || !Number.isFinite(angle_increment) ||
          typeof range_max !== 'number' || !Number.isFinite(range_max) || range_max <= 0 ||
          !Array.isArray(ranges) ||
          !ranges.every((r): r is number => typeof r === 'number' && Number.isFinite(r))) {
        return { type: 'unknown', raw };
      }
      return {
        type: 'scan',
        angle_min,
        angle_increment,
        range_max,
        ranges,
      };
    }
    return { type: 'unknown', raw };
  } catch {
    return { type: 'unknown', raw };
  }
}
