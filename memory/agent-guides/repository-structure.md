# Repository Structure

> **Scope note:** Video streaming milestone complete (v0.6.0 pending tag). Tags so far: `v0.1.0-server`, `v0.1.0-client`, `v0.2.0`, `v0.3.0`, `v0.4.0`.

## Component layers (server)

```
Phone browser
    │  WebSocket ws://<robot-ip>:9091/teleop?token=<secret>
    ▼
┌─────────────────────────────────────────────┐
│  Docker container (ros:humble)              │
│                                             │
│  TeleopNode          ← knows ROS2           │
│      │  publish callback                   │
│  TeleopServer        ← knows WebSocket      │
│      │  ParseResult                        │
│  CommandHandler      ← pure C++ logic       │
└─────────────────────────────────────────────┘
    │  geometry_msgs/Twist
    ▼
/cmd_vel ROS2 topic → robot hardware
```

## Key files (server)

| File | What it does |
|---|---|
| `Dockerfile` | Multi-stage: `builder` compiles + tests, `runtime` runs |
| `docker-compose.yml` | Service definition, port 9091, env var injection |
| `.dockerignore` | Excludes build artefacts and worktrees from image context |
| `server/package.xml` | ROS2 package manifest (`pocket_teleop`) |
| `server/CMakeLists.txt` | Build targets, test targets, dependency resolution |
| `server/include/command_handler.hpp` | CommandHandler types and interface |
| `server/include/teleop_server.hpp` | TeleopServer types and interface |
| `server/include/teleop_node.hpp` | TeleopNode types and interface |
| `server/src/command_handler.cpp` | JSON parse + validate; no I/O, no ROS2 |
| `server/src/teleop_server.cpp` | WebSocket server, auth, single-client, watchdog |
| `server/src/teleop_node.cpp` | ROS2 wrapper; owns TeleopServer, publishes Twist |
| `server/src/main.cpp` | Entry point; catches constructor exceptions |
| `server/launch/teleop.launch.py` | ROS2 launch file for production use |
| `server/test/test_command_handler.cpp` | Unit tests — no ROS2, no WebSocket |
| `server/test/test_teleop_server.cpp` | Integration tests — mock callback, no ROS2 |
| `server/test/test_teleop_node.cpp` | ROS2 integration tests |

## Build commands (server)

```bash
# Requires --network=host on this host — Docker bridge cannot resolve external DNS.

# Full image
docker build --network=host -t pocket-teleop .

# Builder stage only (for test iteration)
docker build --network=host --target builder -t pocket-teleop-dev .
```

## Run tests (server)

```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  pocket-teleop-dev \
  /bin/bash -c ". /opt/ros/humble/setup.sh && \
    cd /ros2_ws && \
    colcon build --packages-select pocket_teleop && \
    colcon test --packages-select pocket_teleop --event-handlers console_direct+ && \
    colcon test-result --verbose"
```

Volume-mounting `server/` picks up host edits without image rebuild.

## Test port assignments (server)

| Port | Reserved for |
|---|---|
| 9091 | Running container (never use in tests) |
| 19091 | `test_teleop_server` |
| 19092 | `test_teleop_node` |

---

## Component layers (client)

```
Phone browser  http://<robot-ip>:8080?token=<secret>
    │
    ▼
┌─────────────────────────────────────────────┐
│  Docker container (nginx)                   │
│  Serves compiled TypeScript → dist/         │
└─────────────────────────────────────────────┘
    │  WebSocket ws://<robot-ip>:9091/teleop?token=<secret>
    ▼
TeleopServer (server container)
```

Browser-side layers (TypeScript, no framework):

```
TeleopClient       ← public API; keepalive + exponential-backoff reconnect
    ├── Connection         ← WebSocket lifecycle; ws?.close() guard on reconnect
    ├── GamepadHandler     ← Gamepad API polling; profile-aware axis reads; rising-edge buttons
    ├── GamepadProfiles    ← built-in profiles + localStorage persistence
    └── Protocol           ← message types + serializers; no I/O
```

## Key files (client)

| File | What it does |
|---|---|
| `web-client/Dockerfile.webclient` | Multi-stage: `builder` (tsc) + `runtime` (nginx) |
| `web-client/src/protocol.ts` | Message types, serializers, inbound parser |
| `web-client/src/connection.ts` | WebSocket open/close/send; fires callbacks |
| `web-client/src/gamepad_profiles.ts` | `GamepadProfile` types; 4 built-in profiles; `matchProfile`, `loadCustomProfiles`, `saveProfile`, `deleteProfile` |
| `web-client/src/gamepad_handler.ts` | Polls Gamepad API; auto-matches profile; emits twist + button events |
| `web-client/src/teleop_client.ts` | Orchestrates all modules; reconnection loop; public API |
| `web-client/test/gamepad_profiles.test.ts` | Unit tests for `matchProfile` and `loadCustomProfiles` (6 tests) |
| `web-client/test/integration.test.ts` | Integration tests against real server; no mocks (11 tests) |
| `web-client/src/settings.ts` | `SettingsRouter`, `loadRobotNamespace`, `saveRobotNamespace`, `clearRobotNamespace` — settings routing and localStorage persistence; `loadVideoUrl`/`saveVideoUrl`/`clearVideoUrl` remain but no longer imported by `index.html` |
| `web-client/src/touch_joystick.ts` | `TouchJoystick` class — floating touch joystick, normalised -1..1 output, jsdom-testable |
| `web-client/test/settings.test.ts` | Unit tests for `settings.ts` (8 tests; `vi.stubGlobal` for localStorage) |
| `web-client/test/touch_joystick.test.ts` | 14 unit tests using jsdom PointerEvent simulation |
| `web-client/index.html` | Full responsive UI — header, status pill, robot name strip, velocity overlay, touch joystick zones, settings drawer (Gamepad + Video + Connection pages) |
| `web-client/tsconfig.json` | TypeScript strict mode config |
| `web-client/package.json` | Dev deps: typescript, vitest, jsdom |

