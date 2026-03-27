# pocket-teleop

Control a ROS2 robot from your phone instead of hauling a laptop around.

WebSocket bridge from phone browser → ROS2 `/cmd_vel`. Token-authenticated, single-client, with a safety watchdog that stops the robot on disconnect.

## Quick start

```bash
TELEOP_TOKEN=mysecrettoken docker compose up --build
```

Phone connects to: `ws://<robot-ip>:9091/teleop?token=mysecrettoken`

ROS2 runs inside Docker — the host only needs Docker and Docker Compose.

## Status

**In development — server backend.** See [`AGENTS.md`](AGENTS.md) for architecture, task guides, and development workflow.

| Component | Status |
|---|---|
| Server (ROS2 + WebSocket) | In development |
| Web client (browser UI) | Not started |
| Android app | Stretch goal |

## Documentation

| Document | Description |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Architecture, dev workflow, task guides (progressive disclosure) |
| [`docs/superpowers/specs/2026-03-27-server-design.md`](docs/superpowers/specs/2026-03-27-server-design.md) | Server design spec |
| [`docs/superpowers/plans/2026-03-27-server-implementation.md`](docs/superpowers/plans/2026-03-27-server-implementation.md) | Step-by-step implementation plan |

## Supported robots

- Differential drive (`linear_x`, `angular_z`)
- Holonomic / omnidirectional (`linear_x`, `linear_y`, `angular_z`)
- Arm/manipulator — stretch goal, not yet designed
