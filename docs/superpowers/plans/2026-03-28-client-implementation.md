# pocket-teleop Web Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript WebSocket client served by nginx from the robot, wired to the Gamepad API, with integration tests against the real server.

**Architecture:** Four layered modules mirror the server's stack — `Protocol` (pure types + serializers), `Connection` (WebSocket lifecycle), `GamepadHandler` (Gamepad API polling), `TeleopClient` (orchestrator + keepalive loop). Only `TeleopClient` is the public API. Integration tests connect to the real server; no mocks. nginx serves compiled output on port 8080.

**Tech Stack:** TypeScript 5 (strict, ES modules), tsc (no bundler), Vitest (Node.js), nginx (alpine), Docker multi-stage build, Docker Compose

---

## File Map

```
web-client/
├── src/
│   ├── protocol.ts         ← message types + serializers; no I/O
│   ├── connection.ts       ← WebSocket lifecycle; fires callbacks
│   ├── gamepad_handler.ts  ← Gamepad API polling; emits twist values
│   └── teleop_client.ts    ← orchestrates all three; owns keepalive loop
├── test/
│   └── integration.test.ts ← full round-trip tests against real server; no mocks
├── index.html              ← shell page; reads token from URL; wires TeleopClient
├── tsconfig.json           ← strict, ESNext, DOM lib, outDir: dist
├── vitest.config.ts        ← Node environment, 5s timeout, sequential
├── package.json            ← type: module; dev deps: typescript, vitest
└── Dockerfile.webclient    ← base (node:20-slim + deps + src), builder (tsc), runtime (nginx)
```

**Responsibility of each file:**

| File | Responsibility |
|---|---|
| `protocol.ts` | `buildTwist`, `buildPing`, `parseMessage`; `InboundMessage` discriminated union |
| `connection.ts` | `Connection` class: `connect`, `disconnect`, `send`; `ConnectionCallbacks` interface |
| `gamepad_handler.ts` | `GamepadHandler` class: polls `navigator.getGamepads()` every 200ms; no-ops if no navigator |
| `teleop_client.ts` | `TeleopClient` class: wires Connection + GamepadHandler + Protocol; 200ms keepalive |
| `integration.test.ts` | 7 integration tests against real server; server URL + token from env vars |
| `index.html` | Reads `?token=` from URL, constructs WS URL, calls `TeleopClient.connect()` |
| `Dockerfile.webclient` | `base` stage (deps + src), `builder` stage (tsc), `runtime` stage (nginx) |

**docker-compose.yml additions:**
- `webclient` service: builds `runtime` target, exposes port 8080
- `webclient-test` service (profile `test`): builds `base` target, runs `npm test`, depends on `teleop-server`

---

## Task 1: Project scaffolding

> Creates the build pipeline and Docker setup. Goal: `docker compose up --build` serves a placeholder page at port 8080.

**Files:**
- Create: `web-client/package.json`
- Create: `web-client/tsconfig.json`
- Create: `web-client/vitest.config.ts`
- Create: `web-client/Dockerfile.webclient`
- Create: `web-client/index.html` (placeholder)
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create `web-client/package.json`**

```json
{
  "name": "pocket-teleop-webclient",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create `web-client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "lib": ["ES2020", "DOM"],
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `web-client/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 5000,
    hookTimeout: 15000,
    sequence: {
      concurrent: false,
    },
  },
});
```

- [ ] **Step 4: Create `web-client/Dockerfile.webclient`**

```dockerfile
# ---- base stage: deps + source ----
FROM node:20-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# ---- builder stage: compile TypeScript ----
FROM base AS builder
RUN npm run build

# ---- runtime stage: nginx serves compiled output ----
FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html/dist
COPY --from=base /app/index.html /usr/share/nginx/html/
EXPOSE 80
```

- [ ] **Step 5: Create placeholder `web-client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pocket-teleop</title>
</head>
<body>
  <p>pocket-teleop client — connecting...</p>
  <script type="module" src="/dist/teleop_client.js"></script>
</body>
</html>
```

- [ ] **Step 6: Add `webclient` and `webclient-test` services to `docker-compose.yml`**

Replace the entire file:

```yaml
services:
  teleop-server:
    build:
      context: .
      network: host
    ports:
      - "9091:9091"
    environment:
      - "TELEOP_TOKEN=${TELEOP_TOKEN:?Error: TELEOP_TOKEN must be set before starting the server}"
      - ROBOT_TYPE=${ROBOT_TYPE:-diff_drive}
    restart: unless-stopped

  webclient:
    build:
      context: ./web-client
      dockerfile: Dockerfile.webclient
      target: runtime
      network: host
    ports:
      - "8080:80"
    restart: unless-stopped

  webclient-test:
    profiles: ["test"]
    build:
      context: ./web-client
      dockerfile: Dockerfile.webclient
      target: base
      network: host
    environment:
      - TELEOP_SERVER_URL=ws://teleop-server:9091/teleop
      - "TELEOP_TOKEN=${TELEOP_TOKEN:?Error: TELEOP_TOKEN must be set}"
    depends_on:
      - teleop-server
    command: ["npm", "test"]
```

