# web-client — React + Vite mission UI

## Purpose

React 18 + Vite 5 SPA (Mission Control), served by nginx from the Vite `dist/` build. A `matchMedia` switch picks phone (`MissionControl`) vs tablet (`MissionTablet`) at 700 px (Fold 6). React UI sits on top of **framework-free** transport/logic TS modules. A `vite-plugin-pwa` service worker precaches the app shell only.

```
Phone browser  http://<robot-ip>:8080
    │  WebSocket /ws (auth-server proxies → teleop:9091); /video WHEP; UDP media direct
    ▼
nginx (internal): serves dist/ — gzip + immutable /assets cache + SPA fallback to index.html
```

Browser-side layers:

```
React UI
  main.tsx → App.tsx (matchMedia phone⇄tablet @700px)
    ├── views/MissionControl.tsx     ← phone (portrait + landscape)
    ├── views/MissionTablet.tsx      ← tablet grid
    ├── components/shared.tsx        ← HUD primitives: Joystick, JoystickZone, Crosshair,
    │                                   MiniMap, Compass(Tape), VelBars, Readout, SignalBars,
    │                                   VideoSignalOverlay, CONNECTION_LABELS, ConnectionState
    ├── components/SettingsDrawer.tsx   ← slide-in drawer (Gamepad/Video/Robot)
    ├── components/CollapsibleRail.tsx  ← slide-out rail bookmark
    ├── components/SpeedStepper.tsx     ← −/+ per-axis speed-limit caps
    ├── components/SessionBanner.tsx    ← idle-timeout bottom toast
    └── hooks/
        ├── useTeleopBridge.ts  ← wraps TeleopClient (connectionState, retryCount, latencyMs,
        │                          odom, eStop/resetEstop, sendTwist, gamepadTwist, inputSource,
        │                          gamepadConnected, maxLinear/maxAngular, robot dims, battery,
        │                          networkQuality/networkStats — getNetworkStats() polled @1 Hz)
        ├── useWhepStream.ts    ← wraps WhepClient; lazy start (requestIdleCallback) + code-split;
        │                          calls client.resume() on visibilitychange/pageshow (foreground)
        └── useSessionStatus.ts ← poll /auth/session-status + throttled /auth/heartbeat + banner

Transport / logic (framework-free TS — no React imports):
  TeleopClient ← 20 Hz continuous publish + bounded zero-burst; keepalive + backoff reconnect;
                 maxMissedPongs zombie detector; 4001 close = terminal (no retry);
                 attaches + starts GamepadHandler in ctor (detection runs always, socket only gates send)
    ├── Connection      ← WebSocket lifecycle; ws?.close() guard on reconnect
    ├── GamepadHandler  ← rAF Gamepad polling (try/finally so one throw can't kill the loop); profile-aware
    │                     axes; rising-edge buttons; estop→LB; attach/detach bind window gamepadconnected/
    │                     disconnected (idempotent, SSR-safe); poll() owns connection state → onConnectionChange
    ├── GamepadProfiles ← built-in profiles + localStorage
    ├── KeyboardHandler ← WASD/arrow → twist; Space = latching E-STOP (ignored in editable fields)
    ├── TouchJoystick   ← floating touch joystick, normalised −1..1
    └── Protocol        ← message types + serializers; inbound Number.isFinite guards
  WhepClient   ← vanilla WHEP gather-then-offer; getStats@1Hz; backoff retry
  map_codec / map_render ← trinary-RLE decode + minimap raster (footprint, scan, pose)
```

## Ownership

Owns: `src/`, `test/`, `index.html`, `nginx.conf`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `Dockerfile.webclient` (base → builder `vite build` → runtime nginx), `public/`, `favicon.svg`.

