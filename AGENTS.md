# pocket-teleop — Agent Guide

> Progressive disclosure: read only as far as you need. Start at **Level 1**, go deeper if the task demands it.

---

## Document Map

Find the right level of detail without reading everything.

| What you need | Where to look |
|---|---|
| Run the server now | Level 1 (this file) |
| Build, test, git workflow | Level 2 (this file) |
| How the system works | Level 3 (this file) + [design spec] |
| How to implement a specific task | Level 4 (this file) + [implementation plan] |
| Full protocol and component spec | `docs/superpowers/specs/2026-03-27-server-design.md` |
| Step-by-step implementation plan | `docs/superpowers/plans/2026-03-27-server-implementation.md` |

**When to go deeper:** If a task guide (Level 4) doesn't answer your question, read the relevant section of the spec. If the spec doesn't answer it, read the plan. Don't read all three up front.

---

## Level 1 — What Is This and How Do I Run It?

**pocket-teleop** lets you drive a ROS2 robot from your phone browser via WebSocket. A token-authenticated WebSocket server on the robot receives velocity commands and publishes them to `/cmd_vel`.

**ROS2 runs inside Docker. The host (Raspberry Pi 5, Debian Bookworm) only needs Docker and Docker Compose.**

```bash
# Start the server (set a real token — no default)
TELEOP_TOKEN=mysecrettoken docker compose up --build

# Stop
docker compose down
```

Phone connects to: `ws://<robot-ip>:9091/teleop?token=mysecrettoken`

---

## Level 2 — Development Workflow

### Build

```bash
# Build the Docker image
docker build -t pocket-teleop .

# Build only (no run) inside the builder stage
docker build --target builder -t pocket-teleop-dev .
```

### Run tests

```bash
# Run all tests inside Docker (volume-mount source for fast iteration)
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  pocket-teleop-dev \
  /bin/bash -c ". /opt/ros/humble/setup.sh && \
    cd /ros2_ws && \
    colcon build --packages-select pocket_teleop && \
    colcon test --packages-select pocket_teleop --event-handlers console_direct+ && \
    colcon test-result --verbose"
```

### Development loop

```bash
# 1. Edit files in server/src/ or server/test/ on the host
# 2. Re-run the test command above (volume mount picks up changes instantly)
# 3. Commit when tests pass
```

### Test and code quality standards

- **TDD order is mandatory:** write failing test → run it to confirm failure → implement → run to confirm pass → commit. Never write implementation before the test.
- **All three test targets must pass** before any commit: `test_command_handler`, `test_teleop_server`, `test_teleop_node`.
- `CommandHandler` and `TeleopServer` tests must run **without ROS2** — if a test in those targets links against `rclcpp`, that is a bug.
- No test may pass by mocking the behaviour it is supposed to verify. Tests must exercise real code paths.
- Port **19091** is reserved for `test_teleop_server`. Port **19092** is reserved for `test_teleop_node`. Never use port 9091 in tests — it may be occupied by a running container.
- Code quality bar: no magic numbers, no silent fallbacks, names match what things do (not how).

### Git workflow

```bash
# Implementation branch (created from main by worktree setup)
git checkout -b feat/server-implementation

# One commit per completed task, prefix feat:
git commit -m "feat: add Docker scaffolding for ROS2 server"

# After all tasks pass review, merge back to main
git checkout main
git merge --no-ff feat/server-implementation
git tag v0.1.0-server
```

**Branch naming:** `feat/<feature>` for new work, `fix/<issue>` for bug fixes.
**Commit messages:** imperative mood, `feat:`/`fix:`/`docs:` prefix, one logical change per commit.
**Never commit to main directly** while implementation is in progress — use the feature branch.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `TELEOP_TOKEN` | Yes | Shared secret; clients must pass this as `?token=` |
| `ROBOT_TYPE` | No (default: `diff_drive`) | Reported to client on connect; `diff_drive` or `holonomic` |

---

## Level 3 — Architecture

### Component layers

```
Phone browser
    │  WebSocket ws://<robot-ip>:9091/teleop?token=<secret>
    ▼
┌─────────────────────────────────────────────┐
│  Docker container (ros:humble)              │
│                                             │
│  TeleopNode          ← knows ROS2           │
│      │  publish callback                   │
│  TeleopServer        ← knows WebSocket      │
│      │  ParseResult                        │
│  CommandHandler      ← pure C++ logic       │
└─────────────────────────────────────────────┘
    │  geometry_msgs/Twist
    ▼
/cmd_vel ROS2 topic → robot hardware
```

### Key behaviours

