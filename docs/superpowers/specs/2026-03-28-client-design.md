# pocket-teleop Web Client Design

**Date:** 2026-03-28
**Scope:** Browser-based WebSocket client — protocol wiring, Gamepad API input, keepalive loop, integration testing, and nginx deployment. Visual UI layer is out of scope for this spec.

---

## 1. Goals

- Connect a phone browser to the pocket-teleop server over a local network or VPN.
- Send `twist` and `ping` messages conforming to the server protocol.
- Read input from a paired Bluetooth gamepad via the browser Gamepad API.
- Maintain the server's 500ms safety watchdog by sending keepalive pings every 200ms when no twist is being sent.
- Serve the client from the robot via nginx so the phone only needs a URL.
- Provide integration tests that verify the full client → server round-trip against the real server.

---

## 2. Deployment Model

The web client is served by an nginx container added to the existing `docker-compose.yml`. The phone navigates to `http://<robot-ip>:8080`. No separate server or file management is required on the phone.

**Build step:** TypeScript is compiled to JavaScript (`tsc`) during the Docker build. Output lands in `dist/` and is copied into the nginx container's `/usr/share/nginx/html`.

**Token:** The token is passed to the client via the page URL — `http://<robot-ip>:8080?token=<token>`. `index.html` reads it from `window.location.search`, constructs the full WebSocket URL (`ws://<host>:9091/teleop?token=<token>`), and passes it to `TeleopClient.connect(url)`. `TeleopClient` itself has no knowledge of `window.location`. The token is never stored beyond the session.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Build | `tsc` — no bundler, ES modules |
| Test runner | Vitest (Node.js, not browser) |
| Static server | nginx (official Docker image) |
| Input | Browser Gamepad API |
| Transport | Browser WebSocket API |

No frontend framework. No runtime dependencies. Dev dependencies only: `typescript`, `vitest`.

---

## 4. File Map

```
web-client/
├── src/
│   ├── protocol.ts         ← message types + serializers; no I/O
│   ├── connection.ts       ← WebSocket lifecycle; no message knowledge
│   ├── gamepad_handler.ts  ← Gamepad API polling; emits twist values
│   └── teleop_client.ts    ← orchestrates the three above; public API
├── test/
│   └── integration.test.ts ← connects to real server, full round-trip
├── index.html              ← shell page; wires TeleopClient; no visual design
├── tsconfig.json
├── package.json            ← tsc + vitest as dev deps only
└── Dockerfile.webclient    ← build stage (tsc) + nginx runtime stage
```

**Responsibility of each file:**

| File | Responsibility |
|---|---|
| `protocol.ts` | Message type definitions and serializers/parsers; no I/O |
| `connection.ts` | WebSocket open/close/send lifecycle; fires callbacks |
| `gamepad_handler.ts` | Polls Gamepad API, maps axes to twist values, fires `onTwist` |
| `teleop_client.ts` | Wires all modules; owns keepalive loop; public API surface |
| `integration.test.ts` | Integration tests against real server; no mocks |
| `index.html` | Entry point; minimal shell; calls `TeleopClient.connect()` |
| `Dockerfile.webclient` | Multi-stage: `builder` (tsc) + `runtime` (nginx) |

---

## 5. Component Design

### 5.1 `protocol.ts`

Pure TypeScript — no I/O, no side effects. Fully testable without a server.

**Outbound message builders:**
```typescript
buildTwist(lx: number, ly: number, az: number): string
buildPing(): string
```

**Inbound message parser:**
```typescript
parseMessage(raw: string): InboundMessage
```

`InboundMessage` is a discriminated union:
```typescript
type InboundMessage =
  | { type: 'pong' }
  | { type: 'status'; connected: boolean; robot_type: string }
  | { type: 'error'; message: string }
  | { type: 'unknown'; raw: string }
```

### 5.2 `connection.ts`

Owns the WebSocket object. Accepts a URL and an options object with callbacks:

```typescript
interface ConnectionCallbacks {
  onMessage: (raw: string) => void;
  onOpen: () => void;
  onClose: (code: number, reason: string) => void;
  onError: (event: Event) => void;
}
```

Exposes:
```typescript
connect(url: string): void
disconnect(): void
send(msg: string): void
```

No knowledge of message format, keepalive, or gamepad.

### 5.3 `gamepad_handler.ts`

Polls `navigator.getGamepads()` on a 200ms interval (matching the keepalive window). Maps the first connected gamepad's axes to `linear_x`, `linear_y`, `angular_z`. Fires `onTwist(lx, ly, az)` when a connected gamepad is detected.

```typescript
interface GamepadHandlerOptions {
  intervalMs: number;         // default: 200
  onTwist: (lx: number, ly: number, az: number) => void;
}
```

Exposes:
```typescript
start(): void
stop(): void
```

Knows nothing about WebSocket or protocol.

**Axis mapping (default, configurable):**

