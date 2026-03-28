# pocket-teleop — Agent Guide

> Progressive disclosure: read only as far as you need. Start at **Level 1**, go deeper if the task demands it.

---

## Handoff State — Resume Here

> **For the next agent:** Web client implementation is in progress on `feat/client-implementation`. Client Task 1 (project scaffolding) is done; Task 2 (`protocol.ts`) is next. Server implementation is complete — 15 tests, 0 failures; tag `v0.1.0-server`.

**Implementation branch:** `feat/client-implementation`
**Head SHA:** `88ec4bb` (as of 2026-03-28)

### Server tasks (complete)

All 12 server tasks done. 15 tests, 0 failures. Tag `v0.1.0-server` applied. See `docs/superpowers/plans/2026-03-27-server-implementation.md` for full history.

### Web client task progress

| Task | Status | Notes |
|---|---|---|
| 1 — Project scaffolding | ✅ Done | `web-client/` dir, `package.json`, `tsconfig.json`, `vitest.config.ts`, `Dockerfile.webclient`, placeholder `index.html`, stub `teleop_client.ts`; `docker-compose.yml` gains `webclient` + `webclient-test` services; nginx serves placeholder at port 8080 |
| 2 — `protocol.ts` | ⬜ Next | |
| 3 — `connection.ts` | ⬜ Pending | |
| 4 — `gamepad_handler.ts` | ⬜ Pending | |
| 5 — `teleop_client.ts` + connection tests | ⬜ Pending | |
| 6 — Keepalive + twist tests | ⬜ Pending | |
| 7 — Safety tests | ⬜ Pending | |
| 8 — Wire `index.html` | ⬜ Pending | |
| 9 — Full suite verification + tag | ⬜ Pending | |

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

---

## Document Map

| What you need | Where to look |
|---|---|
| Run the server now | Level 1 (below) |
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

Phone connects to: `ws://<robot-ip>:9091/teleop?token=mysecrettoken`

For build commands, test commands, and file structure → [repository-structure.md](memory/agent-guides/repository-structure.md)

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
