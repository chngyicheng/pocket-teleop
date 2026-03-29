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

> **For the next agent:** All touch joystick tasks complete and post-ship bugs fixed. 58 tests pass (12 touch_joystick + 8 settings + 16 gamepad_profiles + 10 protocol + 12 integration). `TouchJoystick` rewritten to Pointer Events API (Chrome + Brave dual-touch verified). Settings drawer nav CSS fixed. Tag v0.4.0 pending user confirmation — do NOT apply without explicit user approval.

**Head SHA:** `1aec799` (as of 2026-03-29)

### Completed milestones

| Milestone | Tests | Tag |
|---|---|---|
| Server (ROS2 WebSocket, command handler, teleop node) | — | `v0.1.0-server` |
| Web client v0.1.0 (protocol, connection, gamepad handler, teleop client, integration tests) | 10 | `v0.1.0-client` |
| Practical gaps (gamepad profiles, reconnection, calibration UI) | 43 | `v0.2.0` |
| Frontend UI (settings.ts, onTwist, responsive index.html rewrite) | 43 | pending `v0.3.0` |
| Touch joystick (TouchJoystick module, namespace settings, gamepad switching, index.html rewrite) | 53 | pending `v0.4.0` |

### Touch joystick task progress

| Task | Status | Notes |
|---|---|---|
| 1 — `touch_joystick.ts` + unit tests | ✅ Done | `web-client/src/touch_joystick.ts` — `TouchJoystick` class; 8 unit tests; `jsdom` added to devDeps; `Touch` shim for jsdom 24 |
| 2 — Settings namespace additions | ✅ Done | `web-client/src/settings.ts` — `loadRobotNamespace`, `saveRobotNamespace`, `clearRobotNamespace`; +2 tests; 53 total |
| 3 — `GamepadHandler` setEnabled + onActivity | ✅ Done | `web-client/src/gamepad_handler.ts` — `setEnabled(boolean)`, `onActivity` callback |
| 4 — `TeleopClient` setGamepadEnabled + onGamepadActivity | ✅ Done | `web-client/src/teleop_client.ts` — `setGamepadEnabled(boolean)`, `onGamepadActivity` option |
| 5 — Rewrite `index.html` | ✅ Done | Touch joysticks (fixed corners), robot name strip, velocity overlay, Connection page, input-source switching, all bug fixes |
| 6 — Full verification + docs | ✅ Done | 56/56 tests pass; docker build healthy; AGENTS.md + repository-structure.md updated; 3 coverage gaps filled post-plan |
| 7 — Post-ship bug fixes | ✅ Done | `touch_joystick.ts`: rewritten to Pointer Events API (fixes dual-touch on Chrome + Brave); `index.html`: `.drawer-page[hidden]` CSS fixes settings nav; 58/58 tests pass |

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
| `TouchJoystick` uses Pointer Events, not Touch Events | `web-client/src/touch_joystick.ts` | Chrome Android and Brave both contaminate `targetTouches`/`changedTouches` with cross-zone touches on multi-touch; Pointer Events fire one `pointerdown` per finger on the exact element touched, with `setPointerCapture` locking the event stream — no cross-zone contamination possible |
| `PointerEvent` shimmed in test; `jsdom` shim pattern reused | `web-client/test/touch_joystick.test.ts` | jsdom 24 does not expose `PointerEvent` as a global constructor; shim pattern mirrors the earlier `Touch` shim |

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

**When to go deeper:** If a guide file doesn't answer your question, read the relevant section of the spec. If the spec doesn't answer it, read the plan. Don't read all three up front.

---

## Level 1 — What Is This and How Do I Run It?

**pocket-teleop** lets you drive a ROS2 robot from your phone browser via WebSocket. A token-authenticated WebSocket server on the robot receives velocity commands and publishes them to `/cmd_vel`.

**ROS2 runs inside Docker. The host only needs Docker and Docker Compose.**

```bash
# Start the server (set a real token — no default)
TELEOP_TOKEN=mysecrettoken docker compose up --build

# Stop
docker compose down
```

Phone connects to WebSocket: `ws://<robot-ip>:9091/teleop?token=mysecrettoken`

Web client (phone browser): `http://<robot-ip>:8080?token=mysecrettoken`

For build commands, test commands, and file structure → [repository-structure.md](memory/agent-guides/repository-structure.md)

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
