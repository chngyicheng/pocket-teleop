# Tech Stack

## Language and standard

- **C++17** — mandatory. No C++20 features. `ros:humble` ships GCC 11; C++20 features silently break the build.
- `CMAKE_CXX_STANDARD_REQUIRED ON` and `CMAKE_CXX_EXTENSIONS OFF` must be set in every `CMakeLists.txt`.

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
| `websocketpp` | WebSocket server | `find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/server.hpp REQUIRED)` — no cmake config on Debian |
| `nlohmann-json` | JSON parse/serialise | `nlohmann_json::nlohmann_json` target |
| `Boost.System` | Required by websocketpp | `find_package(Boost REQUIRED COMPONENTS system)` |
| `GTest` | Unit and integration tests | `ament_add_gtest` |

## ROS2 packages used

- `rclcpp` — node, parameters, publisher (TeleopNode only)
- `geometry_msgs` — `geometry_msgs/msg/Twist` published to `/cmd_vel`
- `ament_lint_auto` — declared but not wired (linting not a stated requirement)

## Key architectural constraint

`CommandHandler` and `TeleopServer` must compile and link **without** `rclcpp`. They are pure C++ layers. Only `TeleopNode` may depend on ROS2.
