# Touch Joystick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add floating on-screen touch joysticks for holonomic robot control, a robot namespace field in settings, responsive layout improvements, and fix several existing UI bugs.

**Architecture:** New `TouchJoystick` class compiled alongside existing modules. `GamepadHandler` gains `setEnabled`/`onActivity`; `TeleopClient` gains `setGamepadEnabled`/`onGamepadActivity`. `settings.ts` gains namespace helpers. `index.html` fully rewritten with new layout (velocity overlay, robot name strip, fixed joystick zones, Connection drawer page) and input-source switching logic.

**Tech Stack:** TypeScript 5, Vitest 1.6, native ES modules, nginx static serving, jsdom TouchEvent simulation in tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `web-client/src/touch_joystick.ts` | Create | `TouchJoystick` class — floating touch input, normalised -1..1 output |
| `web-client/test/touch_joystick.test.ts` | Create | 8 unit tests using jsdom TouchEvent simulation |
| `web-client/src/settings.ts` | Modify | Add `SettingsPage 'connection'`, `loadRobotNamespace`, `saveRobotNamespace`, `clearRobotNamespace` |
| `web-client/test/settings.test.ts` | Modify | +2 tests for namespace round-trip |
| `web-client/src/gamepad_handler.ts` | Modify | Add `onActivity` option, `setEnabled(boolean)` method |
| `web-client/src/teleop_client.ts` | Modify | Add `onGamepadActivity` option, `setGamepadEnabled(boolean)` method |
| `web-client/index.html` | Rewrite | New layout + joystick wiring + input switching + bug fixes |

---

## Task 1: `TouchJoystick` module — TDD

**Files:**
- Create: `web-client/test/touch_joystick.test.ts`
- Create: `web-client/src/touch_joystick.ts`

- [ ] **Step 1: Write the failing tests**

Create `web-client/test/touch_joystick.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TouchJoystick } from '../src/touch_joystick.js';

function makeTouch(target: HTMLElement, clientX: number, clientY: number): Touch {
  return new Touch({ identifier: 1, target, clientX, clientY,
    pageX: clientX, pageY: clientY, screenX: clientX, screenY: clientY,
    radiusX: 0, radiusY: 0, rotationAngle: 0, force: 1 });
}

function fire(el: HTMLElement, type: string, clientX: number, clientY: number): void {
  const touch = makeTouch(el, clientX, clientY);
  el.dispatchEvent(new TouchEvent(type, {
    touches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
    changedTouches: [touch],
    bubbles: true,
  }));
}

describe('TouchJoystick', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('joystick base is hidden on init', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('touchstart shows the joystick base', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('block');
  });

  it('onMove fires with normalised values', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchmove', 150, 100); // dx=50, dy=0 → x=1.0, y=0.0
    expect(moves.length).toBe(1);
    expect(moves[0][0]).toBeCloseTo(1.0);
    expect(moves[0][1]).toBeCloseTo(0.0);
  });

  it('values clamp to -1..1 at max radius', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'touchstart', 0, 0);
    fire(container, 'touchmove', 200, 0); // dx=200 >> maxRadius=50 → clamp to x=1.0
    expect(moves[0][0]).toBeCloseTo(1.0);
  });

  it('onEnd fires when finger lifts', () => {
    let ended = false;
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => { ended = true; } });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchend', 100, 100);
    expect(ended).toBe(true);
  });

  it('joystick hides on touchend', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchend', 100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('joystick hides on touchcancel', () => {
    new TouchJoystick(container, { maxRadius: 50, onMove: () => {}, onEnd: () => {} });
    fire(container, 'touchstart', 100, 100);
    fire(container, 'touchcancel', 100, 100);
    const base = container.querySelector('.joystick-base') as HTMLElement;
    expect(base.style.display).toBe('none');
  });

  it('second touchstart updates origin', () => {
    const moves: [number, number][] = [];
    new TouchJoystick(container, { maxRadius: 50, onMove: (x, y) => moves.push([x, y]), onEnd: () => {} });
    fire(container, 'touchstart', 0, 0);
    fire(container, 'touchend', 0, 0);
    // New origin at (200, 200)
    fire(container, 'touchstart', 200, 200);
    fire(container, 'touchmove', 250, 200); // dx=50 → x=1.0
    expect(moves[0][0]).toBeCloseTo(1.0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -20
```

Expected: fails with `Cannot find module '../src/touch_joystick.js'`.

- [ ] **Step 3: Implement `touch_joystick.ts`**

Create `web-client/src/touch_joystick.ts`:

