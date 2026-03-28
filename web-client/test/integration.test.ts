import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';
import { Connection } from '../src/connection.js';

const SERVER_URL = process.env['TELEOP_SERVER_URL'] ?? 'ws://localhost:9091/teleop';
const TOKEN = process.env['TELEOP_TOKEN'] ?? 'testtoken';
const VALID_URL = `${SERVER_URL}?token=${TOKEN}`;
const INVALID_URL = `${SERVER_URL}?token=wrongtoken`;

async function waitForServer(maxRetries = 40): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new globalThis.WebSocket(VALID_URL);
        ws.onopen = () => { ws.close(); resolve(); };
        ws.onerror = () => reject(new Error('not ready'));
        ws.onclose = () => {};
      });
      return;
    } catch {
      await new Promise<void>((r) => setTimeout(r, 500));
    }
  }
  throw new Error('Server did not become ready after 20s');
}

async function pause(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}

beforeAll(async () => {
  await waitForServer();
});

afterEach(async () => {
  await pause(150);
});

describe('Connection', () => {
  it('valid token receives status message', async () => {
    const result = await new Promise<{ connected: boolean; robotType: string }>((resolve, reject) => {
      const client = new TeleopClient({
        onStatus: (connected, robotType) => {
          client.disconnect();
          resolve({ connected, robotType });
        },
        onClose: () => reject(new Error('closed before status')),
        onError: (msg) => reject(new Error(msg)),
      });
      client.connect(VALID_URL);
      setTimeout(() => reject(new Error('timeout')), 4000);
    });

    expect(result.connected).toBe(true);
    expect(result.robotType).toBeTruthy();
  });

  it('invalid token is rejected without opening', async () => {
    const outcome = await new Promise<string>((resolve) => {
      const conn = new Connection({
        onMessage: () => {},
        onOpen: () => resolve('open'),
        onClose: (code) => resolve(`close:${code}`),
        onError: () => resolve('error'),
      });
      conn.connect(INVALID_URL);
      setTimeout(() => resolve('timeout'), 3000);
    });

    expect(outcome).not.toBe('open');
    expect(outcome).not.toBe('timeout');
  });
});
