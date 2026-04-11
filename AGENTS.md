# pocket-teleop — Agent Guide

> Progressive disclosure: read only as far as needed. Start at **Level 1**, go deeper if task demands.

---

## Staleness — Keeping This File Current

**`CLAUDE.md` is a symlink to `AGENTS.md`. Always edit `AGENTS.md` directly — never `CLAUDE.md`.**

**Update this file in same commit as code change it documents.**

Handoff State section: first thing new agent reads. Write as handoff to zero-context reader:

- **Head SHA** — update to commit about to be made (run `git rev-parse --short HEAD` after staging, before committing)
- **Task table** — mark task ✅ Done; move ⬜ Next to following task; update Notes with what was created or key test names now passing
- **Known deviations** — add row for any deviation from plan, with concrete "Why accepted" satisfying skeptical cold reviewer
- **No pronouns or "we" / "I" / "our"** — third person; reads as docs, not conversation

See [version-control.md](memory/agent-guides/version-control.md) for full table of what to update and when.

---

## Handoff State — Resume Here

> **For the next agent:** v0.9.0 complete. All tests pass (34 auth-server / 115 webclient / 19 video-bridge). Next work: implement v0.10.0 (robot telemetry) — plan in `docs/superpowers/plans/`. Runtime verification of the "Apply" button (clicking it in the live UI against a running MediaMTX) is still outstanding.

**Head SHA:** `ec7d661` (as of 2026-04-11)

### Completed milestones

| Milestone | Tests | Tag |
|---|---|---|
| Server (ROS2 WebSocket, command handler, teleop node) | — | `v0.1.0-server` |
| Web client v0.1.0 (protocol, connection, gamepad handler, teleop client, integration tests) | 10 | `v0.1.0-client` |
| Practical gaps (gamepad profiles, reconnection, calibration UI) | 43 | `v0.2.0` |
| Frontend UI (settings.ts, onTwist, responsive index.html rewrite) | 43 | `v0.3.0` |
| Touch joystick + UI polish (TouchJoystick module, namespace settings, gamepad switching, dual-touch fix, UI refinements) | 60 | `v0.4.0` |
| v0.5.0 (KeyboardHandler, TeleopClient fixed retry + onPong, TouchJoystick hint, axis remap, input-mode bar, last-seen pill) | 63 | `v0.5.0` |
| Video streaming (mediamtx, video-bridge, WhepClient, /video proxy, WebRTC panel) | 85 webclient / 31 auth / 19 video-bridge | `v0.6.0` |
| Video source picker (auth-server /mediamtx-api proxy, VideoSourcePicker module, settings UI) + 404 fix | 34 auth / 99 webclient / 19 video-bridge | `v0.7.0` |
| v0.8.0 control reliability (keyboard key-up fires immediately, e-stop button + spacebar, calibration Ready phase) | 34 auth / 103 webclient / 19 video-bridge | — |
| v0.9.0 feedback & polish (RTSP URL validation, WhepClient stream health badge, TeleopClient latency display) | 34 auth / 115 webclient / 19 video-bridge | — |

### Known deviations (still relevant to future work)