| File | What it does |
|---|---|
| `nginx.conf` | `gzip on` + immutable `/assets` cache + SPA fallback; `/sw.js` no-cache |
| `index.html` | Vite entry shell — instant `#boot-splash` + `<div id="root">` |
| `protocol.ts` | Message types + serializers (twist, estop/estop_reset/estop_state, ping, odom); inbound parser with `Number.isFinite` guards |
| `connection.ts` | WebSocket open/close/send; fires callbacks |
| `teleop_client.ts` | Orchestrates modules; **single confluence point for all input sources** — `sendTwist(lx,ly,az,source)` arbitrates gamepad/keyboard/touch (see Local Contracts) before 20 Hz publish + zero-burst; builds + drives GamepadHandler **and** KeyboardHandler; input shaping + `setMaxSpeed` at send choke; cross-source E-STOP; reconnect; zombie detector; 4001 terminal; tracks last-20 RTT + 20-ping loss window → `getNetworkStats()`; `resume()` skips backoff / probe-pings on foreground; `onInputSource(source\|'idle')` fires on owner change |
| `network_quality.ts` | Pure `computeQuality(stats)→0–4` from RTT/jitter/loss component scores (min aggregation); non-finite/negative → worst |
| `network_readout.ts` | Pure quality→`{quality,tier}` (none/danger/warn/ok); component layer maps tier→palette (mirrors `battery_readout.ts`) |
| `input_shaping.ts` | `shapeAxis(v)` — deadzone 0.1 + cubic curve at the `sendTwist` choke |
| `gamepad_profiles.ts` / `gamepad_handler.ts` | Profiles + localStorage; rAF polling, profile-aware axes, rising-edge buttons, `estop`→LB; `attach`/`detach` window connect/disconnect events, detection independent of socket, `onConnectionChange` → bridge `gamepadConnected` → 🎮 GP chip |
| `keyboard_handler.ts` | WASD/arrow → twist, wired into TeleopClient at keyboard priority (start on connect, stop on disconnect); ignores keys while an editable field (input/textarea/select/contentEditable) holds focus. Does **not** handle Space — Space E-STOP lives in the views' keydown effect |
| `touch_joystick.ts` | `TouchJoystick` — floating touch joystick, jsdom-testable |
| `settings.ts` | `SettingsRouter` + namespace/video-url localStorage; `loadMaxSpeed`/`saveMaxSpeed` + clamp (lin 0.1–2.0 / ang 0.1–3.0) |
| `video_source.ts` | RTSP/UDP/SRT/MJPEG validate + `buildMtxSource` + apply (MediaMTX config API) |
| `whep_client.ts` | `WhepClient` — vanilla WHEP gather-then-offer; getStats@1Hz; backoff retry; `'disconnected'` 2 s grace; fps-stall watchdog (framesDecoded flat 3 polls → rebuild); `resume()` rebuilds PC on foreground |
| `map_codec.ts` / `map_render.ts` | Trinary-RLE decode; minimap raster incl. `footprintScreenRect` (length=x→vertical, width=y→horizontal, 14 px zoom gate); scan capture-pose world overlay (`scanToScreenPoints` fuses capture+current pose, `worldToScreenPoint`, `selectScanCapturePose` frame-match fallback) |
| `sw_register.ts` | Prod-only injectable SW registration wrapper |
| `perf_beacon.ts` | Navigation/Paint/resource timing → `POST /perf` |

## Local Contracts

