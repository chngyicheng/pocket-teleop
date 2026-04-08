# pocket-teleop — Agent Guide

> Progressive disclosure: read only as far as you need. Start at **Level 1**, go deeper if the task demands it.

---

## Staleness — Keeping This File Current

**`CLAUDE.md` is a symlink to `AGENTS.md`. Always edit `AGENTS.md` directly — never `CLAUDE.md`.**

**Update this file in the same commit as the code change it documents.**

The Handoff State section is the first thing a new agent reads. Write it as if you are handing off to someone with zero context about this conversation:

- **Head SHA** — update to the commit you are about to make (run `git rev-parse --short HEAD` after staging, before committing)
- **Task table** — mark the task ✅ Done; move ⬜ Next to the following task; update Notes with what was created or the key test names that now pass
- **Known deviations** — add a row for any deviation from the plan, with a concrete "Why accepted" that would satisfy a skeptical reviewer reading it cold
- **No pronouns or "we" / "I" / "our"** — write in third person so it reads as documentation, not a conversation

See [version-control.md](memory/agent-guides/version-control.md) for the full table of what to update and when.

---

## Handoff State — Resume Here

> **For the next agent:** Auth-server merged to main. All planned milestones complete — no active implementation plan. Last completed plan: `docs/superpowers/plans/2026-04-03-auth-server-implementation.md`. Tag `v1.0.0` has not been cut yet.

**Head SHA:** `f09a13e` (as of 2026-04-07)

### Completed milestones

| Milestone | Tests | Tag |
|---|---|---|
| Server (ROS2 WebSocket, command handler, teleop node) | — | `v0.1.0-server` |
| Web client v0.1.0 (protocol, connection, gamepad handler, teleop client, integration tests) | 10 | `v0.1.0-client` |
| Practical gaps (gamepad profiles, reconnection, calibration UI) | 43 | `v0.2.0` |
| Frontend UI (settings.ts, onTwist, responsive index.html rewrite) | 43 | `v0.3.0` |
| Touch joystick + UI polish (TouchJoystick module, namespace settings, gamepad switching, dual-touch fix, UI refinements) | 60 | `v0.4.0` |
| v0.5.0 (KeyboardHandler, TeleopClient fixed retry + onPong, TouchJoystick hint, axis remap, input-mode bar, last-seen pill) | 63 | pending `v0.5.0` |

### Known deviations (still relevant to future work)

