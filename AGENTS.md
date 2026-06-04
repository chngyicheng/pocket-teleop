# pocket-teleop — agent guide

> Progressive disclosure. Read what you need. Start at **Layer 1**, drill deeper only if stuck.

---

## Rules for changing this file

**`CLAUDE.md` is a symlink to `AGENTS.md`. Edit `AGENTS.md`. Never touch `CLAUDE.md` directly.**

**Code change ships with doc change in same commit.**

Handover section is what next agent reads first. Write for zero-context reader:

- **Task table** — mark ✅ done; promote ⬜ next to the heir; Notes name what got built or which tests now pass
- **Known deviations** — append one row per deviation to [deviations.md](memory/agent-guides/deviations.md) with a reason cold reviewer would accept
- **No "we" / "I" / "our"** — third person. Reads like docs, not chat.

Details: [version-control.md](memory/agent-guides/version-control.md).

---

## Handover state — continue from here

> **To next agent:** WebRTC video now flows end-to-end (phone browser sees the H264 stream). Several prior fixes were sitting uncommitted in the working tree; they are now committed together with the firewall diagnosis. **Root cause of the long-standing `deadline exceeded while waiting connection` ICE failure was the host firewall, not mediamtx config.** `ufw` runs with `DEFAULT_INPUT_POLICY="DROP"`; TCP 8080 (signaling) had an allow rule but UDP 8891 (mediamtx WebRTC ICE/UDP mux, host-network) did not, so the phone's STUN binding requests were dropped and ICE timed out every 10 s. Fix is a host-level firewall rule (not a repo change): `sudo ufw allow from 192.168.10.0/24 to any port 8891 proto udp`. The old "docker bridge candidate pollution" hypothesis was **disproven** by inspecting mediamtx's actual SDP answer — it advertises a single clean candidate `192.168.10.123 8891 typ host`. **Committed code fixes (all necessary, none wrong):** docker-compose `target: runtime` for video-bridge; `video_bridge.py` `sleep(inf)` crash → `while True: sleep(3600)` plus RTSP→RTMP transport switch (`flvmux ! rtmpsink`, since `rtspclientsink` is absent in the image); `mediamtx.yml` ICE pin `webrtcLocalUDPAddress: 192.168.10.123:8891` (this is what produces the clean single candidate — keep it); `auth-server` WHEP proxy `pathRewrite` `^/video` → `''`. Redundant `libgstrtspserver-1.0-0` apt dep removed from the video-bridge Dockerfile (unused after the RTMP switch). Full debug trail: `docs/debug-webrtc-ice-handover.md` (now marked RESOLVED) + README troubleshooting entry.
>
> **Next task:** Fix the live-testing bugs logged in `docs/bugs-mission-ui.md` (5 bugs, priority order inside). Two are SAFETY: robot does not stop on joystick release (BUG 1) and E-STOP does not actually latch/stop (BUG 4) — both rooted in one-shot twists with no continuous publish/deadman. Then E-STOP overflow + z-index over the Settings drawer (BUG 3/2), then hardcoded telemetry fields incl. fake `fps`/`res` (BUG 5). Note: the C++ server already has a watchdog + zero-on-disconnect, but it fires only on timeout/disconnect, not on a normal release while still connected. Otherwise the feature backlog ("Feature plan pool" below) remains available.

### Milestones done

