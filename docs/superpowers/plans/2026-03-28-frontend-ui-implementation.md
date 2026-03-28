# Frontend UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unstyled `index.html` with a clean, minimal, responsive UI featuring a sticky header with connection status pill, a video stream panel, a live velocity bar, and a slide-in settings drawer with Gamepad and Video pages.

**Architecture:** New `settings.ts` module (pure logic — `SettingsRouter` + localStorage helpers) compiled by `tsc` alongside existing modules. `index.html` is fully rewritten with a `<style>` block for `prefers-color-scheme` light/dark CSS, a new HTML structure, and all DOM wiring in the inline `<script type="module">`. A new `onTwist` callback is added to `TeleopClientOptions` so the velocity bar can read live values.

**Tech Stack:** TypeScript 5, Vitest 1.6, native ES modules, nginx static serving, `vi.stubGlobal` for localStorage mocking in Node test environment.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `web-client/src/settings.ts` | Create | `SettingsRouter`, `loadVideoUrl`, `saveVideoUrl`, `clearVideoUrl` |
| `web-client/test/settings.test.ts` | Create | 5 unit tests for `settings.ts` |
| `web-client/src/teleop_client.ts` | Modify | Add `onTwist` to `TeleopClientOptions`; fire from `sendTwist` |
| `web-client/index.html` | Rewrite | Full layout, CSS, settings drawer, velocity bars, video panel |

---

## Task 1: `settings.ts` — TDD

**Files:**
- Create: `web-client/test/settings.test.ts`
- Create: `web-client/src/settings.ts`

- [ ] **Step 1: Write the failing tests**

Create `web-client/test/settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl } from '../src/settings.js';

describe('video URL persistence', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadVideoUrl returns null when localStorage is empty', () => {
    expect(loadVideoUrl()).toBeNull();
  });

  it('loadVideoUrl returns saved value after saveVideoUrl', () => {
    saveVideoUrl('http://robot.local:8081/stream');
    expect(loadVideoUrl()).toBe('http://robot.local:8081/stream');
  });

  it('clearVideoUrl removes the saved value', () => {
    saveVideoUrl('http://robot.local:8081/stream');
    clearVideoUrl();
    expect(loadVideoUrl()).toBeNull();
  });
});

describe('SettingsRouter', () => {
  it('navigate updates activePage', () => {
    const router = new SettingsRouter();
    router.navigate('video');
    expect(router.activePage).toBe('video');
  });

  it('navigate fires onNavigate callback', () => {
    const router = new SettingsRouter();
    const pages: string[] = [];
    router.onNavigate = (page) => pages.push(page);
    router.navigate('video');
    router.navigate('gamepad');
    expect(pages).toEqual(['video', 'gamepad']);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -20
```

Expected: test run fails with `Cannot find module '../src/settings.js'` or similar import error.

- [ ] **Step 3: Implement `settings.ts`**

Create `web-client/src/settings.ts`:

```typescript
const VIDEO_URL_KEY = 'pocket-teleop.video-url';

export type SettingsPage = 'gamepad' | 'video';

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
```

- [ ] **Step 4: Run tests — verify 43 pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -10
```

Expected:
```
✓ test/settings.test.ts  (5 tests)
✓ test/gamepad_profiles.test.ts  (16 tests)
✓ test/protocol.test.ts  (10 tests)
✓ test/integration.test.ts  (12 tests)
Tests  43 passed (43)
```

- [ ] **Step 5: Commit**

```bash
git add web-client/src/settings.ts web-client/test/settings.test.ts
git commit -m "feat: add settings.ts — SettingsRouter and video URL persistence"
```

---

## Task 2: Add `onTwist` to `TeleopClient`

**Files:**
- Modify: `web-client/src/teleop_client.ts`

- [ ] **Step 1: Add `onTwist` to `TeleopClientOptions` and fire it from `sendTwist`**

In `web-client/src/teleop_client.ts`, add one line to the interface:

```typescript
export interface TeleopClientOptions {
  onStatus?: (connected: boolean, robotType: string) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
  onReconnecting?: (attempt: number, maxAttempts: number, delayMs: number) => void;
  onButton?: (action: string) => void;
  onTwist?: (lx: number, ly: number, az: number) => void;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  keepaliveIntervalMs?: number;
}
```

And update `sendTwist` to fire the callback:

```typescript
  sendTwist(lx: number, ly: number, az: number): void {
    this.connection.send(buildTwist(lx, ly, az));
    this.lastSentAt = Date.now();
    this.options.onTwist?.(lx, ly, az);
  }
```

- [ ] **Step 2: Run tests — verify still 43 pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -10
```

Expected: `Tests  43 passed (43)`

- [ ] **Step 3: Commit**

```bash
git add web-client/src/teleop_client.ts
git commit -m "feat: add onTwist callback to TeleopClientOptions"
```

---

## Task 3: Rewrite `index.html`

**Files:**
- Rewrite: `web-client/index.html`

