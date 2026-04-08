# pocket-teleop

Control a ROS2 robot from your phone browser — no laptop required.

WebSocket bridge from phone → ROS2 `/cmd_vel`. Session-authenticated with a login page, single-operator, with a safety watchdog that stops the robot on disconnect.

## Architecture

```
Phone browser  http://<robot-ip>:8080
    │
    ▼ port 8080 (only public port)
┌──────────────────────────────────────────────┐
│  auth-server (Node/Express)                  │
│  • login page + session cookie auth          │
│  • proxies HTTP → webclient nginx (internal) │
│  • proxies WebSocket → teleop-server (internal) │
└──────────────────────────────────────────────┘
         │                      │
         ▼                      ▼
  webclient (nginx)      teleop-server (ROS2 + C++)
  serves compiled TS     publishes geometry_msgs/Twist
                         to /cmd_vel
```

ROS2 runs inside Docker — the host only needs Docker and Docker Compose.

## Quick start

```bash
# 1. Create your .env file
cp .env.example .env
```

Edit `.env` and fill in all three required values:

```bash
TELEOP_ADMIN_USER=operator       # login username
TELEOP_ADMIN_PASSWORD=changeme   # initial password
SESSION_SECRET=<random hex>      # generate: openssl rand -hex 32
```

```bash
# 2. Start the stack
docker compose up --build

# 3. Open in browser
# http://<robot-ip>:8080
```

On first login you will be prompted to change the password. After that, credentials persist in the `auth-data` Docker volume across reboots and image rebuilds.

**To reset credentials:** `docker compose down -v` (deletes the volume) then restart.

## Managing the stack

```bash
# Stop the stack (keeps credentials)
docker compose down

# Restart after pulling new code (rebuilds images)
docker compose down && docker compose up --build

# Run in the background (logs go to Docker, not the terminal)
docker compose up --build -d

# View live logs
docker compose logs -f

# Reset everything including credentials
docker compose down -v
```

> **Finding your robot's IP:** run `hostname -I` on the robot — use the first address shown.

## Optional robot configuration

Set these in `.env` before starting (all optional):

| Variable | Default | Description |
|---|---|---|
| `ROBOT_TYPE` | `diff_drive` | `diff_drive` or `holonomic` |
| `ROBOT_NAME` | _(none)_ | Display name shown in the UI |
| `ROBOT_NAMESPACE` | _(none)_ | ROS2 namespace prefix for topics |

## Troubleshooting

### Web UI stuck connecting — `[ETIMEDOUT]` in auth-server logs

The auth-server proxies WebSocket connections to the teleop-server via `host.docker.internal:9091`. This relies on Docker's `host-gateway` feature, which requires **Docker >= 20.10**.

To diagnose, check whether `host.docker.internal` resolves inside the container:

```bash
docker exec pocket-teleop-auth-server-1 getent hosts host.docker.internal
```

If it prints nothing, your Docker version does not support `host-gateway`. Fix: set `TELEOP_SERVER_URL` in your `.env` to the host machine's LAN IP:

```bash
# .env
TELEOP_SERVER_URL=http://192.168.1.50:9091
```

Check your Docker version with `docker --version` — upgrade to >= 20.10 to use the default.

### Inspecting ROS2 topics from another machine (multicast broken)

If `ros2 multicast receive` fails with `[Errno 19] No such device`, multicast is disabled on your machine or network (common with VMs, certain Wi-Fi configs). Use the unicast-only observer profile:

```bash
export TELEOP_HOST_IP=192.168.1.50           # robot's LAN IP
export ROS_NETWORK_INTERFACE=192.168.1.51    # your machine's LAN IP
export ROS_DOMAIN_ID=0                       # must match the robot's domain
export FASTRTPS_DEFAULT_PROFILES_FILE=$(pwd)/server/fastrtps_profiles_observer.xml

ros2 topic list
```

This profile (`server/fastrtps_profiles_observer.xml`) disables multicast and sends unicast DDS discovery packets directly to the robot, bypassing the broken multicast path.

## Running tests

```bash
# Web-client unit + integration tests
docker compose --profile test run --rm webclient-test

# Auth-server tests
docker compose --profile test run --rm auth-server-test
```

Both suites run entirely inside Docker — no local Node.js installation needed.

## Supported robots

| Drive type | Axes used |
|---|---|
| Differential drive | `linear_x`, `angular_z` |
| Holonomic / omnidirectional | `linear_x`, `linear_y`, `angular_z` |

Input sources: gamepad (USB or Bluetooth), on-screen touch joysticks, keyboard.

## Documentation

| Document | Description |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Architecture, dev workflow, agent handoff state |
| [`memory/agent-guides/repository-structure.md`](memory/agent-guides/repository-structure.md) | File map, build commands, port assignments |
| [`memory/agent-guides/techstack.md`](memory/agent-guides/techstack.md) | Language, runtime, and dependency details |
| [`memory/agent-guides/data-schema.md`](memory/agent-guides/data-schema.md) | Message protocol, ROS2 parameters, env vars |
