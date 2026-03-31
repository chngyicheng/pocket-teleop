# Token Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual token-in-URL workflow with a `.env` file for the server and a localStorage-backed token prompt for the web client.

**Architecture:** Token persistence follows the existing `settings.ts` pattern — new `loadToken`/`saveToken`/`clearToken` functions added there. On load, `index.html` reads token from URL params first, then localStorage; if neither present it shows a fullscreen prompt overlay. A "Forget token" button in the Connection settings page clears it.

**Tech Stack:** TypeScript (settings.ts), vanilla JS inline script (index.html), Docker Compose `.env` auto-load, Vitest (tests run in Docker only — never bare npm).

---

## File Map

| File | Change |
|---|---|
| `.env.example` | **Create** — template with `TELEOP_TOKEN=changeme` |
| `.gitignore` | **Modify** — add `.env` entry |
| `web-client/src/settings.ts` | **Modify** — add `loadToken`, `saveToken`, `clearToken` |
| `web-client/test/settings.test.ts` | **Modify** — add token persistence tests |
| `web-client/index.html` | **Modify** — token prompt overlay HTML + wire-up logic + Forget button |

---

### Task 1: Server `.env` setup

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`

Docker Compose automatically loads a `.env` file from the project root when present — no changes to `docker-compose.yml` needed.

- [ ] **Step 1: Create `.env.example`**

```
# Copy this file to .env and set your token.
# NEVER commit .env — it is gitignored.
TELEOP_TOKEN=changeme
```

Save as `.env.example` at the project root.

- [ ] **Step 2: Add `.env` to `.gitignore`**

Append to `.gitignore`:
```
.env
```

(`.env.example` is intentionally NOT gitignored — it is the committed template.)

- [ ] **Step 3: Create a local `.env` for development**

```bash
echo "TELEOP_TOKEN=testtoken" > .env
```

Verify Docker Compose picks it up:
```bash
docker compose config | grep TELEOP_TOKEN
```
Expected: line containing `TELEOP_TOKEN: testtoken`

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "feat: add .env.example; server token now loaded from .env file"
```

---

### Task 2: Token persistence functions + tests

**Files:**
- Modify: `web-client/src/settings.ts`
- Modify: `web-client/test/settings.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `web-client/test/settings.test.ts`:

```typescript
describe('token persistence', () => {
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

  it('loadToken returns null when nothing is stored and params are empty', () => {
    const params = new URLSearchParams('');
    expect(loadToken(params)).toBeNull();
  });

  it('loadToken returns the URL param value when present', () => {
    const params = new URLSearchParams('token=abc123');
    expect(loadToken(params)).toBe('abc123');
  });

  it('loadToken returns localStorage value when no URL param', () => {
    saveToken('stored-token');
    const params = new URLSearchParams('');
    expect(loadToken(params)).toBe('stored-token');
  });

  it('loadToken prefers URL param over localStorage', () => {
    saveToken('stored-token');
    const params = new URLSearchParams('token=url-token');
    expect(loadToken(params)).toBe('url-token');
  });

  it('saveToken persists to localStorage', () => {
    saveToken('mytoken');
    expect(store['pocket-teleop.token']).toBe('mytoken');
  });

  it('clearToken removes from localStorage', () => {
    saveToken('mytoken');
    clearToken();
    expect(store['pocket-teleop.token']).toBeUndefined();
  });
});
```

Update the import at the top of the test file to include the new exports:

```typescript
import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl,
         loadRobotNamespace, saveRobotNamespace, clearRobotNamespace,
         loadToken, saveToken, clearToken } from '../src/settings.js';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose -f docker-compose.test.yml run --rm webclient-test
```

Expected: 6 new failures with "loadToken is not a function" (or similar import error).

- [ ] **Step 3: Implement token functions in `settings.ts`**

Add to `web-client/src/settings.ts` after the `clearRobotNamespace` function:

```typescript
const TOKEN_KEY = 'pocket-teleop.token';

