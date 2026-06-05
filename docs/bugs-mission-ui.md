# Mission UI — open bug log

> Logged 2026-06-04 from live testing on hardware (phone + tablet, real robot, WebRTC video working after the ufw fix). For the next agent. Nothing here is fixed yet — these are reproductions + code locations + hypotheses, not solutions.

All line numbers are against `web-client/src/` at commit `d4d19a9`.

---

## BUG 1 — Robot does not stop when joystick is released (SAFETY) ✅ FIXED

> **Fixed on `feat/control-safety-fixes`.** `TeleopClient` now runs a 20 Hz continuous publisher (`PUBLISH_INTERVAL_MS = 50`, `STOP_REPEATS = 10`): while a non-zero command is held it republishes it every tick (a dropped/reordered packet self-corrects); on release (`sendTwist(0,0,0)`) it sends a bounded burst of `STOP_REPEATS` explicit zero-twists over ~500 ms then goes silent so keepalive/latency still work. Publisher is silent with no input (idle-reconnect/keepalive behavior unchanged) and resets on every (re)connect so a blip never resumes stale motion. The stale-closure cross-axis read (hypothesis 2) is gone: both views hold live axes in an `axesRef` and always send the full current intent, so releasing one joystick zeroes only its own axes. Tests: `web-client/test/teleop_client_continuous_publish.test.ts` + cross-axis guard in `MissionControl.test.tsx`. Hypothesis 3 (robot-side latching) is out of scope for the web client; the bounded zero burst + server watchdog cover it.

**Symptom:** After letting go of a joystick, the robot keeps moving. Either velocity is still being published, or the robot never receives a stop.

**What the code does today**
- On pointer-up the shared `Joystick` fires `onEnd` (`components/shared.tsx:214`).
- The view's end handler sends a single zero on the released axis, e.g. `views/MissionControl.tsx:92` `handleDriveEnd` → `bridge.sendTwist(0, ly, 0)`; STRAFE end → `sendTwist(lx, 0, az)` (`:104`). Same in `views/MissionTablet.tsx:163` / `:179`.
- `TeleopClient.sendTwist` (`teleop_client.ts:103`) sends **one** WebSocket message and returns. There is **no periodic/continuous publisher** and no client-side deadman.

**Hypotheses (investigate in order)**
1. **One-shot zero is fragile.** Real ROS teleop publishes `cmd_vel` continuously (e.g. 10–20 Hz) and lets a single dropped packet be corrected by the next. Here the stop is a single message — if it is dropped, reordered, or the robot's controller latches the last non-zero command, the robot keeps rolling. **Recommended fix:** publish the current command on a fixed-rate timer (e.g. 20 Hz) and send explicit zero on release; OR add a server-side watchdog that zeroes `cmd_vel` if no twist arrives within N ms.
2. **Stale-closure cross-axis value.** End handlers read the *other* axis from a render-closure (`ly` in `handleDriveEnd`, `lx`/`az` in `handleStrafeEnd`). Because `setLx/setLy/setAz` are async React state, the value captured can lag, so the "stop" message may carry a stale non-zero component. Worth confirming whether a release ever emits a non-zero twist. Consider using a ref for the live axes instead of state, or always sending a full `(0,0,0)` on any release.
3. **Server/robot side.** Check whether `teleop-server` republishes or whether the robot's base controller latches the last `cmd_vel`. If it latches, the single zero races with nothing and may be ignored.

**Files:** `views/MissionControl.tsx:85-107`, `views/MissionTablet.tsx:160-185`, `components/shared.tsx:206-215`, `teleop_client.ts:103-107`.

---

## BUG 2 — E-STOP button renders on top of the Settings drawer 🟠 PARTIAL

> **Joysticks part fixed on `feat/control-safety-fixes`.** The drawer (`z-index:9`) already paints above the touch joysticks (phone joysticks are in-flow `auto`; tablet `z-index:5`), but they stayed *interactive* while it was open — and the left joystick is never covered by the 320px right-side panel. Fix: `App` passes `controlsDisabled={drawerOpen}` into both views; the joystick wrappers become `pointerEvents:'none'` while the drawer is open, so neither joystick can be grabbed. The zones (hints) stay rendered one layer below the drawer. Tests: `controlsDisabled` toggling in `MissionControl.test.tsx`/`MissionTablet.test.tsx` + an App-level guard that opening the drawer disables the joysticks.
>
> **Still open — the E-STOP button itself.** It keeps `zIndex:10` (above the drawer) and remains tappable while the drawer is open. Left intentionally for now: a safety control arguably *should* stay reachable. Confirm product-side whether E-STOP should be covered/disabled by the drawer or stay on top; if it stays it must be visually clean over the panel.

