# Video Source Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the operator to switch the video source at runtime from the browser Settings drawer — no container restarts required. Sources: ROS2 topic (current default, routed via video-bridge), direct RTSP URL (pulled by MediaMTX natively), or disabled.

**Architecture:**
```
Settings drawer → Video Source page
    │ PATCH /mediamtx-api/config/paths/patch/teleop
    ▼
auth-server: /mediamtx-api → localhost:8889/v3   (new proxy route)
    ▼
MediaMTX runtime config API
    │ updates path source live — no restart
    ▼
mediamtx: teleop path switches between
  source: publisher          (video-bridge pushes RTSP → default)
  source: rtsp://host/path   (MediaMTX pulls directly)
  source: redirect           (path disabled / placeholder)
```

**Key decisions:**
- MediaMTX config API is at `/v3` on the same port as WHEP (8889) — one proxy route covers both
- `/mediamtx-api` prefix distinguishes the API from `/video` (WHEP media path) in auth-server
- Picker logic lives in `web-client/src/video_source.ts` (not inline in `index.html`) so it is importable and testable by vitest — same pattern as `WhepClient`
- Source state is stored in `localStorage` and re-applied on page load via a `PATCH` to the API; MediaMTX itself is the source of truth at runtime
- `video-bridge` always runs; when source is `rtsp://...` or disabled, MediaMTX ignores video-bridge's RTSP push (no-op)
- Disabling sets `source: redirect` pointing to a non-existent stream path — MediaMTX returns 404 to WHEP clients; WhepClient shows "No video stream" placeholder
- `VIDEO_TOPIC` in `.env` sets the **default** source on first run; the operator can override at runtime

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `web-client/src/video_source.ts` | `buildMtxSource` (pure) + `VideoSourcePicker` class — all picker logic; no DOM references in `buildMtxSource` |
| `web-client/test/video_source.test.ts` | vitest tests for `buildMtxSource` and `VideoSourcePicker` (mocked fetch + localStorage) |

### Modified files
| File | Change |
|---|---|
| `auth-server/src/app.ts` | Add `/mediamtx-api` proxy route (strips prefix, forwards to `mediaMtxUrl/v3`) |
| `auth-server/test/auth.test.ts` | 2 new tests: unauthenticated `/mediamtx-api/...` → 302; authenticated → forwarded |
| `web-client/index.html` | Replace Video settings page HTML; import `VideoSourcePicker`; wire DOM elements |
| `AGENTS.md` | Update handoff, add deviations |

---

## Task 1 — auth-server `/mediamtx-api` proxy route

**Files:** `auth-server/src/app.ts`, `auth-server/test/auth.test.ts`

The MediaMTX config API lives at `http://localhost:8889/v3/...`. Auth-server needs to proxy `/mediamtx-api/*` → `http://localhost:8889/v3/*`, stripping the `/mediamtx-api` prefix.

- [ ] **Step 1: Add proxy route in `auth-server/src/app.ts`**

`mediaMtxUrl` already points to `http://localhost:8889`. Mount the config API proxy after the `/video` route:

```typescript
// Video stream proxy (WHEP media)
app.use('/video', makeHttpProxy(mediaMtxUrl));

// MediaMTX config API — authenticated; /mediamtx-api/* → mediaMtxUrl/v3/*
// Express strips '/mediamtx-api' from req.url; the proxy target includes '/v3'.
app.use('/mediamtx-api', makeHttpProxy(`${mediaMtxUrl}/v3`));
```

- [ ] **Step 2: Add 2 tests to `auth-server/test/auth.test.ts`**

Follow the pattern of the existing `/video` proxy tests (reuse `getAppWithVideo()`):

```typescript
describe('GET /mediamtx-api proxy', () => {
  it('unauthenticated redirects to /auth/login', async () => {
    const res = await supertest(getAppWithVideo())
      .get('/mediamtx-api/config/paths/list');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/auth/login');
  });

  it('authenticated forwards to mediaMtxUrl/v3 (not redirected)', async () => {
    const agent = supertest.agent(getAppWithVideo());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent.get('/mediamtx-api/config/paths/list');
    expect(res.status).not.toBe(302);
    expect(res.headers['location']).not.toBe('/auth/login');
  });
});
```

- [ ] **Step 3: Run auth-server tests**

```bash
docker compose --profile test run --rm auth-server-test
```

Expected: 33 tests passing (31 existing + 2 new).

---

## Task 2 — `VideoSourcePicker` module + tests