- **Transport/logic modules stay framework-free** — no React imports in `teleop_client.ts`, `connection.ts`, `protocol.ts`, the handlers, `whep_client.ts`, `map_*`. React touches them only through `hooks/`.
- **Input arbitration lives only at `TeleopClient.sendTwist` (single confluence point)** — gamepad, keyboard, and touch all call `sendTwist(lx,ly,az,source)`; never add a second arbitration site. Model: **the active source owns control; priority only breaks simultaneity.** Priority gamepad(3) > keyboard(2) > touch(1); a source is "active" if it sent *accepted* input within `ACTIVE_WINDOW_MS` (400 ms). Non-zero input acquires when the owner is idle/none, continues when it's the same source, seizes when priority ≥ the owner, else is **rejected** (no send, no `repeatTwist`, no `onTwist`). A zero (release) is honored **only from the owner** — it frees ownership; a lower source's zero must not stop a higher source. This is deliberately **not** strict-static priority: a continuously-zeroing owner (centered gamepad stick) releases every frame, so an idle high-priority pad never locks out touch. `onTwist`/`onInputSource` only ever report the *accepted* source — the HUD shows true control. Reset ownership on connect/reconnect. Rationale: [deviations.md](../memory/agent-guides/deviations.md).
- **The browser tab holds the live connections, not the server** — the `/ws` WebSocket and the WHEP `RTCPeerConnection` both live in the page; a backgrounded tab gets timers throttled / page suspended, so both degrade. `useTeleopBridge` + `useWhepStream` each listen for `visibilitychange`→visible and bfcache `pageshow` and call the client's `resume()` to recover fast instead of waiting out backoff. Both hooks duplicate the ~8-line listener block — intentional, not worth a shared hook.
- **Live stream never touches the service worker** — `/ws`, `/video`, `/whep`, `/auth`, `/perf`, `/mediamtx-api` are in `navigateFallbackDenylist` and match no runtimeCaching. SW is `autoUpdate`; nginx serves `/sw.js` no-cache; `sw_register.ts` is prod-only + injectable. WS upgrades aren't fetch events, WHEP is POST, video is WebRTC/UDP — none reach the SW.
- **`Protocol` inbound parser guards every numeric field with `Number.isFinite`** — non-finite telemetry must not reach render. Treat missing status fields as `""` / `0` (footprint dims) for back-compat.
- **`4001` WS close = terminal** (idle-timeout kill) — no retry; bridge redirects to login.
- **E-STOP product decisions (do NOT re-ask)**: stays tappable on top while the drawer is open; label `■ STOP` → `■ RESET` when engaged.
- **SettingsDrawer server-backed config** (GET/PUT `/auth/robot-config`): split across two sections, each with its own Save issuing a **partial PUT** (merged server-side) → restart-required toast + per-field errors (red, P.danger). **Video section** owns `VIDEO_TOPIC`/`VIDEO_TOPIC_TYPE` (grouped under the runtime "Source" mode/URL/Apply picker, since the topic is only used when Source = ROS2). **Robot section** owns identity + footprint (ROBOT_TYPE, ROBOT_NAME, ROBOT_NAMESPACE, ROBOT_LENGTH_M, ROBOT_WIDTH_M). Replaces deprecated namespace localStorage. Drawer height uses `dvh` (mobile-scrollable).
- Footprint: minimap draws a to-scale dashed outline when both dims > 0 and the long axis renders ≥ 14 px; axis-aligned in map mode, heading-rotated in odom fallback.

### Inbound message types consumed

`status` (robot_type/name/namespace/length/width), `pong`, `error`, `estop_state`, `map` (trinary-RLE occupancy grid), `pose` (`map`→`base_link`, odom fallback), `scan` (≤120 pts, 0 = invalid, optional `pose` with capture frame/x/y/heading). Outbound: `twist` (`linear_x`/`linear_y`/`angular_z`, clamped `[-1,1]`), `ping`, `estop`, `estop_reset`.

## Work Guidance

- Testing trophy: heavy integration (RTL + jsdom for components/hooks via `test/setup.ts`), light unit; one `*.test.ts(x)` per module; `*.adversarial.test.*` = hardening. `integration.test.ts` self-skips (`describe.skipIf`) without a live server. TDD order mandatory.
- **`--build` is REQUIRED on every test run after edits** — `docker compose run` reuses a stale baked image otherwise.

## Verification

```bash
# Full suite
docker compose -p pocket-teleop run --rm --no-deps --build webclient-test npm test
# Targeted iteration (faster — pass explicit files)
docker compose -p pocket-teleop run --rm --no-deps --build webclient-test \
  npx vitest run test/MissionControl.test.tsx test/shared.test.tsx
# Type-check (some pre-existing test-file tsc errors are not a build gate; build = vite)
docker compose -p pocket-teleop run --rm --no-deps webclient-test npx tsc --noEmit
```
Served behind auth-server on 8080 — nginx + teleop (9091) are not host-exposed. Baseline: webclient count in the root AGENTS.md "Test baseline" (authoritative).

## Child DOX Index

No children. Leaf boundary. For the proxy/server/video sides of the protocol: root [AGENTS.md](../AGENTS.md) + [repository-structure.md](../memory/agent-guides/repository-structure.md).