| Milestone | Test count | Tag |
|---|---|---|
| Server (ROS2 WebSocket, command handler, teleop node) | — | `v0.1.0-server` |
| Web client v0.1.0 (protocol, connection, gamepad handler, teleop client, integration tests) | 10 | `v0.1.0-client` |
| Practical gaps (gamepad profiles, reconnection, calibration UI) | 43 | `v0.2.0` |
| Frontend UI (settings.ts, onTwist, responsive index.html rewrite) | 43 | `v0.3.0` |
| Touch joystick + UI polish (TouchJoystick module, namespace settings, gamepad switching, two-finger fix, UI tweaks) | 60 | `v0.4.0` |
| v0.5.0 (KeyboardHandler, TeleopClient retry + onPong, TouchJoystick hint, axis remap, input mode bar, last-seen pill) | 63 | `v0.5.0` |
| Video streaming (mediamtx, video-bridge, WhepClient, /video proxy, WebRTC panel) | 85 webclient / 31 auth / 19 video-bridge | `v0.6.0` |
| Video source picker (auth-server /mediamtx-api proxy, VideoSourcePicker module, settings UI) + 404 fix | 34 auth / 99 webclient / 19 video-bridge | `v0.7.0` |
| v0.8.0 control reliability (keyboard key-up instant trigger, e-stop button + space, calibration Ready phase) | 34 auth / 103 webclient / 19 video-bridge | `v0.8.0` |
| v0.9.0 feedback + polish (RTSP URL validation, WhepClient stream health badge, TeleopClient latency display) | 34 auth / 117 webclient / 19 video-bridge | `v0.9.0` |
| v0.10.0 robot telemetry (odom subscribe, broadcast, protocol odom type, TeleopClient onOdom, UI panel + compass) | 34 auth / 119 webclient / 19 video-bridge | `v0.10.0` |
| Apply button end-to-end verification (integration profile: mediamtx-test container, mediamtx-test-config.yml, 3 integration tests) | 3 integration | — |
| v0.11.0 video input source expansion (VideoSourceType, UDP/SRT/MJPEG validate/buildMtxSource/apply, onMjpegUrl callback, UI source type picker, MJPEG img direct) | 34 auth / 149 webclient / 19 video-bridge | — |
| v0.11.0 code review fixes (5 logic defects, 8 test additions, code smell cleanup) | 34 auth / 157 webclient / 19 video-bridge | — |
| Auth bugfixes (account page form fetch inline error, visibilitychange logout guard, Docker healthcheck fix) | 34 auth / 157 webclient / 19 video-bridge | — |
| location.replace fix + README update (form success redirect back-prevention, test counts, troubleshooting update, UDP/SRT/MJPEG docs) | 34 auth / 157 webclient / 19 video-bridge | — |
| start.sh launcher + mjpegImgEl typo fix + vitest file serialization (resolves idle-watchdog integration test timing failure) | 34 auth / 157 webclient / 19 video-bridge | — |
| Whole-repo code review + fixes (six Haiku scouts in parallel fixed 30 findings: mjpegImgEl leftover, 9091/9997/8554 LAN exposure closed, isfinite guards, test_command_handler +28 tests, TeleopClient exponential backoff, namespace logic corrected, video_bridge Lock, auth constant-time + atomic write + secure cookie + proxy timeout, etc.) | 34 auth / 157 webclient / 19 video-bridge / 40 C++ | — |
| Mission Control UI integration (worktree + 3 Haiku parallel + 1 Haiku integration + controller test fixes: `mission_hud.ts`, `mission_joystick.ts`, `mission_header.ts`, `mission_app.ts`, `index.html` rewrite; trophy TDD: 24 light unit + 13 heavy integration; E-STOP z-index 10 always-on-top, Space key wired) | 34 auth / 191 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | `feat/mission-ui` |
| Mission UI React port Phase 0 + Wave 1 (vanilla TS shell deleted, React 18 + Vite 5 + jsdom + RTL configured; 3 Haiku parallel wrote `shared.tsx` / `useTeleopBridge` + `useWhepStream` hooks / `SettingsDrawer.tsx`; controller added `setup.ts` polyfills — jest-dom/cleanup/MediaStream/PointerEvent/setPointerCapture/getBoundingClientRect, changed ctor to factory function form, fixed CSS attr selector camelCase→kebab, MiniMap `background` shorthand → `backgroundImage` longhand + `hexToRgba()`, removed `if (zone)` silent-pass guards) | 34 auth / 244/245 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | `feat/mission-ui-react` |
| Mission UI React port Wave 2 (2 Haiku parallel wrote `views/MissionControl.tsx` phone layout + `views/MissionTablet.tsx` tablet three-column grid; Joystick onMove axis-map DRIVE/STRAFE → `bridge.sendTwist`; E-STOP button z-index 10 + Space key wired; controller switched Space test from `fireEvent.keyDown` to `window.dispatchEvent` to preserve event instance) | 34 auth / 259/260 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | `feat/mission-ui-react` |
| Mission UI React port Wave 3 (1 Haiku wrote `App.tsx` matchMedia layout switch + `MissionControl`/`MissionTablet` conditional render + `SettingsDrawer` open/close, `main.tsx` React 18 createRoot, `index.css` Mission palette, `App.test.tsx` 9 crown jewel integration tests; updated `index.html` to add Google Fonts CDN + index.css link; changed hamburger `<div>` to `<button aria-label>` for RTL queries; browser smoke test passed) | 34 auth / 268/269 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | `feat/mission-ui-react` |
| Mission UI design-parity fixes (Task A+B in one commit — MissionTablet V/ω uses Math.hypot, HEADING track uses atan2, top-bar LAT from latencyMs; MissionControl drops `isLandscape` guards so telemetry/MiniMap/Compass render in portrait too. Task C in separate commit — top-bar UP/BAT/SIG static Readouts, STREAM four codec DataRows, left-rail ops footer with `cmd_vel @ 50hz` / `last pong 0.04s`. Controller fixed Haiku jsdom `innerText` → `textContent`, joystick diagonal push to make az non-zero, track sibling-span lookup, `/● live/` casing) | 34 auth / 264/265 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | `feat/mission-ui-react` |
| Mission UI smoke-test fixes (tap-highlight transparent, tablet breakpoint 900→700 for Samsung Fold 6 inner display, right-side SettingsDrawer, top-bar font harmonization with html text-size-adjust + tablet container fontSize 10 baseline, tablet joysticks `classic` → `zone` matching design `hold-zone` default. All five mission-UI branches merged + cleaned.) | 34 auth / 264/265 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | `feat/mission-ui-react` |
| WebRTC video end-to-end fix (committed prior uncommitted fixes: docker-compose video-bridge `target: runtime`, `video_bridge.py` `sleep(inf)` crash + RTSP→RTMP `flvmux ! rtmpsink` transport, `mediamtx.yml` ICE pin `webrtcLocalUDPAddress`, auth WHEP proxy `pathRewrite`. Root cause of `deadline exceeded` ICE timeout traced to host `ufw` DROP on UDP 8891, not docker-bridge candidate pollution — SDP answer inspection proved a single clean candidate; fix is `ufw allow … 8891/udp` at host level. Removed redundant `libgstrtspserver-1.0-0` apt dep. Phone browser confirmed live H264 stream.) | 34 auth / 264/265 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | — |

