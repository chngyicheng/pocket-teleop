<p align="center">
  <img src="docs/assets/banner.svg" alt="pocket-teleop" width="100%">
</p>

<p align="center">
  <em>Control a ROS2 robot from your phone browser — no laptop, no app install.</em>
</p>

<p align="center">
  <img alt="ROS2 Humble" src="https://img.shields.io/badge/ROS2-Humble-22314E?logo=ros&logoColor=white">
  <img alt="React 18 + Vite 5" src="https://img.shields.io/badge/web-React%2018%20%2B%20Vite%205-4ec9d6">
  <img alt="Docker Compose" src="https://img.shields.io/badge/run-Docker%20Compose-2496ED?logo=docker&logoColor=white">
  <img alt="tests" src="https://img.shields.io/badge/tests-556%20web%20%2F%2051%20auth%20%2F%2019%20video%20%2F%2069%20C%2B%2B-22c55e">
</p>

---

**pocket-teleop** bridges a phone browser to a ROS2 robot. A login-gated WebSocket carries velocity commands to `/cmd_vel`, WebRTC carries video back, and a 500 ms server watchdog publishes a zero velocity if the command link goes silent. Everything robot-side runs in Docker — the host only needs Docker and Docker Compose.

## Highlights

- **Phone-first Mission Control UI** — touch joysticks, live telemetry, and a heads-up video feed that adapt across phone (portrait/landscape) and tablet/foldable layouts.
- **Multiple input sources** — gamepad (USB/Bluetooth), on-screen touch joysticks, and keyboard, with input shaping (deadzone + response curve) for smooth low-speed control.
- **Adjustable speed limits** — per-axis linear/angular caps, set live from the UI and persisted.
- **Latching E-STOP** — from the on-screen button, the spacebar, or the gamepad left bumper; one shared latch across every source.
- **Low-latency video** — WebRTC via MediaMTX (~100–300 ms on a LAN), with runtime-switchable sources (ROS2 topic, RTSP, UDP/SRT, MJPEG).
- **Robot-localized minimap** — SLAM occupancy grid (transient_local `/map`), tf2 `map→base_link` pose, and lidar overlay in a robot-centered rotating view with pinch-to-zoom; falls back to odometry when SLAM is unavailable.
- **Access control** — session-cookie login, single operator, forced password change on first run, session-authenticated WebSocket upgrade. Plain HTTP: intended for trusted LANs (TLS not yet implemented).

## Screenshots

> Placeholders below — drop real captures into [`docs/screenshots/`](docs/screenshots) and update the paths.

<p align="center">
  <img src="docs/screenshots/mission-landscape.svg" alt="Mission Control — landscape / tablet" width="62%">
  &nbsp;
  <img src="docs/screenshots/mission-portrait.svg" alt="Mission Control — phone portrait" width="29%">
</p>
<p align="center">
  <img src="docs/screenshots/settings.svg" alt="Settings drawer" width="62%">
</p>

## Architecture

```
Phone browser  http://<robot-ip>:8080
    │
    ▼ port 8080 (only public port)
┌─────────────────────────────────────────────────────┐
│  auth-server (Node/Express)                          │
│  • login page + session cookie auth                  │
│  • /              → webclient nginx (HTTP)           │
│  • /ws            → teleop-server (WebSocket)        │
│  • /video         → mediamtx WHEP (WebRTC SDP)       │
│  • /mediamtx-api  → mediamtx config API              │
└─────────────────────────────────────────────────────┘
      │             │              │
      ▼             ▼              ▼
 webclient     teleop-server   mediamtx
 (nginx,       (ROS2 + C++)    (WebRTC)
  React SPA)   publishes         │ UDP 8891 direct
               /cmd_vel          ▼ to browser
                              video-bridge
                              (ROS2 → GStreamer
                               → RTSP → mediamtx)
```

## Quick start

