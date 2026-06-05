# pocket-teleop

Control a ROS2 robot from your phone browser — no laptop required.

WebSocket bridge from phone → ROS2 `/cmd_vel`. Session-authenticated with a login page, single-operator, with a safety watchdog that stops the robot on disconnect.

## Architecture

```
Phone browser  http://<robot-ip>:8080
    │
    ▼ port 8080 (only public port)
┌─────────────────────────────────────────────────────┐
│  auth-server (Node/Express)                         │
│  • login page + session cookie auth                 │
│  • /         → webclient nginx (HTTP)               │
│  • /ws       → teleop-server (WebSocket)            │
│  • /video    → mediamtx WHEP (WebRTC SDP exchange)  │
│  • /mediamtx-api → mediamtx config API              │
└─────────────────────────────────────────────────────┘
      │           │           │
      ▼           ▼           ▼
 webclient   teleop-server  mediamtx
 (nginx)     (ROS2 + C++)   (WebRTC)
             publishes        │ UDP 8891 direct
             /cmd_vel         ▼ to browser
                          video-bridge
                          (ROS2 → GStreamer
                           → RTSP → mediamtx)
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

**To reset credentials to defaults:** `docker compose down -v` (deletes the volume) then restart. This forces a password change on next login.

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

## Video streaming

The video panel auto-connects in the browser using WebRTC (via MediaMTX). Latency is typically 100–300 ms on a local network. The source can be changed at runtime from the Settings drawer — no restart needed.

### UFW rule (required once)

```bash
sudo ufw allow 8891/udp   # WebRTC UDP media — phone ↔ robot direct
```

### Source: ROS2 topic (default)

Set `VIDEO_TOPIC` in `.env` to stream from a ROS2 camera topic:

```bash
# .env
VIDEO_TOPIC=/camera/image_raw/compressed   # adjust to your camera's topic
VIDEO_TOPIC_TYPE=compressed                # or: raw  (sensor_msgs/Image)
```

To find your camera's topic name:

```bash
ros2 topic list | grep -i image
```

Common topics:
- TurtleBot3 (Pi Camera): `/raspicam_node/image/compressed`
- TurtleBot4 (OAK-D): `/oakd/rgb/preview/image_raw/compressed`

### Source: RTSP camera (IP camera, no ROS2 required)

In the browser: Settings → Video → select **RTSP URL**, enter the camera's RTSP address, and click Apply. MediaMTX pulls the stream directly — `video-bridge` is bypassed.

### Source: UDP or SRT stream

In the browser: Settings → Video → select **UDP stream** or **SRT stream**, enter the stream URL, and click Apply. MediaMTX pulls the stream directly.

Example URLs:
- UDP: `udp://192.168.1.200:1234`
- SRT: `srt://192.168.1.200:8890`

### Source: MJPEG camera

In the browser: Settings → Video → select **MJPEG URL**, enter the camera's HTTP MJPEG stream URL, and click Apply. The browser connects directly to the camera — no MediaMTX involved.

### Disabling video

Settings → Video → select **Disabled** and click Apply. The placeholder is shown in the browser; no stream is consumed.

## Troubleshooting

### Video stream connects but never shows frames — `deadline exceeded while waiting connection` (10 s timeout)

The WHEP signaling succeeds (auth-server logs show `/video` proxy requests completing), but the video panel displays a placeholder, and mediamtx logs show the session closes after 10 seconds. This is caused by the host firewall blocking UDP 8891 (WebRTC ICE media path).

**Root cause:** mediamtx runs in `network_mode: host` and binds the WebRTC ICE UDP listener to port 8891. The mobile browser sends STUN binding requests directly to this port from the phone's IP address. If the host runs ufw (or another stateful firewall) with a default `DROP` policy for inbound traffic, UDP 8891 is not explicitly allowed, and the packets are silently dropped before reaching mediamtx. Mediamtx never sees the client, times out after 10 s, and closes the connection.

**Solution:** Open UDP 8891 on the robot host:
```bash
# Allow WebRTC media from the phone's subnet (recommended):
sudo ufw allow from 192.168.10.0/24 to any port 8891 proto udp

# Or, allow from any source:
sudo ufw allow 8891/udp
```

After adding the rule, the mobile browser can send STUN packets directly to UDP 8891, mediamtx completes the ICE handshake, and video streams immediately.

**Note:** Port 8080 (auth-server signaling) operates over TCP and typically already has an allow rule. Port 8891 is separate and carries WebRTC media; it is not proxied through the auth-server and must have its own firewall rule.

### Slow first load / blank screen after login

The control UI now paints an instant dark **loading splash** (branded, with a spinner) on HTML parse, so a slow load shows the splash rather than a white screen. The app is served **gzip-compressed** (the JS bundle is ~190 KB raw → ~58 KB on the wire) with **immutable caching** for hashed assets, so repeat loads skip the bundle download entirely. The video stream is **deferred** until after the control UI is interactive, so it never blocks first paint.

If loads still feel slow, measure where the time goes — the client POSTs first-paint/load timing to the auth-server on every page load:

```bash
docker logs pocket-teleop-auth-server-1 | grep perf | tail -1
# [perf] <iso> {"readyMs":1937,"responseEndMs":1889,"bundleKB":57,"bundleTransferMs":0, ...}
```

- `responseEndMs` — HTML document fully received.
- `bundleKB` — JS bundle wire size (should be ~57; if ~186, gzip is not reaching the client).
- `bundleTransferMs` — bundle network time (`0` means served from cache).
- `readyMs` — first paint after React mounts (≈ "controls visible").

If `readyMs` is high but `bundleTransferMs` is `0` and `bundleKB` is ~57, the remaining time is the HTML round-trip — that is **link latency** (slow / variable Wi-Fi AP, mobile-radio wake-up), not the app. Improve the robot's Wi-Fi link or AP placement.

### Web UI stuck connecting — `[ETIMEDOUT]` in auth-server logs

The auth-server runs in host network mode and connects to the teleop-server at `localhost:9091` by default. If the teleop-server is reachable at a different address (e.g. running outside Docker on a different machine), override it in `.env`:

```bash
# .env — set to the teleop-server's address
TELEOP_SERVER_URL=http://192.168.1.50:9091
```

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

All suites run entirely inside Docker — no local Node.js or Python installation needed.

```bash
# Web-client unit + component tests (363 pass; live integration + adversarial suites excluded)
docker compose --profile test run --rm webclient-test

# Auth-server tests (49 pass)
docker compose --profile test run --rm auth-server-test

# video-bridge Python tests (19 tests)
docker compose --profile test run --rm video-bridge-test
```

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