### Known deviations (still relevant)

See [deviations.md](memory/agent-guides/deviations.md). Append new ones there.

---

## Document index

| Need | Read |
|---|---|
| Run stack now | Layer 1 (below) |
| Build, test, docker commands | [repository-structure.md](memory/agent-guides/repository-structure.md) |
| Full deviation list | [deviations.md](memory/agent-guides/deviations.md) |
| Tech stack + dependencies | [techstack.md](memory/agent-guides/techstack.md) |
| Message protocol + data types | [data-schema.md](memory/agent-guides/data-schema.md) |
| Git workflow + doc-update rules | [version-control.md](memory/agent-guides/version-control.md) |
| TDD standard, guardrails, task guides | [project-skills.md](memory/agent-guides/project-skills.md) |
| Server implementation plan | `docs/superpowers/plans/2026-03-27-server-implementation.md` |
| Server design spec | `docs/superpowers/specs/2026-03-27-server-design.md` |
| Web client implementation plan | `docs/superpowers/plans/2026-03-28-client-implementation.md` |
| Web client design spec | `docs/superpowers/specs/2026-03-28-client-design.md` |
| Practical gaps implementation plan | `docs/superpowers/plans/2026-03-28-practical-gaps-implementation.md` |
| Practical gaps design spec | `docs/superpowers/specs/2026-03-28-practical-gaps-design.md` |
| Frontend UI implementation plan | `docs/superpowers/plans/2026-03-28-frontend-ui-implementation.md` |
| Frontend UI design spec | `docs/superpowers/specs/2026-03-28-frontend-ui-design.md` |
| Touch joystick implementation plan | `docs/superpowers/plans/2026-03-29-touch-joystick-implementation.md` |
| Touch joystick design spec | `docs/superpowers/specs/2026-03-28-touch-joystick-design.md` |
| **v0.5.0 implementation plan** | `docs/superpowers/plans/2026-03-30-v0.5.0-implementation.md` |
| v0.5.0 design spec | `docs/superpowers/specs/2026-03-30-v0.5.0-design.md` |
| **Auth server implementation plan** | `docs/superpowers/plans/2026-04-03-auth-server-implementation.md` |
| Auth server design spec | `docs/superpowers/specs/2026-04-03-auth-server-design.md` |
| **Video streaming implementation plan** | `docs/superpowers/plans/2026-04-09-video-streaming-implementation.md` |
| **Video source picker implementation plan** | `docs/superpowers/plans/2026-04-09-video-source-picker-implementation.md` |
| **v0.8.0 control reliability plan** | `docs/superpowers/plans/2026-04-11-v0.8.0-control-reliability.md` |
| **v0.9.0 feedback + polish plan** | `docs/superpowers/plans/2026-04-11-v0.9.0-feedback-polish.md` |
| **v0.10.0 robot telemetry plan** | `docs/superpowers/plans/2026-04-11-v0.10.0-robot-telemetry.md` |
| **Apply button end-to-end verification plan** | `docs/superpowers/plans/2026-04-17-apply-button-e2e-verification.md` |
| **Video input source expansion plan** | `docs/superpowers/plans/2026-04-17-video-input-sources.md` |
| **Auth bugfixes implementation plan** | `docs/superpowers/plans/2026-04-08-auth-bugfixes.md` |
| **Code review report (2026-05-27)** | `docs/2026-05-27-codebase-review.md` |
| **Code review fix plan (2026-05-27)** | `docs/superpowers/plans/2026-05-27-codebase-review-fixes.md` |
| **Mission Control UI integration plan (2026-05-28)** | `docs/superpowers/plans/2026-05-28-mission-ui-integration.md` |
| **Mission Control UI React migration plan (2026-05-28)** | `docs/superpowers/plans/2026-05-28-mission-ui-react-migration.md` |
| **Mission UI design parity fix plan (2026-05-30)** | `docs/superpowers/plans/2026-05-30-mission-ui-design-parity-fixes.md` |
| **Feature backlog (from 2026-05-06)** | See "Feature plan pool" below |

