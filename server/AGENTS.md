# server — C++ ROS2 teleop node

## Purpose

ROS2 (`ros:humble`) package `pocket_teleop`: receives velocity commands over WebSocket and publishes `geometry_msgs/Twist` to `/cmd_vel`. Three strictly isolated layers:

```
Phone browser
    │  WebSocket ws://<robot-ip>:9091/teleop?token=<secret>   (internal; auth-server proxies /ws)
    ▼
TeleopNode       ← knows ROS2; owns TeleopServer; publishes Twist
    │  publish callback
TeleopServer     ← knows WebSocket; auth, single-client, watchdog; NO ROS2
    │  ParseResult
CommandHandler   ← pure C++ parse/validate; no I/O, no ROS2
    │  geometry_msgs/Twist
    ▼
/cmd_vel ROS2 topic → robot hardware
```

## Ownership

Owns: `src/`, `include/`, `test/`, `launch/`, `CMakeLists.txt`, `package.xml`, FastRTPS profile XML. The root `Dockerfile` compiles + tests this package (multi-stage: `builder` compiles + tests, `runtime` runs).

| File | What it does |
|---|---|
| `package.xml` | ROS2 package manifest (`pocket_teleop`) |
| `CMakeLists.txt` | Build targets, test targets, dependency resolution |
| `include/command_handler.hpp` / `src/command_handler.cpp` | JSON parse + validate; no I/O, no ROS2 |
| `include/teleop_server.hpp` / `src/teleop_server.cpp` | WebSocket server, auth, single-client, watchdog |
| `include/teleop_node.hpp` / `src/teleop_node.cpp` | ROS2 wrapper; owns TeleopServer, publishes Twist |
| `include/map_codec.hpp` / `src/map_codec.cpp` | Trinary-RLE occupancy-grid encoder for the `map` message |
| `src/main.cpp` | Entry point; catches constructor exceptions |
| `launch/teleop.launch.py` | ROS2 launch file for production use |
| `test/test_command_handler.cpp` | Unit tests — no ROS2, no WebSocket (minimal/empty) |
| `test/test_teleop_server.cpp` | Integration — mock callback, no ROS2 (primary target) |
| `test/test_teleop_node.cpp` | Full ROS2 pipeline (crown jewel) |
| `test/test_map_codec.cpp` | Map encoder unit tests |

## Local Contracts

- **C++17 only — no C++20.** `ros:humble` GCC 11 silently breaks on C++20.
- **No `rclcpp` in `CommandHandler` or `TeleopServer`** — they must compile and test without ROS2. Linking `rclcpp` into those test targets = bug.
- **Token always via `TELEOP_TOKEN` env at runtime** — never in source or image, no default, no fallback. Missing token = hard failure. Never skip token validation on a WebSocket upgrade.
- **One active client at a time** — second connection gets `already-connected` error.
- **Watchdog fires once per session** (`timed_out_` flag); `ws_server_.close()` must run on the io_service thread, never the watchdog thread (websocketpp UB otherwise). For `hold`/`continue` the watchdog enters a holding phase (republishes the cached last twist each tick until `disconnect_action_param` ms elapse) before the single zero+close. `return_home` invokes `return_home_callback_` (injected by TeleopNode so TeleopServer stays ROS2-free) then zero+close — but the node's callback currently **logs only / does not call the Trigger service** (auto-trigger disabled by operator decision; one-line re-enable in `teleop_node.cpp`).
- **Test ports 19091 (`test_teleop_server`) / 19092 (`test_teleop_node`) only** — 9091 is the running container.

### Protocol — client → server

```json
{"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":-0.3}
{"type":"ping"}
{"type":"estop"}
{"type":"estop_reset"}
```
Values clamped to `[-1.0,1.0]` inclusive — out-of-range returns `ParseError`, not clamp. `linear_y` always present (diff-drive sends `0.0`). `estop` latches: publishes one zero `cmd_vel`, then ignores `twist` until `estop_reset`; pings still keep-alive; latch clears on fresh connection.

### Protocol — server → client

```json
{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"My Robot","robot_namespace":"robot1","robot_length":0.281,"robot_width":0.306,"disconnect_action":"stop"}
{"type":"pong"}
{"type":"error","message":"<reason>"}
{"type":"estop_state","engaged":true}
{"type":"map","resolution":0.05,"width":480,"height":480,"origin_x":-12.0,"origin_y":-12.0,"cells":"u120f300o5..."}
{"type":"pose","frame":"map","x":1.5,"y":-0.5,"heading":0.78}
{"type":"scan","angle_min":0.0,"angle_increment":0.052,"range_max":3.5,"ranges":[2.79,1.74],"pose_x":1.5,"pose_y":-0.5,"pose_heading":0.78,"pose_frame":"map"}
```
`robot_name`/`robot_namespace` always present (`""` when unset). `robot_length`/`robot_width` (m) always present, `0` = unconfigured. `map` = trinary RLE (u/f/o + run length, row-major), ~0.5 Hz. `pose` = tf2 `map→base_link`, falls back to `odom→base_link`, ~5 Hz. `scan` = base_link-fixed pointcloud, ≤120 pts (0 = invalid), **optional capture pose** (pose_x/pose_y/pose_heading/pose_frame, frame = "map" or "odom"; omitted if tf lookup fails—backward compatible), ~5 Hz. `disconnect_action` in status = configured disconnect-after behavior (`stop`/`hold`/`continue`/`return_home`), shown read-only in the client. ROS convention: length = x (fwd/back), width = y (left/right).

