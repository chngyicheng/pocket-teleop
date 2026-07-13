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
        │                          odom, eStop/resetEstop, sendTwist, gamepadTwist, publishedTwist,
        │                          inputSource, gamepadConnected, maxLinear/maxAngular, robot dims,
        │                          battery, networkQuality/networkStats — getNetworkStats() polled @1 Hz)
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
| `protocol.ts` | Message types + serializers (twist, estop/estop_reset/estop_state, ping, odom, **nav_goal/nav_pause/nav_resume/nav_cancel**); inbound parser with `Number.isFinite` guards (incl. **nav_state** enum + **nav_path** `[x,y][]` shape/finite checks) |
| `connection.ts` | WebSocket open/close/send; fires callbacks |
| `teleop_client.ts` | Orchestrates modules; **single confluence point for all input sources** — `sendTwist(lx,ly,az,source)` arbitrates gamepad/keyboard/touch (see Local Contracts) then sets a target; the 20 Hz publisher slew-rate-limits `currentTwist`→`targetTwist` and sends (accel ~0.5 s / decel ~0.2 s, E-STOP instant-zero bypass; decel ramp replaced the old zero-burst, one terminal zero at rest); builds + drives GamepadHandler **and** KeyboardHandler; input shaping + `setMaxSpeed` at send choke; cross-source E-STOP; reconnect; zombie detector; 4001 terminal; tracks last-20 RTT + 20-ping loss window → `getNetworkStats()`; `resume()` skips backoff / probe-pings on foreground; `onInputSource(source\|'idle')` fires on owner change; `onPublish(lx,ly,az,source)` fires each tick with the actual ramped command |
| `network_quality.ts` | Pure `computeQuality(stats)→0–4` from RTT/jitter/loss component scores (min aggregation); non-finite/negative → worst |
| `network_readout.ts` | Pure quality→`{quality,tier}` (none/danger/warn/ok); component layer maps tier→palette (mirrors `battery_readout.ts`) |
| `geofence.ts` | Pure keep-out polygons (map frame): `pointInPolygon` (ray-cast), `distanceToBoundary`, `speedScale(p, fences, buffer 0.5 m)` → [0,1] (inside any fence = 0, linear ramp in the buffer, min across fences). Consumed by the publisher tick in `teleop_client.ts` — output-side scaling only, slew ramp untouched; guards teleop twist only, NOT nav2 autonomous motion (deviations) |
| `diagnostics.ts` | Pure `computeDiagnostics({wsState, videoState, ages})` → 7 leveled rows (WebSocket/Video/Odometry/Pose/Scan/Map/Battery; ok/warn/error/none by age thresholds). Local freshness only — server /diagnostics deferred (deviations) |
| `input_shaping.ts` | `shapeAxis(v)` — deadzone 0.1 + cubic curve at the `sendTwist` choke |
| `gamepad_profiles.ts` / `gamepad_handler.ts` | Profiles + localStorage; rAF polling, profile-aware axes, rising-edge buttons, `estop`→LB; `attach`/`detach` window connect/disconnect events, detection independent of socket, `onConnectionChange` → bridge `gamepadConnected` → 🎮 GP chip |
| `keyboard_handler.ts` | WASD/arrow → twist at default velocity **1.0** (a keypress = full configured speed; digital, no analog shaping headroom), wired into TeleopClient at keyboard priority (start on connect, stop on disconnect); ignores keys while an editable field (input/textarea/select/contentEditable) holds focus. Does **not** handle Space — Space E-STOP lives in the views' keydown effect |
| `touch_joystick.ts` | `TouchJoystick` — floating touch joystick, jsdom-testable |
| `settings.ts` | `SettingsRouter` + namespace/video-url localStorage; `loadMaxSpeed`/`saveMaxSpeed` + clamp (lin 0.1–2.0 / ang 0.1–3.0); `loadFences`/`saveFences` (geofence polygons, bad-JSON tolerant) |
| `video_source.ts` | RTSP/UDP/SRT/MJPEG validate + `buildMtxSource` + apply (MediaMTX config API) |
| `whep_client.ts` | `WhepClient` — vanilla WHEP gather-then-offer; getStats@1Hz; backoff retry; `'disconnected'` 2 s grace; fps-stall watchdog (framesDecoded flat 3 polls → rebuild); `resume()` rebuilds PC on foreground |
| `map_codec.ts` / `map_render.ts` | Trinary-RLE decode; minimap raster incl. `footprintScreenRect` (length=x→vertical, width=y→horizontal, 14 px zoom gate); scan capture-pose world overlay (`scanToScreenPoints` fuses capture+current pose, `worldToScreenPoint`, `selectScanCapturePose` frame-match fallback); `screenToWorldPoint` (inverse); waypoint heading helpers `pointerToWorldHeading` (RViz-style aim: world heading from the marker→finger screen vector in the base_link-fixed view, direction-only) + `worldHeadingToScreenDeg` (inverse, arrow render) |
| `MiniMap` (shared.tsx) | Minimap HUD component; internal `MiniMapView` (render/gesture/zoom) + thin `MiniMap` wrapper. `expandable` tap-to-expand + scrollwheel zoom — see the MiniMap contract below. Waypoint placement rejects non-free cells (`cellAtWorld` occupancy check → transient 'Blocked' hint). Expanded overlay hosts the fence editor (Edit Fence → tap vertices → Close Fence ≥3 saves via `onSaveFences`; Undo/Clear/Cancel); fences render as dashed red polygons in every map-mode instance. `onEditingChange` fires while waypoint/fence editing is active — views drop the raised joystick zones below the overlay so editor buttons stay tappable. |
| `perf_beacon.ts` | Navigation/Paint/resource timing → `POST /perf` |