```typescript
export interface TouchJoystickOptions {
  maxRadius: number;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
}

export class TouchJoystick {
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private originX = 0;
  private originY = 0;
  private readonly options: TouchJoystickOptions;

  constructor(container: HTMLElement, options: TouchJoystickOptions) {
    this.options = options;

    this.base = document.createElement('div');
    this.base.className = 'joystick-base';
    this.base.style.display = 'none';

    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    container.appendChild(this.base);

    container.addEventListener('touchstart',  (e) => this.onTouchStart(e),  { passive: true });
    container.addEventListener('touchmove',   (e) => this.onTouchMove(e),   { passive: true });
    container.addEventListener('touchend',    () => this.onTouchEnd(),      { passive: true });
    container.addEventListener('touchcancel', () => this.onTouchEnd(),      { passive: true });
  }

  private onTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.originX = touch.clientX - rect.left;
    this.originY = touch.clientY - rect.top;
    this.base.style.display = 'block';
    this.base.style.position = 'absolute';
    this.base.style.left = `${this.originX}px`;
    this.base.style.top  = `${this.originY}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private onTouchMove(e: TouchEvent): void {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = (touch.clientX - rect.left) - this.originX;
    const dy = (touch.clientY - rect.top)  - this.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = dist > this.options.maxRadius ? this.options.maxRadius / dist : 1;
    const cdx = dx * scale;
    const cdy = dy * scale;
    this.knob.style.transform = `translate(calc(-50% + ${cdx}px), calc(-50% + ${cdy}px))`;
    this.options.onMove(cdx / this.options.maxRadius, cdy / this.options.maxRadius);
  }

  private onTouchEnd(): void {
    this.base.style.display = 'none';
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.options.onEnd();
  }
}
```

- [ ] **Step 4: Run tests — verify 51 pass (43 existing + 8 new)**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -15
```

Expected:
```
✓ test/touch_joystick.test.ts  (8 tests)
Tests  51 passed (51)
```

- [ ] **Step 5: Commit**

```bash
git add web-client/src/touch_joystick.ts web-client/test/touch_joystick.test.ts
git commit -m "feat: add TouchJoystick module — floating touch joystick with normalised output"
```

---

## Task 2: Settings namespace additions — TDD

**Files:**
- Modify: `web-client/test/settings.test.ts`
- Modify: `web-client/src/settings.ts`

- [ ] **Step 1: Add failing tests**

Append to `web-client/test/settings.test.ts` (inside the existing `vi.stubGlobal` pattern, add a new describe block after the existing ones):

```typescript
describe('robot namespace persistence', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem:    (key: string) => store[key] ?? null,
      setItem:    (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadRobotNamespace returns null when localStorage is empty', () => {
    expect(loadRobotNamespace()).toBeNull();
  });

  it('loadRobotNamespace returns saved value after saveRobotNamespace', () => {
    saveRobotNamespace('robot1');
    expect(loadRobotNamespace()).toBe('robot1');
  });
});
```

Update the import line at the top of `web-client/test/settings.test.ts`:

```typescript
import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl,
         loadRobotNamespace, saveRobotNamespace } from '../src/settings.js';
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -10
```

Expected: fails with `loadRobotNamespace is not a function`.

- [ ] **Step 3: Implement namespace additions in `settings.ts`**

Replace the entire contents of `web-client/src/settings.ts`:

```typescript
// Settings routing state and video URL / robot namespace persistence (localStorage).
const VIDEO_URL_KEY = 'pocket-teleop.video-url';
const NAMESPACE_KEY = 'pocket-teleop.robot-namespace';

export type SettingsPage = 'gamepad' | 'video' | 'connection';

export class SettingsRouter {
  activePage: SettingsPage = 'gamepad';
  onNavigate?: (page: SettingsPage) => void;

  navigate(page: SettingsPage): void {
    this.activePage = page;
    this.onNavigate?.(page);
  }
}

export function loadVideoUrl(): string | null {
  return localStorage.getItem(VIDEO_URL_KEY);
}

export function saveVideoUrl(url: string): void {
  localStorage.setItem(VIDEO_URL_KEY, url);
}

export function clearVideoUrl(): void {
  localStorage.removeItem(VIDEO_URL_KEY);
}

export function loadRobotNamespace(): string | null {
  return localStorage.getItem(NAMESPACE_KEY);
}

export function saveRobotNamespace(ns: string): void {
  localStorage.setItem(NAMESPACE_KEY, ns);
}

export function clearRobotNamespace(): void {
  localStorage.removeItem(NAMESPACE_KEY);
}
```

- [ ] **Step 4: Run tests — verify 53 pass (51 existing + 2 new)**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -10
```

Expected: `Tests  53 passed (53)`

- [ ] **Step 5: Commit**

```bash
git add web-client/src/settings.ts web-client/test/settings.test.ts
git commit -m "feat: add robot namespace persistence to settings.ts"
```

---

## Task 3: `GamepadHandler` — `setEnabled` + `onActivity`

**Files:**
- Modify: `web-client/src/gamepad_handler.ts`

No new tests — Gamepad API is browser-only (same precedent as existing handler tests).

- [ ] **Step 1: Add `onActivity` to options interface and `setEnabled` method**

Replace the entire contents of `web-client/src/gamepad_handler.ts`:

```typescript
import { matchProfile } from './gamepad_profiles.js';
import type { GamepadProfile } from './gamepad_profiles.js';

export type { GamepadProfile };

export interface GamepadHandlerOptions {
  intervalMs?: number;
  onTwist: (lx: number, ly: number, az: number) => void;
  profile?: GamepadProfile;
  onButton?: (action: string) => void;
  onActivity?: () => void;
}

