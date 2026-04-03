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

> **Auth-server plan:** `token` parameter will be removed once the auth-server is implemented. See `docs/superpowers/plans/2026-04-03-auth-server-implementation.md` Task 7.

| Parameter | Default | Description |
|---|---|---|
| `port` | `9091` | WebSocket listen port |
| `token` | **required** | Must be set; node exits (throws) if missing. **Retired once auth-server is live.** |
| `timeout_ms` | `500` | Watchdog timeout in ms |
| `cmd_vel_topic` | `/cmd_vel` | Base ROS2 publish topic (overridden by `robot_namespace` if set) |
| `robot_type` | `diff_drive` | Sent to client in status message on connect |
| `robot_name` | `""` | Human-readable display name; sent to client in status message |
| `robot_namespace` | `""` | ROS2 namespace; overrides `cmd_vel_topic` → `/<ns>/cmd_vel` when set |

## Environment variables

### auth-server (once implemented)

| Variable | Required | Description |
|---|---|---|
| `TELEOP_ADMIN_USER` | Yes | Admin username — no default, must be set explicitly |
| `TELEOP_ADMIN_PASSWORD` | Yes | Admin password — no default, must be set explicitly |
| `SESSION_SECRET` | Yes | Signs session cookies; generate with `openssl rand -hex 32` |

### teleop-server (current; `TELEOP_TOKEN` retired when auth-server is live)

| Variable | Required | Description |
|---|---|---|
| `TELEOP_TOKEN` | Yes | Shared secret; clients pass as `?token=` query param. **Retired once auth-server is live.** |
| `ROBOT_TYPE` | No (default: `diff_drive`) | Reported to client on connect; `diff_drive` or `holonomic` |
| `ROBOT_NAME` | No (default: `""`) | Display name shown in UI; omit or leave empty for no label |
| `ROBOT_NAMESPACE` | No (default: `""`) | ROS2 namespace; routes cmd_vel to `/<ns>/cmd_vel` when set |
