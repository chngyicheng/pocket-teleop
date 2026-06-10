# Troubleshooting

Common problems and how to resolve them. For setup and usage, see the [README](README.md).

---

## Contents

- [Gamepad](#gamepad)
  - [Gamepad not detected in Brave](#gamepad-not-detected-in-brave)
  - [Robot only moves while the stick is wiggled](#robot-only-moves-while-the-stick-is-wiggled)
  - [Controls feel reversed or mapped to the wrong stick](#controls-feel-reversed-or-mapped-to-the-wrong-stick)
- [Minimap](#minimap)
  - [Minimap shows "NO MAP"](#minimap-shows-no-map)
  - [Robot position doesn't match the real world](#robot-position-doesnt-match-the-real-world)
- [Video](#video)
  - [Video connects but never shows frames (10 s timeout)](#video-connects-but-never-shows-frames-10-s-timeout)
- [Connection](#connection)
  - [Web UI stuck connecting — `[ETIMEDOUT]`](#web-ui-stuck-connecting--etimedout)
  - [Slow first load / blank screen after login](#slow-first-load--blank-screen-after-login)
- [ROS2](#ros2)
  - [Inspecting ROS2 topics from another machine (multicast broken)](#inspecting-ros2-topics-from-another-machine-multicast-broken)

---

## Gamepad

### Gamepad not detected in Brave

**Symptom:** the gamepad works in Chrome but reads nothing in Brave — the on-screen joysticks don't follow the stick and the published velocity stays at zero.

**Cause:** Brave's **Block Fingerprinting** shield farbles or blocks the Gamepad API (`navigator.getGamepads()`) as an anti-fingerprinting measure. This is intentional and there is no application-side workaround.

**Fix:** open the Brave **Shields** panel (lion icon in the address bar) on the teleop page → set **Fingerprinting** to **Standard**, or turn **Block fingerprinting** off for the site → reload. Alternatively, use Chrome.

### Robot only moves while the stick is wiggled

**Symptom:** holding the stick at a fixed deflection publishes once and then drops to zero; motion only continues while the stick is actively moving.

**Cause:** the browser only refreshes `navigator.getGamepads()` snapshots in sync with the `requestAnimationFrame` / compositor loop. Polling off that loop returns a stale (neutral) reading for a *held* stick, so only stick *movement* registers.

**Fix:** the client polls the gamepad inside a `requestAnimationFrame` loop, so a held stick reads fresh and republishes continuously at ~20 Hz. If you still see drop-outs while held, confirm the command rate reaches the robot:

```bash
# Hold the stick steady (do not wiggle) and watch the rate:
docker compose -p pocket-teleop exec teleop-server \
  bash -lc "source /opt/ros/humble/setup.bash && ros2 topic hz /cmd_vel"
```

- Steady **~20 Hz** → the client and server are fine. If the robot still stops, its base controller's `cmd_vel_timeout` is shorter than expected — raise it on the robot.
- Drops to ~0 unless you wiggle → the browser isn't republishing; check that you are on a `requestAnimationFrame`-driven build and that the tab is foregrounded.

> The on-screen **VELOCITY** bars and the **V / ω** readout reflect the active input source, and show the *published* `cmd_vel` (shaped × the speed-limit cap) — use them to confirm what is actually being sent.

### Controls feel reversed or mapped to the wrong stick

The default profile maps **forward/back + rotate to the left stick** and **strafe to the right stick**, with axis inversions chosen for a standard controller. If a direction is reversed on your hardware, open DevTools → Console, look for the `Gamepad detected:` log line to confirm the profile, then flip the relevant `invert` flag (or remap the axis) for that profile in `web-client/src/gamepad_profiles.ts`. E-STOP is mapped to the left bumper (button 4); if it mis-fires, verify the button index for your controller.

---

## Minimap

### Minimap shows "NO MAP"

**Symptom:** the minimap panel displays a grid but no occupancy or robot position, even though the robot is moving.

**Diagnosis:**

1. **Check SLAM is running:**
   ```bash
   ros2 topic list | grep map
   ros2 topic echo /map --qos-durability transient_local --qos-reliability reliable --once
   ```
   If the `map` topic is not listed or the echo times out, SLAM is not running or not publishing. The minimap will fall back to odometry (grid view only).

2. **Check topic name matches `.env`:**
   If your SLAM publishes to a different topic (e.g. `/nav2/map`), set it in `.env`:
   ```bash
   MAP_TOPIC=/nav2/map
   ```
   Then restart the teleop-server:
   ```bash
   docker compose up -d teleop-server
   ```

3. **Check tf2 transform chain:**
   A running SLAM must publish the `map→odom` transform. Check:
   ```bash
   ros2 run tf2_ros tf2_echo map base_link
   ```
   If it fails, SLAM is publishing the map topic but not the transform. Consult your SLAM documentation (nav2, cartographer, etc.) to enable the `map→base_link` chain.

4. **Check `ROS_DOMAIN_ID`:**
   If the teleop-server and SLAM are on different domain IDs (default 0), they won't see each other. Ensure both set the same domain:
   ```bash
   # In the teleop docker-compose or robot's ROS2 startup:
   ROS_DOMAIN_ID=0
   ```

### Robot position doesn't match the real world

**Symptom:** the minimap shows the occupancy grid and robot, but the robot's displayed position drifts away from the real walls or the orientation is 180° off.

**Cause:** tf2 frame convention or SLAM localization issue (not specific to pocket-teleop).

**Diagnosis:**

1. Check the displayed frame IDs match your robot:
   ```bash
   ros2 run tf2_ros tf2_echo map base_link
   # Look at the frame header and verify they are correct
   ```

2. If you're using a non-standard frame setup, override the defaults in `.env`:
   ```bash
   MAP_FRAME=map
   ODOM_FRAME=odom
   BASE_FRAME=base_link
   ```

3. If position drifts over time, SLAM may need tuning (loop closure, motion model, sensor parameters) — this is independent of pocket-teleop. Use RViz on a desktop to visualize the full transform chain and odometry / scan quality.

---

## Video

### Video connects but never shows frames (10 s timeout)

**Symptom:** WHEP signaling succeeds (auth-server logs show `/video` proxy requests completing) but the video panel stays on the placeholder, and mediamtx logs show the session closing after ~10 s with `deadline exceeded while waiting connection`.

**Cause:** mediamtx runs in `network_mode: host` and binds the WebRTC ICE UDP listener to **port 8891**. The mobile browser sends STUN packets directly to that port. If the host firewall (ufw or similar) drops inbound UDP 8891, the packets never reach mediamtx, which times out and closes the session.

**Fix:** open UDP 8891 on the robot host.

```bash
# Allow WebRTC media from the phone's subnet (recommended):
sudo ufw allow from 192.168.10.0/24 to any port 8891 proto udp

# Or, allow from any source:
sudo ufw allow 8891/udp
```

Port 8080 (auth-server signaling) is TCP and usually already allowed. Port 8891 carries WebRTC media, is **not** proxied through the auth-server, and needs its own rule.

---

## Connection

### Web UI stuck connecting — `[ETIMEDOUT]`

The auth-server runs in host network mode and connects to the teleop-server at `localhost:9091` by default. If the teleop-server is reachable at a different address (e.g. running outside Docker on another machine), set it in `.env`:

```bash
TELEOP_SERVER_URL=http://192.168.1.50:9091
```

### Slow first load / blank screen after login

The control UI paints an instant dark **loading splash** on HTML parse, is served **gzip-compressed** (JS bundle ~190 KB raw → ~58 KB on the wire) with **immutable caching** for hashed assets, and **defers** the video stream until the UI is interactive — so a slow load shows the splash, not a white screen, and repeat loads skip the bundle download.

To measure where the time goes, the client POSTs first-paint/load timing to the auth-server on every load:

```bash
docker logs pocket-teleop-auth-server-1 | grep perf | tail -1
# [perf] <iso> {"readyMs":1937,"responseEndMs":1889,"bundleKB":57,"bundleTransferMs":0, ...}
```

- `responseEndMs` — HTML document fully received.
- `bundleKB` — JS bundle wire size (should be ~57; ~186 means gzip is not reaching the client).
- `bundleTransferMs` — bundle network time (`0` = served from cache).
- `readyMs` — first paint after React mounts (≈ "controls visible").

If `readyMs` is high but `bundleTransferMs` is `0` and `bundleKB` is ~57, the remaining time is the HTML round-trip — i.e. **link latency** (slow/variable Wi-Fi, mobile-radio wake-up), not the app.

---

## ROS2

### Inspecting ROS2 topics from another machine (multicast broken)

If `ros2 multicast receive` fails with `[Errno 19] No such device`, multicast is disabled on your machine or network (common with VMs and some Wi-Fi setups). Use the unicast-only observer profile:

```bash
export TELEOP_HOST_IP=192.168.1.50           # robot's LAN IP
export ROS_NETWORK_INTERFACE=192.168.1.51    # your machine's LAN IP
export ROS_DOMAIN_ID=0                       # must match the robot's domain
export FASTRTPS_DEFAULT_PROFILES_FILE=$(pwd)/server/fastrtps_profiles_observer.xml

ros2 topic list
```

This profile (`server/fastrtps_profiles_observer.xml`) disables multicast and sends unicast DDS discovery directly to the robot.