| Deviation | Location | Why accepted |
|---|---|---|
| `--network=host` required for all builds | `docker-compose.yml`, build commands | Pi5 can't resolve DNS in Docker bridge network — omitting causes silent build failures |
| `#define ASIO_STANDALONE` must NOT be used | `teleop_server.hpp` and any new server WebSocket code | Dockerfile installs `libboost-system-dev` (Boost ASIO); standalone ASIO (`libasio-dev`) not installed |
| `docker-compose.yml` env values must be quoted | `docker-compose.yml` | Docker Compose v2.35+ fails to parse `${VAR:?msg: with colon}` in unquoted YAML strings |
| `moduleResolution: node16` (not `bundler`) | `web-client/tsconfig.json` | `bundler` allows extensionless imports that 404 in nginx-served ES modules; `node16` enforces `.js` extensions |
| `module: Node16` (not `ESNext`) | `web-client/tsconfig.json` | TypeScript 5 rejects `module: ESNext` + `moduleResolution: node16` with TS5110 |
| `node:22-slim` (not `node:20-slim`) | `web-client/Dockerfile.webclient` | Node 20 has no native `WebSocket` global; connection attempts fail silently |
| `navigator` guard must check `getGamepads`, not just `navigator` | `web-client/src/gamepad_handler.ts` | Node 22 defines `navigator` globally without `getGamepads`; bare `typeof navigator` guard crashes |
| `TeleopClient` retry triggered from both `onError` and `onclose` | `web-client/src/teleop_client.ts` | Node.js 22 native WebSocket fires only `onerror` for rejected connections; `retryPending` guard prevents double-scheduling when browsers fire both |
| `Touch` constructor shimmed in test; `jsdom` added to devDeps | `web-client/test/touch_joystick.test.ts`, `web-client/package.json` | jsdom 24 exposes `TouchEvent` but not `Touch` as global constructor; shim defines minimal class satisfying constructor calls |
| `.drawer-page[hidden] { display: none }` required alongside `[hidden]` | `web-client/index.html` | Author CSS `.drawer-page { display: flex }` overrides UA `[hidden] { display: none }` via cascade; compound selector has higher specificity, restores correct behaviour |
| `TouchJoystick` uses document-level Pointer Event listeners, no `setPointerCapture` | `web-client/src/touch_joystick.ts` | Brave routes second finger's `pointerdown` to capturing element when `setPointerCapture` active, corrupting second joystick's origin. Fix: listen on `document`; use `e.target` to route each `pointerdown` to correct zone; `_activeTouchIds` module-level set prevents two zones claiming same `pointerId` if browser reuses IDs. `touch-action: none` still required on zone elements. |
| `PointerEvent` shimmed in test; `jsdom` shim pattern reused | `web-client/test/touch_joystick.test.ts` | jsdom 24 doesn't expose `PointerEvent` as global constructor; shim mirrors earlier `Touch` shim |
| `style.display = ''` does not show elements with CSS `display:none` | `web-client/index.html` applyNamespace | Setting inline display to '' removes inline override, CSS display:none wins; use 'block' explicitly to show |
| `Dockerfile` CMD uses `${VAR:+-p name:=val}` for optional robot params | `Dockerfile` CMD | ROS2 rejects `-p robot_name:=` (empty value); unquoted values with spaces cause word-split; fix: `${ROBOT_NAME:+-p \"robot_name:=${ROBOT_NAME}\"}` — skips param when unset, quotes when set; plan only updated `teleop.launch.py` — Dockerfile was separate invocation path |
| `navigator.maxTouchPoints` returns 0 in Brave (fingerprinting protection) | `web-client/src/touch_joystick.ts` | Brave zeroes `maxTouchPoints` regardless of device; switched to `matchMedia('(pointer: coarse)')` which Brave doesn't suppress. Brave on Android still doesn't show joystick hint — root cause unknown, needs investigation. |
| `vitest.config.ts` added with explicit `include: ['test/**/*.test.ts']` | `auth-server/vitest.config.ts` | Vitest default glob didn't discover tests in `test/` subdirectory without explicit config; harmless addition |
| `(FileStoreCreator as any)(session)` cast required | `auth-server/src/app.ts` | session-file-store typedefs declare export as class not factory; `as any` cast is accepted community workaround |
| `store.reapAsync` call omitted from `createApp` | `auth-server/src/app.ts` | `reapAsync` optional maintenance; periodic reap still runs via `reapInterval: 3600`; omission has no correctness impact |
| `(wsProxy as any).upgrade!` non-null assertion used | `auth-server/src/proxy.ts` | http-proxy-middleware v2 typedefs mark `upgrade` as optional but always assign in constructor; guard removed after external review |
| `TELEOP_SERVER_URL` defaults to `http://` not `ws://` | `auth-server/src/index.ts` | http-proxy-middleware requires HTTP target URL for WebSocket proxying; `ws://` caused protocol errors |
| `auth-server/Dockerfile.auth` creates `/data` with app ownership | `auth-server/Dockerfile.auth` | Without explicit `mkdir + chown`, volume mount at `/data` defaults to root ownership and `app` user can't write credentials |
| `webclient-test` routes through auth-server proxy | `docker-compose.yml` | Integration tests exercise full path (browser→auth-server→teleop-server) matching production topology; discovered during Task 8 |
| `Dockerfile` (C++ server) removes `token` launch param | `Dockerfile` | Token param removal required after TELEOP_TOKEN retired in Task 7; Dockerfile CMD had separate invocation path from launch.py missed in plan |
| `.accordion-body[hidden] { display: none }` required | `web-client/index.html` | Author CSS `.accordion-body { display: flex }` overrides UA `[hidden]` attribute; compound selector restores correct behavior (same pattern as `.drawer-page[hidden]`) |
| Eyeball SVG duplicated across three files | `login.html`, `change-password.html`, `index.html` | Each is standalone server-rendered HTML; shared extraction not worth complexity; SVG ~500 bytes per copy |
| Change-password route behaves differently by context | `auth-server/src/routes/auth.ts` | Forced first-login (mustChangePassword=true) keeps session + redirects to `/`; voluntary account-page change destroys session + redirects to `/auth/login` to force re-auth |
| `Cache-Control: no-store` set on all authenticated proxy responses | `auth-server/src/app.ts` | Prevents browser disk cache and bfcache (Chrome/Firefox) from serving stale pages after logout; trade-off: no caching of static assets through proxy — acceptable since nginx serves assets directly in production |
| Account-page forms use `fetch()` not native HTML POST | `web-client/index.html` | Native form POST navigates browser to plaintext error responses (e.g. `res.status(401).send('...')`); fetch allows inline error display in existing `.form-error` elements |
| Auth check on `visibilitychange` fires fetch on every tab-switch | `web-client/index.html` | `/auth/me` trivial JSON response (~50 bytes); frequency bounded by user actions (tab switch, phone wake), not polling; trade-off: one extra request per visibility change — acceptable for session security |
| Docker healthcheck for auth-server uses inline `node -e` | `docker-compose.yml` | `node:22-slim` base has no `wget` or `curl`; inline Node.js HTTP request is zero-dependency |
| Docker healthcheck for teleop-server uses `bash /dev/tcp` | `docker-compose.yml` | ROS humble base has `bash` but no HTTP client tools; `/dev/tcp` is bash built-in testing TCP connectivity without extra deps |
| `TELEOP_SERVER_URL` now configurable from `.env` | `docker-compose.yml` | `host-gateway` (resolves `host.docker.internal`) requires Docker >= 20.10; older Docker silently fails; URL overridable via `.env` lets users substitute LAN IP without editing compose |
| `fastrtps_profiles_observer.xml` added for cross-machine ROS2 observation | `server/fastrtps_profiles_observer.xml` | Machines with multicast broken (`[Errno 19] No such device`) can't discover ROS2 participants via default SPDP multicast; unicast-only profile with `useBuiltinTransports=false` + `initialPeersList` pointing to robot IP required; main server profile unchanged since it already accepts unicast SPDP from any peer on whitelisted interface |
| `auth-server` switched to `network_mode: host`; `webclient` exposes port 18080 on loopback | `docker-compose.yml` | UFW (active on host) blocks inbound TCP from Docker bridge networks to host's bridge-gateway IP (`172.18.0.1`) via INPUT chain; `host.docker.internal` maps to docker0 (`172.17.0.1`) on separate bridge, also blocked; only reliable path from auth-server to teleop-server (host network) is host-mode networking, both see `localhost:9091`; webclient exposes port 18080 on `127.0.0.1` so auth-server can proxy without crossing bridge boundaries; `webclient-test` also switched to host network to reach `localhost:8080` |
| `auth-server/src/index.ts` `PORT` env var and `detectGateway()` removed | `auth-server/src/index.ts` | `PORT` added for host-network deployment on port 8080; `detectGateway()` added as workaround for UFW-blocked bridge→host traffic but proved unnecessary once host networking used |
| `WhepClient` tested via mocked `RTCPeerConnection` shim | `web-client/test/whep_client.test.ts` | jsdom 24 has no `RTCPeerConnection`; shim defined in test file (same pattern as `Touch` and `PointerEvent` shims); 13 tests cover connect, retry, stop, back-off, onStream, onClose |
| `video-bridge` tested via pytest on pure pipeline functions | `video-bridge/test_video_bridge.py` | GStreamer plumbing untestable without hardware; pipeline-string builder functions (`_compressed_pipeline`, `_raw_pipeline`, `_FORMAT_MAP`) pure and fully covered by 19 pytest tests |
| `<img id="video-img">` removed without replacement | `web-client/index.html` | Manual MJPEG URL input had no users (stream URL never persisted from prior sessions); WebRTC/WHEP supersedes it; MJPEG URL support can be re-added when RTSP/UDP input sources implemented |
| `loadVideoUrl` / `saveVideoUrl` / `clearVideoUrl` removed from settings.ts imports | `web-client/index.html` | No longer needed after MJPEG path removed; `settings.ts` functions remain in source for future use |
| `vi.runAllMicrotasksAsync` replaced with `flushPromises` loop | `web-client/test/whep_client.test.ts` | `vi.runAllMicrotasksAsync` added in Vitest 2.x; project uses Vitest 1.6.1; ten sequential `await Promise.resolve()` calls flush all pending microtasks reliably |
| `monkeypatch.setattr(vb, 'MEDIAMTX_RTSP', ...)` used instead of `importlib.reload` | `video-bridge/test_video_bridge.py` | `importlib.reload` rewrites module dict in-place, not restored after test; `monkeypatch.setattr` patches and restores module-level constant cleanly |
| `video-bridge-test` compose service runs `python3 -m pytest` (not `pytest`) | `docker-compose.yml`, `video-bridge/Dockerfile.video_bridge` | `pip3 install pytest` puts binary in non-`$PATH` location in ROS Humble base image; `python3 -m pytest` always works via installed module directly |
| `/mediamtx-api` prefix strips to `/v3` at proxy layer | `auth-server/src/app.ts` | Avoids exposing raw `/v3` path on public-facing auth-server; clean separation between `/video` (WHEP media) and `/mediamtx-api` (config API) |
| Body parsers scoped to `/auth` only (not global) | `auth-server/src/app.ts` | Global `express.json()` consumed request stream before proxy piped it; proxy request hung indefinitely (never ended); scoping to `/auth` leaves stream intact for proxy routes |
| `pathRewrite: { '^/mediamtx-api': '/v3' }` instead of manual `req.url` mutation | `auth-server/src/app.ts`, `auth-server/src/proxy.ts` | http-proxy-middleware v2 resets `req.url = req.originalUrl` in `prepareProxyRequest`, discarding any prior mutation; `pathRewrite` runs after the reset so it applies correctly |
| Diagnostic PATCH test added to auth-server suite | `auth-server/test/auth.test.ts` | Existing `/mediamtx-api` tests only checked "not 302" and didn't pass `mediaMtxApiUrl` to the mock — verified nothing; new test confirms PATCH method, `/v3` path, and body all reach the mock correctly |
| `source: redirect` to non-existent path used to disable stream | `web-client/src/video_source.ts` | MediaMTX has no explicit "disabled" state; redirect to void path causes WHEP clients to receive 404, which WhepClient handles by showing placeholder |
| Video source state stored in `localStorage` and re-applied on load | `web-client/src/video_source.ts` | MediaMTX runtime config volatile (lost on restart); re-applying on page load reconciles drift without adding server-side persistence layer |
| `VideoSourcePicker` takes `fetchFn` as constructor option | `web-client/src/video_source.ts` | Enables pure vitest testing without `vi.stubGlobal` side effects; same dependency-injection pattern as `WhepClient` callbacks |
| `boundKeyUp` fires twist immediately (not poll-driven) | `web-client/src/keyboard_handler.ts` | Poll interval (200ms) creates a coasting window; key-up handler re-computes and fires the updated twist atomically without duplicating the poll logic |
| Spacebar e-stop skips when `activeElement` is input/textarea/select | `web-client/index.html` | Spacebar is a valid character in text fields; checking tag prevents accidental stops while typing RTSP URLs or profile names |
| Gamepad calibration splits into prompt + sample phases | `web-client/index.html` | Original single-phase sampling started immediately after instruction display; user had no time to position the stick before samples were collected |
| `validate()` lives on `VideoSourcePicker`, not `buildMtxSource` | `web-client/src/video_source.ts` | `buildMtxSource` is a pure data function; validation is a policy concern that belongs on the stateful class |
| Latency updates only during idle (no active driving) | `web-client/src/teleop_client.ts` | Keepalive ping fires only when no twist sent in 200ms; during active driving, continuous twists suppress pings; this is the correct trade-off — latency during idle is more useful than during driving |
| `WhepState` `'error'` is distinct from `'retrying'` | `web-client/src/whep_client.ts` | `onError` fires for transient stream errors (e.g. source not available) that trigger retry; true error state reserved for fetch/network failures that are not retried |