**Symptom:** Opening Settings (slides in from the right) does not cover the E-STOP button; E-STOP paints over the drawer.

**Cause (likely)**
- `SettingsDrawer` is `position: fixed` and documented at `z-index ≤ 9` (`components/SettingsDrawer.tsx:4-5`).
- E-STOP buttons set `zIndex: 10` (`views/MissionControl.tsx:226`, `views/MissionTablet.tsx:302`). They sit above the drawer.
- Note: `z-index` only applies to positioned elements — confirm the E-STOP (or its header container) is positioned, and which stacking context each lives in.

**Fix direction:** make the drawer's stacking context strictly above the E-STOP (raise drawer z-index / render via portal at top level), and/or hide-or-disable E-STOP while the drawer is open. Decide product-side whether E-STOP should remain tappable over the drawer (if so it must at least be visually on top and not visually broken).

---

## BUG 3 — E-STOP label inconsistent + button overflows the screen on tablet ✅ FIXED

> **Fixed on `feat/control-safety-fixes`.** Symptom A: `MissionTablet`'s E-STOP label is unified to `■ STOP` (matches `MissionControl`); the engaged-state label stays `■ RESET`. Symptom B: the tablet top bar is now resilient on one fixed-height line — the robot-name label is the sole shrink target (`flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`) so it truncates first, the E-STOP button is pinned `flexShrink:0` so it can never be squeezed off, and the bar carries `overflow:hidden` as a safety net. The readouts / connection chip keep their min-content room. Keeping a single 44px row preserves the absolutely-positioned `top:44` engaged banner. Tests: 3 added to `test/MissionTablet.test.tsx` (label unified, E-STOP `flexShrink:0`, name truncation + bar overflow); the two existing button queries moved from `/E-STOP/i` to `/STOP/i`.

**Symptom A (label):** Portrait shows `■ STOP`; tablet and landscape show `■ E-STOP`.
- `views/MissionControl.tsx:229` renders `■ STOP` (used for phone portrait *and* landscape).
- `views/MissionTablet.tsx:305` renders `■ E-STOP`.
- Decide on one label and apply everywhere.

**Symptom B (overflow):** On tablet the E-STOP bleeds off the right edge — top-bar runs out of horizontal room.
- Tablet top bar packs UP / BAT / SIG / LAT / connection pill / E-STOP in one row; E-STOP has `whiteSpace: 'nowrap'` (`views/MissionTablet.tsx:301`) and no shrink/wrap handling. At the 700–900 px tablet widths the row exceeds the viewport.
- **Fix direction:** make the top bar responsive (allow wrap, flex-shrink, smaller padding, or collapse some readouts) so E-STOP stays on-screen. Several of the crowding items (UP/BAT/SIG) are fake placeholders anyway — see BUG 5.

---

## BUG 4 — E-STOP may not actually stop the robot (SAFETY) ✅ FIXED

> **Fixed on `feat/control-safety-fixes`.** Now a real server-side latch. Client sends `{"type":"estop"}`; `TeleopServer` sets `estopped_`, publishes one zero `cmd_vel`, and **ignores all incoming twists until `{"type":"estop_reset"}`** — so a still-engaged joystick can no longer override the stop. Ping/keepalive still resets the watchdog so the connection survives while latched; the latch clears on a fresh connect. Server confirms with `{"type":"estop_state","engaged":bool}`; the UI shows an "⚠ E-STOP ENGAGED" banner and flips the button to a deliberate RESET (Space engages only, never resets). Client `sendTwist` is a no-op while latched. Tests: 4 new C++ (`EstopIgnoresSubsequentTwist`, `EstopResetResumesTwist`, `EstopRepliesWithEngagedState`, …) + webclient protocol/bridge/view tests.

**Symptom:** Tapping E-STOP several times did not stop a rolling robot.

**What the code does today**
- `bridge.eStop()` = `clientRef.current.sendTwist(0, 0, 0)` (`hooks/useTeleopBridge.ts:81-85`) — a **single zero twist**. There is no dedicated e-stop protocol message and no latching state.

**Why this is weak**
1. Same one-shot fragility as BUG 1 — one zero, no repeat, no watchdog.
2. It is **not a real e-stop**: it does not engage any latched safety state. The very next joystick `onMove` immediately publishes motion again and overrides the zero. If a joystick is still engaged (or BUG 1 is in play), the robot resumes instantly.
3. No feedback that the stop was received/applied.

