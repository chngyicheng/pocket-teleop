# pocket-teleop — Agent Guide

> Progressive disclosure: read only as far as you need. Start at **Level 1**, go deeper if the task demands it.

---

## Handoff State — Resume Here

> **For the next agent:** Implementation is in progress. Read this section first, then go only as deep as your task requires.

**Implementation branch:** `feat/server-implementation`
**Worktree:** `.worktrees/feat-server` (already exists — do not recreate)
**Head SHA:** `00386a3` (as of 2026-03-28)

### Task progress

| Task | Status | Notes |
|---|---|---|
| 1 — Docker scaffolding | ✅ Done | `Dockerfile`, `docker-compose.yml`, `.dockerignore` |
| 2 — ROS2 package scaffolding | ✅ Done | `package.xml`, `CMakeLists.txt`, stub source files |
| 3 — CommandHandler types + header | ✅ Done | `command_handler.hpp/.cpp` stub; CMakeLists C++17 fix applied |
| 4 — CommandHandler ping/twist parsing | ✅ Done | `command_handler.cpp` full parsing + range validation |
| 5 — TeleopServer skeleton | ✅ Done | `teleop_server.hpp/.cpp` start/stop skeleton + ServerStartsAndStops test |
| 6 — TeleopServer token validation | ✅ Done | `on_validate` with query-string token check; 3 tests pass |
| 7 — TeleopServer single-client + status | ✅ Done | `on_open` sends status JSON, rejects second client; 2 tests pass |
| 8 — TeleopServer message handling | ✅ Done | `on_message` twist/ping/error; 3 new tests pass |
| 9 — TeleopServer safety watchdog | ✅ Done | `watchdog_loop` implemented; WatchdogFiresZeroVelocityOnTimeout passes |
| 10 — TeleopNode ROS2 wrapper | ✅ Done | `teleop_node.hpp/.cpp`; TwistPublishedToCmdVel + DisconnectPublishesZeroVelocity pass |
| 11 — main.cpp + launch file | ✅ Done | `main.cpp` entry point + `teleop.launch.py`; smoke test passes (`Teleop server listening on port 9091`) |
| 12 — Full test suite verification | ⬜ Next | |

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
| Step-by-step implementation plan | `docs/superpowers/plans/2026-03-27-server-implementation.md` |
| Full protocol and component spec | `docs/superpowers/specs/2026-03-27-server-design.md` |

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
