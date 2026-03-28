# pocket-teleop Practical Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-reconnection with exponential backoff to `TeleopClient`, a gamepad profile system (built-in + user-saved) with `localStorage` persistence, and a browser-based calibration UI for axis and button mapping.

**Architecture:** `gamepad_profiles.ts` is a new pure module (types + built-ins + `localStorage` I/O). `GamepadHandler` imports it for auto-matching and profile-aware polling. `TeleopClient` gains a private retry loop, `onReconnecting` callback, and forwards `onButton`. The calibration UI lives entirely as an inline `<script>` in `index.html` — no new `.ts` files for UI logic. No server changes required.

**Tech Stack:** TypeScript 5 (`module: Node16`, `moduleResolution: node16`), Vitest (Node.js), Docker Compose. All changes are in `web-client/`.

---

## File Map

| File | Change |
|---|---|
| `web-client/src/gamepad_profiles.ts` | **New** — `AxisConfig`, `AxisMapping`, `ButtonMapping`, `GamepadProfile` types; 4 built-in profiles; `matchProfile`, `getAllProfiles`, `saveProfile`, `loadCustomProfiles`, `deleteProfile` |
| `web-client/src/gamepad_handler.ts` | Add `profile` + `onButton` constructor options; auto-match on first gamepad; `setProfile()` public method; axis reads via `AxisConfig`; rising-edge button detection |
| `web-client/src/teleop_client.ts` | Add `maxRetries`, `retryBaseDelayMs`, `onReconnecting`, `onButton` options; private retry loop; `intentionalDisconnect` flag; `setGamepadProfile()` public method |
| `web-client/src/connection.ts` | Add `this.ws?.close()` safety guard at start of `connect()` |
| `web-client/index.html` | Add `<button id="reconnect-btn">`; add `onReconnecting` countdown; add `<details id="gamepad-config">` calibration UI |
| `web-client/test/gamepad_profiles.test.ts` | **New** — unit tests for `matchProfile` and `loadCustomProfiles` |
| `web-client/test/integration.test.ts` | Add reconnection test to Safety describe block |

---

## Task 1: `gamepad_profiles.ts` — types, built-ins, persistence

**Files:**
- Create: `web-client/src/gamepad_profiles.ts`
- Create: `web-client/test/gamepad_profiles.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `web-client/test/gamepad_profiles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { matchProfile, loadCustomProfiles } from '../src/gamepad_profiles.js';

describe('matchProfile', () => {
  it('returns Xbox profile for Xbox id string', () => {
    const profile = matchProfile('Xbox 360 Controller (XInput STANDARD GAMEPAD)');
    expect(profile.name).toBe('Xbox');
  });

  it('returns DualShock profile for Sony vendor id string', () => {
    const profile = matchProfile('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)');
    expect(profile.name).toBe('DualShock / DualSense');
  });

  it('returns Generic for unknown id string', () => {
    const profile = matchProfile('Unknown Controller 1234:5678');
    expect(profile.name).toBe('Generic');
  });

  it('returns Generic when id is empty string', () => {
    const profile = matchProfile('');
    expect(profile.name).toBe('Generic');
  });

  it('returns a copy — mutating result does not affect next call', () => {
    const p1 = matchProfile('');
    p1.name = 'mutated';
    const p2 = matchProfile('');
    expect(p2.name).toBe('Generic');
  });
});