## Build and test commands (client)

```bash
# Full stack — requires .env with TELEOP_ADMIN_USER, TELEOP_ADMIN_PASSWORD, SESSION_SECRET
docker compose up --build

# Web-client tests — IMPORTANT: requires port 18080 to be free.
# If main stack is running (pocket-teleop-webclient-1 on 18080), stop it first:
#   docker compose down
# Then from the project root (or worktree):
docker compose --env-file /home/chngyicheng/pocket-teleop/.env --profile test run --rm webclient-test

# Web-client UNIT tests only (no port needed, works while main stack is running):
docker run --rm \
  -v $(pwd)/web-client:/app \
  -w /app \
  node:22-alpine \
  sh -c "npm install --silent 2>/dev/null && npm test"
# Note: integration.test.ts will fail (no server) but unit tests pass.

# Auth-server tests (self-contained, no other services needed)
docker compose --env-file /home/chngyicheng/pocket-teleop/.env --profile test run --rm auth-server-test
```

**Worktree note:** `.env` is not copied into worktrees. Always pass `--env-file /home/chngyicheng/pocket-teleop/.env` explicitly when running compose from a worktree.

## Port assignments (client)

| Port | Reserved for |
|---|---|
| 8080 | auth-server (host-mapped; proxies nginx and WebSocket) |

> Note: once auth-server implemented, nginx (port 80) and teleop-server (port 9091) become internal-only — not host-exposed.

---

## Component layers (video streaming)

```
ROS2 topic (CompressedImage or Image)
    │ rclpy subscriber
    ▼
video-bridge container (host network)
GStreamer: appsrc → jpegdec/videoconvert → x264enc → rtph264pay → rtspclientsink
    │ RTSP push → localhost:8554
    ▼
mediamtx container (host network)
• receives RTSP from video-bridge (or pulls from RTSP source directly)
• serves WHEP at localhost:8889/teleop/whep
• WebRTC UDP ICE at *:8891
    │ HTTP (SDP exchange)     │ UDP (media)
    ▼ proxied via auth-server ▼ direct browser ↔ robot
auth-server: /video → localhost:8889
    │
    ▼ HTTP at :8080
phone browser
WhepClient: RTCPeerConnection + POST /video/teleop/whep → <video> element
```

## Key files (video streaming)

| File | What it does |
|---|---|
| `video-bridge/video_bridge.py` | Python rclpy node — subscribes ROS2 image topic, feeds GStreamer pipeline, pushes RTSP to MediaMTX; sleeps if `VIDEO_TOPIC` unset |
| `video-bridge/Dockerfile.video_bridge` | ROS2 Humble + GStreamer + python3-gst-1.0; multi-stage: `base`, `runtime`, `test` |
| `video-bridge/test_video_bridge.py` | 19 pytest tests for pipeline-string functions and format map |
| `mediamtx.yml` | MediaMTX config — RTSP at 8554, WHEP at 8889, UDP ICE at 8891, path `teleop` |
| `web-client/src/whep_client.ts` | `WhepClient` class — vanilla WHEP gather-then-offer, exponential back-off retry |
| `web-client/test/whep_client.test.ts` | 13 vitest tests with mocked RTCPeerConnection and fetch |

## Build and test commands (video streaming)

```bash
# Run video-bridge Python tests
docker compose --profile test run --rm video-bridge-test

# Run all test suites
docker compose --profile test run --rm webclient-test
docker compose --profile test run --rm auth-server-test
docker compose --profile test run --rm video-bridge-test
```

## Port assignments (video streaming)

| Port | Protocol | Used for |
|---|---|---|
| 8554 | TCP | MediaMTX RTSP ingest (video-bridge → mediamtx) — internal only |
| 8889 | HTTP | MediaMTX WHEP + config API — proxied via auth-server at `/video` |
| 8891 | UDP | WebRTC ICE media — direct browser ↔ robot; requires `sudo ufw allow 8891/udp` |

---

## Component layers (auth-server, once implemented)

```
Phone browser  http://<robot-ip>:8080
    │
    ▼ port 8080 (only exposed port)
┌──────────────────────────────────────────┐
│  auth-server (Node/Express)              │
│  • session cookie validation             │
│  • proxies HTTP → nginx:80 (internal)    │
│  • proxies WS upgrades → teleop-server:9091 (internal) │
└──────────────────────────────────────────┘
```

## Key files (auth-server)

| File | What it does |
|---|---|
| `auth-server/src/credentials.ts` | bcrypt hash/verify; init and read/save credentials.json |
| `auth-server/src/app.ts` | `createApp(AppOptions)` factory — testable Express wiring |
| `auth-server/src/index.ts` | Entry point — env validation, server start, WS upgrade |
| `auth-server/src/proxy.ts` | HTTP proxy to webclient; WS upgrade handler to teleop-server |
| `auth-server/src/routes/auth.ts` | Login, logout, change-password routes |
| `auth-server/views/login.html` | Login page |
| `auth-server/views/change-password.html` | Force-change-on-first-login page |
| `auth-server/test/credentials.test.ts` | Unit tests for credential functions |
| `auth-server/test/auth.test.ts` | Integration tests for auth routes (supertest) |
| `auth-server/Dockerfile.auth` | base → builder → runtime stages |