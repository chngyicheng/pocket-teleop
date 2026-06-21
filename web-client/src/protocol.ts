export type ScanPose = { frame: 'map' | 'odom'; x: number; y: number; heading: number };

export type InboundMessage =
  | { type: 'pong' }
  | { type: 'status'; connected: boolean; robot_type: string; robot_name: string; robot_namespace: string; robot_length: number; robot_width: number; disconnect_action: string }
  | { type: 'error'; message: string }
  | { type: 'odom'; x: number; y: number; heading: number }
  | { type: 'estop_state'; engaged: boolean }
  | { type: 'pose'; frame: 'map' | 'odom'; x: number; y: number; heading: number }
  | { type: 'map'; resolution: number; width: number; height: number; origin_x: number; origin_y: number; cells: string }
  | { type: 'scan'; angle_min: number; angle_increment: number; range_max: number; ranges: number[]; pose?: ScanPose }
  | { type: 'battery'; percentage: number | null; voltage: number | null; current: number | null; charging: boolean }
  | { type: 'nav_state'; state: 'idle' | 'active' | 'paused' }
  | { type: 'nav_path'; points: [number, number][] }
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

export function buildNavGoal(x: number, y: number, heading: number): string {
  return JSON.stringify({ type: 'nav_goal', x, y, heading });
}

export function buildNavPause(): string {
  return JSON.stringify({ type: 'nav_pause' });
}

export function buildNavResume(): string {
  return JSON.stringify({ type: 'nav_resume' });
}

export function buildNavCancel(): string {
  return JSON.stringify({ type: 'nav_cancel' });
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
        disconnect_action: (msg['disconnect_action'] as string | undefined) ?? 'stop',
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

      // Parse optional pose: all four fields must be present and valid
      let pose: ScanPose | undefined;
      const pose_frame = msg['pose_frame'];
      const pose_x = msg['pose_x'];
      const pose_y = msg['pose_y'];
      const pose_heading = msg['pose_heading'];

      if (pose_frame !== undefined && pose_x !== undefined && pose_y !== undefined && pose_heading !== undefined &&
          (pose_frame === 'map' || pose_frame === 'odom') &&
          typeof pose_x === 'number' && Number.isFinite(pose_x) &&
          typeof pose_y === 'number' && Number.isFinite(pose_y) &&
          typeof pose_heading === 'number' && Number.isFinite(pose_heading)) {
        pose = {
          frame: pose_frame as 'map' | 'odom',
          x: pose_x,
          y: pose_y,
          heading: pose_heading,
        };
      }

      const result: { type: 'scan'; angle_min: number; angle_increment: number; range_max: number; ranges: number[]; pose?: ScanPose } = {
        type: 'scan',
        angle_min,
        angle_increment,
        range_max,
        ranges,
      };

      if (pose !== undefined) {
        result.pose = pose;
      }

      return result;
    }
    if (msg['type'] === 'battery') {
      if (typeof msg['charging'] !== 'boolean') {
        return { type: 'unknown', raw };
      }
      const percentage = typeof msg['percentage'] === 'number' && Number.isFinite(msg['percentage'])
        ? msg['percentage']
        : null;
      const voltage = typeof msg['voltage'] === 'number' && Number.isFinite(msg['voltage'])
        ? msg['voltage']
        : null;
      const current = typeof msg['current'] === 'number' && Number.isFinite(msg['current'])
        ? msg['current']
        : null;
      return {
        type: 'battery',
        percentage,
        voltage,
        current,
        charging: msg['charging'],
      };
    }
    if (msg['type'] === 'nav_state') {
      const state = msg['state'];
      if (state !== 'idle' && state !== 'active' && state !== 'paused') {
        return { type: 'unknown', raw };
      }
      return { type: 'nav_state', state };
    }
    if (msg['type'] === 'nav_path') {
      const points = msg['points'];
      if (!Array.isArray(points)) {
        return { type: 'unknown', raw };
      }
      for (const point of points) {
        if (!Array.isArray(point) || point.length !== 2 ||
            typeof point[0] !== 'number' || !Number.isFinite(point[0]) ||
            typeof point[1] !== 'number' || !Number.isFinite(point[1])) {
          return { type: 'unknown', raw };
        }
      }
      return { type: 'nav_path', points };
    }
    return { type: 'unknown', raw };
  } catch {
    return { type: 'unknown', raw };
  }
}