describe('loadCustomProfiles', () => {
  it('returns empty array when localStorage is absent', () => {
    const profiles = loadCustomProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect failure (module does not exist)**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm --build webclient-test 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../src/gamepad_profiles.js'`

- [ ] **Step 3: Implement `web-client/src/gamepad_profiles.ts`**

```typescript
export interface AxisConfig {
  axis: number;
  invert: boolean;
}

export interface AxisMapping {
  lx: AxisConfig;
  ly: AxisConfig;
  az: AxisConfig;
}

export type ButtonMapping = Record<string, number>;

export interface GamepadProfile {
  name: string;
  idPattern: RegExp;
  mapping: AxisMapping;
  buttons: ButtonMapping;
}

const STANDARD: AxisMapping = {
  lx: { axis: 1, invert: true },
  ly: { axis: 0, invert: true },
  az: { axis: 2, invert: true },
};

const BUILT_INS: GamepadProfile[] = [
  {
    name: 'Xbox',
    idPattern: /xbox|xinput/i,
    mapping: STANDARD,
    buttons: {},
  },
  {
    name: 'DualShock / DualSense',
    idPattern: /054c/i,
    mapping: { lx: { axis: 1, invert: true }, ly: { axis: 0, invert: true }, az: { axis: 3, invert: true } },
    buttons: {},
  },
  {
    // TODO: verify gamepad.id on hardware — connect G8+ to Pi5, open
    // http://localhost:8080 in a browser, open DevTools console, look for the
    // "Gamepad detected:" log line, and replace /gamesir/i with the actual id.
    name: 'GameSir G8+',
    idPattern: /gamesir/i,
    mapping: STANDARD,
    buttons: {},
  },
  {
    name: 'Generic',
    idPattern: /.*/,
    mapping: STANDARD,
    buttons: {},
  },
];

const STORAGE_KEY = 'pocket-teleop.gamepad-profiles';

type StoredProfile = { name: string; mapping: AxisMapping; buttons: ButtonMapping };

function loadRaw(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredProfile[];
  } catch {
    return [];
  }
}

function copyProfile(p: GamepadProfile): GamepadProfile {
  return {
    name: p.name,
    idPattern: p.idPattern,
    mapping: {
      lx: { ...p.mapping.lx },
      ly: { ...p.mapping.ly },
      az: { ...p.mapping.az },
    },
    buttons: { ...p.buttons },
  };
}

export function matchProfile(gamepadId: string): GamepadProfile {
  for (const p of BUILT_INS) {
    if (p.idPattern.test(gamepadId)) {
      return copyProfile(p);
    }
  }
  return copyProfile(BUILT_INS[BUILT_INS.length - 1]!);
}

export function getAllProfiles(): GamepadProfile[] {
  const customs = loadCustomProfiles();
  return [...BUILT_INS.map(copyProfile), ...customs];
}

export function loadCustomProfiles(): GamepadProfile[] {
  return loadRaw().map((s) => ({
    name: s.name,
    idPattern: /.*/,
    mapping: s.mapping,
    buttons: s.buttons,
  }));
}

export function saveProfile(name: string, mapping: AxisMapping, buttons: ButtonMapping): void {
  try {
    const all = loadRaw();
    const idx = all.findIndex((s) => s.name === name);
    const entry: StoredProfile = { name, mapping, buttons };
    if (idx >= 0) {
      all[idx] = entry;
    } else {
      all.push(entry);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function deleteProfile(name: string): void {
  try {
    const all = loadRaw().filter((s) => s.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable — silently ignore
  }
}
```

- [ ] **Step 4: Run tests — expect all 6 new tests to pass, existing 10 to still pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm --build webclient-test 2>&1 | tail -20
```

Expected:
```
Test Files  2 passed (2)
     Tests  16 passed (16)
```

- [ ] **Step 5: Commit**

```bash
git add web-client/src/gamepad_profiles.ts web-client/test/gamepad_profiles.test.ts
git commit -m "feat: add gamepad_profiles.ts — types, built-ins, localStorage persistence"
```

---

## Task 2: `GamepadHandler` — profile support and button detection

> No new tests (browser-only Gamepad API). Verify by TypeScript compilation and existing tests staying green.

**Files:**
- Modify: `web-client/src/gamepad_handler.ts`

- [ ] **Step 1: Replace `web-client/src/gamepad_handler.ts`**

```typescript
import { matchProfile } from './gamepad_profiles.js';
import type { GamepadProfile } from './gamepad_profiles.js';

export type { GamepadProfile };

export interface GamepadHandlerOptions {
  intervalMs?: number;
  onTwist: (lx: number, ly: number, az: number) => void;
  profile?: GamepadProfile;
  onButton?: (action: string) => void;
}

export class GamepadHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly onTwist: (lx: number, ly: number, az: number) => void;
  private readonly onButton: ((action: string) => void) | undefined;
  private profile: GamepadProfile | null;
  private prevButtons: boolean[] = [];

  constructor(options: GamepadHandlerOptions) {
    this.intervalMs = options.intervalMs ?? 200;
    this.onTwist = options.onTwist;
    this.onButton = options.onButton;
    this.profile = options.profile ?? null;
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

  setProfile(profile: GamepadProfile): void {
    this.profile = profile;
  }

  private poll(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads.find((g) => g !== null) ?? null;
    if (gp === null) return;

    if (this.profile === null) {
      this.profile = matchProfile(gp.id);
      console.log(`Gamepad detected: ${gp.id} → profile: ${this.profile.name}`);
    }

    const { lx, ly, az } = this.profile.mapping;
    const lxVal = (gp.axes[lx.axis] ?? 0) * (lx.invert ? -1 : 1);
    const lyVal = (gp.axes[ly.axis] ?? 0) * (ly.invert ? -1 : 1);
    const azVal = (gp.axes[az.axis] ?? 0) * (az.invert ? -1 : 1);
    this.onTwist(lxVal, lyVal, azVal);

    if (this.onButton !== undefined) {
      for (const [action, buttonIndex] of Object.entries(this.profile.buttons)) {
        const pressed = (gp.buttons[buttonIndex]?.pressed) ?? false;
        const wasPressed = this.prevButtons[buttonIndex] ?? false;
        if (pressed && !wasPressed) {
          this.onButton(action);
        }
        this.prevButtons[buttonIndex] = pressed;
      }
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd web-client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite — 16 tests still pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm --build webclient-test 2>&1 | tail -10
```

Expected: `Tests  16 passed (16)`

- [ ] **Step 4: Commit**

```bash
git add web-client/src/gamepad_handler.ts
git commit -m "feat: GamepadHandler — profile auto-match, AxisConfig axis reads, onButton detection"
```

---

## Task 3: `TeleopClient` — reconnection + `onButton` + integration test

**Files:**
- Modify: `web-client/src/connection.ts`
- Modify: `web-client/src/teleop_client.ts`
- Modify: `web-client/test/integration.test.ts`

- [ ] **Step 1: Add reconnection integration test (RED)**

Add the following test to the `Safety` describe block in `web-client/test/integration.test.ts`, after the `'second client is rejected'` test:

```typescript
  it('TeleopClient reconnects after being kicked by second connection', async () => {
    let initialStatusReceived = false;
    let reconnectingCount = 0;

    const result = await new Promise<{ reconnected: boolean; reconnectingCount: number }>(
      (resolve, reject) => {
        const client = new TeleopClient({
          maxRetries: 3,
          retryBaseDelayMs: 500,
          onStatus: () => {
            if (!initialStatusReceived) {
              initialStatusReceived = true;
              // Kick client by connecting a second one to occupy the slot
              const kicker = new Connection({
                onMessage: () => {},
                onOpen: () => {
                  // Vacate the slot after 1s, allowing client to reconnect
                  setTimeout(() => kicker.disconnect(), 1000);
                },
                onClose: () => {},
                onError: () => reject(new Error('kicker error')),
              });
              kicker.connect(VALID_URL);
            } else {
              client.disconnect();
              resolve({ reconnected: true, reconnectingCount });
            }
          },
          onReconnecting: () => { reconnectingCount += 1; },
          onClose: () => {},
          onError: () => {},
        });
        client.connect(VALID_URL);
        setTimeout(() => reject(new Error('reconnection timeout')), 10000);
      }
    );

    expect(result.reconnected).toBe(true);
    expect(result.reconnectingCount).toBeGreaterThanOrEqual(1);
  }, 12000);
```

- [ ] **Step 2: Run — expect the new test to fail (TeleopClient has no `maxRetries` option)**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm --build webclient-test 2>&1 | tail -20
```

Expected: FAIL — test times out (client never reconnects because no retry logic exists).

- [ ] **Step 3: Add safety guard to `web-client/src/connection.ts`**

Replace the `connect` method:

```typescript
  connect(url: string): void {
    // Close any pre-existing socket — no-op if already closed; guards against
    // reconnection calls leaving orphaned sockets.
    this.ws?.close();
    this.ws = new globalThis.WebSocket(url);
    this.ws.onmessage = (e: MessageEvent) => this.callbacks.onMessage(e.data as string);
    this.ws.onopen = () => this.callbacks.onOpen();
    this.ws.onclose = (e: CloseEvent) => this.callbacks.onClose(e.code, e.reason);
    this.ws.onerror = (e: Event) => this.callbacks.onError(e);
  }
```

- [ ] **Step 4: Replace `web-client/src/teleop_client.ts`**

```typescript
import { Connection } from './connection.js';
import { GamepadHandler } from './gamepad_handler.js';
import type { GamepadProfile } from './gamepad_profiles.js';
import { buildPing, buildTwist, parseMessage } from './protocol.js';

export interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
  onReconnecting?: (attempt: number, maxAttempts: number, delayMs: number) => void;
  onButton?: (action: string) => void;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export class TeleopClient {
  private readonly connection: Connection;
  private readonly gamepadHandler: GamepadHandler;
  private keepaliveId: ReturnType<typeof setInterval> | null = null;
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = 0;
  private url = '';
  private intentionalDisconnect = false;
  private retryAttempt = 0;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly options: TeleopClientOptions;

  constructor(options: TeleopClientOptions = {}) {
    this.options = options;
    this.maxRetries = options.maxRetries ?? 5;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 2000;
    this.connection = new Connection({
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => { this.retryAttempt = 0; },
      onClose: (code, reason) => {
        this.stopKeepalive();
        this.gamepadHandler.stop();
        if (this.intentionalDisconnect) {
          this.options.onClose?.(code, reason);
          return;
        }
        this.scheduleRetry();
      },
      onError: (e) => {
        this.options.onError?.((e as ErrorEvent).message ?? 'connection error');
      },
    });
    this.gamepadHandler = new GamepadHandler({
      onTwist: (lx, ly, az) => this.sendTwist(lx, ly, az),
      onButton: (action) => this.options.onButton?.(action),
    });
  }

  connect(url: string): void {
    this.url = url;
    this.intentionalDisconnect = false;
    this.retryAttempt = 0;
    this.connection.connect(url);
    this.startKeepalive();
    this.gamepadHandler.start();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.retryTimeoutId !== null) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.stopKeepalive();
    this.gamepadHandler.stop();
    this.connection.disconnect();
  }

  setGamepadProfile(profile: GamepadProfile): void {
    this.gamepadHandler.setProfile(profile);
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

  private scheduleRetry(): void {
    this.retryAttempt += 1;
    if (this.retryAttempt > this.maxRetries) {
      this.options.onClose?.(0, 'max retries exceeded');
      return;
    }
    const delayMs = this.retryBaseDelayMs * Math.pow(2, this.retryAttempt - 1);
    this.options.onReconnecting?.(this.retryAttempt, this.maxRetries, delayMs);
    this.retryTimeoutId = setTimeout(() => {
      this.retryTimeoutId = null;
      this.connection.connect(this.url);
      this.startKeepalive();
      this.gamepadHandler.start();
    }, delayMs);
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

- [ ] **Step 5: Run full test suite — expect all 17 tests to pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm --build webclient-test 2>&1 | tail -15
```

Expected:
```
Test Files  2 passed (2)
     Tests  17 passed (17)
```

- [ ] **Step 6: Commit**

```bash
git add web-client/src/connection.ts web-client/src/teleop_client.ts web-client/test/integration.test.ts
git commit -m "feat: TeleopClient reconnection with exponential backoff; onButton forwarding"
```

---

## Task 4: `index.html` — reconnect UI and calibration UI

> No automated tests. Verified by docker build succeeding and manual smoke test.

**Files:**
- Modify: `web-client/index.html`

- [ ] **Step 1: Replace `web-client/index.html`**

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
  <button id="reconnect-btn" style="display:none">Reconnect</button>

  <details id="gamepad-config" style="display:none">
    <summary>Configure gamepad</summary>

    <p>
      <label for="profile-select">Profile: </label>
      <select id="profile-select"></select>
      <button id="profile-delete" style="display:none">Delete</button>
    </p>

    <div id="axis-calibration">
      <h3>Axis calibration</h3>
      <p id="cal-instruction">Press <strong>Start</strong> to calibrate axes from scratch, or skip to use the selected profile as-is.</p>
      <button id="cal-start">Start calibration</button>
      <button id="cal-next" style="display:none">Next</button>
      <button id="cal-skip" style="display:none">Skip step</button>
    </div>

    <div id="button-assignments">
      <h3>Button assignments</h3>
      <ul id="button-list"></ul>
      <div id="button-add-form">
        <input id="button-action-input" placeholder="action name (e.g. emergency_stop)" style="width:220px" />
        <button id="button-add-start">Add</button>
        <span id="button-waiting" style="display:none"> — press a button on the gamepad…</span>
      </div>
    </div>

    <p>
      <input id="save-name-input" placeholder="Save profile as…" style="width:200px" />
      <button id="save-btn">Save</button>
    </p>
  </details>

  <script type="module">
    import { TeleopClient } from '/dist/teleop_client.js';
    import { matchProfile, getAllProfiles, saveProfile, deleteProfile } from '/dist/gamepad_profiles.js';

    // ── Connection ────────────────────────────────────────────────────────────

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    const wsUrl = `ws://${window.location.hostname}:9091/teleop?token=${encodeURIComponent(token)}`;

    const statusEl      = document.getElementById('status');
    const reconnectBtn  = document.getElementById('reconnect-btn');

    let countdownInterval = null;

    function clearCountdown() {
      if (countdownInterval !== null) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    const client = new TeleopClient({
      maxRetries: 5,
      retryBaseDelayMs: 2000,
      onStatus: (_connected, robotType) => {
        clearCountdown();
        reconnectBtn.style.display = 'none';
        statusEl.textContent = `Connected — robot type: ${robotType}`;
      },
      onError: (msg) => {
        statusEl.textContent = `Error: ${msg}`;
      },
      onReconnecting: (attempt, maxAttempts, delayMs) => {
        clearCountdown();
        reconnectBtn.style.display = 'none';
        let remaining = Math.ceil(delayMs / 1000);
        statusEl.textContent = `Reconnecting in ${remaining}s (attempt ${attempt}/${maxAttempts})…`;
        countdownInterval = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearCountdown();
            statusEl.textContent = `Reconnecting… (attempt ${attempt}/${maxAttempts})`;
          } else {
            statusEl.textContent = `Reconnecting in ${remaining}s (attempt ${attempt}/${maxAttempts})…`;
          }
        }, 1000);
      },
      onClose: () => {
        clearCountdown();
        statusEl.textContent = 'Disconnected';
        reconnectBtn.style.display = 'inline';
      },
      onButton: (action) => {
        console.log(`Button action: ${action}`);
      },
    });

    reconnectBtn.addEventListener('click', () => {
      reconnectBtn.style.display = 'none';
      statusEl.textContent = 'Connecting…';
      client.connect(wsUrl);
    });

    client.connect(wsUrl);

    // ── Calibration UI ────────────────────────────────────────────────────────

    const gamepadConfig   = document.getElementById('gamepad-config');
    const profileSelect   = document.getElementById('profile-select');
    const profileDeleteBtn = document.getElementById('profile-delete');
    const calInstruction  = document.getElementById('cal-instruction');
    const calStartBtn     = document.getElementById('cal-start');
    const calNextBtn      = document.getElementById('cal-next');
    const calSkipBtn      = document.getElementById('cal-skip');
    const buttonList      = document.getElementById('button-list');
    const buttonActionInput = document.getElementById('button-action-input');
    const buttonAddStart  = document.getElementById('button-add-start');
    const buttonWaiting   = document.getElementById('button-waiting');
    const saveNameInput   = document.getElementById('save-name-input');
    const saveBtn         = document.getElementById('save-btn');

    // Working state — starts as a copy of the selected profile's mapping
    let workingMapping = { lx: { axis: 1, invert: true }, ly: { axis: 0, invert: true }, az: { axis: 2, invert: true } };
    let workingButtons = {};
    let listeningForButton = false;

    // Calibration state machine: idle → step1 → step2 → step3 → done
    let calState = 'idle';
    const CAL_STEPS = [
      { key: 'lx', instruction: 'Push the <strong>left stick fully forward</strong> and hold…' },
      { key: 'ly', instruction: 'Push the <strong>left stick fully right</strong> and hold…' },
      { key: 'az', instruction: 'Push the <strong>right stick fully right</strong> and hold…' },
    ];
    let calStepIndex = 0;
    let calSamples = [];
    let calSampleInterval = null;

    function populateProfileDropdown() {
      const profiles = getAllProfiles();
      profileSelect.innerHTML = '';
      for (const p of profiles) {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        profileSelect.appendChild(opt);
      }
      updateDeleteButton();
    }

    function updateDeleteButton() {
      const builtIns = ['Xbox', 'DualShock / DualSense', 'GameSir G8+', 'Generic'];
      const isCustom = !builtIns.includes(profileSelect.value);
      profileDeleteBtn.style.display = isCustom ? 'inline' : 'none';
    }

    function applySelectedProfile() {
      const profiles = getAllProfiles();
      const selected = profiles.find((p) => p.name === profileSelect.value);
      if (!selected) return;
      workingMapping = {
        lx: { ...selected.mapping.lx },
        ly: { ...selected.mapping.ly },
        az: { ...selected.mapping.az },
      };
      workingButtons = { ...selected.buttons };
      client.setGamepadProfile(selected);
      renderButtonList();
    }

    profileSelect.addEventListener('change', () => {
      updateDeleteButton();
      applySelectedProfile();
    });

    profileDeleteBtn.addEventListener('click', () => {
      deleteProfile(profileSelect.value);
      populateProfileDropdown();
      applySelectedProfile();
    });

    // Calibration step logic
    calStartBtn.addEventListener('click', () => {
      calStepIndex = 0;
      calState = 'step1';
      startCalStep();
    });

    function startCalStep() {
      const step = CAL_STEPS[calStepIndex];
      calInstruction.innerHTML = step.instruction;
      calStartBtn.style.display = 'none';
      calNextBtn.style.display = 'none';
      calSkipBtn.style.display = 'inline';
      calSamples = [];

      calSampleInterval = setInterval(() => {
        const gamepads = navigator.getGamepads();
        const gp = Array.from(gamepads).find((g) => g !== null) ?? null;
        if (!gp) return;
        calSamples.push([...gp.axes]);
        if (calSamples.length >= 5) {
          clearInterval(calSampleInterval);
          calSampleInterval = null;
          commitCalStep();
        }
      }, 200);
    }

    function commitCalStep() {
      // Find the axis with the largest mean absolute deflection
      const axisCount = calSamples[0].length;
      let maxMean = 0;
      let maxAxis = 0;
      for (let a = 0; a < axisCount; a++) {
        const mean = calSamples.reduce((sum, s) => sum + Math.abs(s[a] ?? 0), 0) / calSamples.length;
        if (mean > maxMean) { maxMean = mean; maxAxis = a; }
      }
      // Determine inversion: if mean value is negative, invert so output is positive
      const meanVal = calSamples.reduce((sum, s) => sum + (s[maxAxis] ?? 0), 0) / calSamples.length;
      const invert = meanVal < 0;
      workingMapping[CAL_STEPS[calStepIndex].key] = { axis: maxAxis, invert };
      advanceCalStep();
    }

    function advanceCalStep() {
      calStepIndex += 1;
      if (calStepIndex >= CAL_STEPS.length) {
        calState = 'done';
        calInstruction.textContent = 'Axis calibration complete. Save the profile below.';
        calStartBtn.style.display = 'inline';
        calStartBtn.textContent = 'Recalibrate';
        calNextBtn.style.display = 'none';
        calSkipBtn.style.display = 'none';
      } else {
        startCalStep();
      }
    }

    calSkipBtn.addEventListener('click', () => {
      if (calSampleInterval !== null) { clearInterval(calSampleInterval); calSampleInterval = null; }
      advanceCalStep();
    });

    // Button assignment
    function renderButtonList() {
      buttonList.innerHTML = '';
      for (const [action, idx] of Object.entries(workingButtons)) {
        const li = document.createElement('li');
        li.textContent = `${action} → button ${idx} `;
        const rm = document.createElement('button');
        rm.textContent = 'Remove';
        rm.addEventListener('click', () => {
          delete workingButtons[action];
          renderButtonList();
        });
        li.appendChild(rm);
        buttonList.appendChild(li);
      }
    }

    buttonAddStart.addEventListener('click', () => {
      const actionName = buttonActionInput.value.trim();
      if (!actionName) return;
      buttonWaiting.style.display = 'inline';
      buttonAddStart.disabled = true;
      listeningForButton = true;
    });

    // Detect button presses while listening
    setInterval(() => {
      if (!listeningForButton) return;
      const gamepads = navigator.getGamepads();
      const gp = Array.from(gamepads).find((g) => g !== null) ?? null;
      if (!gp) return;
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i]?.pressed) {
          workingButtons[buttonActionInput.value.trim()] = i;
          listeningForButton = false;
          buttonWaiting.style.display = 'none';
          buttonAddStart.disabled = false;
          buttonActionInput.value = '';
          renderButtonList();
          break;
        }
      }
    }, 100);

    // Save profile
    saveBtn.addEventListener('click', () => {
      const name = saveNameInput.value.trim();
      if (!name) return;
      saveProfile(name, workingMapping, workingButtons);
      populateProfileDropdown();
      profileSelect.value = name;
      updateDeleteButton();
      saveNameInput.value = '';
    });

    // Detect first gamepad connection
    let gamepadDetected = false;
    setInterval(() => {
      if (gamepadDetected) return;
      const gamepads = navigator.getGamepads();
      const gp = Array.from(gamepads).find((g) => g !== null) ?? null;
      if (gp !== null) {
        gamepadDetected = true;
        gamepadConfig.style.display = '';
        populateProfileDropdown();
        applySelectedProfile();
      }
    }, 500);
  </script>
</body>
</html>
```

- [ ] **Step 2: Build the full stack and verify nginx serves the page**

```bash
TELEOP_TOKEN=testtoken docker compose up --build --wait webclient 2>&1 | tail -10
```

Expected: `Container ...-webclient-1  Healthy`

```bash
curl -s http://localhost:8080/ | grep -c "Configure gamepad"
```

Expected: `1`

- [ ] **Step 3: Run full test suite — all 17 tests still pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm --build webclient-test 2>&1 | tail -10
```

Expected: `Tests  17 passed (17)`

- [ ] **Step 4: Commit**

```bash
git add web-client/index.html
git commit -m "feat: add reconnect countdown UI and gamepad calibration UI to index.html"
```

---

## Task 5: Full verification, AGENTS.md update, tag

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Run full integration suite one final time**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm --build webclient-test 2>&1
```

Expected:
```
Test Files  2 passed (2)
     Tests  17 passed (17)
```

- [ ] **Step 2: Build the full stack**

```bash
TELEOP_TOKEN=testtoken docker compose up --build --wait 2>&1 | tail -5
```

Expected: both `teleop-server` and `webclient` healthy, no errors.

- [ ] **Step 3: Manual smoke test on device**

Navigate to `http://<robot-ip>:8080?token=<token>`. Confirm:
- "Connected — robot type: diff_drive" appears
- Connecting a GameSir G8+ shows the "Configure gamepad" section
- Console logs `Gamepad detected: <id> → profile: GameSir G8+` (or Generic if id didn't match)
- If the profile logged is "Generic" instead of "GameSir G8+", update the `idPattern` in `gamepad_profiles.ts`:
  - Note the exact `id` string from the console
  - Change `/gamesir/i` to a pattern that matches it (e.g. `/G8/i`)
  - Re-run tests, rebuild, re-verify
  - Add a deviation row to AGENTS.md Known deviations table

- [ ] **Step 4: Update `AGENTS.md`**

Update the Handoff State section. Run `git rev-parse --short HEAD` after staging files but before committing to get the SHA, then fill it in.

- Summary line: "Practical gaps complete: reconnection, gamepad profiles, calibration UI. 17 tests pass. Tag `v0.2.0` applied."
- Add the following rows to the task table (create a new `### Task progress (practical gaps)` subsection):

| Task | Status | Notes |
|---|---|---|
| Reconnection | ✅ Done | `TeleopClient` retries with exponential backoff; `onReconnecting` callback; `onClose` fires only on intentional disconnect or retry exhaustion |
| Gamepad profiles | ✅ Done | `gamepad_profiles.ts`; 4 built-ins (Xbox, DualShock/DualSense, GameSir G8+, Generic); `localStorage` persistence; `getAllProfiles`, `matchProfile`, `saveProfile`, `deleteProfile` |
| Calibration UI | ✅ Done | `index.html` `<details>` — profile selector, 3-step axis calibration, button assignment, save-as |

- If the GameSir G8+ id pattern was corrected in Step 3, add a deviation row.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: mark practical gaps complete — 17 tests, reconnection + gamepad profiles"
```

- [ ] **Step 6: Update AGENTS.md head SHA, commit, tag, and push**

```bash
# Get the SHA of the commit you just made
git rev-parse --short HEAD

# Edit AGENTS.md: update Head SHA to the value above
# Then:
git add AGENTS.md
git commit -m "docs: update AGENTS.md head SHA"
git tag v0.2.0
git push && git push --tags
```

---

## Expected final state

| Metric | Value |
|---|---|
| Test files | 2 (`integration.test.ts`, `gamepad_profiles.test.ts`) |
| Total tests | 17 |
| Tag | `v0.2.0` |
| New files | `web-client/src/gamepad_profiles.ts`, `web-client/test/gamepad_profiles.test.ts` |
| Modified files | `connection.ts`, `gamepad_handler.ts`, `teleop_client.ts`, `index.html`, `integration.test.ts`, `AGENTS.md` |
