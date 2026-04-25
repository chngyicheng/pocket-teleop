# Auth Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three auth bugs: (1) account-page form errors show as plaintext pages instead of inline errors, (2) browser back-button after logout shows cached controls page, (3) Docker healthcheck for auth-server uses missing `wget`.

**Architecture:** Server-side changes are minimal — one `Cache-Control` header already added. Bulk of the work is client-side: convert two HTML form submissions to `fetch()` with inline error display, add `visibilitychange` + `pageshow` auth check, fix docker-compose healthcheck. All changes are already prototyped in the working tree — this plan formalises them with tests.

**Tech Stack:** Express (auth-server), Vitest + supertest (auth tests), vanilla JS in index.html (web client), Docker Compose (healthchecks)

---

## Current state of the working tree

The following changes have already been applied but are **uncommitted**:

| File | Change | Status |
|---|---|---|
| `web-client/index.html` | Account-page forms converted to `fetch()`, `pageshow` listener added | Applied, needs `visibilitychange` added |
| `auth-server/src/app.ts` | `Cache-Control: no-store` on authenticated responses | Applied |
| `docker-compose.yml` | auth-server healthcheck changed to `node`, teleop-server healthcheck added | Applied |

The plan below treats these as the starting point. Tasks verify, adjust, test, and commit these changes.

---

### Task 1: Add `Cache-Control: no-store` test for authenticated responses

The header is already in `auth-server/src/app.ts:64`. This task adds a test to lock it down.

**Files:**
- Test: `auth-server/test/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('GET / authenticated', ...)` block in `auth-server/test/auth.test.ts`, after the existing test at line 121:

```typescript
  it('sets Cache-Control: no-store on authenticated responses', async () => {
    const agent = supertest.agent(getApp());
    await agent
      .post('/auth/login')
      .send('username=admin&password=correctpass')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    const res = await agent.get('/');
    expect(res.headers['cache-control']).toBe('no-store');
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `docker compose run --rm auth-server-test -- npx vitest run test/auth.test.ts 2>&1`
Expected: PASS (header is already set in `app.ts:64`)

- [ ] **Step 3: Commit**

```bash
git add auth-server/test/auth.test.ts
git commit -m "test: verify Cache-Control no-store on authenticated responses"
```

---

### Task 2: Convert account-page forms to fetch and add visibilitychange auth check

The index.html already has the `fetch()`-based form handlers and `pageshow` listener from the prototype. This task adds the `visibilitychange` listener and verifies the full set of changes is correct.

**Files:**
- Modify: `web-client/index.html:1074-1080` (auth check section at end of script)

- [ ] **Step 1: Replace the pageshow-only listener with visibilitychange + pageshow**

Find the current block at the end of `<script>` in `web-client/index.html` (around line 1074):

```javascript
    // If the browser restores this page from bfcache (back button after logout),
    // verify the session is still valid and redirect to login if not.
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        fetch('/auth/me').then((res) => { if (!res.ok) window.location.replace('/auth/login'); });
      }
    });
```

Replace with:

```javascript
    // When the page regains visibility (back-button, tab-switch, phone wake),
    // verify the session is still valid. Redirect to login if not.
    function checkAuth() {
      fetch('/auth/me').then((res) => { if (!res.ok) window.location.replace('/auth/login'); });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkAuth();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) checkAuth();
    });
```

- [ ] **Step 2: Verify the fetch-based form handlers are correct**

Confirm the following blocks exist in `web-client/index.html` (already applied from prototype):

1. **Change-username handler** (~line 596): `document.getElementById('form-change-username').addEventListener('submit', async (e) => { ... })` — uses `fetch('/auth/change-username', ...)`, shows `errEl.textContent = await res.text()` on `!res.ok`, redirects to `/auth/login` on success.

2. **Change-password handler** (~line 620): `document.getElementById('form-change-password').addEventListener('submit', async (e) => { ... })` — checks passwords match first, then uses `fetch('/auth/change-password', ...)`, shows inline error on `!res.ok` or on `res.redirected && URL has error param`, redirects to `/auth/login` on success.

No changes needed if both blocks are present as described above.

- [ ] **Step 3: Run existing web-client tests to verify nothing is broken**

Run: `docker compose run --rm webclient-test 2>&1`
Expected: All existing tests pass (these are unit tests for protocol, gamepad, settings, etc. — they don't test the HTML directly, but confirm no TypeScript compilation errors)

- [ ] **Step 4: Commit**

```bash
git add web-client/index.html
git commit -m "fix: account-page form errors shown inline, auth check on visibility change