| Deviation | Location | Why accepted |
|---|---|---|
| `--network=host` required for all builds | `docker-compose.yml`, build commands | Pi5 cannot resolve DNS in Docker bridge network — omitting this flag causes silent build failures |
| `#define ASIO_STANDALONE` must NOT be used | `teleop_server.hpp` and any new server WebSocket code | Dockerfile installs `libboost-system-dev` (Boost ASIO); standalone ASIO (`libasio-dev`) is not installed |
| `docker-compose.yml` env values must be quoted | `docker-compose.yml` | Docker Compose v2.35+ fails to parse `${VAR:?msg: with colon}` in unquoted YAML strings |
| `moduleResolution: node16` (not `bundler`) | `web-client/tsconfig.json` | `bundler` allows extensionless imports that 404 in nginx-served ES modules; `node16` enforces `.js` extensions |
| `module: Node16` (not `ESNext`) | `web-client/tsconfig.json` | TypeScript 5 rejects `module: ESNext` + `moduleResolution: node16` with TS5110 |
| `node:22-slim` (not `node:20-slim`) | `web-client/Dockerfile.webclient` | Node 20 has no native `WebSocket` global; connection attempts fail silently |
| `navigator` guard must check `getGamepads`, not just `navigator` | `web-client/src/gamepad_handler.ts` | Node 22 defines `navigator` globally but without `getGamepads`; bare `typeof navigator` guard crashes |
| `TeleopClient` retry triggered from both `onError` and `onclose` | `web-client/src/teleop_client.ts` | Node.js 22 native WebSocket fires only `onerror` for rejected connections; `retryPending` guard prevents double-scheduling when browsers fire both |
| `Touch` constructor shimmed in test; `jsdom` added to devDeps | `web-client/test/touch_joystick.test.ts`, `web-client/package.json` | jsdom 24 exposes `TouchEvent` but not `Touch` as a global constructor; shim defines a minimal class that satisfies the test's constructor calls |
| `.drawer-page[hidden] { display: none }` required alongside `[hidden]` | `web-client/index.html` | Author CSS `.drawer-page { display: flex }` overrides UA `[hidden] { display: none }` due to cascade order; compound selector has higher specificity and restores correct behaviour |
| `TouchJoystick` uses document-level Pointer Event listeners, no `setPointerCapture` | `web-client/src/touch_joystick.ts` | Brave routes a second finger's `pointerdown` to the capturing element when `setPointerCapture` is active, corrupting the second joystick's origin. Fix: listen on `document`; use `e.target` to route each `pointerdown` to the correct zone; `_activeTouchIds` module-level set prevents two zones from claiming the same `pointerId` if a browser reuses IDs. `touch-action: none` is still required on zone elements. |
| `PointerEvent` shimmed in test; `jsdom` shim pattern reused | `web-client/test/touch_joystick.test.ts` | jsdom 24 does not expose `PointerEvent` as a global constructor; shim pattern mirrors the earlier `Touch` shim |
| `style.display = ''` does not show elements with CSS `display:none` | `web-client/index.html` applyNamespace | Setting inline display to '' removes inline override, CSS display:none wins; use 'block' explicitly to show |
| `Dockerfile` CMD uses `${VAR:+-p name:=val}` for optional robot params | `Dockerfile` CMD | ROS2 rejects `-p robot_name:=` (empty value); unquoted values with spaces cause word-split; fix: `${ROBOT_NAME:+-p \"robot_name:=${ROBOT_NAME}\"}` — skips the param entirely when unset, quotes it when set; plan only updated `teleop.launch.py` — Dockerfile was a separate invocation path |
| `navigator.maxTouchPoints` returns 0 in Brave (fingerprinting protection) | `web-client/src/touch_joystick.ts` | Brave zeroes `maxTouchPoints` regardless of device; switched to `matchMedia('(pointer: coarse)')` which Brave does not suppress. However, Brave on Android still does not show the joystick hint — root cause unknown, further investigation needed. |
| `vitest.config.ts` added with explicit `include: ['test/**/*.test.ts']` | `auth-server/vitest.config.ts` | Vitest default glob did not discover tests in `test/` subdirectory without explicit config; harmless addition |
| `(FileStoreCreator as any)(session)` cast required | `auth-server/src/app.ts` | session-file-store typedefs declare export as class rather than factory function; `as any` cast is the accepted community workaround |
| `store.reapAsync` call omitted from `createApp` | `auth-server/src/app.ts` | `reapAsync` is optional maintenance; periodic reap still runs via `reapInterval: 3600`; omission has no correctness impact |
| `(wsProxy as any).upgrade!` non-null assertion used | `auth-server/src/proxy.ts` | http-proxy-middleware v2 typedefs mark `upgrade` as optional but always assign it in constructor; guard removed for simplicity after external review |
| `TELEOP_SERVER_URL` defaults to `http://` not `ws://` | `auth-server/src/index.ts` | http-proxy-middleware requires HTTP target URL for WebSocket proxying; `ws://` caused protocol errors |
| `auth-server/Dockerfile.auth` creates `/data` with app ownership | `auth-server/Dockerfile.auth` | Without explicit `mkdir + chown`, volume mount at `/data` defaults to root ownership and `app` user cannot write credentials |
| `webclient-test` routes through auth-server proxy | `docker-compose.yml` | Integration tests now exercise the full path (browser→auth-server→teleop-server) matching production topology; discovered during Task 8 |
| `Dockerfile` (C++ server) removes `token` launch param | `Dockerfile` | Token param removal was required after TELEOP_TOKEN retired in Task 7; Dockerfile CMD had a separate invocation path from launch.py that was missed in the plan |

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

