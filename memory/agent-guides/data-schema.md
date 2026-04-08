# Data Schema

## Message protocol — client → server

```json
{"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":-0.3}
{"type":"ping"}
```

- Values clamped to `[-1.0, 1.0]` inclusive — out-of-range returns a `ParseError`, not a clamp.
- `linear_y` is always present in twist messages even for differential drive (client sends `0.0`).

## Message protocol — server → client

```json
{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"My Robot","robot_namespace":"robot1"}
{"type":"pong"}
{"type":"error","message":"<reason>"}
```

- `robot_name` and `robot_namespace` are always present in status messages (empty string `""` when not configured).
- Client treats missing fields as `""` for backwards compatibility.

## C++ result types (CommandHandler)

```cpp
struct TwistCommand { double linear_x; double linear_y; double angular_z; };
struct PingCommand  {};
struct ParseError   { std::string message; };

using ParseResult = std::variant<TwistCommand, PingCommand, ParseError>;
```

Callers use `std::holds_alternative<>` to dispatch on the variant.

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
| `TELEOP_ADMIN_USER` | Yes | Initial admin username — used only on first run to seed credentials |
| `TELEOP_ADMIN_PASSWORD` | Yes | Initial admin password — used only on first run; user is forced to change it on first login |
| `SESSION_SECRET` | Yes | Signs session cookies; generate with `openssl rand -hex 32` |
| `TELEOP_SERVER_URL` | No (default: `http://teleop-server:9091`) | URL of the teleop WebSocket server for proxying |
| `WEBCLIENT_URL` | No (default: `http://webclient:80`) | URL of the nginx webclient for HTTP proxying |

**Credential persistence:** Credentials are stored in the `auth-data` Docker volume at `/data/credentials.json`. They survive reboots and `docker compose up --build`. Only `docker compose down -v` deletes the volume and resets to the `.env` defaults.

**Single-operator model:** One credential set per robot instance. Multi-user support is not implemented.

### teleop-server

| Variable | Required | Description |
|---|---|---|
| `ROBOT_TYPE` | No (default: `diff_drive`) | Reported to client on connect; `diff_drive` or `holonomic` |
| `ROBOT_NAME` | No (default: `""`) | Display name shown in UI; omit or leave empty for no label |
| `ROBOT_NAMESPACE` | No (default: `""`) | ROS2 namespace; routes cmd_vel to `/<ns>/cmd_vel` when set |
