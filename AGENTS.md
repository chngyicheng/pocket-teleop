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

> **Current state (2026-06-07):** Gamepad controls improvements (6-task plan) merged, followed by post-merge UX fixes and now the **gamepad cold-start detection fix** (3-task plan `fix/gamepad-*`, see latest Milestones row + [plan](docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md)): operator reported joysticks + LB E-STOP dead on a cold browser until another gamepad page "primed" the device — root cause was detection being chained to the WebSocket with no `gamepadconnected` listener. Detection now runs continuously, independent of the socket, with a **🎮 GP** connected indicator. Docs refreshed earlier: **README rewritten** + troubleshooting in **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** (now incl. cold-start section). **Considering a `v1.0.0` tag** — gated on operator verifying (a) cold-browser gamepad/E-STOP activation works without priming, and (b) held-stick continuous drive + axis directions on the real robot (see hardware-verify items in [deviations.md](memory/agent-guides/deviations.md)). Per-feature rationale lives in deviations + the Milestones rows — this block stays orientation-only.
>
> **Run stack:** `docker compose -p pocket-teleop --env-file ./.env up --build -d` from repo root. The `-p pocket-teleop` pin reuses the `auth-data` volume so operator creds survive rebuilds; `down` to stop, `down -v` to reset creds. Currently up + healthy.
>
> **Deployment must-do (host, not repo):** mediamtx WebRTC media needs UDP **8891** open or video ICE fails (`deadline exceeded`): `sudo ufw allow from <lan-subnet>/24 to any port 8891 proto udp`. See README troubleshooting.
>
> **Product decisions — do NOT re-ask:** E-STOP stays tappable on top while the drawer is open (safety; never cover/disable). E-STOP label is `■ STOP` everywhere (engaged → `■ RESET`).
>
> **Test baseline:** webclient **471** pass / **11** skipped / auth **51** pass / video-bridge **19** / C++ **44**. Docker only (see [repository-structure.md](memory/agent-guides/repository-structure.md); iterate with a targeted file list) — rebuild with `--build` after editing tests, else `docker compose run` reuses a stale baked image. Adversarial backlog (9 webclient + 2 auth) cleared — see latest **Milestones** row. The two former webclient reds are now fixed: `whep_client` ICE-timer test rewritten (functional mock listener registry + `vi.getTimerCount`), and `integration.test.ts` now `describe.skipIf(!serverReachable)` (probes once, **skips** without a live server instead of hard-failing; run the full `--profile test` stack to exercise it). Remaining pre-existing red — leave red, not a regression: auth `mediamtx_integration.test.ts` (3 tests; needs the `mediamtx-test` companion container — green only via full `--profile test` compose).
>
> **Subagent/worktree gotchas:** (0) **Subagents never commit** — see Execution mode. They report a dirty tree; the controller stages by explicit path + commits. A Haiku that ran `git add` once swept the untracked `.claude/worktrees/…` tree (2754 files) into one commit. (1) a Haiku subagent's cwd can pin to the **main repo instead of the worktree** — verify `git status` in BOTH before trusting reports (transfer stray edits with `git diff | git apply`). (2) Docker test runs may leave a **root-owned** `web-client/node_modules`; chown back before removing a worktree: `docker run --rm -v <path>:/w alpine chown -R 1000:1000 /w`.
>
> **Next — operator to pick:** a feature from the **Feature plan pool** below (HTTPS/TLS = top safety gap; battery telemetry retires the `BAT —` placeholder). Or a **service worker** precaching the app shell — the only remaining first-load cost is the HTML round-trip on a variable Wi-Fi link (separate feature; staleness/deploy tradeoffs).

### Milestones done

Tests column = webclient / auth / video-bridge / C++ (— where not yet present). Full rationale per milestone lives in [deviations.md](memory/agent-guides/deviations.md) + the linked plans.