export class GamepadHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly onTwist: (lx: number, ly: number, az: number) => void;
  private readonly onButton: ((action: string) => void) | undefined;
  private readonly onActivity: (() => void) | undefined;
  private profile: GamepadProfile | null;
  private prevButtons: boolean[] = [];
  private enabled = true;

  constructor(options: GamepadHandlerOptions) {
    this.intervalMs  = options.intervalMs ?? 200;
    this.onTwist     = options.onTwist;
    this.onButton    = options.onButton;
    this.onActivity  = options.onActivity;
    this.profile     = options.profile ?? null;
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

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
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

    // Track button rising edges and detect activity — regardless of enabled state.
    // This ensures a button press while touch is active still switches back to gamepad.
    let hasButtonActivity = false;
    const risingEdgeActions: string[] = [];
    for (const [action, buttonIndex] of Object.entries(this.profile.buttons)) {
      const pressed    = (gp.buttons[buttonIndex]?.pressed) ?? false;
      const wasPressed = this.prevButtons[buttonIndex] ?? false;
      if (pressed && !wasPressed) {
        hasButtonActivity = true;
        risingEdgeActions.push(action);
      }
      this.prevButtons[buttonIndex] = pressed;
    }

    const hasAxisActivity = Math.abs(lxVal) > 0.1 || Math.abs(lyVal) > 0.1 || Math.abs(azVal) > 0.1;
    if (hasAxisActivity || hasButtonActivity) this.onActivity?.();

    if (this.enabled) {
      this.onTwist(lxVal, lyVal, azVal);
      for (const action of risingEdgeActions) {
        this.onButton?.(action);
      }
    }
  }
}
```

- [ ] **Step 2: Run tests — verify still 53 pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -10
```

Expected: `Tests  53 passed (53)`

- [ ] **Step 3: Commit**

```bash
git add web-client/src/gamepad_handler.ts
git commit -m "feat: GamepadHandler — add setEnabled and onActivity"
```

---

## Task 4: `TeleopClient` — `setGamepadEnabled` + `onGamepadActivity`

**Files:**
- Modify: `web-client/src/teleop_client.ts`

- [ ] **Step 1: Add `onGamepadActivity` option and `setGamepadEnabled` method**

In `web-client/src/teleop_client.ts`, update `TeleopClientOptions` to add one field:

```typescript
export interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
  onReconnecting?: (attempt: number, maxAttempts: number, delayMs: number) => void;
  onButton?: (action: string) => void;
  onTwist?: (lx: number, ly: number, az: number) => void;
  onGamepadActivity?: () => void;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  keepaliveIntervalMs?: number;
}
```

Update the `GamepadHandler` construction in the `TeleopClient` constructor to wire `onActivity`:

```typescript
    this.gamepadHandler = new GamepadHandler({
      onTwist:    (lx, ly, az) => this.sendTwist(lx, ly, az),
      onButton:   (action) => this.options.onButton?.(action),
      onActivity: () => this.options.onGamepadActivity?.(),
    });
```

Add the `setGamepadEnabled` method after `setGamepadProfile`:

```typescript
  setGamepadEnabled(enabled: boolean): void {
    this.gamepadHandler.setEnabled(enabled);
  }
```