- [ ] **Step 7: Create stub `web-client/src/teleop_client.ts`** so tsc has something to compile

```typescript
export {};
```

- [ ] **Step 8: Build and verify the placeholder page is served**

```bash
TELEOP_TOKEN=testtoken docker compose up --build webclient
```

Expected: nginx starts, navigate to `http://localhost:8080` in browser and see "pocket-teleop client — connecting..."

Stop with `Ctrl+C`.

- [ ] **Step 9: Commit**

```bash
git add web-client/ docker-compose.yml
git commit -m "feat: add web client project scaffolding and Docker setup"
```

---

## Task 2: `protocol.ts` — message types and serializers

> Pure TypeScript — no I/O, no side effects. Covered by integration tests, not unit tests.

**Files:**
- Create: `web-client/src/protocol.ts`

- [ ] **Step 1: Create `web-client/src/protocol.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

```bash
cd web-client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web-client/src/protocol.ts
git commit -m "feat: add protocol.ts — message types and serializers"
```

---

## Task 3: `connection.ts` — WebSocket lifecycle

**Files:**
- Create: `web-client/src/connection.ts`

- [ ] **Step 1: Create `web-client/src/connection.ts`**

```typescript
export interface ConnectionCallbacks {
  onMessage: (raw: string) => void;
  onOpen: () => void;
  onClose: (code: number, reason: string) => void;
  onError: (event: Event) => void;
}

export class Connection {
  private ws: WebSocket | null = null;
  private readonly callbacks: ConnectionCallbacks;

  constructor(callbacks: ConnectionCallbacks) {
    this.callbacks = callbacks;
  }

