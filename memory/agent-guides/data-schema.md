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
```

- `estop_state` confirms the latch state to the client (sent in reply to `estop`/`estop_reset`); the UI shows an engaged banner + RESET affordance while `engaged` is true.

- `robot_name` and `robot_namespace` always present in status messages (empty string `""` when not configured).
- Client treats missing fields as `""` for backwards compatibility.

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