### Feature plan pool (waiting on user to pick priority)

**Safety + control**
- HTTPS/TLS: `docs/superpowers/plans/2026-05-06-https-tls-implementation.md`
- Login rate limit: `docs/superpowers/plans/2026-05-06-login-rate-limit-implementation.md`
- Session idle timeout: `docs/superpowers/plans/2026-05-06-session-timeout-implementation.md`
- Speed limit slider: `docs/superpowers/plans/2026-05-06-speed-limit-slider-implementation.md`
- Geofence: `docs/superpowers/plans/2026-05-06-geofence-implementation.md`
- Disconnect behavior: `docs/superpowers/plans/2026-05-06-disconnect-behavior-implementation.md`

**Observation**
- Map view: `docs/superpowers/plans/2026-05-06-map-view-implementation.md`
- Multi-camera: `docs/superpowers/plans/2026-05-06-multi-camera-implementation.md`
- Latency history graph: `docs/superpowers/plans/2026-05-06-latency-graph-implementation.md`
- Battery telemetry: `docs/superpowers/plans/2026-05-06-battery-telemetry-implementation.md`
- Diagnostics panel: `docs/superpowers/plans/2026-05-06-diagnostics-panel-implementation.md`
- Network quality: `docs/superpowers/plans/2026-05-06-network-quality-implementation.md`

**Operations**
- Session recording: `docs/superpowers/plans/2026-05-06-session-recording-implementation.md`
- Multi-observer: `docs/superpowers/plans/2026-05-06-multi-observer-implementation.md`
- Bidirectional audio: `docs/superpowers/plans/2026-05-06-audio-bidirectional-implementation.md`
- PTZ control: `docs/superpowers/plans/2026-05-06-ptz-control-implementation.md`
- Aux outputs: `docs/superpowers/plans/2026-05-06-aux-outputs-implementation.md`
- Action macros: `docs/superpowers/plans/2026-05-06-action-macros-implementation.md`
- OTA updates: `docs/superpowers/plans/2026-05-06-ota-updates-implementation.md`

