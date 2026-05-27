export type InboundMessage =
  | { type: 'pong' }
  | { type: 'status'; connected: boolean; robot_type: string; robot_name: string; robot_namespace: string }
  | { type: 'error'; message: string }
  | { type: 'odom'; x: number; y: number; heading: number }
  | { type: 'unknown'; raw: string };

export function buildTwist(lx: number, ly: number, az: number): string {
  return JSON.stringify({ type: 'twist', linear_x: lx, linear_y: ly, angular_z: az });
}

export function buildPing(): string {
  return JSON.stringify({ type: 'ping' });
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
      return {
        type:            'status',
        connected:       msg['connected'],
        robot_type:      msg['robot_type']      as string,
        robot_name:      (msg['robot_name']      as string | undefined) ?? '',
        robot_namespace: (msg['robot_namespace'] as string | undefined) ?? '',
      };
    }
    if (msg['type'] === 'error') {
      return { type: 'error', message: msg['message'] as string };
    }
    if (msg['type'] === 'odom' &&
        typeof msg['x'] === 'number' &&
        typeof msg['y'] === 'number' &&
        typeof msg['heading'] === 'number') {
      return { type: 'odom', x: msg['x'], y: msg['y'], heading: msg['heading'] };
    }
    return { type: 'unknown', raw };
  } catch {
    return { type: 'unknown', raw };
  }
}
