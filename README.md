# pocket-teleop

Control a ROS2 robot from your phone instead of hauling a laptop around.

WebSocket bridge from phone browser → ROS2 `/cmd_vel`. Token-authenticated, single-client, with a safety watchdog that stops the robot on disconnect.

## Quick start

```bash
TELEOP_TOKEN=mysecrettoken docker compose up --build
```

- Server WebSocket: `ws://<robot-ip>:9091/teleop?token=mysecrettoken`
- Web client: `http://<robot-ip>:8080?token=mysecrettoken`

ROS2 runs inside Docker — the host only needs Docker and Docker Compose.

## Status

| Component | Status |
|---|---|
| Server (ROS2 + WebSocket) | Complete — `v0.1.0-server` |
| Web client (browser UI) | Complete — `v0.1.0-client` |
| Android app | Stretch goal |

## Running tests

```bash
# Integration tests (client against real server)
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

## Documentation

| Document | Description |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Architecture, dev workflow, task guides (progressive disclosure) |
| [`docs/superpowers/specs/2026-03-27-server-design.md`](docs/superpowers/specs/2026-03-27-server-design.md) | Server design spec |
| [`docs/superpowers/specs/2026-03-28-client-design.md`](docs/superpowers/specs/2026-03-28-client-design.md) | Web client design spec |
| [`docs/superpowers/plans/2026-03-27-server-implementation.md`](docs/superpowers/plans/2026-03-27-server-implementation.md) | Server implementation plan |
| [`docs/superpowers/plans/2026-03-28-client-implementation.md`](docs/superpowers/plans/2026-03-28-client-implementation.md) | Web client implementation plan |

## Supported robots

- Differential drive (`linear_x`, `angular_z`)
- Holonomic / omnidirectional (`linear_x`, `linear_y`, `angular_z`)
- Arm/manipulator — stretch goal, not yet designed
