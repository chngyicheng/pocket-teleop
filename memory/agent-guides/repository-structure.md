# Repository Structure

> **Scope note:** Web client is now a **React 18 + Vite 5** SPA (Mission Control UI). The old vanilla-TS `index.html` UI is gone — `index.html` is just the Vite entry shell (boot splash + mount point). Authoritative test counts live in the **AGENTS.md** handover ("Test baseline") — per-file counts below rot quickly, so they are described by purpose, not number.

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
Phone browser  http://<robot-ip>:8080
    │
    ▼
┌─────────────────────────────────────────────┐
│  Docker container (nginx + nginx.conf)      │
│  Serves Vite build → dist/ (gzip + immutable│
│  /assets cache); SPA fallback to index.html │
└─────────────────────────────────────────────┘
    │  WebSocket ws://<robot-ip>:8080/ws (proxied by auth-server → teleop:9091)
    ▼
TeleopServer (server container)
```

Browser-side layers — **React 18 + Vite 5** UI on top of framework-free transport/logic modules:

```
React UI
  main.tsx            ← createRoot; mounts <App/>
  App.tsx             ← matchMedia layout switch (phone ⇄ tablet @700px = Fold 6)
    ├── views/MissionControl.tsx  ← phone (portrait + landscape branches)
    ├── views/MissionTablet.tsx   ← tablet grid
    ├── components/shared.tsx      ← HUD primitives: Joystick, JoystickZone, Crosshair,
    │                                MiniMap, Compass(Tape), VelBars, Readout,
    │                                VideoSignalOverlay, CONNECTION_LABELS, ConnectionState
    ├── components/SettingsDrawer.tsx  ← slide-in drawer (Gamepad/Video/Connection)
    ├── components/CollapsibleRail.tsx ← slide-out left/right rail bookmark
    └── hooks/
        ├── useTeleopBridge.ts  ← wraps TeleopClient; exposes connectionState, retryCount,
        │                          latencyMs, odom, eStop/resetEstop, sendTwist
        └── useWhepStream.ts    ← wraps WhepClient; lazy start (requestIdleCallback),
                                   code-splits WhepClient; exposes WhepState + stats

Transport / logic (framework-free TS, unchanged by the React migration):
  TeleopClient   ← public API; 20 Hz continuous publish + bounded zero-burst;
                   keepalive + exponential-backoff reconnect; maxMissedPongs zombie detector
    ├── Connection       ← WebSocket lifecycle; ws?.close() guard on reconnect
    ├── GamepadHandler   ← Gamepad API polling; profile-aware axis reads; rising-edge buttons
    ├── GamepadProfiles  ← built-in profiles + localStorage persistence
    ├── KeyboardHandler  ← WASD/arrow keys → twist; Space = latching E-STOP
    └── Protocol         ← message types + serializers (twist, estop, ping, odom); no I/O
  WhepClient     ← vanilla WHEP gather-then-offer; getStats@1Hz; exponential back-off retry
```

## Key files (client)

Build / shell:

| File | What it does |
|---|---|
| `web-client/Dockerfile.webclient` | Multi-stage: `base` (deps + tests), `builder` (`vite build`), `runtime` (nginx serving `dist/`) |
| `web-client/vite.config.ts` | Vite + `@vitejs/plugin-react`; Vitest config (jsdom, `setup.ts`) |
| `web-client/nginx.conf` | `gzip on` + immutable `/assets` cache + SPA fallback (bundle 186→57 KB; fixed first-paint) |
| `web-client/index.html` | Vite entry shell — instant `#boot-splash` + `<div id="root">` mount point |
| `web-client/tsconfig.json` | TypeScript strict mode |
| `web-client/package.json` | deps: `react`, `react-dom`. devDeps: `vite`, `vitest`, `@vitejs/plugin-react`, `@testing-library/{react,jest-dom,user-event}`, `jsdom`, `typescript` |

React UI (`src/`):