## Local Contracts

- **Transport/logic modules stay framework-free** — no React imports in `teleop_client.ts`, `connection.ts`, `protocol.ts`, the handlers, `whep_client.ts`, `map_*`. React touches them only through `hooks/`.
- **Input arbitration lives only at `TeleopClient.sendTwist` (single confluence point)** — gamepad, keyboard, and touch all call `sendTwist(lx,ly,az,source)`; never add a second arbitration site. Model: **the active source owns control; priority only breaks simultaneity.** Priority gamepad(3) > keyboard(2) > touch(1); a source is "active" if it sent *accepted* input within `ACTIVE_WINDOW_MS` (400 ms). Non-zero input acquires when the owner is idle/none, continues when it's the same source, seizes when priority ≥ the owner, else is **rejected** (no target update, no `onTwist`). A zero (release) is honored **only from the owner** — it frees ownership; a lower source's zero must not stop a higher source. This is deliberately **not** strict-static priority: a continuously-zeroing owner (centered gamepad stick) releases every frame, so an idle high-priority pad never locks out touch. `onTwist`/`onInputSource` only ever report the *accepted* source — the HUD shows true control. Reset ownership on connect/reconnect. Rationale: [deviations.md](../memory/agent-guides/deviations.md).
- **The publisher slew-rate-limits and owns the send; sendTwist only sets a target.** The 20 Hz publisher ramps `currentTwist` toward `targetTwist` one bounded step per tick (accel ~0.5 s to full, decel ~0.2 s — sharper so stops stay prompt; per-axis; a reversal decelerates through zero before building reverse speed) so a large command never jerks the robot. The decel ramp replaced the old fixed zero-burst: it still emits exactly one terminal zero on reaching rest, then goes silent. **E-STOP bypasses the limiter** — `engageEstop` forces `current`+`target` to zero instantly. Accel/decel are named constants in `teleop_client.ts` (runtime/Settings tuning deferred). `onPublish(lx,ly,az,source)` fires each send with the actual ramped command → bridge `publishedTwist` → the VELOCITY bars + numeric V/ω show **real published cmd_vel for any source** (replaces the prior per-source heuristic; keyboard now reads out, and the ramp is visible). `gamepadTwist` (gamepad-only, from `onTwist`) still drives the on-screen joystick knob-follow, which is separate.
- **The browser tab holds the live connections, not the server** — the `/ws` WebSocket and the WHEP `RTCPeerConnection` both live in the page; a backgrounded tab gets timers throttled / page suspended, so both degrade. `useTeleopBridge` + `useWhepStream` each listen for `visibilitychange`→visible and bfcache `pageshow` and call the client's `resume()` to recover fast instead of waiting out backoff. Both hooks duplicate the ~8-line listener block — intentional, not worth a shared hook.
- **Live stream never touches the service worker** — `/ws`, `/video`, `/whep`, `/auth`, `/perf`, `/mediamtx-api` are in `navigateFallbackDenylist` and match no runtimeCaching. SW is `autoUpdate`; nginx serves `/sw.js` no-cache; vite-plugin-pwa auto-injects registration (`dist/registerSW.js`, no hand-rolled wrapper). WS upgrades aren't fetch events, WHEP is POST, video is WebRTC/UDP — none reach the SW.
- **`Protocol` inbound parser guards every numeric field with `Number.isFinite`** — non-finite telemetry must not reach render. Treat missing status fields as `""` / `0` (footprint dims) for back-compat.
- **`4001` WS close = terminal** (idle-timeout kill) — no retry; bridge redirects to login.
- **E-STOP product decisions (do NOT re-ask)**: stays tappable on top while the drawer is open; label `■ STOP` → `■ RESET` when engaged.
- **SettingsDrawer server-backed config** (GET/PUT `/auth/robot-config`): split across two sections, each with its own Save issuing a **partial PUT** (merged server-side) → restart-required toast + per-field errors (red, P.danger). **Video section** owns `VIDEO_TOPIC`/`VIDEO_TOPIC_TYPE` (grouped under the runtime "Source" mode/URL/Apply picker, since the topic is only used when Source = ROS2). **Robot section** owns identity + footprint + nav (ROBOT_TYPE, ROBOT_NAME, ROBOT_NAMESPACE, ROBOT_LENGTH_M, ROBOT_WIDTH_M, NAV_ACTION). Replaces deprecated namespace localStorage. Drawer height uses `dvh` (mobile-scrollable).
- Footprint: minimap draws a to-scale dashed outline when both dims > 0 and the long axis renders ≥ 14 px; axis-aligned in map mode, heading-rotated in odom fallback.
- **MiniMap `pannable`** (set on the expanded view): in map mode, **1-finger drag** and **2-finger drag** pan the view (`pan` screen-offset state), **pinch / wheel** zoom — Google-Maps style. `pan` shifts the canvas (map+scan) and every map/robot-anchored overlay (trail, footprint, robot arrow, nav-path, waypoint marker) by the same offset; the HUD grid + range rings stay screen-fixed. Pan resets to 0 when the map frame is lost. Heading is unaffected by pan (marker + finger move together). In waypoint mode 1-finger is placement, so panning there is 2-finger only. Collapsed view is not `pannable` (keeps tap-to-expand + pinch-zoom).
- **MiniMap `enableWaypoints`** (expanded overlay only): an `idle`+map-frame "Set Waypoint" gate enters placement mode — a tap/release on the map maps screen→world via `screenToWorldPoint` (pan-corrected) and drops a **ghost-robot marker** — the same arrow glyph as the live robot but hollow + faded in the **goal colour (palette `accent2` cyan `#4ec9d6`)** so it's never confused with the amber live robot (colour convention: amber = where I am, cyan = where I'm going; the `navPath` polyline is cyan too). Orientation is set by a **distinct hollow-ring grip at the arrow tip** (clearly not the solid robot/center dot) — dragging it aims **RViz-style** (`pointerToWorldHeading`: heading = direction from the marker toward the finger, distance-independent). "Send Waypoint" calls `onSendWaypoint(wx,wy,heading)` (→ bridge `sendNavGoal`). The control bar switches on `navState`: active → Pause/Stop, paused → Resume/Stop (→ `onNavPause`/`onNavResume`/`onNavCancel`). "Set" is disabled unless `mapPose.frame==='map'`. The nav2 global path (`navPath`) draws as a polyline on both collapsed + expanded maps. Backdrop/collapse always clears waypoint mode. Loupe magnifier deferred (ponytail).
- **MiniMap `expandable`**: tap (collapsed) opens a full-screen overlay `createPortal`-ed to `document.body` (must escape the CollapsibleRail's `transform`/`overflow:hidden` containing block), `position:fixed`, zIndex 200, bg forced `rgba(8,10,14,0.7)` so the video shows through. The overlay content has `paddingTop: TOP_CLEARANCE` (56) and the map is sized `max(160, min(vw-24, vh-56-84))` so it **scales to fit below the top bar / E-STOP — never under the STOP button**. **Close is the ✕ button anchored to the map card's own top-right corner** (inside the `position:relative` map wrapper, clear of the E-STOP) or the backdrop — tapping the expanded map pans/places, never dismisses (avoids accidental close). Collapsed-view tap-to-expand uses `tapStartRef` (1 pointer, <10 px, <400 ms), unconditional (works with no map); pinch + native non-passive wheel zoom gate on map mode; a 2-finger touch suppresses tap. Collapsed view uses `hidden` (`visibility:hidden`, footprint kept) while expanded. `onExpandedChange(expanded)` lifts state to the view (`mapExpanded`): while expanded it raises JoystickZones (zIndex 250) + E-STOP (zIndex 260, needs `position:relative`) above the overlay for drive-with-map-open, and landscape/tablet close both rails (`gridTemplateColumns` side cols → 0 = fullscreen) restoring prior state on collapse (`prevRailsRef`, keyed on `mapExpanded` only so it isn't clobbered; portrait has no rails → no-op). Portrait minimap is a standalone **top-right** square (`position:absolute right:8`, zIndex 12) hovering above the video — same size/translucency as the landscape/tablet corner overlay (no blur wrapper; the map's own `bg rgba(8,10,14,0.45)` shows video through). Its `top` is **measured** from the SPEED/VELOCITY HUD panel (`speedPanelRef` offsetTop+offsetHeight+6 via `useLayoutEffect`, re-measured on resize) so it sits just below the panel regardless of the panel's height.
- **Collapsed-rail corner minimap** (landscape phone + tablet): a second `MiniMap` (same bridge props, translucent `bg rgba(8,10,14,0.45)` so video shows through — the map raster is already alpha-aware, only walls are opaque) sits `position:absolute` top-right (`data-testid="corner-minimap"`, zIndex 12, above video). It **crossfades** with the right MAP rail — `opacity`/`scale` transition keyed on `rightOpen || mapExpanded` (hidden + `pointerEvents:none` while the rail is open **or the map is expanded**, fades in only when the rail is collapsed and not expanded) — so the map stays visible (and tap-expandable) when the rail is closed, and never peeks through the expanded overlay's translucent backdrop (expanding auto-closes the rails, which would otherwise fade it in). Portrait already shows its minimap full-time, so the corner overlay is landscape/tablet only.

### Inbound message types consumed

`status` (robot_type/name/namespace/length/width), `pong`, `error`, `estop_state`, `map` (trinary-RLE occupancy grid), `pose` (`map`→`base_link`, odom fallback), `scan` (≤120 pts, 0 = invalid, optional `pose` with capture frame/x/y/heading), **`nav_state`** (idle/active/paused/succeeded/failed on the wire; bridge maps terminal `succeeded`/`failed` → `navState: 'idle'` + transient `navNotice`, so `navState` stays 3-state and MiniMap controls are untouched), **`nav_path`** (`[x,y][]` map-frame plan → bridge `navPath`). Outbound: `twist` (`linear_x`/`linear_y`/`angular_z`, clamped `[-1,1]`), `ping`, `estop`, `estop_reset`, **`nav_goal`** (absolute world x/y/heading, **not** scaled; estop-gated — `sendNavGoal` returns `false` when blocked and the bridge raises a warn `navNotice`), **`nav_pause`/`nav_resume`/`nav_cancel`** (resume estop-gated; pause/cancel always send). Bridge exposes `navState`/`navPath`/`navNotice` (`{text, tone: ok|warn|error} | null`, 4 s auto-clear) + `sendNavGoal`/`sendNavPause`/`sendNavResume`/`sendNavCancel` — all four nav sends return `false` on a closed socket (bridge raises a 'Not connected' warn notice; estop-blocked goal/resume keep the E-STOP message). Bridge also exposes `latencyHistory` (rolling 60 RTTs → `LatencySparkline`, a bare SVG riding inside the LAT `Readout` pill via its trailing-children slot), `telemetryAges` (odom/pose/scan/map/battery ms, 1 Hz → Settings Diagnostics section), and `fences`/`saveFencesAndApply` (localStorage + `client.setFences`; `onGeofenceLimit` → warn notice). Views own a CAM/MAP header toggle — map mode hides the video element (stream kept) and fills the main viewport with a pannable `MiniMap`; disabled without map data, auto-reverts when the map drops. `HudToast` (shared.tsx) renders `navNotice` top-center in both views, just below the E-STOP-banner slot (`top` prop = header + banner height per view; zIndex 300, above the expanded map, pointer-events none) so it reads as a notification and never covers the expanded map's nav buttons; fades in/out via a 300 ms opacity transition (unmount lags clear by the fade so the out-animation plays).

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