**When to dig deeper:** Guide file can't answer → read the spec. Spec can't answer → read the plan. Don't read all three upfront.

---

## Layer 1 — what + how to run

**pocket-teleop** drives a ROS2 robot from a phone browser over WebSocket. Auth server handles login, proxies web client + WebSocket, publishes velocity commands to `/cmd_vel` via ROS2.

**ROS2 runs in Docker. Host needs only Docker + Docker Compose.**

```bash
# Copy .env.example to .env and fill all values first:
cp .env.example .env
# Edit .env: set TELEOP_ADMIN_USER, TELEOP_ADMIN_PASSWORD, SESSION_SECRET

docker compose up --build

# Stop
docker compose down
```

Web client (phone browser): `http://<robot-ip>:8080` — first visit shows login.

**Credentials:** One operator per robot. First run: log in with `.env` values — server forces password change immediately. New credentials persist in `auth-data` Docker volume across restarts and image rebuilds. Reset: `docker compose down -v` (deletes volume) then restart.

Build commands, test commands, file layout → [repository-structure.md](memory/agent-guides/repository-structure.md)

---

## Execution mode — subagent-driven development

**All implementation work uses the `superpowers:subagent-driven-development` skill.**

Controller dispatches new subagent per task. Each subagent:
1. Implements strictly to plan
2. Runs tests (Docker only — never bare `npm`)
3. Updates `AGENTS.md` handover table in same commit as code
4. Commits + reports

After each subagent finishes, controller runs two review rounds (spec compliance, then code quality) before marking task done and continuing.

See `docs/superpowers/plans/` for current implementation plans.

### Communication modes (caveman skill rules)

| Channel | Mode | Why |
|---|---|---|
| Controller ↔ user | `caveman full` (English) | Default interaction. Saves tokens, keeps technical accuracy. |
| Controller ↔ Haiku subagent | `caveman wenyan-ultra` (terse classical Chinese) | Haiku prompts also compressed. English technical terms stay English. |
| Code / commits / PRs / security warnings / irreversible-action confirmations | normal English | caveman skill's auto-clarity rule |

User says `normal` or `stop caveman` → revert this turn. Level holds until changed or session ends.

---

## Task completion protocol — enforced per task

**Every task, every time, no exceptions.**

1. **Run all tests** — zero failures before continuing. Fix failures first. Nothing moves to step 2 until the suite is green.
2. **Update all docs** — same commit as code:
   - `AGENTS.md` handover table: mark task ✅ done, promote ⬜ next, update Notes
   - Any guide files that changed (see "Keeping docs current" table in [version-control.md](memory/agent-guides/version-control.md))
3. **Commit** — one commit per task, code + docs together
4. **Ask to push** — say exactly: `"Committed as <hash>. Ready to push — shall I?"`
5. **Wait** — no next task until user explicitly confirms push and gives permission

Skipping any step breaks the workflow. Tests are the gate — everything stops until they pass.

---

## Layer 2 — dev workflow

Build + test commands: [repository-structure.md](memory/agent-guides/repository-structure.md).

Branch strategy, commit conventions, doc-update rules: [version-control.md](memory/agent-guides/version-control.md).

TDD standard, code quality bar, execution rules: [project-skills.md](memory/agent-guides/project-skills.md).

---

## Layer 3 — architecture + data

Language, runtime, dependency details: [techstack.md](memory/agent-guides/techstack.md).

Component layer diagram + key file map: [repository-structure.md](memory/agent-guides/repository-structure.md).

Message protocol, C++ result types, ROS2 parameters, environment variables: [data-schema.md](memory/agent-guides/data-schema.md).

---

## Layer 4 — task guides

Task orientation table (what each task creates + which tests must pass): [project-skills.md](memory/agent-guides/project-skills.md).

Full step-by-step code: `docs/superpowers/plans/2026-03-27-server-implementation.md`

Full protocol + component spec: `docs/superpowers/specs/2026-03-27-server-design.md`