```bash
# 1. Create your .env from the template
cp .env.example .env
```

Fill in the three required values:

```bash
TELEOP_ADMIN_USER=operator       # login username
TELEOP_ADMIN_PASSWORD=changeme   # initial password (you'll change it on first login)
SESSION_SECRET=<random hex>      # generate with: openssl rand -hex 32
```

```bash
# 2. Build and start the stack
docker compose up --build

# 3. Open the UI on your phone
#    http://<robot-ip>:8080
```

On first login you're prompted to change the password. New credentials persist in the `auth-data` Docker volume across reboots and rebuilds.

> **Find the robot's IP:** run `hostname -I` on the robot and use the first address.

## Managing the stack

```bash
docker compose up --build -d         # start in the background
docker compose logs -f               # follow logs
docker compose down                  # stop (keeps credentials)
docker compose down && docker compose up --build   # restart after a code pull
docker compose down -v               # reset everything, incl. credentials
```

## Enabling HTTPS (TLS)

By default the stack serves plain HTTP on port 8080 — fine for a trusted LAN,
not for anything routable. An opt-in Caddy frontend terminates TLS on 443/80
and proxies everything (UI, WebSocket, video signaling) to auth-server:

```bash
# .env: set TLS_DOMAIN, optionally TLS_ACME_EMAIL, and BIND_HOST=127.0.0.1
docker compose -p pocket-teleop --env-file ./.env --profile tls up --build -d
```

| Mode | .env | Notes |
|---|---|---|
| Plain HTTP (default) | no `--profile tls` | Unchanged behavior; LAN-only deployments |
| Self-signed | `TLS_DOMAIN=<LAN IP or hostname>`, `TLS_ACME_EMAIL` empty | Caddy's internal CA signs the cert; each phone must trust the root CA once (below) |
| Let's Encrypt | `TLS_DOMAIN=<public domain>`, `TLS_ACME_EMAIL=<you@example.com>` | Domain must resolve publicly and ports 80/443 must be reachable from the internet |

With TLS enabled, also set `BIND_HOST=127.0.0.1` in `.env` so auth-server's
plain-HTTP port 8080 is reachable only via Caddy, and allow 443 through the
firewall (`sudo ufw allow 443/tcp`). The session cookie picks up the `Secure`
flag automatically on HTTPS requests. WebRTC video is already DTLS-encrypted
in both modes; only signaling moves under TLS.

**Trusting the self-signed root CA on a phone** — export it from the Caddy
container:

```bash
docker compose -p pocket-teleop cp caddy:/data/caddy/pki/authorities/local/root.crt .
```

Then install `root.crt` on the device: **iOS** — AirDrop/download the file,
install the profile (Settings → General → VPN & Device Management), then
enable it under Settings → General → About → Certificate Trust Settings.
**Android** — Settings → Security → More security settings → Install from
device storage → CA certificate. Until the CA is trusted, the browser blocks
the WebSocket upgrade, so the UI loads but nothing connects.

## Controls

| Source | Drive | Notes |
|---|---|---|
| **Gamepad** | left stick = forward/back + rotate, right stick = strafe | E-STOP on the left bumper (LB). Deadzone + response curve applied. |
| **Touch joysticks** | left zone = drive, right zone = strafe | Bottom-corner hold-zones; the knob mirrors gamepad input when a pad is active. |
| **Keyboard** | arrows / WASD | Spacebar = E-STOP. |

- **Speed limits:** set the max linear (m/s) and angular (rad/s) caps live from the left rail's **SPEED** panel; the value is shaped, scaled, and shown as the published `cmd_vel`.
- **E-STOP:** latches across all sources — engage from any one, reset from any one.

## Robot configuration

All optional; set in `.env` before starting:

| Variable | Default | Description |
|---|---|---|
| `ROBOT_TYPE` | `diff_drive` | `diff_drive` or `holonomic` |
| `ROBOT_NAME` | _(none)_ | Display name shown in the UI |
| `ROBOT_NAMESPACE` | _(none)_ | ROS2 namespace prefix for topics |
| `TELEOP_SERVER_URL` | _auto-detected_ | auth-server finds the Docker bridge gateway at startup; override only if that detection is wrong |

### Supported robots

| Drive type | Axes used |
|---|---|
| Differential drive | `linear_x`, `angular_z` |
| Holonomic / omnidirectional | `linear_x`, `linear_y`, `angular_z` |

### Robot localization (SLAM + odometry)

Minimap rendering requires odometry; SLAM is optional:

| Variable | Default | Description |
|---|---|---|
| `ODOM_TOPIC` | `/odom` | Odometry source; always used as fallback |
| `MAP_TOPIC` | `/map` | SLAM occupancy grid topic |
| `SCAN_TOPIC` | `/scan` | 2D lidar scan for the obstacle overlay |
| `MAP_FRAME` | `map` | Frame ID for SLAM origin |
| `ODOM_FRAME` | `odom` | Frame ID for odometry origin |
| `BASE_FRAME` | `base_link` | Robot base frame for pose/scan transforms |
| `MAP_WINDOW_M` | `24.0` | Side length of the transmitted map crop window, centered on the robot (24.0 → 24×24 m) |

When SLAM publishes the map and the `map→base_link` transform, the UI shows the SLAM-localized pose (with lidar overlay when a scan is available). If SLAM is unavailable or silent, the minimap falls back to odometry (`odom→base_link`).

## Video streaming

The video panel auto-connects over WebRTC (via MediaMTX) and can be re-sourced at runtime from **Settings → Video** — no restart needed.

**One-time firewall rule** (WebRTC media is direct phone ↔ robot over UDP):

```bash
sudo ufw allow 8891/udp
```

| Source | How |
|---|---|
| **ROS2 topic** (default) | Set `VIDEO_TOPIC` + `VIDEO_TOPIC_TYPE` (`compressed` or `raw`) in `.env`. Find it with `ros2 topic list \| grep -i image`. |
| **RTSP camera** | Settings → Video → **RTSP URL** → Apply. MediaMTX pulls it directly. |
| **UDP / SRT** | Settings → Video → **UDP/SRT stream** → e.g. `udp://192.168.1.200:1234`, `srt://192.168.1.200:8890`. |
| **MJPEG** | Settings → Video → **MJPEG URL** → the browser connects directly to the camera. |
| **Disabled** | Settings → Video → **Disabled** → no stream consumed. |

Common ROS2 topics: TurtleBot3 (Pi Camera) `/raspicam_node/image/compressed`, TurtleBot4 (OAK-D) `/oakd/rgb/preview/image_raw/compressed`.

## Running tests

All suites run inside Docker — no local Node.js or Python needed.

```bash
docker compose --profile test run --rm webclient-test       # web client (React + Vitest)
docker compose --profile test run --rm auth-server-test     # auth server
docker compose --profile test run --rm video-bridge-test    # video-bridge (pytest)
```

C++ server tests build and run via the server image; see [repository-structure.md](memory/agent-guides/repository-structure.md).

## Troubleshooting

Common problems (video not appearing, gamepad not detected in Brave, held-stick drop-outs, slow first load, ROS2 discovery) are covered in **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**.

## Documentation

| Document | Description |
|---|---|
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Common problems and fixes |
| [`AGENTS.md`](AGENTS.md) | Architecture, dev workflow, agent handoff state |
| [`memory/agent-guides/repository-structure.md`](memory/agent-guides/repository-structure.md) | File map, build commands, port assignments |
| [`memory/agent-guides/techstack.md`](memory/agent-guides/techstack.md) | Language, runtime, and dependency details |
| [`memory/agent-guides/data-schema.md`](memory/agent-guides/data-schema.md) | Message protocol, ROS2 parameters, env vars |