| Axis | Gamepad axis index | Value range |
|---|---|---|
| `linear_x` | 1 (left stick Y, inverted) | `[-1.0, 1.0]` |
| `linear_y` | 0 (left stick X, inverted) | `[-1.0, 1.0]` |
| `angular_z` | 2 (right stick X, inverted) | `[-1.0, 1.0]` |

### 5.4 `teleop_client.ts`

The only module the application and tests interact with directly.

```typescript
interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
}
```

Exposes:
```typescript
connect(url: string): void
disconnect(): void
sendTwist(lx: number, ly: number, az: number): void
```

**Keepalive logic:** maintains a timestamp of the last sent message. A 200ms interval fires; if no twist has been sent within that window, it sends a `ping`. Interval starts on `connect()`, stops on `disconnect()`.

**Input convergence:** both `GamepadHandler.onTwist` and external callers (future UI buttons, tests) route through `sendTwist()`.

```
Physical gamepad → GamepadHandler → TeleopClient.sendTwist()
On-screen buttons (future) ──────→ TeleopClient.sendTwist()
Manual / test calls ─────────────→ TeleopClient.sendTwist()
```

---

## 6. Data Flow

### Normal operation (gamepad active)
```
GamepadHandler polls axes every 200ms
  → fires onTwist(lx, ly, az)
  → TeleopClient resets keepalive timer
  → Protocol.buildTwist() → Connection.send()
  → Server receives, publishes to /cmd_vel
  → Robot moves
```

### Keepalive (no gamepad input)
```
TeleopClient keepalive timer fires (200ms since last twist)
  → Protocol.buildPing() → Connection.send()
  → Server replies with pong, watchdog reset
```

### Connection
```
TeleopClient.connect(url) called
  → Connection opens WebSocket
  → Server sends {"type":"status","connected":true,"robot_type":"..."}
  → Protocol.parseMessage() → StatusMessage
  → TeleopClient fires onStatus callback
```

### Error / bad token
```
Server sends {"type":"error","message":"..."}
  → Protocol.parseMessage() → ErrorMessage
  → TeleopClient fires onError callback
  → Connection closed by server
```

### Disconnect
```
TeleopClient.disconnect() called
  → Connection.disconnect()
  → TeleopClient stops keepalive timer
  → GamepadHandler.stop()
  → Server watchdog fires after 500ms → zero velocity published → robot stops
```

---

## 7. Testing

### 7.1 Philosophy

Integration tests only. No mocks. Tests connect to the real WebSocket server and assert on actual responses. Gamepad input is manual — it is a hardware boundary that automated tests cannot cover.

### 7.2 Test cases

| Test | What it verifies |
|---|---|
| Connect with valid token | Status message received (`connected: true`, `robot_type` present) |
| Connect with invalid token | Connection rejected (HTTP 401, `onError` fires) |
| Send twist | No error response received; server does not close connection |
| Keepalive ping | Pong received within 250ms |
| No message for 600ms | Server closes connection; `onClose` fires |
| Send malformed message via `Connection.send()` | Error response received |
| Second client connects while first is active | Rejected with `{"type":"error","message":"already connected"}` |

### 7.3 Test runner setup

Tests run in Node.js via Vitest. The server must be running before the suite executes.

`connection.ts` uses `globalThis.WebSocket`, which is available natively in Node.js 20+. The `builder` Docker stage must use Node 20+ (e.g. `node:20-slim`) so the same `TeleopClient` code runs in both the browser and the Vitest environment without a polyfill.

A `test` profile is added to `docker-compose.yml`:
```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

This starts the server and runs the integration suite. Uses the same `TELEOP_TOKEN` env var as the server.

---

## 8. Deployment (Docker)

`Dockerfile.webclient` is a two-stage build:
- **`builder` stage** — installs Node.js dev deps, runs `tsc`, outputs `dist/`
- **`runtime` stage** — copies `dist/` into nginx's `/usr/share/nginx/html`

`docker-compose.yml` additions:
- `webclient` service: builds from `Dockerfile.webclient`, exposes port `8080`
- `webclient-test` service (profile: `test`): runs Vitest integration suite, depends on `teleop-server`

**Full stack start:**
```bash
TELEOP_TOKEN=mysecrettoken docker compose up --build
```

Phone navigates to `http://<robot-ip>:8080?token=mysecrettoken`.

---

## 9. Out of Scope (this spec)

- **Visual UI design** — joystick overlay, status indicators, connection screen; deferred to the next phase
- **On-screen button input** — routes through `TeleopClient.sendTwist()` when built; no architectural changes required
- **Android native app** — stretch goal, separate spec
- **Touch input handling** — part of the UI phase
- **Auto-reconnect on disconnect** — not designed; disconnection is explicit
- **HTTPS / WSS** — out of scope; assumed local network or VPN. When TLS is needed: configure nginx for TLS termination and change `ws://` to `wss://` at the `TeleopClient.connect()` call site — no other code changes required