---

## Document Map

| What you need | Where to look |
|---|---|
| Run the stack now | Level 1 (below) |
| Build, test, docker commands | [repository-structure.md](memory/agent-guides/repository-structure.md) |
| Tech stack and dependencies | [techstack.md](memory/agent-guides/techstack.md) |
| Message protocol and data types | [data-schema.md](memory/agent-guides/data-schema.md) |
| Git workflow and doc update rules | [version-control.md](memory/agent-guides/version-control.md) |
| TDD standards, guardrails, task orientation | [project-skills.md](memory/agent-guides/project-skills.md) |
| Server implementation plan | `docs/superpowers/plans/2026-03-27-server-implementation.md` |
| Server design spec | `docs/superpowers/specs/2026-03-27-server-design.md` |
| Web client implementation plan | `docs/superpowers/plans/2026-03-28-client-implementation.md` |
| Web client design spec | `docs/superpowers/specs/2026-03-28-client-design.md` |
| Practical gaps implementation plan | `docs/superpowers/plans/2026-03-28-practical-gaps-implementation.md` |
| Practical gaps design spec | `docs/superpowers/specs/2026-03-28-practical-gaps-design.md` |
| Frontend UI implementation plan | `docs/superpowers/plans/2026-03-28-frontend-ui-implementation.md` |
| Frontend UI design spec | `docs/superpowers/specs/2026-03-28-frontend-ui-design.md` |
| Touch joystick implementation plan | `docs/superpowers/plans/2026-03-29-touch-joystick-implementation.md` |
| Touch joystick design spec | `docs/superpowers/specs/2026-03-28-touch-joystick-design.md` |
| **v0.5.0 implementation plan** | `docs/superpowers/plans/2026-03-30-v0.5.0-implementation.md` |
| v0.5.0 design spec | `docs/superpowers/specs/2026-03-30-v0.5.0-design.md` |
| **Auth server implementation plan** | `docs/superpowers/plans/2026-04-03-auth-server-implementation.md` |
| Auth server design spec | `docs/superpowers/specs/2026-04-03-auth-server-design.md` |
| **Video streaming implementation plan** | `docs/superpowers/plans/2026-04-09-video-streaming-implementation.md` |
| **Video source picker implementation plan** | `docs/superpowers/plans/2026-04-09-video-source-picker-implementation.md` |
| **v0.8.0 control reliability plan** | `docs/superpowers/plans/2026-04-11-v0.8.0-control-reliability.md` |
| **v0.9.0 feedback & polish plan** | `docs/superpowers/plans/2026-04-11-v0.9.0-feedback-polish.md` |
| **v0.10.0 robot telemetry plan** | `docs/superpowers/plans/2026-04-11-v0.10.0-robot-telemetry.md` |

