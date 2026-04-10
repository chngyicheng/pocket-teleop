# Tech Stack

## Language and standard

- **C++17** — mandatory. No C++20. `ros:humble` ships GCC 11; C++20 silently breaks build.
- `CMAKE_CXX_STANDARD_REQUIRED ON` and `CMAKE_CXX_EXTENSIONS OFF` — set in every `CMakeLists.txt`.

## Runtime environment

| Layer | Technology |
|---|---|
| OS (host) | Unix |
| Containerisation | Docker + Docker Compose |
| ROS2 distribution | Humble (base image: `ros:humble`) |
| Build system | `colcon` + `ament_cmake` |

## C++ dependencies

| Library | Purpose | How found in CMake |
|---|---|---|
| `websocketpp` | WebSocket server | `find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/server.hpp REQUIRED)` — no cmake config Debian |
| `nlohmann-json` | JSON parse/serial | `nlohmann_json::nlohmann_json` target |
| `Boost.System` | websocketpp dep | `find_package(Boost REQUIRED COMPONENTS system)` |
| `GTest` | unit/integration tests | `ament_add_gtest` |

## ROS2 packages used

- `rclcpp` — node, params, publisher (TeleopNode only)
- `geometry_msgs` — `geometry_msgs/msg/Twist` published to `/cmd_vel`
- `ament_lint_auto` — declared, not wired (linting not required)

## Key architectural constraint (server)

`CommandHandler` and `TeleopServer` compile/link **without** `rclcpp`. Pure C++ layers. Only `TeleopNode` depends on ROS2.

---

## Web client tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Build | `tsc` — no bundler, ES modules |
| Test runner | Vitest (Node 22, not browser) |
| Static server | nginx (official Docker image) |
| Input | Browser Gamepad API |
| Transport | Browser WebSocket API |
| Node runtime | Node 22 (node:22-slim) — required for native `globalThis.WebSocket` |

No framework. No runtime deps. Dev only: `typescript`, `vitest`.

## Key architectural constraint (client)

`Protocol` — no I/O/side effects, pure TS types/serializers. `Connection` — no message format or gamepad knowledge. Only `TeleopClient` wires modules. UI (future) calls `TeleopClient.sendTwist()` directly, never touches lower layers.