| File | What it does |
|---|---|
| `main.tsx` | `createRoot` → mounts `<App/>` |
| `App.tsx` | `matchMedia` layout switch: phone (`MissionControl`) ⇄ tablet (`MissionTablet`) at 700 px |
| `views/MissionControl.tsx` | Phone view — portrait + landscape branches; DRIVE/STRAFE `JoystickZone`s, telemetry, top-bar identity, E-STOP |
| `views/MissionTablet.tsx` | Tablet grid view — rails + joystick overlays + SVG reticle |
| `components/shared.tsx` | Pure HUD primitives (see layer diagram); `ConnectionState` type + `CONNECTION_LABELS` |
| `components/SettingsDrawer.tsx` | Slide-in settings drawer (Gamepad / Video / Connection pages) |
| `components/CollapsibleRail.tsx` | Slide-out left/right rail bookmark (panel z1, toggle z15 > joystick z5) |
| `components/SpeedStepper.tsx` | Mission-styled `−/+` stepper for the per-axis speed-limit caps (SPEED rail panel) |
| `hooks/useTeleopBridge.ts` | React wrapper over `TeleopClient`; exposes `TeleopBridge` (connectionState, retryCount, latencyMs, odom, eStop/resetEstop, sendTwist, `gamepadTwist`, `inputSource`, `maxLinear`/`maxAngular` + setters) |
| `hooks/useWhepStream.ts` | React wrapper over `WhepClient`; lazy start + code-split; `WhepState` + stats |
| `index.css` | Mission palette + base layout |
| `perf_beacon.ts` | Navigation/Paint/resource timing → `POST /perf` (auth-server logs it) |

Transport / logic (`src/`, framework-free):

| File | What it does |
|---|---|
| `protocol.ts` | Message types + serializers: twist, estop/estop_reset/estop_state, ping, odom; inbound parser with `Number.isFinite` guards |
| `connection.ts` | WebSocket open/close/send; fires callbacks |
| `teleop_client.ts` | Orchestrates modules; 20 Hz continuous publish + bounded zero-burst; input shaping + `setMaxSpeed` scale at the send choke; cross-source E-STOP toggle; reconnect loop; `maxMissedPongs` zombie-link detector |
| `input_shaping.ts` | `shapeAxis(v)` — deadzone 0.1 + cubic curve, applied to every twist at the `sendTwist` choke |
| `gamepad_profiles.ts` / `gamepad_handler.ts` | Built-in profiles + localStorage; **rAF-driven** Gamepad polling (fresh held-stick reads), profile-aware axes, rising-edge buttons + button-exists guard, `estop`→LB |
| `keyboard_handler.ts` | WASD/arrow → twist; Space = latching E-STOP (ignored while an editable field is focused) |
| `touch_joystick.ts` | `TouchJoystick` — floating touch joystick, normalised −1..1, jsdom-testable |
| `settings.ts` | `SettingsRouter` + namespace/video-url localStorage; `loadMaxSpeed`/`saveMaxSpeed` + clamp (lin 0.1–2.0 / ang 0.1–3.0) |
| `video_source.ts` | RTSP/UDP/SRT/MJPEG validate + `buildMtxSource` + apply (MediaMTX config API) |
| `whep_client.ts` | `WhepClient` — vanilla WHEP gather-then-offer; `getStats`@1Hz fps/res; back-off retry |

Tests (`test/`): one `*.test.ts(x)` per module above (RTL + jsdom for components/hooks; `setup.ts` polyfills). `integration.test.ts` needs a live server (self-skips via `describe.skipIf` otherwise). `*.adversarial.test.*` = hardening cases. **Authoritative counts: AGENTS.md "Test baseline".**

## Build and test commands (client)

```bash
# Full stack — requires .env with TELEOP_ADMIN_USER, TELEOP_ADMIN_PASSWORD, SESSION_SECRET
docker compose -p pocket-teleop --env-file ./.env up --build -d

# Web-client tests (Docker only — never bare npm, never ad-hoc node:22-alpine mounts).
# --no-deps skips the live server; --build is REQUIRED after editing source/tests,
# else `docker compose run` reuses a STALE baked image and your edits are ignored:
docker compose -p pocket-teleop run --rm --no-deps --build webclient-test npm test

# Iterate a targeted subset (faster) — pass explicit files to vitest:
docker compose -p pocket-teleop run --rm --no-deps --build webclient-test \
  npx vitest run test/MissionControl.test.tsx test/shared.test.tsx

# Type-check (note: some pre-existing test-file tsc errors are not a build gate; `build` = vite):
docker compose -p pocket-teleop run --rm --no-deps webclient-test npx tsc --noEmit

# Auth-server tests (self-contained)
docker compose -p pocket-teleop run --rm --no-deps --build auth-server-test npm test
```