| Milestone | Tests (web/auth/vb/cpp) | Tag |
|---|---|---|
| Server — ROS2 WebSocket, command handler, teleop node | — | `v0.1.0-server` |
| Web client v0.1.0 — protocol, connection, gamepad, teleop client | 10 | `v0.1.0-client` |
| Practical gaps — gamepad profiles, reconnection, calibration UI | 43 | `v0.2.0` |
| Frontend UI — settings.ts, onTwist, responsive rewrite | 43 | `v0.3.0` |
| Touch joystick + polish — TouchJoystick, namespace, gamepad switch | 60 | `v0.4.0` |
| v0.5.0 — KeyboardHandler, retry+onPong, axis remap, input bar | 63 | `v0.5.0` |
| Video streaming — mediamtx, video-bridge, WhepClient, /video proxy, WebRTC panel | 85 / 31 / 19 | `v0.6.0` |
| Video source picker — /mediamtx-api proxy, VideoSourcePicker, settings UI | 99 / 34 / 19 | `v0.7.0` |
| v0.8.0 control reliability — key-up instant trigger, e-stop button+space, calib Ready | 103 / 34 / 19 | `v0.8.0` |
| v0.9.0 feedback — RTSP validation, stream-health badge, latency display | 117 / 34 / 19 | `v0.9.0` |
| v0.10.0 telemetry — odom subscribe/broadcast, onOdom, panel + compass | 119 / 34 / 19 | `v0.10.0` |
| Apply-button e2e verify — mediamtx-test container + 3 integration tests | +3 integ | — |
| v0.11.0 video sources — UDP/SRT/MJPEG validate/buildMtxSource/apply, MJPEG img direct | 149 / 34 / 19 | — |
| v0.11.0 review fixes — 5 logic defects + 8 tests | 157 / 34 / 19 | — |
| Auth bugfixes — account inline error, visibilitychange guard, healthcheck | 157 / 34 / 19 | — |
| location.replace fix + README | 157 / 34 / 19 | — |
| start.sh + mjpegImgEl typo + vitest file serialization | 157 / 34 / 19 | — |
| Whole-repo review — 6 Haiku fixed 30 findings (LAN exposure closed, backoff, video_bridge Lock, auth hardening, +28 C++ tests) | 157 / 34 / 19 / 40 | — |
| Mission Control UI integration — vanilla shell, trophy TDD, E-STOP z10, Space wired | 191 / 34 / 19 / 40 | `feat/mission-ui` |
| Mission UI React Phase 0+Wave 1 — React 18 + Vite 5 + jsdom + RTL; shared.tsx, hooks, SettingsDrawer; setup.ts polyfills | 244 / 34 / 19 / 40 | `feat/mission-ui-react` |
| Mission UI React Wave 2 — MissionControl phone + MissionTablet grid; axis-map; E-STOP z10 | 259 / 34 / 19 / 40 | `feat/mission-ui-react` |
| Mission UI React Wave 3 — App.tsx matchMedia switch, main.tsx createRoot, index.css palette, 9 integration tests | 268 / 34 / 19 / 40 | `feat/mission-ui-react` |
| Mission UI design-parity — Math.hypot V/ω, atan2 heading, LAT from latencyMs, portrait telemetry, static readouts | 264 / 34 / 19 / 40 | `feat/mission-ui-react` |
| Mission UI smoke fixes — tablet breakpoint 700 (Fold 6), right SettingsDrawer, font harmonize, zone joysticks; branches merged | 264 / 34 / 19 / 40 | `feat/mission-ui-react` |
| WebRTC e2e fix — video-bridge target:runtime, sleep(inf) crash, RTSP→RTMP, ICE pin, WHEP pathRewrite; root cause host ufw DROP UDP 8891 | 264 / 34 / 19 / 40 | — |
| BUG 1 stop-on-release (SAFETY) — TeleopClient 20 Hz continuous publish + bounded zero-burst; axesRef cross-axis fix | 275 / 34 / 19 / 40 | `feat/control-safety-fixes` |
| BUG 4 latching E-STOP (SAFETY) — estop/estop_reset/estop_state protocol; C++ latch; engage/reset; ENGAGED banner | 286 / 34 / 19 / 44 | `feat/control-safety-fixes` |
| BUG 3 tablet top-bar — `■ STOP` label, robot-name sole shrink target, E-STOP pinned flexShrink:0 | 290 / 34 / 19 / 44 | `feat/control-safety-fixes` |
| BUG 5 video telemetry — WhepClient getStats@1Hz fps/res; fake UP/BAT/SIG → `—` | 300 / 34 / 19 / 44 | `feat/control-safety-fixes` |
| Settings drawer UX — slide-left, topOffset, burger toggle, backdrop scrim, Mission palette | 306 / 34 / 19 / 44 | `feat/settings-drawer-redesign` |
| Post-merge bugfixes — offline vendored woff2, auth theme + /auth-static route, enforceDefaultCredentialChange | 343 / 46 / 19 / 44 | `fix/post-merge-bugs` (merged `7bb948f`) |
| Collapsible rails + video fit — CollapsibleRail slide-out bookmark, toggle z15 > joystick z5, objectFit contain; portrait unchanged | 323 / 34 / 19 / 44 | `feat/collapsible-rails-video-fit` (merged `00f14b4`) |
| Video lazy-load + NO SIGNAL + gzip first-paint — 甲 useWhepStream defers start (requestIdleCallback) + code-splits WhepClient; 乙 VideoSignalOverlay (CONNECTING…/RECONNECTING…/NO SIGNAL, z2 < joystick z5); 丙 `/perf` beacon (Navigation/Paint/resource timing → auth log); 丁 instant `#boot-splash` in index.html; **戊 root cause: nginx gzip was off** — new `nginx.conf` (`gzip on` + immutable /assets cache), bundle 186→57 KB, `readyMs` 7919→~1937 ms | 363 / 49 / 19 / 44 | `feat/video-lazy-load` (merged `85ad697`) |
| Adversarial backlog cleared — 6 hardening fixes: protocol odom `Number.isFinite` guard, MissionControl LAT readout (neg/NaN/Inf → `— ms`), Space-key E-STOP ignored while editable field focused, TeleopClient `maxMissedPongs` zombie-link detector (onClose + reconnect), auth change-password rejects new==current (400), **/ws upgrade now session-authenticated** (`makeWsUpgradeHandler` runs express-session, fail-closed); pong-timeout test rewritten to standard `vi.mock(connection)` harness | 372 / 51 / 19 / 44 | — |
| Reconnecting counter wired live — top-bar chip showed hardcoded placeholder `⟳ Reconnecting… (3)`; now reads `bridge.retryCount` (counts up per attempt) in MissionControl + MissionTablet (`connText`); static `CONNECTION_LABELS.reconnecting` placeholder number dropped | 373 / 51 / 19 / 44 | — |
| Header robot identity de-faked — top-bar showed hardcoded `bot-07` / `ns/robot1`; now `robotLabel = robotName \|\| robotType` (falls back to robot model), renders nothing when both empty; namespace span only shown when non-empty (MissionControl + MissionTablet) | 375 / 51 / 19 / 44 | — |
| Settings drawer z-index fix — drawer panel z17 / backdrop z16 now above CollapsibleRail toggle tab (z15); previously z9/z8 let rail tab paint over the drawer | 375 / 51 / 19 / 44 | — |
| Dedup HUD primitives — `fallow` flagged MissionControl/MissionTablet clone groups; extracted `Crosshair` (16×16 line cross) + `JoystickZone` (positioned bottom-corner Joystick wrapper) into `shared.tsx`. MissionControl drops 2 inline crosshairs + 4 inline joystick wrappers (landscape + portrait branches), MissionTablet drops 2; behavior-preserving, inner Joystick keeps `data-testid="joystick-zone"`. Tablet's SVG reticle left as-is (different design). +7 shared tests | 382 / 51 / 19 / 44 | — |
| Two webclient reds fixed — `whep_client` "clears safety timeout" test was broken (fake PC defaulted `iceGatheringState='complete'` → no timer armed; fired wrong `onconnectionstatechange` event; `addEventListener` was a no-op `vi.fn`). Reworked mock: gated `_initialIceGatheringState`, functional listener registry + `_setIceGatheringState` dispatch; assert via `vi.getTimerCount` (source unchanged — was already correct). `integration.test.ts` now probes the server once + `describe.skipIf(!serverReachable)` (11 skip without live stack, no 20 s hard-fail) | 382 / 51 / 19 / 44 | — |
| Dead-export cleanup — fallow flagged 4 unused exports; all used internally so dropped only the `export` keyword on `PUBLISH_INTERVAL_MS`/`STOP_REPEATS` (teleop_client) + `CollapsibleRailProps` (CollapsibleRail); `ConnectionState` (shared) wired into useTeleopBridge replacing its 2× inline duplicate union (TeleopBridge field + useState generic). Type-only, no behavior change | 382 / 51 / 19 / 44 | — |
| Gamepad controls improvements — 6 serial worktree tasks (Haiku + trophy TDD): **務A** bridge exposes `gamepadTwist`+`inputSource` (activity-timestamp, idle reversion); **務一** `input_shaping.ts` deadzone 0.1 + cubic curve at `sendTwist` choke (covers gamepad/touch/keyboard; repeatTwist stores shaped-normalized so a held stick never self-zeros); **務三** STANDARD axes remapped — rotate(az)←left-stick X (axis0), strafe(ly)←right-stick X (axis2), lx unchanged (DualShock untouched); **務五** E-STOP on LB (button 4) cross-source toggle (Xbox/GameSir/Generic; `handleGamepadButton` engages/resets the shared latch; button-exists guard); **務二** Joystick `externalValue`/`externalActive` — knob follows gamepad truth, hint hides, touch still wins; **務四** `setMaxSpeed` scales at send choke (default 1.0), `SpeedStepper` +/- in left-rail SPEED panel, persisted to localStorage (hard caps lin 0.1–2.0 / ang 0.1–3.0), no socket reconnect on change | 451 / 51 / 19 / 44 | `feat/gp-*` |
| Gamepad post-merge UX fixes — **(1)** held-stick regression: `GamepadHandler` polls via `requestAnimationFrame` (not bare `setInterval`) so a held stick reads fresh (Chrome refreshes `getGamepads()` only on the rAF loop) and republishes ~20 Hz; **(2)** published-velocity surfaced — VELOCITY bars + tablet V/ω readout now read the active source and show actual `cmd_vel` (shaped × cap), not raw stick; **(3)** left rail reordered VELOCITY→SPEED→ODOMETRY→VIDEO so the SPEED ± sit clear of the bottom joysticks (drawer kept at z1 — not raised); **(4)** `SpeedStepper` restyled to Mission palette, single line, label-left / `− x.x unit +` right, columns aligned; **(5)** common joystick sizing (base 120 / knob 50); **(6)** long-phone-landscape (aspect ≥ 17/10) uses a smaller joystick (150/90/38, no clip → no slice) so the rail scrolls above it, Fold keeps full 200 both orientations | 451 / 51 / 19 / 44 | — |
| Docs refresh + README rewrite — professional README (SVG banner in UI font, screenshot placeholders, controls table, badges); troubleshooting moved to `TROUBLESHOOTING.md` (incl. Brave fingerprinting + held-stick + cmd_vel hz check) | 451 / 51 / 19 / 44 | — |
| Gamepad cold-start detection (SAFETY) — 3 serial worktree tasks (Haiku + trophy TDD): **務一** `GamepadHandler` `attach()`/`detach()` bind `window` gamepadconnected/gamepaddisconnected (idempotent, SSR-safe), `poll()` centrally manages connection state for both event + warm-poll paths (`onConnectionChange`/`isConnected()`), rAF loop wraps `poll()` in try/finally so one throw no longer kills it; **務二** `TeleopClient` attaches+starts the handler in its constructor (detection now independent of the socket), `onClose`/`handlePongTimeout` → `setEnabled(false)` (stop sending, keep polling), `connect()`/`scheduleRetry` → `setEnabled(true)`, `disconnect()` → `detach()` — `Connection.send` already no-ops when not OPEN; **務三** `onGamepadConnected` option → `useTeleopBridge.gamepadConnected` → **🎮 GP** chip beside the connection chip in both views (only when connected, so touch-only phones unaffected). Root cause: detection was chained to the WebSocket + no `gamepadconnected` listener, so a cold browser missed the activation moment; a second page warmed the process-global gamepad service. | 471 / 51 / 19 / 44 | `fix/gamepad-*` |

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
| **Collapsible rails + video auto-fit plan (2026-06-05)** | `docs/superpowers/plans/2026-06-05-collapsible-rails-video-fit.md` |
| **Post-merge bugfixes plan (2026-06-05, ✅ built — merged `7bb948f`)** | `docs/superpowers/plans/2026-06-05-post-merge-bugfixes.md` |
| **Video lazy-load + NO SIGNAL + gzip first-paint (2026-06-05, ✅ done — merged to `main`)** | `docs/superpowers/plans/2026-06-05-video-lazy-load.md` |
| **Gamepad controls improvements (2026-06-06, ✅ done — 6 tasks built/tested: bridge channel, input-shaping/deadzone+curve, axis remap, E-STOP LB toggle, hint ground-truth, configurable max-speed; webclient 451)** | `docs/superpowers/plans/2026-06-06-gamepad-controls-improvements.md` |
| **Gamepad cold-start detection (2026-06-07, ✅ done — 3 tasks: handler decouple + window events + resilient loop, TeleopClient detection-always-on, 🎮 GP indicator; webclient 471; operator cold-browser verify pending)** | `docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md` |
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
3. Updates `AGENTS.md` handover table alongside the code edits
4. **Reports** (files changed, test results) — leaves the working tree dirty for the controller

**Subagents MUST NOT commit, stage, or run any `git add`/`git commit`/`git push`/`git reset` — no exceptions.** Only the controller touches git. A subagent that runs `git add -A`/`git add .` will sweep untracked junk (e.g. `.claude/worktrees/…` copies) into the index — this has happened. Subagent prompts must say "do not stage or commit; leave changes in the working tree and report." The controller reviews the diff, stages **only** the intended files by explicit path, and commits.

After each subagent finishes, controller: (a) verifies `git status` (transfer any stray edits, confirm no swept files), (b) runs two review rounds (spec compliance, then code quality), (c) stages intended files by path + commits, before marking the task done.

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
3. **Commit (controller only)** — one commit per task, code + docs together. Subagents never commit; the controller stages intended files by explicit path (never `git add -A`/`.`) and commits.
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