**When to go deeper:** Guide file doesn't answer → read relevant spec. Spec doesn't answer → read plan. Don't read all three upfront.

---

## Level 1 — What Is This and How Do I Run It?

**pocket-teleop** drives ROS2 robot from phone browser via WebSocket. Auth server handles login, proxies web client and WebSocket, publishes velocity commands to `/cmd_vel` via ROS2.

**ROS2 runs inside Docker. Host needs only Docker and Docker Compose.**

```bash
# Copy .env.example to .env and fill in all values first:
cp .env.example .env
# Edit .env: set TELEOP_ADMIN_USER, TELEOP_ADMIN_PASSWORD, SESSION_SECRET

docker compose up --build

# Stop
docker compose down
```

Web client (phone browser): `http://<robot-ip>:8080` — login prompt on first visit.

**Credentials:** Single operator per robot. First run: login with `.env` values — server forces immediate password change. New credentials stored in `auth-data` Docker volume, persist across reboots and image rebuilds. To reset: `docker compose down -v` (deletes volume) then restart.

Build commands, test commands, file structure → [repository-structure.md](memory/agent-guides/repository-structure.md)

---

## Execution Model — Subagent-Driven Development

**All implementation work uses `superpowers:subagent-driven-development` skill.**

Controller dispatches fresh subagent per task. Each subagent:
1. Implements exactly what plan specifies
2. Runs tests (Docker only — never bare `npm`)
3. Updates `AGENTS.md` handoff table in same commit as code
4. Commits and reports back