- [ ] **Step 2: Run tests — verify still 53 pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -10
```

Expected: `Tests  53 passed (53)`

- [ ] **Step 3: Commit**

```bash
git add web-client/src/teleop_client.ts
git commit -m "feat: TeleopClient — add setGamepadEnabled and onGamepadActivity"
```

---

## Task 5: Rewrite `index.html`

**Files:**
- Rewrite: `web-client/index.html`

- [ ] **Step 1: Replace the entire contents of `web-client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pocket-teleop</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #ffffff;
      --surface: #f5f5f5;
      --border: #e0e0e0;
      --text: #111111;
      --text-muted: #666666;
      --accent: #0070f3;
      --warn: #f59e0b;
      --danger: #ef4444;
      --header-h: 48px;
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111111;
        --surface: #1e1e1e;
        --border: #333333;
        --text: #f0f0f0;
        --text-muted: #999999;
      }
    }

    html, body { height: 100%; }
    body { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }

    /* ── Header ─────────────────────────────────── */
    #app-header {
      flex: 0 0 var(--header-h);
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
      z-index: 40;
    }
    #menu-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 20px;
      color: var(--text);
      padding: 6px 8px;
      border-radius: 6px;
      line-height: 1;
    }
    #menu-btn:hover { background: var(--surface); }
    #app-title { flex: 1; text-align: center; font-weight: 600; font-size: 15px; }

    /* ── Status pill ────────────────────────────── */
    .pill {
      font-size: 12px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 99px;
      border: 1px solid currentColor;
      background: transparent;
      white-space: nowrap;
      color: var(--text-muted);
      cursor: default;
    }
    .pill:disabled { cursor: default; opacity: 1; }
    .pill-connected { color: #16a34a; }
    .pill-warn      { color: var(--warn); }
    .pill-danger    { color: var(--danger); cursor: pointer; }

    /* ── Robot name strip ───────────────────────── */
    #robot-name-strip {
      flex: 0 0 auto;
      padding: 4px 16px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      background: var(--bg);
      display: none;
    }

    /* ── Video panel ────────────────────────────── */
    #video-panel {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--surface);
      position: relative;
    }
    #video-placeholder-box {
      aspect-ratio: 4 / 3;
      max-width: 100%;
      max-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #video-placeholder { color: var(--text-muted); font-size: 14px; text-align: center; padding: 16px; }
    #video-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }

    /* ── Velocity overlay ───────────────────────── */
    #vel-overlay {
      position: absolute;
      top: 0; left: 0; right: 0;
      background: rgba(0, 0, 0, 0.35);
      padding: 8px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 5;
      pointer-events: none;
    }
    .vel-row { display: flex; align-items: center; gap: 8px; }
    .vel-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.7); width: 16px; text-align: right; font-family: monospace; }
    .vel-track {
      position: relative;
      flex: 1;
      height: 6px;
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
    }
    .vel-fill {
      position: absolute;
      top: 0;
      height: 100%;
      background: rgba(255,255,255,0.8);
      border-radius: 3px;
      transition: left 100ms, width 100ms;
      left: 50%;
      width: 0;
    }
    .vel-value { font-size: 11px; font-family: monospace; color: rgba(255,255,255,0.7); width: 44px; text-align: right; }

    /* ── Backdrop ───────────────────────────────── */
    #backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 20;
    }
    #backdrop.visible { display: block; }

    /* ── Settings drawer ────────────────────────── */
    #drawer {
      position: fixed;
      top: 0; left: 0;
      height: 100%;
      width: 320px;
      background: var(--bg);
      border-right: 1px solid var(--border);
      z-index: 30;
      transform: translateX(-100%);
      transition: transform 250ms ease;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    #drawer.open { transform: translateX(0); }
    @media (max-width: 400px) { #drawer { width: 90vw; } }

    #drawer-header { padding: 16px; font-weight: 600; font-size: 15px; border-bottom: 1px solid var(--border); }

    #drawer-nav { list-style: none; border-bottom: 1px solid var(--border); }
    .nav-item {
      padding: 12px 16px;
      cursor: pointer;
      font-size: 14px;
      color: var(--text-muted);
      border-left: 3px solid transparent;
    }
    .nav-item:hover { background: var(--surface); }
    .nav-item.active { color: var(--accent); border-left-color: var(--accent); font-weight: 500; }

    .drawer-page { padding: 16px; display: flex; flex-direction: column; gap: 16px; }

    .drawer-page h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .drawer-page label { font-size: 14px; }
    .drawer-page select,
    .drawer-page input[type="text"] {
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--surface);
      color: var(--text);
      font-size: 14px;
      font-family: inherit;
    }
    .drawer-page button {
      padding: 7px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--surface);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }
    .drawer-page button:hover { background: var(--border); }
    .drawer-page button:disabled { opacity: 0.5; cursor: default; }
    .drawer-page ul { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .drawer-page li { font-size: 13px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }

    .field-group { display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .field-row { display: flex; gap: 8px; }
    .field-row input { flex: 1; }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-primary:hover { opacity: 0.9; background: var(--accent); }

    /* ── Joystick zones ─────────────────────────── */
    #joystick-left, #joystick-right {
      position: fixed;
      bottom: 0;
      width: 45vw;
      height: 45vh;
      z-index: 15;
      touch-action: none;
    }
    #joystick-left  { left: 0; }
    #joystick-right { right: 0; }

    /* ── Joystick elements (rendered by TouchJoystick) ── */
    .joystick-base {
      position: absolute;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(255,255,255,0.12);
      border: 2px solid rgba(255,255,255,0.4);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .joystick-knob {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(255,255,255,0.55);
      transform: translate(-50%, -50%);
    }
  </style>
</head>
<body>
  <div id="backdrop"></div>

  <nav id="drawer" aria-label="Settings">
    <div id="drawer-header">Settings</div>
    <ul id="drawer-nav">
      <li class="nav-item active" data-page="gamepad">Gamepad</li>
      <li class="nav-item" data-page="video">Video</li>
      <li class="nav-item" data-page="connection">Connection</li>
    </ul>

    <!-- Gamepad page -->
    <div id="page-gamepad" class="drawer-page">
      <div>
        <label for="profile-select">Profile</label><br>
        <div style="display:flex;gap:8px;margin-top:6px;align-items:center">
          <select id="profile-select"></select>
          <button id="profile-delete" style="display:none">Delete</button>
        </div>
      </div>

      <div id="axis-calibration">
        <h3>Axis calibration</h3>
        <p id="cal-instruction" style="font-size:13px;margin-top:6px">Press <strong>Start</strong> to calibrate axes from scratch, or skip to use the selected profile as-is.</p>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button id="cal-start">Start calibration</button>
          <button id="cal-next" style="display:none">Next</button>
          <button id="cal-skip" style="display:none">Skip step</button>
        </div>
      </div>

      <div id="button-assignments">
        <h3>Button assignments</h3>
        <ul id="button-list"></ul>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
          <input id="button-action-input" type="text" placeholder="action name (e.g. emergency_stop)" style="width:200px" />
          <button id="button-add-start">Add</button>
          <span id="button-waiting" style="display:none;font-size:13px;color:var(--text-muted)">press a button on the gamepad…</span>
        </div>
      </div>

      <div>
        <h3>Save profile</h3>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="save-name-input" type="text" placeholder="Profile name…" style="flex:1" />
          <button id="save-btn" class="btn-primary">Save</button>
        </div>
      </div>
    </div>

    <!-- Video page -->
    <div id="page-video" class="drawer-page" hidden>
      <div class="field-group">
        <span class="field-label">Stream URL</span>
        <div class="field-row">
          <input id="stream-url-input" type="text" placeholder="http://robot.local:8081/stream" />
        </div>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button id="video-apply-btn" class="btn-primary">Apply</button>
          <button id="video-clear-btn">Clear</button>
        </div>
      </div>
    </div>

    <!-- Connection page -->
    <div id="page-connection" class="drawer-page" hidden>
      <div class="field-group">
        <span class="field-label">Robot namespace</span>
        <div class="field-row">
          <input id="namespace-input" type="text" placeholder="robot1" />
        </div>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button id="namespace-apply-btn" class="btn-primary">Apply</button>
          <button id="namespace-clear-btn">Clear</button>
        </div>
      </div>
    </div>
  </nav>

  <header id="app-header">
    <button id="menu-btn" aria-label="Open settings">☰</button>
    <span id="app-title">pocket-teleop</span>
    <button id="status-pill" class="pill" disabled>Connecting…</button>
  </header>

  <div id="robot-name-strip"></div>

  <main id="video-panel">
    <div id="vel-overlay">
      <div class="vel-row">
        <span class="vel-label">lx</span>
        <div class="vel-track"><div class="vel-fill" id="vel-fill-lx"></div></div>
        <span class="vel-value" id="vel-val-lx">—</span>
      </div>
      <div class="vel-row">
        <span class="vel-label">ly</span>
        <div class="vel-track"><div class="vel-fill" id="vel-fill-ly"></div></div>
        <span class="vel-value" id="vel-val-ly">—</span>
      </div>
      <div class="vel-row">
        <span class="vel-label">az</span>
        <div class="vel-track"><div class="vel-fill" id="vel-fill-az"></div></div>
        <span class="vel-value" id="vel-val-az">—</span>
      </div>
    </div>
    <div id="video-placeholder-box">
      <p id="video-placeholder">No video stream — configure one in Settings (☰)</p>
    </div>
    <img id="video-img" alt="video stream" style="display:none" />
  </main>

  <div id="joystick-left"></div>
  <div id="joystick-right"></div>

  <script type="module">
    import { TeleopClient } from '/dist/teleop_client.js';
    import { getAllProfiles, saveProfile, deleteProfile } from '/dist/gamepad_profiles.js';
    import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl,
             loadRobotNamespace, saveRobotNamespace, clearRobotNamespace } from '/dist/settings.js';
    import { TouchJoystick } from '/dist/touch_joystick.js';

    // ── Settings drawer ───────────────────────────────────────────────────────

    const drawer   = document.getElementById('drawer');
    const backdrop = document.getElementById('backdrop');
    const menuBtn  = document.getElementById('menu-btn');

    function openDrawer()  { drawer.classList.add('open');    backdrop.classList.add('visible'); }
    function closeDrawer() { drawer.classList.remove('open'); backdrop.classList.remove('visible'); }

    menuBtn.addEventListener('click', () =>
      drawer.classList.contains('open') ? closeDrawer() : openDrawer()
    );
    backdrop.addEventListener('click', closeDrawer);

    // ── Settings router ───────────────────────────────────────────────────────

    const router = new SettingsRouter();
    router.onNavigate = (page) => {
      document.querySelectorAll('.drawer-page').forEach((el) => { el.hidden = true; });
      document.getElementById(`page-${page}`).hidden = false;
      document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
      document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
    };
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', () => router.navigate(item.dataset.page));
    });
    router.navigate('gamepad'); // initialise: ensures only gamepad page is visible

    // ── Connection URL builder ────────────────────────────────────────────────

    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token') ?? '';

    function buildWsUrl() {
      const ns   = loadRobotNamespace();
      const base = `ws://${window.location.hostname}:9091/teleop?token=${encodeURIComponent(token)}`;
      return ns ? `${base}&ns=${encodeURIComponent(ns)}` : base;
    }

    // ── Status pill ───────────────────────────────────────────────────────────

    const statusPill = document.getElementById('status-pill');
    let countdownInterval = null;

    function clearCountdown() {
      if (countdownInterval !== null) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    function setStatus(state, text) {
      clearCountdown();
      statusPill.textContent = text;
      statusPill.className = 'pill';
      statusPill.disabled = state !== 'danger';
      if (state === 'connected') statusPill.classList.add('pill-connected');
      else if (state === 'warn')  statusPill.classList.add('pill-warn');
      else if (state === 'danger') statusPill.classList.add('pill-danger');
    }

    statusPill.addEventListener('click', () => {
      if (!statusPill.disabled) {
        setStatus('default', 'Connecting…');
        client.connect(buildWsUrl());
      }
    });

    // ── Velocity overlay ──────────────────────────────────────────────────────

    function updateVelBar(key, v) {
      const fill = document.getElementById(`vel-fill-${key}`);
      const val  = document.getElementById(`vel-val-${key}`);
      const c = Math.max(-1, Math.min(1, v));
      if (c >= 0) {
        fill.style.left  = '50%';
        fill.style.width = `${c * 50}%`;
      } else {
        fill.style.left  = `${(0.5 + c * 0.5) * 100}%`;
        fill.style.width = `${-c * 50}%`;
      }
      val.textContent = v.toFixed(2);
    }

    function clearVelBars() {
      ['lx', 'ly', 'az'].forEach((k) => {
        document.getElementById(`vel-fill-${k}`).style.left  = '50%';
        document.getElementById(`vel-fill-${k}`).style.width = '0';
        document.getElementById(`vel-val-${k}`).textContent  = '—';
      });
    }

    // ── Robot name strip ──────────────────────────────────────────────────────

    const robotNameStrip = document.getElementById('robot-name-strip');

    function applyNamespace(ns) {
      robotNameStrip.textContent    = ns || '';
      robotNameStrip.style.display  = ns ? '' : 'none';
    }

    applyNamespace(loadRobotNamespace());

    // ── Input source switching ────────────────────────────────────────────────

    let inputSource = 'touch';
    const joystickLeftEl  = document.getElementById('joystick-left');
    const joystickRightEl = document.getElementById('joystick-right');

    function showJoysticks() {
      joystickLeftEl.style.display  = '';
      joystickRightEl.style.display = '';
    }
    function hideJoysticks() {
      joystickLeftEl.style.display  = 'none';
      joystickRightEl.style.display = 'none';
    }

    window.addEventListener('gamepadconnected', () => {
      inputSource = 'gamepad';
      hideJoysticks();
      client.setGamepadEnabled(true);
    });

    window.addEventListener('gamepaddisconnected', () => {
      inputSource = 'touch';
      showJoysticks();
    });

    [joystickLeftEl, joystickRightEl].forEach((zone) => {
      zone.addEventListener('touchstart', () => {
        if (inputSource !== 'touch') {
          inputSource = 'touch';
          showJoysticks();
          client.setGamepadEnabled(false);
        }
      }, { passive: true });
    });

    // ── TeleopClient ──────────────────────────────────────────────────────────

    let joyLx = 0, joyLy = 0, joyAz = 0;

    const client = new TeleopClient({
      maxRetries:       5,
      retryBaseDelayMs: 2000,
      onStatus: (_connected, robotType) => {
        setStatus('connected', `● Connected — ${robotType}`);
      },
      onError: (msg) => {
        setStatus('warn', `Error: ${msg}`);
      },
      onReconnecting: (attempt, maxAttempts, delayMs) => {
        clearCountdown();
        let remaining = Math.ceil(delayMs / 1000);
        statusPill.disabled = true;
        statusPill.className = 'pill pill-warn';
        statusPill.textContent = `⟳ Reconnecting in ${remaining}s (${attempt}/${maxAttempts})`;
        countdownInterval = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearCountdown();
            statusPill.textContent = `⟳ Reconnecting… (${attempt}/${maxAttempts})`;
          } else {
            statusPill.textContent = `⟳ Reconnecting in ${remaining}s (${attempt}/${maxAttempts})`;
          }
        }, 1000);
      },
      onClose: () => {
        clearCountdown();
        clearVelBars();
        setStatus('danger', '○ Disconnected');
      },
      onTwist: (lx, ly, az) => {
        updateVelBar('lx', lx);
        updateVelBar('ly', ly);
        updateVelBar('az', az);
      },
      onButton: (action) => {
        console.log(`Button action: ${action}`);
      },
      onGamepadActivity: () => {
        if (inputSource === 'touch') {
          inputSource = 'gamepad';
          hideJoysticks();
          client.setGamepadEnabled(true);
        }
      },
    });

    client.connect(buildWsUrl());

    // ── Touch joysticks ───────────────────────────────────────────────────────

    // Left joystick: lx = forward/back (invert Y), ly = strafe left/right
    // Right joystick: az = rotate (invert X for clockwise = positive)
    new TouchJoystick(joystickLeftEl, {
      maxRadius: 60,
      onMove: (x, y) => { joyLx = -y; joyLy = x; client.sendTwist(joyLx, joyLy, joyAz); },
      onEnd:  ()     => { joyLx = 0; joyLy = 0;  client.sendTwist(0, 0, joyAz); },
    });

    new TouchJoystick(joystickRightEl, {
      maxRadius: 60,
      onMove: (x, _) => { joyAz = -x; client.sendTwist(joyLx, joyLy, joyAz); },
      onEnd:  ()     => { joyAz = 0;  client.sendTwist(joyLx, joyLy, 0); },
    });

    // ── Video panel ───────────────────────────────────────────────────────────

    const videoImg           = document.getElementById('video-img');
    const videoPlaceholder   = document.getElementById('video-placeholder');
    const videoPlaceholderBox = document.getElementById('video-placeholder-box');
    const streamUrlInput     = document.getElementById('stream-url-input');

    function applyVideoUrl(url) {
      if (!url) {
        videoImg.style.display         = 'none';
        videoPlaceholderBox.style.display = '';
        return;
      }
      videoImg.src                    = url;
      videoImg.style.display          = 'block';
      videoPlaceholderBox.style.display = 'none';
    }

    videoImg.onerror = () => {
      videoImg.style.display            = 'none';
      videoPlaceholderBox.style.display = '';
      videoPlaceholder.textContent      = 'Stream unavailable';
    };

    const savedUrl = loadVideoUrl();
    if (savedUrl) { streamUrlInput.value = savedUrl; applyVideoUrl(savedUrl); }

    document.getElementById('video-apply-btn').addEventListener('click', () => {
      const url = streamUrlInput.value.trim();
      if (url) saveVideoUrl(url); else clearVideoUrl();
      videoPlaceholder.textContent = 'No video stream — configure one in Settings (☰)';
      applyVideoUrl(url);
    });

    document.getElementById('video-clear-btn').addEventListener('click', () => {
      streamUrlInput.value = '';
      clearVideoUrl();
      videoPlaceholder.textContent = 'No video stream — configure one in Settings (☰)';
      applyVideoUrl('');
    });

    // ── Namespace settings ────────────────────────────────────────────────────

    const namespaceInput = document.getElementById('namespace-input');
    const savedNs = loadRobotNamespace();
    if (savedNs) namespaceInput.value = savedNs;

    document.getElementById('namespace-apply-btn').addEventListener('click', () => {
      const ns = namespaceInput.value.trim();
      if (ns) saveRobotNamespace(ns); else clearRobotNamespace();
      applyNamespace(ns);
    });

    document.getElementById('namespace-clear-btn').addEventListener('click', () => {
      namespaceInput.value = '';
      clearRobotNamespace();
      applyNamespace('');
    });

    // ── Gamepad calibration UI ────────────────────────────────────────────────

    const profileSelect     = document.getElementById('profile-select');
    const profileDeleteBtn  = document.getElementById('profile-delete');
    const calInstruction    = document.getElementById('cal-instruction');
    const calStartBtn       = document.getElementById('cal-start');
    const calNextBtn        = document.getElementById('cal-next');
    const calSkipBtn        = document.getElementById('cal-skip');
    const buttonList        = document.getElementById('button-list');
    const buttonActionInput = document.getElementById('button-action-input');
    const buttonAddStart    = document.getElementById('button-add-start');
    const buttonWaiting     = document.getElementById('button-waiting');
    const saveNameInput     = document.getElementById('save-name-input');
    const saveBtn           = document.getElementById('save-btn');

    let workingMapping = { lx: { axis: 1, invert: true }, ly: { axis: 0, invert: true }, az: { axis: 2, invert: true } };
    let workingButtons = {};
    let listeningForButton = false;

    let calStepIndex = 0;
    let calSamples = [];
    let calSampleInterval = null;
    const CAL_STEPS = [
      { key: 'lx', instruction: 'Push the <strong>left stick fully forward</strong> and hold…' },
      { key: 'ly', instruction: 'Push the <strong>left stick fully right</strong> and hold…' },
      { key: 'az', instruction: 'Push the <strong>right stick fully right</strong> and hold…' },
    ];

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
      profileDeleteBtn.style.display = builtIns.includes(profileSelect.value) ? 'none' : 'inline';
    }

    function applySelectedProfile() {
      const profiles = getAllProfiles();
      const selected = profiles.find((p) => p.name === profileSelect.value);
      if (!selected) return;
      workingMapping = { lx: { ...selected.mapping.lx }, ly: { ...selected.mapping.ly }, az: { ...selected.mapping.az } };
      workingButtons = { ...selected.buttons };
      client.setGamepadProfile(selected);
      renderButtonList();
    }

    profileSelect.addEventListener('change', () => { updateDeleteButton(); applySelectedProfile(); });

    profileDeleteBtn.addEventListener('click', () => {
      deleteProfile(profileSelect.value);
      populateProfileDropdown();
      applySelectedProfile();
    });

    calStartBtn.addEventListener('click', () => { calStepIndex = 0; startCalStep(); });

    function startCalStep() {
      calInstruction.innerHTML = CAL_STEPS[calStepIndex].instruction;
      calStartBtn.style.display = 'none';
      calNextBtn.style.display  = 'none';
      calSkipBtn.style.display  = 'inline';
      calSamples = [];
      calSampleInterval = setInterval(() => {
        const gp = Array.from(navigator.getGamepads()).find((g) => g !== null) ?? null;
        if (!gp) return;
        calSamples.push([...gp.axes]);
        if (calSamples.length >= 5) { clearInterval(calSampleInterval); calSampleInterval = null; commitCalStep(); }
      }, 200);
    }

    function commitCalStep() {
      const axisCount = calSamples[0].length;
      let maxMean = 0, maxAxis = 0;
      for (let a = 0; a < axisCount; a++) {
        const mean = calSamples.reduce((s, r) => s + Math.abs(r[a] ?? 0), 0) / calSamples.length;
        if (mean > maxMean) { maxMean = mean; maxAxis = a; }
      }
      const meanVal = calSamples.reduce((s, r) => s + (r[maxAxis] ?? 0), 0) / calSamples.length;
      workingMapping[CAL_STEPS[calStepIndex].key] = { axis: maxAxis, invert: meanVal < 0 };
      advanceCalStep();
    }

    function advanceCalStep() {
      calStepIndex += 1;
      if (calStepIndex >= CAL_STEPS.length) {
        calInstruction.textContent    = 'Axis calibration complete. Save the profile below.';
        calStartBtn.style.display     = 'inline';
        calStartBtn.textContent       = 'Recalibrate';
        calNextBtn.style.display      = 'none';
        calSkipBtn.style.display      = 'none';
      } else {
        startCalStep();
      }
    }

    calSkipBtn.addEventListener('click', () => {
      if (calSampleInterval !== null) { clearInterval(calSampleInterval); calSampleInterval = null; }
      advanceCalStep();
    });

    function renderButtonList() {
      buttonList.innerHTML = '';
      for (const [action, idx] of Object.entries(workingButtons)) {
        const li    = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = `${action} → button ${idx}`;
        const rm = document.createElement('button');
        rm.textContent = 'Remove';
        rm.addEventListener('click', () => { delete workingButtons[action]; renderButtonList(); });
        li.appendChild(label);
        li.appendChild(rm);
        buttonList.appendChild(li);
      }
    }

    buttonAddStart.addEventListener('click', () => {
      if (!buttonActionInput.value.trim()) return;
      buttonWaiting.style.display  = 'inline';
      buttonAddStart.disabled      = true;
      listeningForButton           = true;
    });

    setInterval(() => {
      if (!listeningForButton) return;
      const gp = Array.from(navigator.getGamepads()).find((g) => g !== null) ?? null;
      if (!gp) return;
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i]?.pressed) {
          workingButtons[buttonActionInput.value.trim()] = i;
          listeningForButton          = false;
          buttonWaiting.style.display = 'none';
          buttonAddStart.disabled     = false;
          buttonActionInput.value     = '';
          renderButtonList();
          break;
        }
      }
    }, 100);

    saveBtn.addEventListener('click', () => {
      const name = saveNameInput.value.trim();
      if (!name) return;
      saveProfile(name, workingMapping, workingButtons);
      populateProfileDropdown();
      profileSelect.value = name;
      updateDeleteButton();
      saveNameInput.value = '';
    });

    let gamepadDetected = false;
    setInterval(() => {
      if (gamepadDetected) return;
      const gp = Array.from(navigator.getGamepads()).find((g) => g !== null) ?? null;
      if (gp !== null) { gamepadDetected = true; populateProfileDropdown(); applySelectedProfile(); }
    }, 500);
  </script>
