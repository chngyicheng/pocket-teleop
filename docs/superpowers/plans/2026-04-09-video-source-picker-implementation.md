# Video Source Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the operator to switch the video source at runtime from the browser Settings drawer — no container restarts required. Sources: ROS2 topic (current default, routed via video-bridge), direct RTSP URL (pulled by MediaMTX natively), or disabled.

**Architecture:**
```
Settings drawer → Video Source page
    │ PATCH /mediamtx-api/v3/config/paths/patch/teleop
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
- Source state is stored in `localStorage` and re-applied on page load via a `PATCH` to the API; MediaMTX itself is the source of truth at runtime
- `video-bridge` always runs; when source is `rtsp://...` or disabled, MediaMTX ignores video-bridge's RTSP push (no-op)
- Disabling sets `source: redirect` pointing to a non-existent stream path — MediaMTX returns 404 to WHEP clients; WhepClient shows "No video stream" placeholder
- `VIDEO_TOPIC` in `.env` sets the **default** source on first run; the operator can override at runtime

**No new test infrastructure needed** — the new auth-server route (`/mediamtx-api`) follows the same proxy pattern as `/video`, tested with the same supertest mock-server approach.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `docs/superpowers/plans/2026-04-09-video-source-picker-implementation.md` | This plan |

### Modified files
| File | Change |
|---|---|
| `auth-server/src/app.ts` | Add `/mediamtx-api` proxy route (strips prefix, forwards to `mediaMtxUrl/v3`) |
| `auth-server/test/auth.test.ts` | 2 new tests: unauthenticated `/mediamtx-api/...` → 302; authenticated → forwarded |
| `web-client/src/whep_client.ts` | No change — WhepClient already auto-retries on source switch |
| `web-client/index.html` | Replace Video settings page: source dropdown + optional RTSP URL input + Apply; wire to PATCH API; persist source to localStorage and re-apply on load |
| `AGENTS.md` | Update handoff, add deviations |

---

## Task 1 — auth-server `/mediamtx-api` proxy route

**Files:** `auth-server/src/app.ts`, `auth-server/test/auth.test.ts`

The MediaMTX config API lives at `http://localhost:8889/v3/...`. Auth-server needs to proxy `/mediamtx-api/*` → `http://localhost:8889/v3/*`, stripping the `/mediamtx-api` prefix but keeping the `/v3/...` suffix.

- [ ] **Step 1: Add `mediaMtxApiUrl` option and proxy route in `auth-server/src/app.ts`**

`mediaMtxUrl` already points to `http://localhost:8889`. The API lives at `/v3` on the same host. Rather than adding a second option, construct the API base from `mediaMtxUrl`:

```typescript
// Video stream proxy (WHEP media)
app.use('/video', makeHttpProxy(mediaMtxUrl));

// MediaMTX config API — authenticated; /mediamtx-api/* → mediaMtxUrl/v3/*
// Express strips '/mediamtx-api' from req.url, so the proxy target needs the
// '/v3' prefix appended to the base URL.
app.use('/mediamtx-api', makeHttpProxy(`${mediaMtxUrl}/v3`));
```

- [ ] **Step 2: Add 2 tests to `auth-server/test/auth.test.ts`**

Follow the pattern of the existing `/video` proxy tests:

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

## Task 2 — Settings Video Source page (index.html)

**Files:** `web-client/index.html`

Replace the current status-only Video settings page with an interactive source picker. All logic lives in the inline `<script type="module">`.

- [ ] **Step 1: Replace the Video settings page HTML**

Replace the existing `#page-video` content:

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

- [ ] **Step 2: Add source-picker logic to the inline script**

Remove the old `videoStatus` reference (from the previous "Connecting…" status span) and add:

```javascript
// ── Video source picker ───────────────────────────────────────────────────────

const VIDEO_SOURCE_KEY = 'video-source';       // 'ros2' | 'rtsp' | 'disabled'
const VIDEO_RTSP_KEY   = 'video-rtsp-url';

const videoSourceSelect  = document.getElementById('video-source-select');
const videoRtspField     = document.getElementById('video-rtsp-field');
const videoRtspInput     = document.getElementById('video-rtsp-input');
const videoSourceApply   = document.getElementById('video-source-apply');
const videoSourceStatus  = document.getElementById('video-source-status');

// MediaMTX source values for each mode
const MEDIAMTX_SOURCES = {
  ros2:     { source: 'publisher' },                         // video-bridge pushes
  disabled: { source: 'redirect', sourceRedirect: 'mediamtx-void' }, // 404 → WhepClient shows placeholder
};

function buildMtxSource(mode, rtspUrl) {
  if (mode === 'rtsp') return { source: rtspUrl };
  return MEDIAMTX_SOURCES[mode];
}

async function applyVideoSource(mode, rtspUrl) {
  videoSourceStatus.textContent = 'Applying…';
  try {
    const body = buildMtxSource(mode, rtspUrl);
    const res = await fetch('/mediamtx-api/config/paths/patch/teleop', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (res.ok) {
      videoSourceStatus.textContent = 'Applied.';
      localStorage.setItem(VIDEO_SOURCE_KEY, mode);
      if (mode === 'rtsp') localStorage.setItem(VIDEO_RTSP_KEY, rtspUrl);
      else localStorage.removeItem(VIDEO_RTSP_KEY);
    } else {
      videoSourceStatus.textContent = `Error ${res.status}`;
    }
  } catch (e) {
    videoSourceStatus.textContent = `Failed: ${e.message}`;
  }
}

// Show/hide RTSP field when dropdown changes
videoSourceSelect.addEventListener('change', () => {
  videoRtspField.style.display = videoSourceSelect.value === 'rtsp' ? '' : 'none';
});

videoSourceApply.addEventListener('click', () => {
  const mode = videoSourceSelect.value;
  const rtspUrl = videoRtspInput.value.trim();
  if (mode === 'rtsp' && !rtspUrl) {
    videoSourceStatus.textContent = 'Enter an RTSP URL first.';
    return;
  }
  applyVideoSource(mode, rtspUrl);
});

// Restore persisted source on load and re-apply to MediaMTX
(function restoreVideoSource() {
  const saved     = localStorage.getItem(VIDEO_SOURCE_KEY) ?? 'ros2';
  const savedRtsp = localStorage.getItem(VIDEO_RTSP_KEY) ?? '';
  videoSourceSelect.value = saved;
  if (saved === 'rtsp') {
    videoRtspField.style.display = '';
    videoRtspInput.value = savedRtsp;
  }
  // Re-apply on every page load so MediaMTX reflects the stored choice
  // (MediaMTX loses runtime config on restart).
  applyVideoSource(saved, savedRtsp);
})();
```

- [ ] **Step 3: Run webclient tests**

```bash
docker compose --profile test run --rm webclient-test
```

Expected: all 85 existing tests pass. No new tests for the settings UI (DOM event wiring — integration-level browser test, deferred).

---

## Task 3 — AGENTS.md update

**Files:** `AGENTS.md`

- [ ] Update Handoff State summary
- [ ] Update Head SHA
- [ ] Add deviations:

| Deviation | Location | Why accepted |
|---|---|---|
| `/mediamtx-api` prefix strips to `/v3` at proxy layer | `auth-server/src/app.ts` | Avoids exposing a raw `/v3` path on the public-facing auth-server; clean separation between `/video` (WHEP media) and `/mediamtx-api` (config API) |
| `source: redirect` with non-existent path used to disable stream | `web-client/index.html` | MediaMTX has no explicit "disabled" state; `redirect` to a non-existent path causes WHEP clients to receive 404, which WhepClient already handles by showing the placeholder |
| Video source state stored in `localStorage` and re-applied on load | `web-client/index.html` | MediaMTX runtime config is volatile (lost on restart); re-applying on page load reconciles drift without adding a server-side persistence layer |
| No new tests for Settings Video Source page DOM wiring | `web-client/index.html` | The PATCH call to `/mediamtx-api` requires a live MediaMTX instance; jsdom has no fetch → network round-trip to mock; deferred to a follow-up integration test once a MediaMTX mock is available |

---

## Completion checklist

Before marking this milestone done:

- [ ] `docker compose --profile test run --rm auth-server-test` — 33 tests passing
- [ ] `docker compose --profile test run --rm webclient-test` — 85 tests passing
- [ ] `docker compose --profile test run --rm video-bridge-test` — 19 tests passing
- [ ] `docker compose up --build` starts without errors
- [ ] Settings drawer → Video: dropdown switches between ROS2 / RTSP / Disabled
- [ ] Selecting RTSP shows URL input field; Apply sends PATCH to MediaMTX API
- [ ] After switching source, browser video panel reconnects automatically (WhepClient retry)
- [ ] Page reload re-applies the saved source (MediaMTX config restored after restart)
- [ ] AGENTS.md Head SHA updated