| Behaviour | Detail |
|---|---|
| Auth | Token in WebSocket handshake query param; bad token → HTTP 401 (never upgrades) |
| Single client | Second connection receives `{"type":"error","message":"already connected"}` then closes |
| Safety timeout | No valid message for 500 ms → zero-velocity Twist published; client disconnected |
| Keepalive | Client sends `{"type":"ping"}` ≤ every 200 ms; server replies `{"type":"pong"}` |
| Malformed message | Returns `{"type":"error","message":"..."}` and does **not** reset the watchdog |

### Message protocol (client → server)

```json
{"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":-0.3}
{"type":"ping"}
```

Values clamped to `[-1.0, 1.0]`; out-of-range returns a parse error.

### Message protocol (server → client)

```json
{"type":"status","connected":true,"robot_type":"diff_drive"}
{"type":"pong"}
{"type":"error","message":"<reason>"}
```

### Configuration (ROS2 parameters)

| Parameter | Default | Description |
|---|---|---|
| `port` | `9091` | WebSocket listen port |
| `token` | **required** | Must be set; node exits if missing |
| `timeout_ms` | `500` | Watchdog timeout in ms |
| `cmd_vel_topic` | `/cmd_vel` | ROS2 publish topic |
| `robot_type` | `diff_drive` | Sent to client on connect |

### Key files

| File | What it does |
|---|---|
| `Dockerfile` | Multi-stage: `builder` compiles, `runtime` runs |
| `docker-compose.yml` | Service, port 9091, env vars |
| `server/src/command_handler.hpp/.cpp` | JSON parse + validate; no I/O |
| `server/src/teleop_server.hpp/.cpp` | WebSocket, auth, single-client, watchdog |
| `server/src/teleop_node.hpp/.cpp` | ROS2 wrapper; owns TeleopServer |
| `server/src/main.cpp` | Entry point |
| `server/launch/teleop.launch.py` | ROS2 launch file |
| `server/test/test_command_handler.cpp` | Unit tests (no ROS2, no WebSocket) |
| `server/test/test_teleop_server.cpp` | Integration tests (mock callback) |
| `server/test/test_teleop_node.cpp` | ROS2 integration tests |

---

## Level 4 — Task Guides

> Full implementation plan: `docs/superpowers/plans/2026-03-27-server-implementation.md`
> Design spec: `docs/superpowers/specs/2026-03-27-server-design.md`

Each task below maps to a numbered task in the plan. Follow the plan for complete step-by-step code. This section gives you the orientation to start each task confidently.

---

### Task 1: Docker scaffolding