After each subagent completes, controller runs two review passes (spec compliance, then code quality) before marking task done and moving on.

See `docs/superpowers/plans/` for active implementation plan.

---

## Task Completion Protocol — Mandatory After Every Task

**Required after every task, every time, no exceptions.**

1. **Run all tests** — 0 failures required before anything else. Fix failures first. Don't proceed to step 2 until suite is green.
2. **Update all docs** — same commit as code:
   - `AGENTS.md` handoff table: mark task ✅ Done, advance ⬜ Next, update Notes and Head SHA
   - Any guide file that changed (see "Keeping docs current" table in [version-control.md](memory/agent-guides/version-control.md))
3. **Commit** — one commit per task, code + docs together
4. **Request push** — say exactly: `"Committed as <hash>. Ready to push — shall I?"`
5. **Wait** — don't start next task until user explicitly confirms push and gives go-ahead

Skipping any step violates workflow. Tests are gate — nothing moves until they pass.

---

## Level 2 — Development Workflow

See [repository-structure.md](memory/agent-guides/repository-structure.md) for build and test commands.

See [version-control.md](memory/agent-guides/version-control.md) for branch strategy, commit conventions, and doc update rules.

See [project-skills.md](memory/agent-guides/project-skills.md) for TDD standards, code quality bar, and execution rules.

---

## Level 3 — Architecture and Data

See [techstack.md](memory/agent-guides/techstack.md) for language, runtime, and dependency details.

See [repository-structure.md](memory/agent-guides/repository-structure.md) for component layer diagram and key file map.

See [data-schema.md](memory/agent-guides/data-schema.md) for message protocol, C++ result types, ROS2 parameters, and environment variables.

---

## Level 4 — Task Guides

See [project-skills.md](memory/agent-guides/project-skills.md) for task orientation table (what each task creates and which tests must pass).

Full step-by-step code: `docs/superpowers/plans/2026-03-27-server-implementation.md`

Full protocol and component spec: `docs/superpowers/specs/2026-03-27-server-design.md`