**Worktree note:** `.env` is not copied into worktrees. Pass `--env-file /home/chngyicheng/pocket-teleop/.env` explicitly when running compose from a worktree.

## Port assignments (client)

| Port | Reserved for |
|---|---|
| 8080 | auth-server (host-mapped; the only exposed port; proxies nginx + `/ws` + `/video` + `/perf`) |

> nginx (internal, serves `dist/`) and teleop-server (9091) are **not** host-exposed — auth-server fronts everything on 8080.

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
| `web-client/src/whep_client.ts` | `WhepClient` class — vanilla WHEP gather-then-offer, `getStats`@1Hz, exponential back-off retry |
| `web-client/test/whep_client.test.ts` | vitest tests with a mock `RTCPeerConnection` (functional listener registry for `icegatheringstatechange`) + fetch |

## Build and test commands (video streaming)

```bash
# Run video-bridge Python tests (-p pin + --build to avoid a stale image)
docker compose -p pocket-teleop run --rm --no-deps --build video-bridge-test

# All suites
docker compose -p pocket-teleop run --rm --no-deps --build webclient-test npm test
docker compose -p pocket-teleop run --rm --no-deps --build auth-server-test npm test
docker compose -p pocket-teleop run --rm --no-deps --build video-bridge-test
```

> The `mediamtx-test` integration profile (auth `mediamtx_integration.test.ts`) needs the companion container — green only via full `--profile test` compose, otherwise red. Pre-existing; not a regression.

## Port assignments (video streaming)

| Port | Protocol | Used for |
|---|---|---|
| 8554 | TCP | MediaMTX RTSP ingest (video-bridge → mediamtx) — internal only |
| 8889 | HTTP | MediaMTX WHEP + config API — proxied via auth-server at `/video` |
| 8891 | UDP | WebRTC ICE media — direct browser ↔ robot; requires `sudo ufw allow 8891/udp` |

---

## Component layers (auth-server)

```
Phone browser  http://<robot-ip>:8080
    │
    ▼ port 8080 (only exposed port)
┌──────────────────────────────────────────┐
│  auth-server (Node/Express)              │
│  • session cookie validation             │
│  • proxies HTTP        → nginx (internal, serves dist/) │
│  • proxies /ws upgrade → teleop-server:9091 (session-authed, fail-closed) │
│  • proxies /video, /mediamtx-api → mediamtx:8889 │
│  • POST /perf → logs first-paint timing  │
└──────────────────────────────────────────┘
```

## Key files (auth-server)

| File | What it does |
|---|---|
| `auth-server/src/credentials.ts` | bcrypt hash/verify; init + read/save credentials.json (persisted in `auth-data` volume) |
| `auth-server/src/app.ts` | `createApp(AppOptions)` factory — testable Express wiring; `/perf` + `/auth-static` routes |
| `auth-server/src/index.ts` | Entry point — env validation, server start, WS upgrade wiring |
| `auth-server/src/proxy.ts` | HTTP proxy to webclient; `makeWsUpgradeHandler` runs express-session on `/ws` upgrade (fail-closed); `/video` + `/mediamtx-api` proxies |
| `auth-server/src/routes/auth.ts` | Login, logout, change-password (rejects new==current); `enforceDefaultCredentialChange` |
| `auth-server/views/login.html` / `change-password.html` | Login + force-change-on-first-login pages (themed; offline vendored woff2 via `/auth-static`) |
| `auth-server/test/auth.test.ts` / `auth_offline.test.ts` / `credentials.test.ts` | Route integration (supertest) + offline + credential unit tests |
| `auth-server/test/mediamtx_integration.test.ts` | Apply-button e2e — needs `mediamtx-test` container (full `--profile test` only) |
| `auth-server/Dockerfile.auth` | base → builder → runtime stages |