export function loadToken(params: URLSearchParams): string | null {
  const fromUrl = params.get('token');
  if (fromUrl) return fromUrl;
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose -f docker-compose.test.yml run --rm webclient-test
```

Expected: all tests pass (was 60 before; now 66).

- [ ] **Step 5: Commit**

```bash
git add web-client/src/settings.ts web-client/test/settings.test.ts
git commit -m "feat: add token persistence to settings (loadToken, saveToken, clearToken)"
```

---

### Task 3: Token prompt UI and wire-up in `index.html`

**Files:**
- Modify: `web-client/index.html`

This task has no new unit-testable logic — the functions come from Task 2. Manual verification: open the client with no token in URL and no localStorage, confirm the prompt appears.

- [ ] **Step 1: Add token prompt overlay HTML**

Insert this block immediately before `<nav id="drawer"` (around line 273):

```html
  <!-- ── Token prompt overlay ──────────────────────────────────────────── -->
  <div id="token-overlay" style="
    display:none; position:fixed; inset:0; background:var(--bg);
    z-index:999; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:16px; padding:32px;
  ">
    <span style="font-family:'Press Start 2P',monospace; font-size:13px; color:var(--accent)">pocket-teleop</span>
    <p style="font-size:14px; color:var(--text-muted); text-align:center; max-width:300px">
      Enter your access token to connect.
    </p>
    <input id="token-input" type="password" placeholder="Access token"
      style="width:100%; max-width:300px; padding:10px 12px; border:1px solid var(--border);
             border-radius:6px; font-size:14px; background:var(--surface); color:var(--text);" />
    <button id="token-submit-btn" class="btn-primary"
      style="width:100%; max-width:300px; padding:10px;">Connect</button>
  </div>
```

Note: the overlay uses `display:flex` inline (not `display:none`) to immediately render as a flex column. To hide it, the JS sets `style.display = 'none'`. To show it, the JS sets `style.display = 'flex'`.

- [ ] **Step 2: Add "Forget token" button in the Connection settings page**

In the Connection `<div id="page-connection"` section, after the namespace field group, add:

```html
      <div class="field-group">
        <span class="field-label">Access Token</span>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button id="token-forget-btn">Forget token</button>
        </div>
      </div>
```

- [ ] **Step 3: Update the import line in the inline script**

Change:
```javascript
    import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl,
             loadRobotNamespace, saveRobotNamespace, clearRobotNamespace } from '/dist/settings.js';
```

To:
```javascript
    import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl,
             loadRobotNamespace, saveRobotNamespace, clearRobotNamespace,
             loadToken, saveToken, clearToken } from '/dist/settings.js';
```

- [ ] **Step 4: Replace the token reading block and add overlay logic**

Replace:
```javascript
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token') ?? '';
```

With:
```javascript
    const params = new URLSearchParams(window.location.search);
    let token = loadToken(params) ?? '';

    const tokenOverlay   = document.getElementById('token-overlay');
    const tokenInput     = document.getElementById('token-input');
    const tokenSubmitBtn = document.getElementById('token-submit-btn');
    const tokenForgetBtn = document.getElementById('token-forget-btn');

    function showTokenPrompt() {
      tokenOverlay.style.display = 'flex';
    }

    function hideTokenPrompt() {
      tokenOverlay.style.display = 'none';
    }

    tokenSubmitBtn.addEventListener('click', () => {
      const entered = tokenInput.value.trim();
      if (!entered) return;
      saveToken(entered);
      token = entered;
      hideTokenPrompt();
      client.connect(buildWsUrl());
    });

    tokenInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tokenSubmitBtn.click();
    });

    tokenForgetBtn.addEventListener('click', () => {
      clearToken();
      token = '';
      showTokenPrompt();
    });

    if (!token) {
      showTokenPrompt();
    }
```

- [ ] **Step 5: Verify the `buildWsUrl` function still references `token`**

The existing `buildWsUrl` function references the `token` variable by closure. After the replacement in Step 4, `token` is now a `let` (reassignable). Confirm `buildWsUrl` is unchanged:

```javascript
    function buildWsUrl() {
      const ns   = loadRobotNamespace();
      const base = `ws://${window.location.hostname}:9091/teleop?token=${encodeURIComponent(token)}`;
      return ns ? `${base}&ns=${encodeURIComponent(ns)}` : base;
    }
```

No change needed — it already reads from the `token` variable by closure.

- [ ] **Step 6: Verify the initial `client.connect` call is guarded**

Find the `client.connect(buildWsUrl())` initial call near the bottom of the inline script. It must only fire when a token is present (overlay handles the no-token case). Wrap it:

```javascript
    if (token) {
      client.connect(buildWsUrl());
    }
```

- [ ] **Step 7: Rebuild Docker and smoke test manually**

```bash
docker compose up --build
```

Check three scenarios:
1. Open `http://pi:8080` (no token) → prompt overlay appears
2. Enter token in overlay, press Connect → overlay hides, status pill shows "Connecting…"
3. Refresh `http://pi:8080` (token now in localStorage) → overlay does NOT appear, connects directly
4. Open Settings → Connection → "Forget token" → page reloads overlay

- [ ] **Step 8: Commit**

```bash
git add web-client/index.html
git commit -m "feat: token prompt overlay with localStorage persistence; Forget token in settings"
```