  connect(url: string): void {
    // Use globalThis.WebSocket so this works in both browser and Node.js 20+
    this.ws = new globalThis.WebSocket(url);
    this.ws.onmessage = (e: MessageEvent) => this.callbacks.onMessage(e.data as string);
    this.ws.onopen = () => this.callbacks.onOpen();
    this.ws.onclose = (e: CloseEvent) => this.callbacks.onClose(e.code, e.reason);
    this.ws.onerror = (e: Event) => this.callbacks.onError(e);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  send(msg: string): void {
    if (this.ws !== null && this.ws.readyState === 1) {
      this.ws.send(msg);
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd web-client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web-client/src/connection.ts
git commit -m "feat: add connection.ts — WebSocket lifecycle"
```

---

## Task 4: `gamepad_handler.ts` — Gamepad API polling

**Files:**
- Create: `web-client/src/gamepad_handler.ts`

- [ ] **Step 1: Create `web-client/src/gamepad_handler.ts`**

```typescript
export interface GamepadHandlerOptions {
  intervalMs?: number;
  onTwist: (lx: number, ly: number, az: number) => void;
}

export class GamepadHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly onTwist: (lx: number, ly: number, az: number) => void;

  constructor(options: GamepadHandlerOptions) {
    this.intervalMs = options.intervalMs ?? 200;
    this.onTwist = options.onTwist;
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private poll(): void {
    // navigator is not available in Node.js (test environment) — no-op
    if (typeof navigator === 'undefined') return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads.find((g) => g !== null) ?? null;
    if (gp === null) return;

    // Axis mapping:
    //   linear_x  → left stick Y  (axis 1), inverted
    //   linear_y  → left stick X  (axis 0), inverted
    //   angular_z → right stick X (axis 2), inverted
    const lx = -(gp.axes[1] ?? 0);
    const ly = -(gp.axes[0] ?? 0);
    const az = -(gp.axes[2] ?? 0);

    this.onTwist(lx, ly, az);
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd web-client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web-client/src/gamepad_handler.ts
git commit -m "feat: add gamepad_handler.ts — Gamepad API polling"
```

---

## Task 5: `teleop_client.ts` + connection integration tests

> Implements the orchestrator. First two integration tests verify the connection handshake.

**Files:**
- Modify: `web-client/src/teleop_client.ts` (replace stub)
- Create: `web-client/test/integration.test.ts` (partial — connection tests only)

- [ ] **Step 1: Write the failing integration tests**

Create `web-client/test/integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { TeleopClient } from '../src/teleop_client.js';
import { Connection } from '../src/connection.js';

const SERVER_URL = process.env['TELEOP_SERVER_URL'] ?? 'ws://localhost:9091/teleop';
const TOKEN = process.env['TELEOP_TOKEN'] ?? 'testtoken';
const VALID_URL = `${SERVER_URL}?token=${TOKEN}`;
const INVALID_URL = `${SERVER_URL}?token=wrongtoken`;

async function waitForServer(maxRetries = 20): Promise<void> {
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
  throw new Error('Server did not become ready after 10s');
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
```

- [ ] **Step 2: Run tests — expect them to fail (TeleopClient is a stub)**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected: FAIL — `TeleopClient` has no `connect` method.

- [ ] **Step 3: Implement `web-client/src/teleop_client.ts`**

```typescript
import { Connection } from './connection.js';
import { GamepadHandler } from './gamepad_handler.js';
import { buildPing, buildTwist, parseMessage } from './protocol.js';

export interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
}

export class TeleopClient {
  private readonly connection: Connection;
  private readonly gamepadHandler: GamepadHandler;
  private keepaliveId: ReturnType<typeof setInterval> | null = null;
  private lastSentAt = 0;
  private readonly options: TeleopClientOptions;

  constructor(options: TeleopClientOptions = {}) {
    this.options = options;
    this.connection = new Connection({
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => {},
      onClose: (code, reason) => {
        this.stopKeepalive();
        this.gamepadHandler.stop();
        this.options.onClose?.(code, reason);
      },
      onError: (e) => {
        this.options.onError?.((e as ErrorEvent).message ?? 'connection error');
      },
    });
    this.gamepadHandler = new GamepadHandler({
      onTwist: (lx, ly, az) => this.sendTwist(lx, ly, az),
    });
  }

  connect(url: string): void {
    this.connection.connect(url);
    this.startKeepalive();
    this.gamepadHandler.start();
  }

  disconnect(): void {
    this.stopKeepalive();
    this.gamepadHandler.stop();
    this.connection.disconnect();
  }

  sendTwist(lx: number, ly: number, az: number): void {
    this.connection.send(buildTwist(lx, ly, az));
    this.lastSentAt = Date.now();
  }

  private handleMessage(raw: string): void {
    const msg = parseMessage(raw);
    if (msg.type === 'status') {
      this.options.onStatus?.(msg.connected, msg.robot_type);
    } else if (msg.type === 'error') {
      this.options.onError?.(msg.message);
    }
  }

  private startKeepalive(): void {
    this.lastSentAt = Date.now();
    this.keepaliveId = setInterval(() => {
      if (Date.now() - this.lastSentAt >= 200) {
        this.connection.send(buildPing());
        this.lastSentAt = Date.now();
      }
    }, 200);
  }

  private stopKeepalive(): void {
    if (this.keepaliveId !== null) {
      clearInterval(this.keepaliveId);
      this.keepaliveId = null;
    }
  }
}
```

- [ ] **Step 4: Run tests — expect connection tests to pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected:
```
✓ Connection > valid token receives status message
✓ Connection > invalid token is rejected without opening
```

- [ ] **Step 5: Commit**

```bash
git add web-client/src/teleop_client.ts web-client/test/integration.test.ts
git commit -m "feat: add teleop_client.ts; connection integration tests pass"
```

---

## Task 6: Keepalive and twist integration tests

> Verifies sendTwist, ping→pong, and that the keepalive loop keeps the connection alive.

**Files:**
- Modify: `web-client/test/integration.test.ts` (add Messaging describe block)

- [ ] **Step 1: Add Messaging tests to `web-client/test/integration.test.ts`**

Add the following after the `Connection` describe block. Add the `buildPing` import to the top of the file too.

Import addition at top of file:
```typescript
import { buildPing } from '../src/protocol.js';
```

New describe block:
```typescript
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
```

- [ ] **Step 2: Run tests — all four should pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected:
```
✓ Connection > valid token receives status message
✓ Connection > invalid token is rejected without opening
✓ Messaging > sendTwist does not produce an error response
✓ Messaging > ping receives pong within 250ms
```

- [ ] **Step 3: Commit**

```bash
git add web-client/test/integration.test.ts
git commit -m "test: add sendTwist and ping/pong integration tests"
```

---

## Task 7: Safety integration tests

> Verifies server behaviour under silence, malformed input, and duplicate connections.

**Files:**
- Modify: `web-client/test/integration.test.ts` (add Safety describe block)

- [ ] **Step 1: Add Safety tests to `web-client/test/integration.test.ts`**

Add after the `Messaging` describe block:

```typescript
describe('Safety', () => {
  it('connection stays open after 600ms of silence', async () => {
    let closedUnexpectedly = false;

    await new Promise<void>((resolve, reject) => {
      const conn = new Connection({
        onMessage: () => {},
        onOpen: () => {
          // Establish session with a ping, then go silent for 600ms
          conn.send(buildPing());
          setTimeout(() => {
            // Watchdog has fired by now — verify connection still open
            conn.send(buildPing());
            setTimeout(() => { conn.disconnect(); resolve(); }, 300);
          }, 600);
        },
        onClose: () => { closedUnexpectedly = true; resolve(); },
        onError: () => reject(new Error('error during silence test')),
      });
      conn.connect(VALID_URL);
    });

    expect(closedUnexpectedly).toBe(false);
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
    // Server sends error message then closes — either observation is valid
    expect(['error-message', 'closed', 'connection-error']).toContain(outcome);
  });
});
```

- [ ] **Step 2: Run tests — all seven should pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected:
```
✓ Connection > valid token receives status message
✓ Connection > invalid token is rejected without opening
✓ Messaging > sendTwist does not produce an error response
✓ Messaging > ping receives pong within 250ms
✓ Safety > connection stays open after 600ms of silence
✓ Safety > malformed message receives error response
✓ Safety > second client is rejected while first is connected

Test Files  1 passed (1)
Tests       7 passed (7)
```

- [ ] **Step 3: Commit**

```bash
git add web-client/test/integration.test.ts
git commit -m "test: add safety integration tests (silence, malformed, second client)"
```

---

## Task 8: Wire `index.html`

> Reads token from the URL query string, constructs the WebSocket URL, and calls `TeleopClient.connect()`. This is the entry point for the phone browser.

**Files:**
- Modify: `web-client/index.html`

- [ ] **Step 1: Update `web-client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pocket-teleop</title>
</head>
<body>
  <p id="status">Connecting...</p>
  <script type="module">
    import { TeleopClient } from '/dist/teleop_client.js';

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    const wsUrl = `ws://${window.location.hostname}:9091/teleop?token=${encodeURIComponent(token)}`;

    const client = new TeleopClient({
      onStatus: (_connected, robotType) => {
        document.getElementById('status').textContent =
          `Connected — robot type: ${robotType}`;
      },
      onError: (msg) => {
        document.getElementById('status').textContent = `Error: ${msg}`;
      },
      onClose: () => {
        document.getElementById('status').textContent = 'Disconnected';
      },
    });

    client.connect(wsUrl);
  </script>
</body>
</html>
```

- [ ] **Step 2: Rebuild and smoke-test**

```bash
TELEOP_TOKEN=mysecrettoken docker compose up --build
```

Navigate to `http://localhost:8080?token=mysecrettoken`.

Expected: page shows "Connected — robot type: diff_drive" (or whatever `ROBOT_TYPE` is set to).

- [ ] **Step 3: Verify bad token shows error**

Navigate to `http://localhost:8080?token=wrongtoken`.

Expected: page shows "Error: ..." or "Disconnected" — not "Connected".

- [ ] **Step 4: Commit**

```bash
git add web-client/index.html
git commit -m "feat: wire index.html — reads token from URL, calls TeleopClient.connect()"
```

---

## Task 9: Full suite verification

> Confirms all 7 integration tests pass, the full docker compose stack builds cleanly, and the page is reachable from a phone browser.

**Files:** none — verification only

- [ ] **Step 1: Run the full integration suite**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected:
```
✓ Connection > valid token receives status message
✓ Connection > invalid token is rejected without opening
✓ Messaging > sendTwist does not produce an error response
✓ Messaging > ping receives pong within 250ms
✓ Safety > connection stays open after 600ms of silence
✓ Safety > malformed message receives error response
✓ Safety > second client is rejected while first is connected

Test Files  1 passed (1)
Tests       7 passed (7)
Duration    ~5s
```

- [ ] **Step 2: Build the full stack**

```bash
TELEOP_TOKEN=mysecrettoken docker compose up --build
```

Expected: both `teleop-server` and `webclient` start without errors.

- [ ] **Step 3: Verify from a phone (or second browser tab)**

Navigate to `http://<robot-ip>:8080?token=mysecrettoken`.

Expected: page shows "Connected — robot type: diff_drive". If a Bluetooth gamepad is paired to the phone, moving the left stick should drive the robot (check `/cmd_vel` with `ros2 topic echo /cmd_vel` inside the server container).

- [ ] **Step 4: Apply tag**

```bash
git tag v0.1.0-client
git push origin main --tags
```

- [ ] **Step 5: Update `AGENTS.md` handoff state**

Update the Handoff State section in `AGENTS.md`:
- Head SHA: run `git rev-parse --short HEAD` and update
- Add web client rows to the task table or note completion
- Add any deviations from this plan to the Known deviations table