**Fix direction:** add a real latching e-stop — a distinct protocol message that puts `teleop-server` (or the robot) into a stopped state that zeroes `cmd_vel` and **ignores incoming twists until explicitly reset**, with a UI affordance to arm/disarm and a visible engaged state. Pair with continuous publishing (BUG 1).

**Files:** `hooks/useTeleopBridge.ts:81-85`, `protocol.ts` (no estop message type today), `teleop_client.ts`, server command handler.

---

## BUG 5 — Several frontend telemetry fields are hardcoded / fake ✅ FIXED

> **Fixed on `feat/control-safety-fixes`.** `fps`/`res` are now real: `WhepClient` polls `RTCPeerConnection.getStats()` every 1 s once the track is live, reads the inbound-rtp video report's `framesPerSecond`/`frameWidth`/`frameHeight`, and emits them via a new `onStats` callback; `useWhepStream` exposes them as `stats: VideoStats | null`, and the tablet STREAM panel renders `stats.fps.toFixed(1)` / `${width}×${height}`, falling back to `—` until the first sample (so the old fake `30.1` / wrong `1280×720` are gone — live stream now reports its true 15 fps / 1920×1080). The fake `UP` / `BAT` / `SIG` placeholders (tablet top bar + phone telemetry stack) now render `—` instead of invented values, since there is no real uptime/battery/signal telemetry source yet (battery has a backlog plan). `src`/`codec` stay static (`WebRTC` / `H.264`) — true pipeline values, now commented as static-but-accurate. `LAT` was already real. Deviations recorded in `memory/agent-guides/deviations.md`. Tests: whep_client +3 (getStats polling), useWhepStream +2 (stats update/clear), MissionTablet +1 (fps/res from stats + `—` fallbacks), MissionControl +1 (BAT/SIG `—`). Webclient 300 pass.

The video FPS (and more) are not real. Audit of literal display values:

| View | Field | Line | Value shown | Real? |
|---|---|---|---|---|
| Tablet | `UP` (uptime) | `MissionTablet.tsx:261` | `03:24:18` | ❌ hardcoded |
| Tablet | `BAT` | `:262` | `78%` | ❌ hardcoded |
| Tablet | `SIG` | `:263` | `-58dBm` | ❌ hardcoded |
| Tablet | `src` | `:325` | `WebRTC` | ⚠️ static, but accurate |
| Tablet | `codec` | `:326` | `H.264` | ⚠️ static, but accurate |
| Tablet | `fps` | `:327` | `30.1` | ❌ **hardcoded — pipeline actually encodes 15 fps** |
| Tablet | `res` | `:328` | `1280×720` | ❌ **hardcoded AND wrong — stream is 1920×1080** |
| Phone | `BAT` | `MissionControl.tsx:302` | `78%` | ❌ hardcoded |
| Phone | `SIG` | `:303` | `-58 dBm` | ❌ hardcoded |

**Real (correctly wired) fields, for reference:** `LAT` (← `bridge.latencyMs`), `pos.x/pos.y/hdg`, `course`, `track`, `V` (`Math.hypot(lx, ly)`), `ω` (`az`) — all driven by `bridge.odom` / live axes.

**Notes**
- `fps`/`res` answer the user's question: the 30 fps was never real — it is the literal `30.1`. The encoder is configured `framerate=15/1, width=1920, height=1080` in `video-bridge/video_bridge.py`, so even `res` is wrong.
- `src`/`codec` are static but currently match reality; either wire them from the WHEP stats or leave with a comment.
- `BAT`/`SIG`/`UP` need real sources (battery telemetry plan + a signal/uptime source) or should be removed until backed by data. Battery has a backlog plan: `docs/superpowers/plans/2026-05-06-battery-telemetry-implementation.md`.
- **Recommended:** wire `fps`/`res` from `RTCPeerConnection.getStats()` (frameWidth/frameHeight/framesPerSecond on the inbound video track) so they reflect the actual decoded stream; mark anything still unbacked as a deviation in `memory/agent-guides/deviations.md`.

---

## Suggested priority for next agent

1. **BUG 1 + BUG 4 together** (safety — stop on release + real latching e-stop + continuous publish). These share a root: one-shot twists with no deadman.
2. **BUG 3 overflow** then **BUG 2 z-index** (E-STOP must be reliably visible and on-screen — safety-adjacent).
3. **BUG 5** (fix `fps`/`res` from real stats; decide on BAT/SIG/UP; record deviations).
4. **BUG 3 label** consistency (cosmetic).
