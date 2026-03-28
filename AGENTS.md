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

> **For the next agent:** Server and web client both complete. All 10 client integration tests pass. Both `v0.1.0-server` and `v0.1.0-client` tagged. Everything merged to `main`.

**Head SHA:** `d877f21` (as of 2026-03-28)

### Task progress (web client)

| Task | Status | Notes |
|---|---|---|
| 1 — Project scaffolding | ✅ Done | `web-client/package.json`, `tsconfig.json`, `vitest.config.ts`, `Dockerfile.webclient`, `index.html`, `src/teleop_client.ts` stub; `docker-compose.yml` gains `webclient` + `webclient-test` services; nginx serves placeholder at port 8080 |
| 2 — protocol.ts | ✅ Done | `web-client/src/protocol.ts` — `buildTwist`, `buildPing`, `parseMessage`; `InboundMessage` discriminated union |
| 3 — connection.ts | ✅ Done | `web-client/src/connection.ts` — `Connection` class with `connect`, `disconnect`, `send`; uses `globalThis.WebSocket` for Node compat |
| 4 — gamepad_handler.ts | ✅ Done | `web-client/src/gamepad_handler.ts` — `GamepadHandler` class; polls `navigator.getGamepads()` every 200ms; no-ops in Node (no `navigator`) |
| 5 — teleop_client.ts + connection tests | ✅ Done | `web-client/src/teleop_client.ts` full implementation; `test/integration.test.ts` Connection describe block; 2 tests pass |
| 6 — Keepalive and twist integration tests | ✅ Done | Messaging describe block: `sendTwist does not produce an error response`, `ping receives pong within 250ms` |
| 7 — Safety integration tests | ✅ Done | Safety describe block: `keepalive keeps connection alive past watchdog timeout`, `server closes connection after silence exceeds timeout`, `malformed message receives error response`, `TeleopClient routes server error response to onError callback`, `second client is rejected while first is connected`; 9 tests total pass |
| 8 — Wire index.html | ✅ Done | `index.html` reads `?token=` from URL, constructs WS URL via `window.location.hostname`, calls `TeleopClient.connect()`; status paragraph updated via `onStatus`/`onError`/`onClose` callbacks |
| 9 — Full suite verification | ✅ Done | 10 tests pass (added `TeleopClient.onClose fires when connection is closed`); `tsconfig.json` `module` fixed to `Node16`; full docker stack builds; nginx serves `index.html` + compiled JS; tag `v0.1.0-client` applied |

### Known deviations from the plan (accepted)

| Deviation | Location | Why accepted |
|---|---|---|
| `--network=host` added to build | `docker-compose.yml`, build commands | Pi5 cannot resolve DNS in Docker bridge network |
| `TELEOP_TOKEN:?Error:...` guard | `docker-compose.yml` | Positive hardening — fails loud if token unset |
| `ament_add_gtest` used for "no ROS2" test targets | `CMakeLists.txt` | Tests always run inside Docker (ROS2 present); "no ROS2" means no ROS2 *code*, not no ROS2 *environment* |
| `ament_lint_auto` declared but not wired | `package.xml` + `CMakeLists.txt` | Linting not a stated requirement; accepted for now |
| `test_command_handler.cpp` left empty | `server/test/` | Testing trophy philosophy: parsing behavior covered by `test_teleop_server` integration tests |
| `#define ASIO_STANDALONE` removed from all WebSocket code | `teleop_server.hpp`, `test_teleop_server.cpp`, and future `test_teleop_node.cpp` | Dockerfile installs `libboost-system-dev` (Boost ASIO); standalone ASIO (`libasio-dev`) is not installed. Boost ASIO is correct for this environment. |
| `docker-compose.yml` environment value quoted | `docker-compose.yml` line 9 | Docker Compose v2.35+ fails to parse `${VAR:?msg: with colon}` in unquoted YAML strings; wrapping in double quotes fixes the YAML parse error. |
| `moduleResolution` changed from `bundler` to `node16` | `web-client/tsconfig.json` | `bundler` permits extensionless imports that 404 in browsers without a bundler; `node16` enforces `.js` extensions on all relative imports, which is correct for nginx-served native ES modules. |
| `node:20-slim` changed to `node:22-slim` | `web-client/Dockerfile.webclient` | Node 20 has no native `WebSocket` global; `globalThis.WebSocket` is `undefined`, causing all connection attempts to fail silently. Node 22 ships stable native WebSocket. |
| `maxRetries` increased from 20 to 40 in `waitForServer` | `web-client/test/integration.test.ts` | ROS2 node startup takes >10 s on Pi5; 40 retries × 500 ms = 20 s gives adequate margin. `hookTimeout` raised to 30 000 ms to match. |
| `navigator` guard strengthened to check `getGamepads` | `web-client/src/gamepad_handler.ts` | Node 22 defines `navigator` globally (Node 21+) but without `getGamepads`; original guard `typeof navigator === 'undefined'` passed and then crashed on `.getGamepads()`. |
| `connection stays open after 600ms of silence` split into two tests | `web-client/test/integration.test.ts` | Server watchdog closes the connection after 500 ms silence (not just fires zero velocity); original test had wrong expectation. Split into: (1) keepalive prevents watchdog timeout, (2) server closes connection after silence. |
| `module` changed from `ESNext` to `Node16` | `web-client/tsconfig.json` | TypeScript 5 requires `module` and `moduleResolution` to match; `ESNext` + `node16` is rejected by `tsc` with TS5110. Vitest's esbuild transform tolerated the mismatch silently, so tests passed while the builder stage failed. |

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