**Files:** `web-client/src/video_source.ts`, `web-client/test/video_source.test.ts`

Extract all picker logic into a typed TypeScript module so vitest can import and test it. `index.html` only wires DOM elements to the exported class.

- [ ] **Step 1: Create `web-client/src/video_source.ts`**

```typescript
/**
 * VideoSourcePicker — runtime video source selection via MediaMTX config API.
 *
 * buildMtxSource  — pure function; maps (mode, rtspUrl) → MediaMTX PATCH body.
 * VideoSourcePicker — stateful class; persists to localStorage, applies to API.
 */

export type VideoSourceMode = 'ros2' | 'rtsp' | 'disabled';

export interface MtxSourceBody {
  source: string;
  sourceRedirect?: string;
}

/** Maps a mode + optional RTSP URL to the MediaMTX path config PATCH body. */
export function buildMtxSource(mode: VideoSourceMode, rtspUrl = ''): MtxSourceBody {
  if (mode === 'rtsp')      return { source: rtspUrl };
  if (mode === 'disabled')  return { source: 'redirect', sourceRedirect: 'mediamtx-void' };
  /* ros2 */                return { source: 'publisher' };
}

const SOURCE_KEY   = 'video-source';
const RTSP_URL_KEY = 'video-rtsp-url';
const API_PATH     = '/mediamtx-api/config/paths/patch/teleop';

export interface VideoSourcePickerOptions {
  /** Override the PATCH URL — useful in tests. Default: API_PATH. */
  apiUrl?: string;
  /** Override fetch — useful in tests. Default: globalThis.fetch. */
  fetchFn?: typeof fetch;
}

export class VideoSourcePicker {
  private readonly apiUrl:  string;
  private readonly fetchFn: typeof fetch;

  constructor(options: VideoSourcePickerOptions = {}) {
    this.apiUrl  = options.apiUrl  ?? API_PATH;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /** Load the saved source from localStorage (defaults to 'ros2'). */
  loadSaved(): { mode: VideoSourceMode; rtspUrl: string } {
    const mode    = (localStorage.getItem(SOURCE_KEY) ?? 'ros2') as VideoSourceMode;
    const rtspUrl = localStorage.getItem(RTSP_URL_KEY) ?? '';
    return { mode, rtspUrl };
  }

  /** Persist source to localStorage. */
  save(mode: VideoSourceMode, rtspUrl: string): void {
    localStorage.setItem(SOURCE_KEY, mode);
    if (mode === 'rtsp') localStorage.setItem(RTSP_URL_KEY, rtspUrl);
    else                 localStorage.removeItem(RTSP_URL_KEY);
  }

  /**
   * Send PATCH to MediaMTX config API and persist on success.
   * Resolves with 'ok' | 'http-error:<status>' | 'network-error:<message>'.
   */
  async apply(mode: VideoSourceMode, rtspUrl = ''): Promise<string> {
    const body = buildMtxSource(mode, rtspUrl);
    try {
      const res = await this.fetchFn(this.apiUrl, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        this.save(mode, rtspUrl);
        return 'ok';
      }
      return `http-error:${res.status}`;
    } catch (e) {
      return `network-error:${(e as Error).message}`;
    }
  }
}
```

- [ ] **Step 2: Create `web-client/test/video_source.test.ts`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMtxSource, VideoSourcePicker } from '../src/video_source.js';

// ── buildMtxSource ────────────────────────────────────────────────────────────

describe('buildMtxSource', () => {
  it('ros2 → publisher', () => {
    expect(buildMtxSource('ros2')).toEqual({ source: 'publisher' });
  });

  it('disabled → redirect to void path', () => {
    expect(buildMtxSource('disabled')).toEqual({
      source: 'redirect',
      sourceRedirect: 'mediamtx-void',
    });
  });

  it('rtsp → source is the RTSP URL', () => {
    expect(buildMtxSource('rtsp', 'rtsp://192.168.1.200:554/stream')).toEqual({
      source: 'rtsp://192.168.1.200:554/stream',
    });
  });

  it('rtsp with empty URL → source is empty string (caller must validate)', () => {
    expect(buildMtxSource('rtsp', '')).toEqual({ source: '' });
  });
});

// ── VideoSourcePicker ─────────────────────────────────────────────────────────

const TEST_API = 'http://robot.local/mediamtx-api/config/paths/patch/teleop';

function makePicker(fetchFn: typeof fetch) {
  return new VideoSourcePicker({ apiUrl: TEST_API, fetchFn });
}

function okResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

function errResponse(status: number): Response {
  return { ok: false, status } as Response;
}

beforeEach(() => {
  localStorage.clear();
});

describe('VideoSourcePicker.loadSaved', () => {
  it('defaults to ros2 when nothing stored', () => {
    const picker = makePicker(vi.fn());
    expect(picker.loadSaved()).toEqual({ mode: 'ros2', rtspUrl: '' });
  });

  it('returns stored mode and rtsp URL', () => {
    localStorage.setItem('video-source', 'rtsp');
    localStorage.setItem('video-rtsp-url', 'rtsp://cam:554/live');
    const picker = makePicker(vi.fn());
    expect(picker.loadSaved()).toEqual({ mode: 'rtsp', rtspUrl: 'rtsp://cam:554/live' });
  });
});

describe('VideoSourcePicker.save', () => {
  it('persists mode to localStorage', () => {
    const picker = makePicker(vi.fn());
    picker.save('disabled', '');
    expect(localStorage.getItem('video-source')).toBe('disabled');
  });

  it('persists rtsp URL when mode is rtsp', () => {
    const picker = makePicker(vi.fn());
    picker.save('rtsp', 'rtsp://cam:554/live');
    expect(localStorage.getItem('video-rtsp-url')).toBe('rtsp://cam:554/live');
  });

  it('removes rtsp URL when mode is not rtsp', () => {
    localStorage.setItem('video-rtsp-url', 'rtsp://old:554/live');
    const picker = makePicker(vi.fn());
    picker.save('ros2', '');
    expect(localStorage.getItem('video-rtsp-url')).toBeNull();
  });
});

describe('VideoSourcePicker.apply', () => {
  it('sends PATCH with correct body for ros2', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('ros2');
    expect(fetchFn).toHaveBeenCalledWith(TEST_API, expect.objectContaining({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'publisher' }),
    }));
  });

  it('sends PATCH with RTSP URL as source', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    await picker.apply('rtsp', 'rtsp://cam:554/live');
    expect(fetchFn).toHaveBeenCalledWith(TEST_API, expect.objectContaining({
      body: JSON.stringify({ source: 'rtsp://cam:554/live' }),
    }));
  });

  it('returns "ok" and persists on success', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(okResponse());
    const picker = makePicker(fetchFn);
    const result = await picker.apply('disabled');
    expect(result).toBe('ok');
    expect(localStorage.getItem('video-source')).toBe('disabled');
  });

  it('returns "http-error:<status>" without persisting on HTTP error', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(errResponse(500));
    const picker = makePicker(fetchFn);
    const result = await picker.apply('ros2');
    expect(result).toBe('http-error:500');
    expect(localStorage.getItem('video-source')).toBeNull();
  });

  it('returns "network-error:<msg>" without persisting on fetch throw', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockRejectedValue(new Error('Failed to fetch'));
    const picker = makePicker(fetchFn);
    const result = await picker.apply('ros2');
    expect(result).toBe('network-error:Failed to fetch');
    expect(localStorage.getItem('video-source')).toBeNull();
  });
});
```

- [ ] **Step 3: Verify tests are red before implementation**

```bash
docker compose --profile test run --rm webclient-test
```

Expected: `video_source.test.ts` fails (module not found or all tests fail because stubs throw). This is the red phase.

- [ ] **Step 4: Run tests again after implementing `video_source.ts`**

Expected: all `video_source.test.ts` tests pass; 85 prior tests still pass; total ≥ 99.

---

## Task 3 — Wire `VideoSourcePicker` into `index.html`

**Files:** `web-client/index.html`

`index.html` handles only DOM binding — no business logic.

- [ ] **Step 1: Replace the Video settings page HTML**

Replace the existing `#page-video` `<div>`:

```html
<!-- Video page -->
<div id="page-video" class="drawer-page" hidden>
  <div class="field-group">
    <span class="field-label">Video source</span>
    <select id="video-source-select" class="field-value" style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:4px 8px;color:var(--text);font-size:13px">
      <option value="ros2">ROS2 topic</option>
      <option value="rtsp">RTSP URL</option>
      <option value="disabled">Disabled</option>
    </select>
  </div>
  <div id="video-rtsp-field" class="field-group" style="display:none">
    <span class="field-label">RTSP URL</span>
    <div class="field-row">
      <input id="video-rtsp-input" type="text"
             placeholder="rtsp://192.168.1.200:554/stream" />
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-top:8px">
    <button id="video-source-apply" class="btn-primary">Apply</button>
  </div>
  <div id="video-source-status" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>
  <p style="font-size:12px;color:var(--text-muted);margin-top:8px">
    <strong>ROS2 topic</strong> — uses <code>video-bridge</code> (set <code>VIDEO_TOPIC</code> in <code>.env</code>).<br>
    <strong>RTSP URL</strong> — MediaMTX pulls directly from an IP camera.<br>
    Changes take effect immediately; no restart needed.
  </p>
</div>
```