</body>
</html>
```

- [ ] **Step 2: Run tests — verify still 53 pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -15
```

Expected: `Tests  53 passed (53)`

- [ ] **Step 3: Docker build + nginx check**

```bash
TELEOP_TOKEN=testtoken docker compose up --build --wait webclient 2>&1 | tail -5
curl -s http://localhost:8080/ | grep -c "pocket-teleop"
```

Expected: container Healthy, curl returns `2`.

- [ ] **Step 4: Verify key UI elements in served page**

```bash
curl -s http://localhost:8080/ | grep -E '(id="joystick-left"|id="joystick-right"|id="robot-name-strip"|id="vel-overlay"|id="page-connection"|touch_joystick\.js|loadRobotNamespace)' | wc -l
```

Expected: `7` (one match per pattern).

- [ ] **Step 5: Commit**

```bash
git add web-client/index.html
git commit -m "feat: rewrite index.html — touch joysticks, robot namespace, layout overhaul, bug fixes"
```

---

## Task 6: Full verification + docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `memory/agent-guides/repository-structure.md`

- [ ] **Step 1: Run full test suite**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -15
```

Expected:
```
✓ test/touch_joystick.test.ts  (8 tests)
✓ test/settings.test.ts        (7 tests)
✓ test/gamepad_profiles.test.ts (16 tests)
✓ test/protocol.test.ts        (10 tests)
✓ test/integration.test.ts     (12 tests)
Tests  53 passed (53)
```

- [ ] **Step 2: Docker build healthy + WebSocket smoke test**

```bash
TELEOP_TOKEN=testtoken docker compose up --build --wait 2>&1 | tail -5
curl -s -o /dev/null -w "%{http_code}" \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  "http://localhost:9091/teleop?token=testtoken"
```

Expected: both containers Healthy; curl returns `101`.

- [ ] **Step 3: Update `AGENTS.md`**

In the Handoff State section:

- Update summary to: `All touch joystick tasks complete. 53 tests pass (8 touch_joystick + 7 settings + 16 gamepad_profiles + 10 protocol + 12 integration). Touch joysticks, robot namespace, layout overhaul, and bug fixes shipped. Tag v0.4.0 pending user confirmation — do NOT apply without explicit user approval.`
- In the Frontend UI task table, add a new "Touch Joystick" task section:

| Task | Status | Notes |
|---|---|---|
| 1 — `touch_joystick.ts` + unit tests | ✅ Done | `web-client/src/touch_joystick.ts` — `TouchJoystick` class; 8 unit tests |
| 2 — Settings namespace additions | ✅ Done | `web-client/src/settings.ts` — `loadRobotNamespace`, `saveRobotNamespace`, `clearRobotNamespace`; +2 tests; 53 total |
| 3 — `GamepadHandler` setEnabled + onActivity | ✅ Done | `web-client/src/gamepad_handler.ts` — `setEnabled(boolean)`, `onActivity` callback |
| 4 — `TeleopClient` setGamepadEnabled + onGamepadActivity | ✅ Done | `web-client/src/teleop_client.ts` — `setGamepadEnabled(boolean)`, `onGamepadActivity` option |
| 5 — Rewrite `index.html` | ✅ Done | Touch joysticks (fixed corners), robot name strip, velocity overlay, Connection page, input-source switching, all bug fixes |
| 6 — Full verification + docs | ✅ Done | 53/53 tests pass; docker build healthy; AGENTS.md + repository-structure.md updated; push requested |

- Update Head SHA to TBD (fill in after commit).

- [ ] **Step 4: Update `memory/agent-guides/repository-structure.md`**

Update scope note:
```
Server and web client v0.1.0 both complete. All practical gaps tasks complete. Frontend UI + touch joysticks complete (v0.4.0 pending tag). Tags so far: v0.1.0-server, v0.1.0-client, v0.2.0.
```

Add to Key files (client) table:
```
| `web-client/src/touch_joystick.ts` | `TouchJoystick` class — floating touch joystick, normalised -1..1 output, jsdom-testable |
| `web-client/test/touch_joystick.test.ts` | 8 unit tests using jsdom TouchEvent simulation |
```

- [ ] **Step 5: Commit docs, capture SHA, update Head SHA**

```bash
git add AGENTS.md memory/agent-guides/repository-structure.md
git commit -m "docs: mark touch joystick tasks complete — 53 tests, v0.4.0 pending"
git rev-parse --short HEAD
# edit AGENTS.md Head SHA line with the captured value
git add AGENTS.md
git commit -m "docs: update AGENTS.md Head SHA"
```

- [ ] **Step 6: Request push**

Say exactly: `"Committed as <hash>. Ready to push — shall I?"`