**Creates:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`

**Goal:** Host only needs Docker. ROS2, deps, and the built binary all live inside the image.

**Key decisions:**
- Multi-stage build: `builder` stage installs `libwebsocketpp-dev`, `libboost-system-dev`, `nlohmann-json3-dev` and runs `colcon build`. The `runtime` stage copies only `install/` — keeping the image lean.
- `TELEOP_TOKEN` is injected at runtime via environment variable, never baked into the image.
- Port 9091 published to `0.0.0.0` so the phone can reach it on the local network.

**Verify:** `docker build --target builder -t pocket-teleop-test .` completes without error.

---

### Task 2: ROS2 package scaffolding

**Creates:** `server/package.xml`, `server/CMakeLists.txt`, stub source files

**Goal:** A valid `ament_cmake` package that colcon can build and test against.

**Key decisions:**
- Package name: `pocket_teleop` (snake_case, ROS2 convention).
- Three separate `ament_add_gtest` targets: `test_command_handler` (no ROS2), `test_teleop_server` (no ROS2), `test_teleop_node` (ROS2).
- `find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/server.hpp REQUIRED)` — websocketpp has no cmake config file on Debian.
- Stub source files (`touch`) so colcon does not fail on missing files.

**Verify:** `docker build --target builder -t pocket-teleop-test .` completes. Colcon may warn about empty files but must not hard-fail.

---

### Task 3: CommandHandler — types and header

**Creates:** `server/src/command_handler.hpp`, `server/src/command_handler.cpp`, `server/test/test_command_handler.cpp`

**Goal:** Define the three result types (`TwistCommand`, `PingCommand`, `ParseError`) and a `CommandHandler` class with a stub `parse()` that passes the first two tests.

**Key decisions:**
- `ParseResult = std::variant<TwistCommand, PingCommand, ParseError>` — callers use `std::holds_alternative<>` to dispatch.
- Stub returns `ParseError{"not implemented"}` for anything other than missing type or malformed JSON — this makes the first two tests pass while leaving the rest failing.

**Tests that must pass:** `MissingTypeReturnsParseError`, `MalformedJsonReturnsParseError`

---

### Task 4: CommandHandler — ping, twist, range validation

**Modifies:** `server/src/command_handler.cpp`, `server/test/test_command_handler.cpp`

**Goal:** Full implementation of `parse()`. All eight `test_command_handler` tests pass.

**Key decisions:**
- Out-of-range values are **rejected**, not clamped. Return `ParseError` with the field name.
- Range is `[-1.0, 1.0]` inclusive — boundary values (`1.0`, `-1.0`) are valid.
- `linear_y` is always present in twist messages even for differential drive (client sends `0.0`).

**Tests that must pass:** all 8 tests in `test_command_handler`

---

### Task 5: TeleopServer — skeleton and start/stop

**Creates:** `server/src/teleop_server.hpp`, `server/src/teleop_server.cpp`, `server/test/test_teleop_server.cpp`

**Goal:** A `TeleopServer` that can be constructed, started in a thread, and stopped cleanly. The `on_validate`, `on_open`, `on_message` are stubs. Watchdog loop runs but does nothing yet.

**Key decisions:**
- Constructor takes `(token, port, timeout_ms, robot_type, callback)` — all logic dependencies injected, no globals.
- `start()` blocks (calls `ws_server_.run()`). Always run it in a `std::thread`.
- `stop()` is idempotent — safe to call multiple times.
- Test uses port **19091** to avoid colliding with a running server on 9091.
- `TeleopServerTest` fixture handles start/stop in `SetUp`/`TearDown` — all tests inherit it.

**Tests that must pass:** `ServerStartsAndStops`

---

### Task 6: TeleopServer — token validation

**Modifies:** `server/src/teleop_server.cpp`, `server/test/test_teleop_server.cpp`

**Goal:** Implement `on_validate`. Bad or missing token → HTTP 401, connection never upgrades.

**Key decisions:**
- Token is extracted from the URI query string: `/teleop?token=<value>`.
- `con->set_status(websocketpp::http::status_code::unauthorized)` + `return false` sends the 401.
- The test uses a helper `attempt_connect(uri)` that returns the HTTP response code (101 = upgraded, 401 = rejected).

**Tests that must pass:** `ValidTokenAccepted`, `InvalidTokenRejectedWith401`, `MissingTokenRejectedWith401`

---

### Task 7: TeleopServer — single-client and status message

**Modifies:** `server/src/teleop_server.cpp`, `server/test/test_teleop_server.cpp`

**Goal:** Implement `on_open`. First client gets a status message; second client gets an error and is closed.

**Key decisions:**
- Single-client check is in `on_open`, not `on_validate` — the second client upgrades to WebSocket, receives the error message, then gets closed. This matches the spec.
- Status message sent on successful open: `{"type":"status","connected":true,"robot_type":"<value>"}`.
- `has_client_` and `active_client_` are protected by `client_mutex_`.
- `reset_watchdog()` is called in `on_open` to start the timeout clock for the new client.

**Tests that must pass:** `ConnectReceivesStatusMessage`, `SecondClientReceivesAlreadyConnectedError`

---

### Task 8: TeleopServer — message handling

**Modifies:** `server/src/teleop_server.cpp`, `server/test/test_teleop_server.cpp`

**Goal:** Implement `on_message`. Delegate to `CommandHandler`, dispatch on result type.

**Key decisions:**
- Only `TwistCommand` and `PingCommand` reset the watchdog — `ParseError` does **not**.
- Twist fires `publish_callback_` with `(linear_x, linear_y, angular_z)`.
- Ping sends `{"type":"pong"}` back; no callback.
- Parse error sends `{"type":"error","message":"..."}` back; no callback.

**Tests that must pass:** `TwistFiresCallback`, `PingReturnsPongCallbackNotFired`, `MalformedMessageReturnsErrorCallbackNotFired`

---

### Task 9: TeleopServer — safety watchdog

**Modifies:** `server/src/teleop_server.cpp`, `server/test/test_teleop_server.cpp`

**Goal:** Implement `watchdog_loop`. No valid message for `timeout_ms` → fire callback with `(0,0,0)` and close client.

**Key decisions:**
- Watchdog runs in its own `std::thread`, polling every 50 ms.
- `last_message_ms_` is `std::atomic<int64_t>` (milliseconds since epoch on `steady_clock`) — written by message handler, read by watchdog, no mutex needed.
- On timeout: post a task to `ws_server_.get_io_service()` so `ws_server_.close()` runs on the correct thread. Direct cross-thread close is unsafe with websocketpp.
- `timed_out_` flag prevents repeated firings for one session.

**Tests that must pass:** `WatchdogFiresZeroVelocityOnTimeout`

---

### Task 10: TeleopNode — ROS2 wrapper

**Creates:** `server/src/teleop_node.hpp`, `server/src/teleop_node.cpp`, `server/test/test_teleop_node.cpp`

**Goal:** Thin ROS2 node that owns a `TeleopServer` and publishes `geometry_msgs/Twist` on `/cmd_vel`.

**Key decisions:**
- `TeleopServer` starts in a `std::thread` in the constructor. `rclcpp::spin()` runs in the main thread.
- `rclcpp::Publisher::publish()` is called from the WebSocket thread (via callback). This is safe — ROS2 publishers are thread-safe.
- Node **exits** (throws) if `token` parameter is empty — no silent default.
- Integration test uses port **19092** (different from TeleopServer tests on 19091).
- Test subscribes to `/cmd_vel` and asserts messages arrive with correct values.

**Tests that must pass:** `TwistPublishedToCmdVel`, `DisconnectPublishesZeroVelocity`

---

### Task 11: main.cpp and launch file

**Creates:** `server/src/main.cpp`, `server/launch/teleop.launch.py`

**Goal:** Runnable binary and a ROS2 launch file for production use.

**Key decisions:**
- `main.cpp` catches exceptions from `TeleopNode` constructor (e.g. missing token) and logs them as FATAL before returning exit code 1.
- Launch file reads `TELEOP_TOKEN` from environment via `EnvironmentVariable('TELEOP_TOKEN')` — never hard-coded.
- All parameters have launch arguments with sensible defaults except `token` (no default — forces explicit setting).
- Smoke-test: `TELEOP_TOKEN=mytoken docker compose up -d` → logs show `Teleop server listening on port 9091`.

---

### Task 12: Full test suite verification

**Goal:** All tests pass. Tag the release.

**Run command:**
```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  pocket-teleop-dev \
  /bin/bash -c ". /opt/ros/humble/setup.sh && \
    cd /ros2_ws && \
    colcon build --packages-select pocket_teleop && \
    colcon test --packages-select pocket_teleop --event-handlers console_direct+ && \
    colcon test-result --verbose"
