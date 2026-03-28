import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';
import { Connection } from '../src/connection.js';
import { buildPing } from '../src/protocol.js';

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

describe('Messaging', () => {
  it('sendTwist does not produce an error response', async () => {
    const errors: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const client = new TeleopClient({
        onStatus: () => {
          client.sendTwist(0.5, 0.0, -0.3);
          setTimeout(() => { client.disconnect(); resolve(); }, 300);
        },
        onError: (msg) => errors.push(msg),
        onClose: () => {},
      });
      client.connect(VALID_URL);
      setTimeout(() => reject(new Error('timeout')), 4000);
    });

    expect(errors).toHaveLength(0);
  });

  it('ping receives pong within 250ms', async () => {
    const pongReceived = await new Promise<boolean>((resolve) => {
      const conn = new Connection({
        onMessage: (raw) => {
          const parsed = JSON.parse(raw) as { type: string };
          if (parsed['type'] === 'pong') { conn.disconnect(); resolve(true); }
        },
        onOpen: () => conn.send(buildPing()),
        onClose: () => resolve(false),
        onError: () => resolve(false),
      });
      conn.connect(VALID_URL);
      setTimeout(() => { conn.disconnect(); resolve(false); }, 250);
    });

    expect(pongReceived).toBe(true);
  });
});

describe('Safety', () => {
  it('keepalive keeps connection alive past watchdog timeout (500ms)', async () => {
    // TeleopClient sends pings every 200ms; server closes after 500ms silence.
    // With keepalive active the connection must survive 700ms.
    let closedEarly = false;
    let intentionallyDisconnecting = false;

    await new Promise<void>((resolve, reject) => {
      const client = new TeleopClient({
        onStatus: () => {
          // Connection is established; keepalive is already running.
          // Wait 700ms — past the 500ms server watchdog — then verify still alive.
          setTimeout(() => {
            intentionallyDisconnecting = true;
            client.disconnect();
            resolve();
          }, 700);
        },
        onClose: () => {
          if (!intentionallyDisconnecting) { closedEarly = true; resolve(); }
        },
        onError: () => reject(new Error('error during keepalive test')),
      });
      client.connect(VALID_URL);
      setTimeout(() => reject(new Error('timeout')), 4000);
    });

    expect(closedEarly).toBe(false);
  });

  it('server closes connection after silence exceeds timeout', async () => {
    // Raw Connection has no keepalive — server must close it after ~500ms silence.
    const outcome = await new Promise<string>((resolve) => {
      const conn = new Connection({
        onMessage: () => {},
        onOpen: () => {}, // go silent immediately
        onClose: () => resolve('closed'),
        onError: () => resolve('error'),
      });
      conn.connect(VALID_URL);
      setTimeout(() => { conn.disconnect(); resolve('timeout'); }, 1500);
    });

    expect(outcome).toBe('closed');
  });

  it('malformed message receives error response', async () => {
    const errorReceived = await new Promise<boolean>((resolve) => {
      const conn = new Connection({
        onMessage: (raw) => {
          const parsed = JSON.parse(raw) as { type: string };
          if (parsed['type'] === 'error') { conn.disconnect(); resolve(true); }
        },
        onOpen: () => conn.send('not valid json {{ garbage'),
        onClose: () => resolve(false),
        onError: () => resolve(false),
      });
      conn.connect(VALID_URL);
      setTimeout(() => { conn.disconnect(); resolve(false); }, 2000);
    });

    expect(errorReceived).toBe(true);
  });

  it('TeleopClient routes server error response to onError callback', async () => {
    // Sends malformed JSON via TeleopClient so the error flows through
    // TeleopClient.handleMessage → error branch → options.onError
    const errorMessage = await new Promise<string>((resolve, reject) => {
      const client = new TeleopClient({
        onStatus: () => {
          // Once connected, send garbage directly through the underlying connection.
          // TeleopClient has no public raw-send, so we use sendTwist with extreme
          // values that the server rejects as out-of-range.
          // Instead, reach the error path by connecting a second time via a separate
          // Connection and letting TeleopClient stay as the active client, then having
          // TeleopClient itself receive the "already connected" error by connecting a
          // second TeleopClient while this one is active.
          resolve('skip'); // handled below
        },
        onError: (msg) => resolve(msg),
        onClose: () => {},
      });

      // Connect a first raw Connection to occupy the slot, then connect TeleopClient.
      // TeleopClient will receive the "already connected" error → onError fires.
      const occupier = new Connection({
        onMessage: () => {},
        onOpen: () => {
          client.connect(VALID_URL);
          setTimeout(() => { occupier.disconnect(); client.disconnect(); reject(new Error('timeout')); }, 3000);
        },
        onClose: () => {},
        onError: () => reject(new Error('occupier error')),
      });
      occupier.connect(VALID_URL);
    });

    expect(errorMessage).toBeTruthy();
    expect(errorMessage).not.toBe('skip');
  });

  it('TeleopClient.onClose fires when connection is closed', async () => {
    let closeCode: number | null = null;

    await new Promise<void>((resolve, reject) => {
      const client = new TeleopClient({
        onStatus: () => {
          client.disconnect();
        },
        onClose: (code) => {
          closeCode = code;
          resolve();
        },
        onError: (msg) => reject(new Error(msg)),
      });
      client.connect(VALID_URL);
      setTimeout(() => reject(new Error('timeout')), 4000);
    });

    expect(closeCode).not.toBeNull();
  });

  it('second client is rejected while first is connected', async () => {
    // Connect first client and wait for status confirmation
    let firstClient: TeleopClient | null = null;

    await new Promise<void>((resolve, reject) => {
      firstClient = new TeleopClient({
        onStatus: () => resolve(),
        onError: (msg) => reject(new Error(`first client error: ${msg}`)),
      });
      firstClient.connect(VALID_URL);
      setTimeout(() => reject(new Error('first client timeout')), 3000);
    });

    // Attempt second connection — expect error or close, never open+status
    const outcome = await new Promise<string>((resolve) => {
      const conn = new Connection({
        onMessage: (raw) => {
          const parsed = JSON.parse(raw) as { type: string };
          if (parsed['type'] === 'error') resolve('error-message');
        },
        onOpen: () => {},
        onClose: () => resolve('closed'),
        onError: () => resolve('connection-error'),
      });
      conn.connect(VALID_URL);
      setTimeout(() => resolve('timeout'), 3000);
    });

    firstClient!.disconnect();

    expect(outcome).not.toBe('timeout');
    expect(['error-message', 'closed', 'connection-error']).toContain(outcome);
  });
});