- [ ] **Step 1: Write the full new `index.html`**

Replace the entire contents of `web-client/index.html` with:

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
      z-index: 10;
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
    .pill-connected  { color: #16a34a; }
    .pill-warn       { color: var(--warn); }
    .pill-danger     { color: var(--danger); cursor: pointer; }

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
    #video-placeholder { color: var(--text-muted); font-size: 14px; text-align: center; padding: 16px; }
    #video-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }

    /* ── Velocity bar ───────────────────────────── */
    #velocity-bar {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }
    .vel-row { display: flex; align-items: center; gap: 8px; }
    .vel-label { font-size: 11px; font-weight: 600; color: var(--text-muted); width: 16px; text-align: right; font-family: monospace; }
    .vel-track {
      position: relative;
      flex: 1;
      height: 8px;
      background: var(--surface);
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .vel-fill {
      position: absolute;
      top: 0;
      height: 100%;
      background: var(--accent);
      border-radius: 4px;
      transition: left 100ms, width 100ms;
      left: 50%;
      width: 0;
    }
    .vel-value { font-size: 11px; font-family: monospace; color: var(--text-muted); width: 44px; text-align: right; }

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

    /* Shared drawer element styles */
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

    /* Video page */
    .field-group { display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .field-row { display: flex; gap: 8px; }
    .field-row input { flex: 1; }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-primary:hover { opacity: 0.9; background: var(--accent); }
  </style>
</head>
<body>
  <div id="backdrop"></div>

  <nav id="drawer" aria-label="Settings">
    <div id="drawer-header">Settings</div>
    <ul id="drawer-nav">
      <li class="nav-item active" data-page="gamepad">Gamepad</li>
      <li class="nav-item" data-page="video">Video</li>
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
  </nav>

  <header id="app-header">
    <button id="menu-btn" aria-label="Open settings">☰</button>
    <span id="app-title">pocket-teleop</span>
    <button id="status-pill" class="pill" disabled>Connecting…</button>
  </header>

  <main id="video-panel">
    <p id="video-placeholder">No video stream — add one in Settings ⚙</p>
    <img id="video-img" alt="video stream" style="display:none" />
  </main>

  <footer id="velocity-bar">
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
  </footer>

  <script type="module">
    import { TeleopClient } from '/dist/teleop_client.js';
    import { getAllProfiles, saveProfile, deleteProfile } from '/dist/gamepad_profiles.js';
    import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl } from '/dist/settings.js';

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

    // ── Connection ────────────────────────────────────────────────────────────

    const params   = new URLSearchParams(window.location.search);
    const token    = params.get('token') ?? '';
    const wsUrl    = `ws://${window.location.hostname}:9091/teleop?token=${encodeURIComponent(token)}`;

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
        client.connect(wsUrl);
      }
    });

    // ── Velocity bars ─────────────────────────────────────────────────────────

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
        const fill = document.getElementById(`vel-fill-${k}`);
        fill.style.left = '50%';
        fill.style.width = '0';
        document.getElementById(`vel-val-${k}`).textContent = '—';
      });
    }

    // ── TeleopClient ──────────────────────────────────────────────────────────

    const client = new TeleopClient({
      maxRetries: 5,
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
        // Set pill state directly — avoid calling setStatus() inside the interval
        // because setStatus() calls clearCountdown(), which would stop the interval.
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
    });

    client.connect(wsUrl);

    // ── Video panel ───────────────────────────────────────────────────────────

    const videoImg         = document.getElementById('video-img');
    const videoPlaceholder = document.getElementById('video-placeholder');
    const streamUrlInput   = document.getElementById('stream-url-input');

    function applyVideoUrl(url) {
      if (!url) {
        videoImg.style.display = 'none';
        videoPlaceholder.style.display = '';
        return;
      }
      videoImg.src = url;
      videoImg.style.display = 'block';
      videoPlaceholder.style.display = 'none';
    }

    videoImg.onerror = () => {
      videoImg.style.display = 'none';
      videoPlaceholder.textContent = 'Stream unavailable';
      videoPlaceholder.style.display = '';
    };

    const savedUrl = loadVideoUrl();
    if (savedUrl) { streamUrlInput.value = savedUrl; applyVideoUrl(savedUrl); }

    document.getElementById('video-apply-btn').addEventListener('click', () => {
      const url = streamUrlInput.value.trim();
      if (url) saveVideoUrl(url); else clearVideoUrl();
      videoPlaceholder.textContent = 'No video stream — add one in Settings ⚙';
      applyVideoUrl(url);
    });

    document.getElementById('video-clear-btn').addEventListener('click', () => {
      streamUrlInput.value = '';
      clearVideoUrl();
      videoPlaceholder.textContent = 'No video stream — add one in Settings ⚙';
      applyVideoUrl('');
    });

    // ── Gamepad calibration UI ────────────────────────────────────────────────

    const profileSelect    = document.getElementById('profile-select');
    const profileDeleteBtn = document.getElementById('profile-delete');
    const calInstruction   = document.getElementById('cal-instruction');
    const calStartBtn      = document.getElementById('cal-start');
    const calNextBtn       = document.getElementById('cal-next');
    const calSkipBtn       = document.getElementById('cal-skip');
    const buttonList       = document.getElementById('button-list');
    const buttonActionInput = document.getElementById('button-action-input');
    const buttonAddStart   = document.getElementById('button-add-start');
    const buttonWaiting    = document.getElementById('button-waiting');
    const saveNameInput    = document.getElementById('save-name-input');
    const saveBtn          = document.getElementById('save-btn');

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
      calNextBtn.style.display = 'none';
      calSkipBtn.style.display = 'inline';
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

    function renderButtonList() {
      buttonList.innerHTML = '';
      for (const [action, idx] of Object.entries(workingButtons)) {
        const li = document.createElement('li');
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
      buttonWaiting.style.display = 'inline';
      buttonAddStart.disabled = true;
      listeningForButton = true;
    });

    setInterval(() => {
      if (!listeningForButton) return;
      const gp = Array.from(navigator.getGamepads()).find((g) => g !== null) ?? null;
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

    saveBtn.addEventListener('click', () => {
      const name = saveNameInput.value.trim();
      if (!name) return;
      saveProfile(name, workingMapping, workingButtons);
      populateProfileDropdown();
      profileSelect.value = name;
      updateDeleteButton();
      saveNameInput.value = '';
    });

    // Detect first gamepad — populate profile dropdown on connect
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

- [ ] **Step 2: Run tests — verify still 43 pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -10
```

Expected: `Tests  43 passed (43)`

- [ ] **Step 3: Docker build + nginx check**

```bash
TELEOP_TOKEN=testtoken docker compose up --build --wait webclient 2>&1 | tail -5
```

Expected: `Container pocket-teleop-webclient-1  Healthy`

```bash
curl -s http://localhost:8080/ | grep -c "pocket-teleop"
```

Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add web-client/index.html
git commit -m "feat: rewrite index.html with responsive UI, settings drawer, velocity bars, video panel"
```

---

## Task 4: Full verification + AGENTS.md

**Files:**
- Modify: `AGENTS.md`
- Modify: `memory/agent-guides/repository-structure.md`

- [ ] **Step 1: Run full test suite**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test 2>&1 | tail -10
```

Expected:
```
✓ test/settings.test.ts  (5 tests)
✓ test/gamepad_profiles.test.ts  (16 tests)
✓ test/protocol.test.ts  (10 tests)
✓ test/integration.test.ts  (12 tests)
Tests  43 passed (43)
```

- [ ] **Step 2: Docker build healthy**

```bash
TELEOP_TOKEN=testtoken docker compose up --build --wait webclient 2>&1 | tail -5
curl -s http://localhost:8080/ | grep -c "pocket-teleop"
```

Expected: container Healthy, curl returns `1`.

- [ ] **Step 3: Update `AGENTS.md`**

Update the Handoff State section:

- Summary: All frontend UI tasks complete. 43 tests pass (38 existing + 5 new `settings.test.ts`). `settings.ts`, `index.html` rewritten, `teleop_client.ts` gains `onTwist`. Tag `v0.3.0` pending user confirmation.
- Practical gaps table: add a new "Frontend UI" task block, or extend with a new section. Mark all tasks ✅ Done.
- Head SHA: update after committing this step.

Add a new task section to the practical gaps table (after Task 5):

| Task | Status | Notes |
|---|---|---|
| 6 — Frontend UI | ✅ Done | `web-client/src/settings.ts` + 5 unit tests; `index.html` rewritten — sticky header, status pill, video panel, velocity bars, settings drawer with Gamepad/Video pages; `teleop_client.ts` gains `onTwist`; 43 tests pass |

- [ ] **Step 4: Update `memory/agent-guides/repository-structure.md`**

Update the scope note and key files table to reflect new files:

Scope note: `Server and web client v0.1.0 both complete. All practical gaps tasks complete (43 tests, main). Frontend UI complete (v0.3.0).`

Add to Key files (client) table:
| `web-client/src/settings.ts` | `SettingsRouter`, `loadVideoUrl`, `saveVideoUrl`, `clearVideoUrl` — settings routing and video URL persistence |

- [ ] **Step 5: Commit docs + request push**

```bash
git add AGENTS.md memory/agent-guides/repository-structure.md
git commit -m "docs: mark frontend UI task complete — 43 tests, v0.3.0 pending"
```

Then update Head SHA in a second commit:

```bash
git rev-parse --short HEAD  # capture this value
# edit AGENTS.md Head SHA line
git add AGENTS.md
git commit -m "docs: update AGENTS.md Head SHA"
```

Say: `"Committed as <hash>. Ready to push — shall I?"` and wait for confirmation before pushing or tagging.
