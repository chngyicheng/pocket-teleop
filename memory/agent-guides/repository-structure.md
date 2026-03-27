# Repository Structure

> **Scope note:** The current implementation covers the **server** component only. This file will expand as additional components (e.g. client, bridge) are added.

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
| `server/src/command_handler.hpp/.cpp` | JSON parse + validate; no I/O, no ROS2 |
| `server/src/teleop_server.hpp/.cpp` | WebSocket server, auth, single-client, watchdog |
| `server/src/teleop_node.hpp/.cpp` | ROS2 wrapper; owns TeleopServer, publishes Twist |
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

Volume-mounting `server/` means host edits are picked up without rebuilding the image.

## Test port assignments (server)

| Port | Reserved for |
|---|---|
| 9091 | Running container (never use in tests) |
| 19091 | `test_teleop_server` |
| 19092 | `test_teleop_node` |
