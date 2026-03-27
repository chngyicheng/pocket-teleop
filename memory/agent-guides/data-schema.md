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
{"type":"status","connected":true,"robot_type":"diff_drive"}
{"type":"pong"}
{"type":"error","message":"<reason>"}
```

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
| `port` | `9091` | WebSocket listen port |
| `token` | **required** | Must be set; node exits (throws) if missing |
| `timeout_ms` | `500` | Watchdog timeout in ms |
| `cmd_vel_topic` | `/cmd_vel` | ROS2 publish topic |
| `robot_type` | `diff_drive` | Sent to client in status message on connect |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TELEOP_TOKEN` | Yes | Shared secret; clients must pass this as `?token=` query param |
| `ROBOT_TYPE` | No (default: `diff_drive`) | Reported to client on connect; `diff_drive` or `holonomic` |

Token is **never** baked into the image or source. Always injected at runtime via environment variable.
