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

> **Current state (2026-06-06):** `main` @ `85ad697` + uncommitted adversarial-backlog fixes (web-client + auth-server) in the working tree, pending commit. No other open backlog. Latest merged work (video lazy-load + NO SIGNAL + gzip first-paint); details in the **Milestones** rows + [deviations.md](memory/agent-guides/deviations.md). Per-feature rationale lives in deviations + plans — this block stays orientation-only.
>
> **Run stack:** `docker compose -p pocket-teleop --env-file ./.env up --build -d` from repo root. The `-p pocket-teleop` pin reuses the `auth-data` volume so operator creds survive rebuilds; `down` to stop, `down -v` to reset creds. Currently up + healthy.
>
> **Deployment must-do (host, not repo):** mediamtx WebRTC media needs UDP **8891** open or video ICE fails (`deadline exceeded`): `sudo ufw allow from <lan-subnet>/24 to any port 8891 proto udp`. See README troubleshooting.
>
> **Product decisions — do NOT re-ask:** E-STOP stays tappable on top while the drawer is open (safety; never cover/disable). E-STOP label is `■ STOP` everywhere (engaged → `■ RESET`).
>
> **Test baseline:** webclient **372** pass / auth **51** pass / video-bridge **19** / C++ **44**. Docker only (see [repository-structure.md](memory/agent-guides/repository-structure.md); iterate with a targeted file list). Adversarial backlog (9 webclient + 2 auth) cleared — see latest **Milestones** row. Pre-existing reds — leave red, not regressions: webclient `integration.test.ts` (needs live server) + 1 `whep_client` ICE-timer flake; auth `mediamtx_integration.test.ts` (3 tests; needs the `mediamtx-test` companion container — green only via full `--profile test` compose).
>
> **Subagent/worktree gotchas:** (1) a Haiku subagent's cwd can pin to the **main repo instead of the worktree** — verify `git status` in BOTH before trusting reports (transfer stray edits with `git diff | git apply`). (2) Docker test runs may leave a **root-owned** `web-client/node_modules`; chown back before removing a worktree: `docker run --rm -v <path>:/w alpine chown -R 1000:1000 /w`.
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