- [ ] **Step 2: Add import and DOM wiring to the inline script**

Add import alongside other module imports:

```javascript
import { VideoSourcePicker } from '/dist/video_source.js';
```

Add the wiring block (replaces any leftover `videoStatus` reference):

```javascript
// ── Video source picker ───────────────────────────────────────────────────────

const videoSourceSelect = document.getElementById('video-source-select');
const videoRtspField    = document.getElementById('video-rtsp-field');
const videoRtspInput    = document.getElementById('video-rtsp-input');
const videoSourceApply  = document.getElementById('video-source-apply');
const videoSourceStatus = document.getElementById('video-source-status');

const picker = new VideoSourcePicker();

// Show/hide RTSP URL field
videoSourceSelect.addEventListener('change', () => {
  videoRtspField.style.display = videoSourceSelect.value === 'rtsp' ? '' : 'none';
});

videoSourceApply.addEventListener('click', async () => {
  const mode    = videoSourceSelect.value;
  const rtspUrl = videoRtspInput.value.trim();
  if (mode === 'rtsp' && !rtspUrl) {
    videoSourceStatus.textContent = 'Enter an RTSP URL first.';
    return;
  }
  videoSourceStatus.textContent = 'Applying…';
  const result = await picker.apply(mode, rtspUrl);
  videoSourceStatus.textContent = result === 'ok' ? 'Applied.' : result.replace(':', ': ');
});

// Restore saved source and re-apply on every load
// (MediaMTX runtime config is volatile — lost on container restart).
(async function () {
  const { mode, rtspUrl } = picker.loadSaved();
  videoSourceSelect.value = mode;
  if (mode === 'rtsp') {
    videoRtspField.style.display = '';
    videoRtspInput.value = rtspUrl;
  }
  await picker.apply(mode, rtspUrl);
})();
```

- [ ] **Step 3: Run full webclient test suite**

```bash
docker compose --profile test run --rm webclient-test
```

Expected: all tests pass (≥ 99 total).

---

## Task 4 — AGENTS.md update

**Files:** `AGENTS.md`

- [ ] Update Handoff State summary
- [ ] Update Head SHA
- [ ] Add deviations:

| Deviation | Location | Why accepted |
|---|---|---|
| `/mediamtx-api` prefix strips to `/v3` at proxy layer | `auth-server/src/app.ts` | Avoids exposing a raw `/v3` path on the public-facing auth-server; clean separation between `/video` (WHEP media) and `/mediamtx-api` (config API) |
| `source: redirect` to non-existent path used to disable stream | `web-client/src/video_source.ts` | MediaMTX has no explicit "disabled" state; redirect to a void path causes WHEP clients to receive 404, which WhepClient already handles by showing the placeholder |
| Video source state stored in `localStorage` and re-applied on load | `web-client/src/video_source.ts` | MediaMTX runtime config is volatile (lost on restart); re-applying on page load reconciles drift without adding a server-side persistence layer |
| `VideoSourcePicker` takes `fetchFn` as constructor option | `web-client/src/video_source.ts` | Enables pure vitest testing without `vi.stubGlobal` side effects; same dependency-injection pattern as `WhepClient` callbacks |

---

## Completion checklist

Before marking this milestone done:

- [ ] `docker compose --profile test run --rm auth-server-test` — 33 tests passing
- [ ] `docker compose --profile test run --rm webclient-test` — ≥ 99 tests passing
- [ ] `docker compose --profile test run --rm video-bridge-test` — 19 tests passing
- [ ] `docker compose up --build` starts without errors
- [ ] Settings drawer → Video: dropdown switches between ROS2 / RTSP / Disabled
- [ ] Selecting RTSP shows URL input field; Apply sends PATCH to MediaMTX API
- [ ] After switching source, browser video panel reconnects automatically (WhepClient retry)
- [ ] Page reload re-applies the saved source (MediaMTX config restored after restart)
- [ ] AGENTS.md Head SHA updated