**When to go deeper:** If a guide file doesn't answer your question, read the relevant section of the spec. If the spec doesn't answer it, read the plan. Don't read all three up front.

---

## Level 1 — What Is This and How Do I Run It?

**pocket-teleop** lets you drive a ROS2 robot from your phone browser via WebSocket. An auth server handles login, proxies the web client and WebSocket, and publishes velocity commands to `/cmd_vel` via ROS2.

**ROS2 runs inside Docker. The host only needs Docker and Docker Compose.**

```bash
# Copy .env.example to .env and fill in all values first:
cp .env.example .env
# Edit .env: set TELEOP_ADMIN_USER, TELEOP_ADMIN_PASSWORD, SESSION_SECRET

docker compose up --build

# Stop
docker compose down
```

Web client (phone browser): `http://<robot-ip>:8080` — login prompt on first visit.

**Credentials:** Single operator per robot. On first run, login with the values from `.env` — the server forces an immediate password change. After that, the new credentials are stored in the `auth-data` Docker volume and persist across reboots and image rebuilds. To reset credentials, run `docker compose down -v` (deletes the volume) and restart.

For build commands, test commands, and file structure → [repository-structure.md](memory/agent-guides/repository-structure.md)

---

## Execution Model — Subagent-Driven Development

**All implementation work on this project uses the `superpowers:subagent-driven-development` skill.**

The controller (orchestrating agent) dispatches a fresh subagent per task. Each subagent:
1. Implements exactly what the plan specifies
2. Runs tests (Docker only — never bare `npm`)
3. Updates `AGENTS.md` handoff table in the same commit as the code
4. Commits and reports back

After each subagent completes, the controller runs two review passes (spec compliance, then code quality) before marking the task done and moving to the next.

See `docs/superpowers/plans/` for the active implementation plan.

---

## Task Completion Protocol — Mandatory After Every Task

**This ritual is required after every task, every time, without exception.**

1. **Run all tests** — 0 failures required before anything else. If any test fails, fix it first. Do not proceed to step 2 until the full suite is green.
2. **Update all docs** — in the same commit as the code:
   - `AGENTS.md` handoff table: mark task ✅ Done, advance ⬜ Next, update Notes and Head SHA
   - Any guide file that changed (see the "Keeping docs current" table in [version-control.md](memory/agent-guides/version-control.md))
3. **Commit** — one commit per task, with code + docs together
4. **Request push** — say exactly: `"Committed as <hash>. Ready to push — shall I?"`
5. **Wait** — do not start the next task until the user explicitly confirms the push and gives the go-ahead

Skipping any step is a violation of the workflow. Tests are the gate — nothing moves forward until they pass.

---

## Level 2 — Development Workflow

See [repository-structure.md](memory/agent-guides/repository-structure.md) for build and test commands.

See [version-control.md](memory/agent-guides/version-control.md) for branch strategy, commit conventions, and doc update rules.

See [project-skills.md](memory/agent-guides/project-skills.md) for TDD standards, code quality bar, and execution rules.

---

## Level 3 — Architecture and Data

See [techstack.md](memory/agent-guides/techstack.md) for language, runtime, and dependency details.

See [repository-structure.md](memory/agent-guides/repository-structure.md) for the component layer diagram and key file map.

See [data-schema.md](memory/agent-guides/data-schema.md) for message protocol, C++ result types, ROS2 parameters, and environment variables.

---

## Level 4 — Task Guides

See [project-skills.md](memory/agent-guides/project-skills.md) for the task orientation table (what each task creates and which tests must pass).

For complete step-by-step code: `docs/superpowers/plans/2026-03-27-server-implementation.md`

For full protocol and component spec: `docs/superpowers/specs/2026-03-27-server-design.md`
