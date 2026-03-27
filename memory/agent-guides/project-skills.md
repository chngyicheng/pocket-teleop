# Project Skills

## TDD and code quality standards

- **Testing trophy philosophy:** heavy on integration tests, light on unit tests. Tests must survive a refactor without needing to be rewritten. Do not write tests that assert specific function return values on internal helpers.
- **TDD order is mandatory:** write failing test → run to confirm failure → implement → run to confirm pass → commit. Never write implementation before the test.
- **`test_command_handler.cpp` — minimal or empty.** `CommandHandler` parsing behavior is covered through `test_teleop_server` (real WebSocket messages, real parsing). Avoid unit tests that pin return types of `parse()`.
- **`test_teleop_server.cpp` — primary test target.** Real WebSocket connections, real JSON messages, mock ROS2 callback. This is where most test coverage lives.
- **`test_teleop_node.cpp` — crown jewel.** Full ROS2 pipeline: WebSocket message → `/cmd_vel` Twist published. Covers auth, parsing, and publish in one shot.
- `CommandHandler` and `TeleopServer` test targets must run **without ROS2** — if a test in those targets links against `rclcpp`, that is a bug.
- No test may pass by mocking the behaviour it is supposed to verify. Tests must exercise real code paths.
- Code quality bar: no magic numbers, no silent fallbacks, names match what things do (not how).

## Execution rules

- **Stop after every task** and wait for the user to confirm before starting the next one.
- **Pre-commit order: build → test → docs → commit.** Run the full pre-commit checklist in `version-control.md` before every `git commit`. Tests must pass (0 failures) and all docs must be verified fresh — including `.worktrees/feat-server/CLAUDE.md` and `AGENTS.md` — before committing.
- Run all docker commands with `--network=host` (or use `docker compose` which has it in the build config).

## Critical guardrails

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

## Task orientation

For complete step-by-step code, see the implementation plan:
`docs/superpowers/plans/2026-03-27-server-implementation.md`

The table below is a navigation aid — what each task creates and what must pass. Go to the plan for the actual implementation steps.

| Task | Creates / Modifies | Tests that must pass |
|---|---|---|
| 1 — Docker scaffolding | `Dockerfile`, `docker-compose.yml`, `.dockerignore` | `docker build --target builder` succeeds |
| 2 — ROS2 package scaffolding | `server/package.xml`, `server/CMakeLists.txt`, stubs | `colcon build` does not hard-fail |
| 3 — CommandHandler types + header | `command_handler.hpp/.cpp` | `colcon build` succeeds; `test_command_handler` compiles (may be empty) |
| 4 — CommandHandler ping/twist/range | `command_handler.cpp` | `colcon build` succeeds; parsing behavior verified via `test_teleop_server` in Tasks 5–9 |
| 5 — TeleopServer skeleton | `teleop_server.hpp/.cpp`, `test_teleop_server.cpp` | `ServerStartsAndStops` |
| 6 — TeleopServer token validation | `teleop_server.cpp`, `test_teleop_server.cpp` | `ValidTokenAccepted`, `InvalidTokenRejectedWith401`, `MissingTokenRejectedWith401` |
| 7 — TeleopServer single-client + status | `teleop_server.cpp`, `test_teleop_server.cpp` | `ConnectReceivesStatusMessage`, `SecondClientReceivesAlreadyConnectedError` |
| 8 — TeleopServer message handling | `teleop_server.cpp`, `test_teleop_server.cpp` | `TwistFiresCallback`, `PingReturnsPongCallbackNotFired`, `MalformedMessageReturnsErrorCallbackNotFired` |
| 9 — TeleopServer safety watchdog | `teleop_server.cpp`, `test_teleop_server.cpp` | `WatchdogFiresZeroVelocityOnTimeout` |
| 10 — TeleopNode ROS2 wrapper | `teleop_node.hpp/.cpp`, `test_teleop_node.cpp` | `TwistPublishedToCmdVel`, `DisconnectPublishesZeroVelocity` |
| 11 — main.cpp + launch file | `main.cpp`, `teleop.launch.py` | Smoke-test: server starts, logs show port 9091 |
| 12 — Full test suite verification | — | 0 failures across all three test executables; tag `v0.1.0-server` |
