export type InboundMessage =
  | { type: 'pong' }
  | { type: 'status'; connected: boolean; robot_type: string }
  | { type: 'error'; message: string }
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
      return {
        type: 'status',
        connected: msg['connected'] as boolean,
        robot_type: msg['robot_type'] as string,
      };
    }
    if (msg['type'] === 'error') {
      return { type: 'error', message: msg['message'] as string };
    }
    return { type: 'unknown', raw };
  } catch {
    return { type: 'unknown', raw };
  }
}
