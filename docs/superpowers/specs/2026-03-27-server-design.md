# pocket-teleop Server Design

**Date:** 2026-03-27
**Scope:** ROS2 WebSocket server backend — protocol, components, data flow, safety, configuration, and testing. Frontend is out of scope for this spec.

---

## 1. Goals

- Allow a phone (browser or Android app) to send velocity commands to a ROS2 robot over a local network or VPN.
- Support differential drive and holonomic robots via a unified `Twist` command.
- Arm/manipulator control is a stretch goal and is not designed here.
- Keep the core logic decoupled from ROS2 so it is independently testable and portable.

---

## 2. Connectivity Model

The phone and robot are on the same network — either directly (robot Wi-Fi hotspot, shared LAN) or virtually (VPN). The server does not support cloud relay. There is no distinction in software between the two cases; VPN makes the robot's network appear local.

**Client priority:** browser first, native Android app as a stretch goal. The browser Gamepad API is supported, so a paired Bluetooth controller works in the browser without waiting for the Android app.

---

## 3. WebSocket Protocol

### 3.1 Connection

```
ws://<robot-ip>:9091/teleop?token=<shared-secret>
```

- Port **9091** — chosen to be adjacent to rosbridge (9090) but non-conflicting.
- Token is a shared secret passed as a query parameter on the WebSocket handshake.
- Invalid or missing token → HTTP 401, connection rejected before WebSocket upgrade.
- Only **one active client** is permitted at a time. A second connection attempt is rejected with `{"type":"error","message":"already connected"}` and the new connection is closed.

### 3.2 Client → Server Messages

All messages are JSON with a `type` field.

**Twist command** (drive the robot):
```json
{
  "type": "twist",
  "linear_x": 0.5,
  "linear_y": 0.0,
  "angular_z": -0.3
}
```
- `linear_x`: forward/backward, range `[-1.0, 1.0]`
- `linear_y`: lateral (holonomic only), range `[-1.0, 1.0]`; always `0.0` for differential drive
- `angular_z`: yaw rotation, range `[-1.0, 1.0]`
- Values outside range are rejected (not clamped) and return a parse error.

**Ping** (keepalive):
```json
{ "type": "ping" }
```

### 3.3 Server → Client Messages

```json
{ "type": "pong" }
{ "type": "error", "message": "<description>" }
{ "type": "status", "connected": true, "robot_type": "diff_drive" }
```

### 3.4 Safety Timeout

- The client must send a `twist` or `ping` at least every **200ms** while operating.
- If no valid message is received for **500ms**, the server publishes a zero-velocity Twist and marks the session as timed out.
- A malformed message does **not** reset the watchdog timer.
- Reconnection resets the timer.

---

## 4. Component Design

All components run on the robot inside a single binary. Only `TeleopNode` has a ROS2 dependency.

```
[ TeleopNode ]         ← knows ROS2
      |
[ TeleopServer ]       ← knows WebSocket; no ROS2
      |
[ CommandHandler ]     ← knows JSON parsing; no WebSocket, no ROS2
```

### 4.1 `TeleopNode` (`server/src/teleop_node.cpp`)

- Extends `rclcpp::Node`.
- Owns a `TeleopServer` instance.
- Creates a `rclcpp::Publisher<geometry_msgs::msg::Twist>` on the configured topic.
- Provides a publish callback: `void publish_twist(double lx, double ly, double az)`.
- Reads ROS2 parameters: `port`, `token`, `timeout_ms`, `cmd_vel_topic`.
- Exits with a clear error message if `token` is not set.

### 4.2 `TeleopServer` (`server/src/teleop_server.cpp`)

- No ROS2 dependency.
- Constructor takes `std::function<void(double, double, double)>` as the publish callback.
- Owns the WebSocket server (uWebSockets).
- Validates token on handshake.
- Enforces single-client constraint.
- Runs a watchdog timer (std::thread or async timer); fires callback with `(0.0, 0.0, 0.0)` on timeout.
- Delegates message parsing to `CommandHandler`.
- Resets watchdog only on valid `twist` or `ping` messages.

### 4.3 `CommandHandler` (`server/src/command_handler.cpp`)

- Pure logic — no I/O, no ROS2, no WebSocket.
- `ParseResult parse(const std::string& json_message)`
- Returns one of: `TwistCommand`, `PingCommand`, `ParseError`.
- Validates value ranges; returns `ParseError` for out-of-range values.

---