### C++ result types (CommandHandler)

```cpp
struct TwistCommand      { double linear_x; double linear_y; double angular_z; };
struct PingCommand       {};
struct EStopCommand      {};
struct EStopResetCommand {};
struct ParseError        { std::string message; };
using ParseResult = std::variant<TwistCommand, PingCommand, EStopCommand, EStopResetCommand, ParseError>;
```
Dispatch via `std::holds_alternative<>`.

### ROS2 parameters (TeleopNode) ← env vars

| Parameter | Env | Default | Description |
|---|---|---|---|
| `port` | — | `9091` | WebSocket listen port (internal only) |
| `timeout_ms` | — | `500` | Watchdog timeout (ms) |
| `disconnect_action` | `DISCONNECT_ACTION` | `stop` | Watchdog-fire behavior: `stop`/`hold`/`continue`/`return_home`. `hold`/`continue` **violate fail-stop** (keep republishing last twist) |
| `disconnect_action_param` | `DISCONNECT_ACTION_PARAM` | `0` | `hold`/`continue` republish window (ms) before zero+close |
| `return_home_service` | `RETURN_HOME_SERVICE` | `/return_home` | `std_srvs/Trigger` service called once for `return_home` (unavailable → degrades to stop) |
| `cmd_vel_topic` | — | `/cmd_vel` | Base publish topic (overridden by namespace) |
| `robot_type` | `ROBOT_TYPE` | `diff_drive` | `diff_drive` or `holonomic`; sent in status |
| `robot_name` | `ROBOT_NAME` | `""` | Display name; sent in status |
| `robot_namespace` | `ROBOT_NAMESPACE` | `""` | Set → `/<ns>/cmd_vel` |
| `robot_length_m` | `ROBOT_LENGTH_M` | `0.0` | Footprint length (m, x); `0` = no outline. TB3 Waffle `0.281` |
| `robot_width_m` | `ROBOT_WIDTH_M` | `0.0` | Footprint width (m, y); `0` = no outline. TB3 Waffle `0.306` |
| `odom_topic` | `ODOM_TOPIC` | `/odom` | Odometry (absolute path) |
| `map_topic` | `MAP_TOPIC` | `/map` | SLAM grid (transient_local+reliable QoS) |
| `map_window_m` | `MAP_WINDOW_M` | `24.0` | Map crop window side (m), robot-centered |
| `scan_topic` | `SCAN_TOPIC` | `/scan` | LaserScan (sensor_data QoS) |
| `map_frame` | `MAP_FRAME` | `map` | tf2 frame for SLAM pose lookup |
| `odom_frame` | `ODOM_FRAME` | `odom` | tf2 fallback frame |
| `base_frame` | `BASE_FRAME` | `base_link` | Pose target + scan yaw correction |

## Work Guidance

- Testing trophy: `test_teleop_server.cpp` is primary (real WS, mock ROS2 callback); `test_teleop_node.cpp` is the full-pipeline crown jewel; `test_command_handler.cpp` minimal/empty (parsing covered through the server). No tests pinning `parse()` return types. `CommandHandler`/`TeleopServer` targets must run without ROS2.
- TDD order mandatory: failing-behavior red (stub returns sentinel, not missing symbol) → implement → green → commit. Guardrail violations are bugs, not style.

## Verification

```bash
# Requires --network=host (Docker bridge can't resolve external DNS on this host).
docker build --network=host --target builder -t pocket-teleop-dev .
docker run --rm -v $(pwd)/server:/ros2_ws/src/pocket_teleop pocket-teleop-dev \
  /bin/bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && \
    colcon build --packages-select pocket_teleop && \
    colcon test --packages-select pocket_teleop --event-handlers console_direct+ && \
    colcon test-result --verbose"
```
Volume-mounting `server/` picks up host edits without an image rebuild. Baseline: C++ count in the root AGENTS.md "Test baseline" (authoritative).

## Child DOX Index

No children. Leaf boundary. For the rest of the repo (auth proxy, web client, video): root [AGENTS.md](../AGENTS.md) + [repository-structure.md](../memory/agent-guides/repository-structure.md).
