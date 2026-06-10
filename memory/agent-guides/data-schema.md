# Data Schema

## Message protocol — client → server

```json
{"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":-0.3}
{"type":"ping"}
{"type":"estop"}
{"type":"estop_reset"}
```

- Values clamped to `[-1.0, 1.0]` inclusive — out-of-range returns `ParseError`, not clamp.
- `linear_y` always present in twist messages even for differential drive (client sends `0.0`).
- `estop` latches the server: it publishes a single zero `cmd_vel` and then **ignores all incoming `twist` messages** until `estop_reset`. Pings still work and keep the connection alive while latched. The latch clears on a fresh connection.

## Message protocol — server → client

```json
{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"My Robot","robot_namespace":"robot1"}
{"type":"pong"}
{"type":"error","message":"<reason>"}
{"type":"estop_state","engaged":true}
{"type":"map","resolution":0.05,"width":480,"height":480,"origin_x":-12.0,"origin_y":-12.0,"cells":"u120f300o5..."}
{"type":"pose","frame":"map","x":1.5,"y":-0.5,"heading":0.78}
{"type":"scan","angle_min":0.0,"angle_increment":0.052,"range_max":3.5,"ranges":[2.79,1.74]}
```

- `estop_state` confirms the latch state to the client (sent in reply to `estop`/`estop_reset`); the UI shows an engaged banner + RESET affordance while `engaged` is true.
- `robot_name` and `robot_namespace` always present in status messages (empty string `""` when not configured).
- Client treats missing fields as `""` for backwards compatibility.
- `map` message (SLAM occupancy grid): cells are encoded as trinary RLE string (u=unknown, f=free, o=occupied, followed by run length; row-major order). Sent at ~0.5 Hz when available. Frame origin is world-relative. Cells within a crop window (configurable via `MAP_WINDOW_M`) are transmitted.
- `pose` message (tf2 transform): SLAM `map→base_link` pose frame when SLAM is active; falls back to `odom→base_link` (frame="odom") when SLAM unavailable. Sent at ~5 Hz.
- `scan` message (lidar): pointcloud in base_link-fixed frame (yaw-corrected). Up to 120 points; 0 indicates invalid/no-return. Sent at ~5 Hz.

## C++ result types (CommandHandler)

```cpp
struct TwistCommand      { double linear_x; double linear_y; double angular_z; };
struct PingCommand       {};
struct EStopCommand      {};
struct EStopResetCommand {};
struct ParseError        { std::string message; };

using ParseResult = std::variant<TwistCommand, PingCommand, EStopCommand, EStopResetCommand, ParseError>;
```

Callers use `std::holds_alternative<>` to dispatch on variant.

## ROS2 parameters (TeleopNode)

| Parameter | Default | Description |
|---|---|---|
| `port` | `9091` | WebSocket listen port (internal only — not exposed; auth-server proxies) |
| `timeout_ms` | `500` | Watchdog timeout in ms |
| `cmd_vel_topic` | `/cmd_vel` | Base ROS2 publish topic (overridden by `robot_namespace` if set) |
| `robot_type` | `diff_drive` | Sent to client in status message on connect |
| `robot_name` | `""` | Human-readable display name; sent to client in status message |
| `robot_namespace` | `""` | ROS2 namespace; overrides `cmd_vel_topic` → `/<ns>/cmd_vel` when set |
| `odom_topic` | `/odom` | Odometry subscription (absolute path; no namespace magic) |
| `map_topic` | `/map` | SLAM occupancy grid subscription (transient_local+reliable QoS) |
| `map_window_m` | `24.0` | Side length (m) of the map crop window centered on the robot |
| `scan_topic` | `/scan` | LaserScan subscription (sensor_data QoS) |
| `map_frame` | `map` | tf2 frame for the SLAM-corrected pose lookup |
| `odom_frame` | `odom` | tf2 fallback frame when `map_frame` is unavailable |
| `base_frame` | `base_link` | Robot base frame; pose target + scan yaw correction |

## Environment variables

### auth-server

| Variable | Required | Description |
|---|---|---|
| `TELEOP_ADMIN_USER` | Yes | Initial admin username — first run only, seeds credentials |
| `TELEOP_ADMIN_PASSWORD` | Yes | Initial admin password — first run only; forced change on first login |
| `SESSION_SECRET` | Yes | Signs session cookies; generate with `openssl rand -hex 32` |
| `TELEOP_SERVER_URL` | No (default: `http://teleop-server:9091`) | Teleop WebSocket server URL for proxying |
| `WEBCLIENT_URL` | No (default: `http://webclient:80`) | nginx webclient URL for HTTP proxying |

**Credential persistence:** Stored in `auth-data` Docker volume at `/data/credentials.json`. Survive reboots and `docker compose up --build`. Only `docker compose down -v` deletes volume and resets to `.env` defaults.

**Single-operator model:** One credential set per robot instance. Multi-user not implemented.

### teleop-server

| Variable | Required | Description |
|---|---|---|
| `ROBOT_TYPE` | No (default: `diff_drive`) | Reported to client on connect; `diff_drive` or `holonomic` |
| `ROBOT_NAME` | No (default: `""`) | Display name shown in UI; omit or leave empty for no label |
| `ROBOT_NAMESPACE` | No (default: `""`) | ROS2 namespace; routes cmd_vel to `/<ns>/cmd_vel` when set |
| `MAP_TOPIC` | No (default: `/map`) | SLAM occupancy grid topic (transient_local QoS); unset/empty = default `/map` |
| `MAP_FRAME` | No (default: `map`) | tf2 frame for the SLAM-corrected pose lookup |
| `MAP_WINDOW_M` | No (default: `24.0`) | Side length (m) of the transmitted map crop window, centered on the robot |
| `SCAN_TOPIC` | No (default: `/scan`) | 2D LaserScan topic for the minimap obstacle overlay |
| `ODOM_TOPIC` | No (default: `/odom`) | Odometry topic (minimap fallback when SLAM unavailable) |
| `ODOM_FRAME` | No (default: `odom`) | tf2 fallback frame when `map` frame unavailable |
| `BASE_FRAME` | No (default: `base_link`) | Robot base frame for pose/scan transforms |

### auth-server (video proxy)

| Variable | Required | Description |
|---|---|---|
| `MEDIAMTX_URL` | No (default: `http://localhost:8889`) | MediaMTX HTTP API + WHEP endpoint URL; proxied at `/video` |

### video-bridge

| Variable | Required | Description |
|---|---|---|
| `VIDEO_TOPIC` | No (empty = disabled) | Full ROS2 topic path, e.g. `/camera/image_raw/compressed`; empty = node sleeps |
| `VIDEO_TOPIC_TYPE` | No (default: `compressed`) | `compressed` for `sensor_msgs/CompressedImage`; `raw` for `sensor_msgs/Image` |
| `MEDIAMTX_RTSP` | No (default: `rtsp://localhost:8554/teleop`) | RTSP push URL inside MediaMTX |