## 5. Data Flow

### Normal operation
```
Phone sends twist message
  → TeleopServer receives frame, resets watchdog
  → CommandHandler parses & validates JSON
  → TeleopServer fires publish callback
  → TeleopNode publishes Twist on /cmd_vel
  → Robot moves
```

### Keepalive
```
Phone sends ping
  → TeleopServer resets watchdog, replies with pong
  → No publish to /cmd_vel
```

### Safety timeout
```
Watchdog fires (no valid message for 500ms)
  → TeleopServer calls publish callback with (0.0, 0.0, 0.0)
  → TeleopNode publishes zero-velocity Twist on /cmd_vel
  → Robot stops
  → Server logs timeout event
```

### Bad token
```
WebSocket handshake received
  → Token mismatch → HTTP 401, connection rejected
```

### Malformed message
```
CommandHandler returns ParseError
  → TeleopServer sends {"type":"error","message":"..."}
  → Watchdog timer is NOT reset
```

---

## 6. Configuration

ROS2 parameters set via launch file or command line:

| Parameter | Default | Description |
|---|---|---|
| `port` | `9091` | WebSocket listen port |
| `token` | *(required, no default)* | Shared secret token |
| `timeout_ms` | `500` | Watchdog timeout in milliseconds |
| `cmd_vel_topic` | `/cmd_vel` | ROS2 topic for Twist commands |
| `robot_type` | `diff_drive` | Reported to client on connect; valid values: `diff_drive`, `holonomic` |

No default token — node exits with a clear error if not set.

---

## 7. Testing

### 7.1 Test structure

```
server/
  test/
    test_command_handler.cpp   ← unit tests, no ROS2, no WebSocket
    test_teleop_server.cpp     ← integration tests, mock callback
    test_teleop_node.cpp       ← ROS2 integration test
```

Using `ament_cmake` test infrastructure with `gtest`.

### 7.2 `test_command_handler.cpp`

- Valid twist message → correct `TwistCommand` values returned
- Valid ping message → `PingCommand` returned
- Malformed JSON → `ParseError` returned
- `linear_x` out of range → `ParseError` returned
- Missing `type` field → `ParseError` returned

### 7.3 `test_teleop_server.cpp`

- Connect with valid token → connection accepted
- Connect with invalid token → connection rejected (HTTP 401)
- Second client connects while one is active → rejected
- Send twist → mock callback fired with correct values
- Send ping → mock callback not fired, pong received
- Send nothing for `timeout_ms` → mock callback fired with `(0.0, 0.0, 0.0)`
- Send malformed message → error response, watchdog not reset

### 7.4 `test_teleop_node.cpp`

- Spin up node, connect WebSocket client, send twist → message appears on `/cmd_vel` with correct values
- Disconnect client → zero-velocity message appears on `/cmd_vel` after timeout

---

## 8. Containerisation

ROS2 is not installed on the host (Raspberry Pi 5, Debian Bookworm). The server runs entirely inside a Docker container. The host only needs Docker and Docker Compose.

**Base image:** `ros:humble` (ROS2 LTS, official multi-arch image, supports `linux/arm64`)

**Container responsibilities:**
- Install system dependencies (`libwebsocketpp-dev`, `libboost-system-dev`, `nlohmann-json3-dev`)
- Build the `pocket_teleop` colcon workspace
- Expose port 9091 to the host
- Run `teleop_node` as the container entrypoint

**Files at project root:**
- `Dockerfile` — multi-stage: `builder` stage compiles the workspace, `runtime` stage runs it
- `docker-compose.yml` — defines the `teleop-server` service, maps port 9091, injects `TELEOP_TOKEN` from environment
- `.dockerignore` — excludes `.git`, `web-client/`, docs

**Token handling:** `TELEOP_TOKEN` is passed as an environment variable to the container and read by the node as the `token` ROS2 parameter. Never hard-coded in any file.

**Development workflow:**
- `docker compose up --build` — build and start the server
- `docker compose run --rm teleop-server colcon test` — run the test suite
- `docker compose exec teleop-server bash` — interactive shell for debugging

**Networking:** Port `9091` is published to `0.0.0.0:9091` on the host so the phone can reach it over the local network or VPN.

---

## 9. Out of Scope (this spec)

- Web client / frontend UI
- Android native app
- Arm/manipulator commands (stretch goal, separate spec)
- Robot hardware drivers (assumed to subscribe to `/cmd_vel`)
- VPN setup
