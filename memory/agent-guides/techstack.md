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
| UI framework | **React 18** (`react`, `react-dom`) |
| Build / bundler | **Vite 5** (`@vitejs/plugin-react`) → `dist/`; `build` = `vite build` |
| Test runner | **Vitest** + jsdom + React Testing Library (`@testing-library/{react,jest-dom,user-event}`) |
| Static server | nginx (custom `nginx.conf`: `gzip on` + immutable `/assets` cache + SPA fallback) |
| Input | Browser Gamepad API + touch/pointer + keyboard |
| Transport | Browser WebSocket API; WebRTC/WHEP for video |
| Node runtime | Node 22 — required for native `globalThis.WebSocket` |

Runtime deps: `react`, `react-dom` only. Everything else is devDeps (Vite, Vitest, RTL, jsdom, typescript).

## Key architectural constraint (client)

Transport/logic stays **framework-free and React-agnostic**: `Protocol` is pure types/serializers (no I/O), `Connection` knows nothing about message format or gamepad, and only `TeleopClient`/`WhepClient` wire the lower modules. React touches them **only through the `useTeleopBridge` / `useWhepStream` hooks** — views and components never import `TeleopClient` or `WhepClient` directly. This keeps the logic layer unit-testable without a DOM and swappable under the UI.