```

**Expected:** 0 failures across all three test executables.

**Tag:**
```bash
git tag v0.1.0-server
```

---

## Critical Guardrails

Violations here are bugs, not style issues. Do not work around them.

| Guardrail | Why |
|---|---|
| **C++17 only — no C++20** | `ros:humble` ships GCC 11; C++20 features silently break the build |
| **No ROS2 in `CommandHandler` or `TeleopServer`** | These layers must compile and test without `rclcpp` — isolation is the design |
| **No default token anywhere** | A missing token must cause a hard failure, not a fallback |
| **Never skip token validation** | Any WebSocket upgrade without token check is a security hole |
| **Watchdog fires only once per session** | Use `timed_out_` flag — repeated zero-velocity publishes on an already-stopped robot mask real bugs |
| **`ws_server_.close()` must run on the io_service thread** | Calling it from the watchdog thread directly is undefined behaviour with websocketpp |
| **Test ports 19091 / 19092 only** | Port 9091 may be in use by a running container on the host |
| **One active client at a time** | Two simultaneous operators on one robot is a safety hazard |
| **Token never in source or image** | Always injected via `TELEOP_TOKEN` environment variable at runtime |

---

## Staleness — Keeping This File Current

This file describes a system that is actively being built. It will drift from reality as implementation progresses. **If you change something that contradicts a statement in this file, update the file in the same commit.**

### What to update and when

| Change | Update here |
|---|---|
| New ROS2 parameter added | Configuration table in Level 3 |
| Message type added or changed | Protocol tables in Level 3 |
| Port number changed | Both Level 2 dev workflow and Level 3 key behaviours |
| New file added to `server/` | File map in Level 3 |
| Task completed | Remove from Level 4 or mark as done |
| New task added | Add task guide to Level 4 |
| New guardrail identified | Critical Guardrails table |
| New document created | Document Map table |

### What not to update here

- Code patterns already visible in the source files
- Git history or who changed what (use `git log`)
- Anything already in the spec or plan documents

### How to update

1. **At task completion** — before committing, check whether any document (AGENTS.md, README.md, spec, plan) needs updating to reflect what you just built. If yes, update it in the same commit.
2. Edit the relevant section in place — do not append a "changelog" at the bottom
3. Keep the progressive disclosure structure intact — Level 1 stays terse
4. Commit the AGENTS.md change alongside the code change it documents

---

## Constraints and conventions

- **C++17** everywhere. No C++20 features (ros:humble ships with GCC 11).
- **No ROS2 in `CommandHandler` or `TeleopServer`** — these must compile and test without `rclcpp`.
- **No default token** — any code path that skips token validation is a bug.
- **Tests use ports 19091 (TeleopServer tests) and 19092 (TeleopNode tests)** — never 9091, which may be in use on the host.
- **Commits are per-task** — one commit per completed task, message prefixed with `feat:`.