Convert change-username and change-password forms from native HTML POST
to fetch() — server error responses (wrong password, 'admin' username)
now display in the existing .form-error elements instead of navigating
to a plaintext page.

Add visibilitychange + pageshow listeners that call /auth/me when the
page regains visibility. Covers back-button after logout, tab switch,
and phone wake — redirects to login if session is gone."
```

---

### Task 3: Fix Docker healthchecks

The `docker-compose.yml` already has the updated healthchecks from the prototype. This task adds the `Cache-Control: no-store` server change and commits all infra fixes together.

**Files:**
- Verify: `docker-compose.yml` (healthchecks already applied)
- Verify: `auth-server/src/app.ts` (Cache-Control header already applied)

- [ ] **Step 1: Verify docker-compose.yml healthchecks are correct**

Confirm `docker-compose.yml` contains:

1. **teleop-server** (after `restart: unless-stopped`):
```yaml
    healthcheck:
      test: ["CMD", "bash", "-c", "echo > /dev/tcp/localhost/9091"]
      interval: 30s
      timeout: 5s
      retries: 3
```

2. **auth-server** healthcheck uses `node` not `wget`:
```yaml
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 2: Verify auth-server app.ts has the Cache-Control header**

Confirm `auth-server/src/app.ts` line 64 contains:
```typescript
    res.setHeader('Cache-Control', 'no-store');
```
inside the unauthenticated-check middleware, after the `if (!req.session.userId)` guard.

- [ ] **Step 3: Run all tests**

Run auth-server tests:
```bash
docker compose run --rm auth-server-test 2>&1
```
Expected: All pass (including the new Cache-Control test from Task 1)

Run web-client tests:
```bash
docker compose run --rm webclient-test 2>&1
```
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml auth-server/src/app.ts
git commit -m "fix: Docker healthchecks use available tools, add Cache-Control no-store

auth-server healthcheck: wget → node (wget not installed in node:22-slim)
teleop-server: add TCP healthcheck on port 9091 using bash /dev/tcp
auth-server: set Cache-Control: no-store on authenticated responses to
prevent browser disk cache from serving stale pages after logout"
```

---

### Task 4: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md` (handoff state and known deviations)

- [ ] **Step 1: Update the handoff state block**

Update the handoff summary and SHA. The exact SHA will be determined after Tasks 1–3 are committed. Update the block to reflect:

```markdown
> **For the next agent:** Auth bugfixes complete. Account-page form errors display inline (no more plaintext pages). Back-button after logout redirects to login via visibilitychange + pageshow check. Docker healthchecks fixed (node for auth-server, bash TCP for teleop-server). All tests passing.
```

Update `**Head SHA:**` to the SHA of the Task 3 commit.

- [ ] **Step 2: Add known deviations for new patterns**

Add to the known deviations table:

| Deviation | Location | Why accepted |
|---|---|---|
| `Cache-Control: no-store` set on all authenticated proxy responses | `auth-server/src/app.ts` | Prevents browser disk cache and bfcache (Chrome/Firefox) from serving stale pages after logout; trade-off is no caching of static assets through the proxy — acceptable since nginx serves assets directly in production |
| Account-page forms use `fetch()` not native HTML POST | `web-client/index.html` | Native form POST navigates browser to plaintext error responses from server (e.g. `res.status(401).send('...')`); fetch allows inline error display in existing `.form-error` elements |
| Auth check on `visibilitychange` fires a fetch on every tab-switch | `web-client/index.html` | `/auth/me` is a trivial JSON response (~50 bytes); frequency is bounded by user actions (tab switch, phone wake), not polling; trade-off is one extra request per visibility change — acceptable for session security |
| Docker healthcheck for auth-server uses inline `node -e` | `docker-compose.yml` | `node:22-slim` base image does not include `wget` or `curl`; inline Node.js HTTP request is zero-dependency |
| Docker healthcheck for teleop-server uses `bash /dev/tcp` | `docker-compose.yml` | ROS humble base image has `bash` but no HTTP client tools; `/dev/tcp` is a bash built-in that tests TCP connectivity without extra dependencies |

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md — auth bugfixes complete"
```
