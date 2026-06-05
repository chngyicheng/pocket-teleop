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

> **To next agent (2026-06-05, current):** The post-merge bugfixes are now **merged to `main`** (`7bb448b`). The **video lazy-load + NO SIGNAL** feature is **BUILT on branch `feat/video-lazy-load`** (worktree `.worktrees/feat-video-lazy-load`), **NOT yet merged to `main`, NOT pushed** — awaiting operator OK. Working tree on `main` carries only untracked `.claude/` and `design_handoff_pocket_teleop/`. Per-task detail in the **Milestones done** table below; this block is orientation.
>
> **✅ JUST BUILT — video lazy-load + NO SIGNAL placeholder** (plan: `docs/superpowers/plans/2026-06-05-video-lazy-load.md`; worktree + 2 Haiku subagents thinking in wenyan-ultra + trophy TDD). Two parallel 役 on the same `stream.state` path:
> - **甲 — snappier first paint.** `useWhepStream` no longer calls `WhepClient.start()` synchronously in its effect — it **defers** to after first paint via `requestIdleCallback` (fallback `setTimeout(…,0)`), so the control UI (top bar, joysticks, telemetry) paints + is interactive before WHEP/ICE negotiation grabs the main thread. A `cancelled` flag + handle-cancel in cleanup guards the race (unmount before the scheduled callback fires never starts a client; no leak). The **production path** now `await import('../whep_client.js')` so Vite code-splits `WhepClient` into its own chunk (`dist/assets/whep_client-*.js`, **2.95 KB / 1.14 KB gzip**); the **injected-factory path stays synchronous** (no dynamic import) so existing factory-injected tests still pass. Top import is now `import type` (compile-time, required for the split). Measured initial JS **191031 → 189988 B** (~1 KB — the win is deferred start, not bundle size; recorded honestly in deviations).
> - **乙 — NO SIGNAL placeholder.** New `VideoSignalOverlay` in `shared.tsx`, driven by `stream.state`: `live`→none, `connecting`→`CONNECTING…`, `retrying`→`RECONNECTING…`, `error`/other→`NO SIGNAL`. Centered, `pointerEvents:'none'`, **zIndex 2 (below joystick hold-zones at z 5)**, Mission palette muted (`#8b92a0`) JetBrains Mono. Placed inside all three video containers (tablet `<main>`, phone-landscape `<main>`, phone-portrait floating div). **Joystick show/hide untouched** — control is always present (safety prereq); regression-guarded. Stream corner badge (`● {state}`) kept — overlay is the large video-area status, badge is the corner glyph.
> - **丙 — UI-ready perf beacon** (added on operator request to measure real load time). New `web-client/src/perf_beacon.ts`: after first paint (double-rAF in `main.tsx`) it POSTs Navigation + Paint Timing (`readyMs` ≈ first paint post-mount, `fcpMs`, `domContentLoadedMs`, `responseEndMs`, `ua`) to a new **unauthenticated** `POST /perf` route in auth-server `app.ts` (mounted before the auth-redirect, body parser scoped to the route), which logs `[perf] <iso> <json>`. Read with `docker logs pocket-teleop-auth-server-1 | grep perf`. Best-effort (sendBeacon → keepalive-fetch fallback, never throws). Verified end-to-end (live `POST /perf → 204`, log line confirmed).
> - **+28 tests** (甲 useWhepStream +3 defer/sync/no-leak; 乙 MissionTablet +6 / MissionControl +11; 丙 perf_beacon webclient +5 / auth +3). All green. Pre-existing reds unchanged (webclient: 9 adversarial + 1 whep ICE-timer flake; auth: 2 adversarial); none in touched files.
>
> **— earlier (merged `7bb448b`): three operator-reported post-merge bugs FIXED** (plan: `docs/superpowers/plans/2026-06-05-post-merge-bugfixes.md`). All verified at artifact level (built images inspected):
> 1. **~15 s white screen after login (offline LAN) — FIXED.** Removed the render-blocking external Google Fonts `<link>` + 2 preconnects from `web-client/index.html`; vendored the latin-subset variable woff2 (`inter-latin.woff2` 48 KB, `jetbrains-mono-latin.woff2` 31 KB) into `web-client/public/fonts/`; declared `@font-face` (`font-display:swap`, weight-range faces — variable fonts) in `src/index.css`. Built nginx image confirmed to ship `/fonts/*.woff2` and carry **zero** googleapis refs → no external request to stall offline. +5 asset tests (`fonts_offline.test.ts`).
> 2. **Login / Change-password off-theme + same font link — FIXED.** Both views restyled to the Mission palette (`#0c0e12`/`#14171e`/border `#2a2f3a`/amber `#f0a92a`/JetBrains Mono); external Google Fonts link removed; font served from an **unauthenticated** `/auth-static` `express.static` route mounted in `app.ts` **before** the auth-redirect middleware. **`Dockerfile.auth` now copies `public/` into the runtime image** (was `dist`+`views` only — vitest passed on src but prod would have 404'd the font; controller caught this). Form behavior / error display / eyeball toggle preserved. +6 tests (`auth_offline.test.ts`).
> 3. **admin/admin no longer forced a credential change — FIXED.** New `credentials.ts:enforceDefaultCredentialChange()` called at startup after `initCredentials`: if the stored hash still verifies env `TELEOP_ADMIN_PASSWORD` (operator still on default) **and** `mustChangePassword` is false, force it true + atomic-save. No-op once the operator changes away from the default, and no-op when the file is absent (init still owns first-create). README documents `docker compose down -v` as the hard reset. +3 tests.
>
> **Process note for whoever continues:** Haiku subagent T-B's cwd was **pinned to the main repo, not the worktree** — its edits landed in `/home/chngyicheng/pocket-teleop` instead of the worktree. Controller transferred them via `git diff | git apply` into the worktree and reverted main. If you dispatch subagents from inside a worktree, **verify with `git status` in BOTH the worktree and main repo** before trusting their reports.
>
> **What just shipped (all merged to `main`):**
> - **WebRTC video end-to-end** — H264 stream reaches the phone. The long-standing `deadline exceeded` ICE failure was a **host firewall** issue, not repo config: `ufw` defaults to DROP and UDP **8891** (mediamtx WebRTC ICE/UDP mux, host-network) had no allow rule. **This is a host-level fix, required on every deployment host, not a repo change:** `sudo ufw allow from <lan-subnet>/24 to any port 8891 proto udp` (e.g. `192.168.10.0/24`). Full trail: `docs/debug-webrtc-ice-handover.md` (RESOLVED) + README troubleshooting.
> - **All `docs/bugs-mission-ui.md` live-testing bugs resolved:** BUG 1 (stop on joystick release — 20 Hz continuous publish + bounded zero-burst), BUG 3 (tablet top-bar overflow + unified `■ STOP` label), BUG 4 (real latching server-side E-STOP), BUG 5 (real video fps/res from `getStats()`; fake UP/BAT/SIG → `—`) are **FIXED**. BUG 2 is **PARTIAL by design** — joysticks are disabled while the drawer is open; the E-STOP button intentionally stays tappable above the drawer.
> - **Settings drawer redesign** — slides from the **left** (matches the burger), burger **toggles** it, starts **below the top bar** (`topOffset` prop: 44px tablet/landscape, 36px portrait) so E-STOP stays clear, **backdrop scrim** closes on outside tap, restyled to the Mission palette (surface `#14171e`, amber `#f0a92a`, JetBrains Mono).
> - **Collapsible side rails + video auto-fit** (merged `00f14b4`, was branch `feat/collapsible-rails-video-fit`) — new `CollapsibleRail` presentational component. **Tablet** left (STREAM) / right (MAP) and **phone-landscape** (restructured from floating overlays into real rails) both wrap it; the grid `gridTemplateColumns` is state-driven so tapping the arrow **slides the whole rail fully out of view** (panel `translateX ±100%`, column animates to **`0px`**) and the `1fr` center video widens. Collapsed leaves only a small rounded **bookmark arrow** protruding into the video (vertically centred, like a page marker); expanded restores the inline arrow at the drawer's inner edge. The toggle is **z-index 15 (above the joystick hold-zones at z 5)** — this is the fix for collapse/expand being dead in landscape, where the joystick layer used to swallow the equal-z tap. **Phone-portrait is unchanged** (floating overlays — regression-guarded). Both videos `objectFit: 'cover' → 'contain'` (fits the smaller of width/height, letterboxes, grows as rails collapse).
>
> **Product decisions already made by the operator (do NOT re-ask):**
> - E-STOP **stays tappable on top** while the drawer is open — it is a safety control; do NOT cover/disable it.
> - E-STOP label is **`■ STOP`** everywhere (engaged state shows `■ RESET`).
>
> **Running stack:** rebuilt from current `main` and healthy (all five containers up). Run / rebuild from the repo root: `docker compose -p pocket-teleop --env-file ./.env up --build -d` (the `-p pocket-teleop` pin reuses the `auth-data` volume, so operator credentials are NOT reset; `down` to stop). Note: docker test runs create a **root-owned** `web-client/node_modules`; if you ever need to remove a worktree, `chown` it back first via a throwaway container (`docker run --rm -v <path>:/w alpine chown -R 1000:1000 /w`).
>
> **Test baseline to preserve:** **server 44** / **webclient 343 unit+component pass** (323 + 5 fonts + earlier drift) / **video-bridge 19** / **auth 46 pass** (34 + 6 auth_offline + 3 credentials + 3 diagnostic). Pre-existing reds that are NOT regressions (leave red): `integration.test.ts` (needs a live server), 9 `*.adversarial.test.*` (document other open bugs by design), 1 `whep_client` "ICE gathering timer cleanup" flake, 2 auth adversarial (`proxy_auth.adversarial`, `change_password_reject_same.adversarial`). Tests run in Docker only (see [repository-structure.md](memory/agent-guides/repository-structure.md)); iterate with a targeted file list.
>
> **Next task — operator to pick.** No bug backlog remains (video lazy-load + NO SIGNAL above is built on `feat/video-lazy-load`, pending merge+push). Options: (a) a feature from the **Feature plan pool** below (HTTPS/TLS is the standout safety gap for a networked robot; battery telemetry would retire the `BAT —` placeholder from BUG 5); (b) housekeeping — a stale **`feat/mission-ui`** local branch and an unregistered **`.worktrees/feat-mission-ui`** directory are left over from earlier work and can be deleted.

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
| BUG 1 stop-on-release (SAFETY) — `TeleopClient` 20 Hz continuous publisher (`PUBLISH_INTERVAL_MS`/`STOP_REPEATS`): republish held command each tick, bounded zero-twist burst on release then silent; resets on (re)connect; silent when idle so keepalive/latency + idle-reconnect unaffected. Views (`MissionControl`/`MissionTablet`) use `axesRef` to kill the stale-closure cross-axis read. +4 tests (`teleop_client_continuous_publish.test.ts` ×3, MissionControl cross-axis guard ×1). | 34 auth / 275 webclient unit+component pass (+4 new); integration suite (~11) not run w/o live server; pre-existing reds: 9 adversarial-hypothesis + 1 whep timer flake / 19 video-bridge / 40 C++ | `feat/control-safety-fixes` |
| BUG 4 real latching E-STOP (SAFETY) — new `estop`/`estop_reset` → `estop_state` protocol; C++ `EStopCommand`/`EStopResetCommand` + `TeleopServer.estopped_` latch (zeroes `cmd_vel`, ignores twists until reset, clears on connect); `TeleopClient.engageEstop/resetEstop` (+ `sendTwist` no-op while latched, `onEstopState`); `useTeleopBridge.estopEngaged`/`resetEstop`; views show ENGAGED banner + deliberate RESET button (Space engages only). Two parallel Sonnet subagents (C++ half / TS+UI half), controller-integrated single commit. | 34 auth / 286 webclient pass (+11; same baseline reds) / 19 video-bridge / 44 C++ (4 new estop) | `feat/control-safety-fixes` |
| BUG 3 tablet top-bar overflow + label — `MissionTablet` E-STOP label unified to `■ STOP` (engaged stays `■ RESET`); top bar stays one 44px row with robot-name as sole shrink/ellipsis target, E-STOP pinned `flexShrink:0`, bar `overflow:hidden` safety net, so E-STOP never leaves the viewport at 700–900px. +3 `MissionTablet.test.tsx` tests; two button queries `/E-STOP/i`→`/STOP/i`. | 34 auth / 290 webclient pass (+3) / 19 video-bridge / 44 C++ | `feat/control-safety-fixes` |
| BUG 5 real video telemetry — `WhepClient` polls `getStats()` @1Hz once live → inbound-rtp `framesPerSecond`/`frameWidth`/`frameHeight` via new `onStats`; `useWhepStream` exposes `stats: VideoStats\|null`; tablet STREAM `fps`/`res` from real stats with `—` fallback (fake `30.1`/`1280×720` removed). Fake `UP`/`BAT`/`SIG` → `—` (no source yet); `src`/`codec` static-but-accurate; `LAT` already real. Two Haiku subagents (tablet view / phone view) in parallel. Deviations recorded. | 34 auth / 300 webclient pass (+7) / 19 video-bridge / 44 C++ | `feat/control-safety-fixes` |
| Settings drawer UX overhaul — `SettingsDrawer` slides from the **left** (closed `translateX(-100%)`, `borderRight`), starts below the top bar via new `topOffset` prop (`top`/`calc(100vh-…)`), burger **toggles** (`App` `setDrawerOpen(o=>!o)`), **backdrop scrim** (open-only, below top bar) closes on outside tap, restyled to Mission palette (surface `#14171e` / amber `#f0a92a` / JetBrains Mono) replacing off-theme blue. +6 tests (SettingsDrawer slide-left/backdrop×2/topOffset, App toggle + backdrop-close). | 34 auth / 306 webclient pass (+6) / 19 video-bridge / 44 C++ | `feat/settings-drawer-redesign` |
| Post-merge bugfixes — three operator-reported bugs: (A) offline white-screen — vendored Inter+JetBrains Mono latin variable woff2 into `web-client/public/fonts/`, `@font-face` in `index.css`, deleted external Google Fonts `<link>`+preconnects from `index.html`; (B) auth login/change-password restyled to Mission palette + `/auth-static` unauthenticated `express.static` route (before auth-redirect mw) + `Dockerfile.auth` ships `public/`; (C) `enforceDefaultCredentialChange()` at startup re-forces `mustChangePassword` while env default still verifies. 2 Haiku subagents (T-A webclient, T-B+C auth) — T-B cwd pinned to main repo, controller transferred via `git apply` + caught the missing Dockerfile `public/` COPY. 3 code + 1 docs commit. +14 tests (5 fonts_offline, 6 auth_offline, 3 credentials). | 46 auth pass / 343 webclient pass / 19 video-bridge / 44 C++ | `fix/post-merge-bugs` (not merged) |
| Collapsible side rails + video auto-fit — new `CollapsibleRail` (presentational: edge-anchored toggle + side-aware chevron, `aria-expanded`, `data-testid rail-tab-{side}` / `rail-panel-{side}`). `MissionTablet` left (STREAM) / right (MAP) and `MissionControl` **phone-landscape** (restructured from floating overlays) wrap it; `gridTemplateColumns` state-driven (tablet `220/240↔0px`, landscape `180↔0px`) + panel `translateX ±100%` so the arrow tap **slides the rail fully out** to a vertically-centred rounded **bookmark**, and the `1fr` center widens. Toggle **z-index 15 > joystick z 5** fixes dead collapse/expand in landscape (tablet + 16:9). Joysticks moved into center `<main>`; **portrait unchanged** (regression-guarded). Both videos `objectFit cover→contain`. 3 Haiku (T1 component / T2 tablet / T3 landscape) sequential in one worktree; controller DRY-restored tablet right rail to `SidePanel`, then redesigned collapse to slide-out bookmark + z-index fix. +21 tests (CollapsibleRail 12 unit, MissionTablet +5, MissionControl +4). | 34 auth / 323 webclient pass (+21 net) / 19 video-bridge / 44 C++ | `feat/collapsible-rails-video-fit` (merged `00f14b4`) |
| Video lazy-load + NO SIGNAL — **甲** `useWhepStream` defers `WhepClient.start()` to after first paint (`requestIdleCallback`→`setTimeout` fallback; `cancelled` flag + handle-cancel cleanup = no leak on early unmount), production path `await import('../whep_client.js')` → Vite splits `whep_client-*.js` chunk (2.95 KB / 1.14 KB gzip), injected-factory path stays synchronous (existing tests intact), top `import type`. Initial JS 191031→189988 B (~1 KB; real win is deferred start, honest in deviations). **乙** new `VideoSignalOverlay` in `shared.tsx` (`stream.state`→`CONNECTING…`/`RECONNECTING…`/`NO SIGNAL`, live→none), placed in all 3 video containers, `pointerEvents:'none'` zIndex 2 < joystick z 5, joystick show/hide untouched (safety). 2 Haiku parallel (wenyan-ultra, disjoint files) + trophy TDD; controller hoisted shared.tsx import + verified code-split via real build. **丙** UI-ready perf beacon (operator request): `perf_beacon.ts` POSTs Navigation/Paint Timing after first paint (double-rAF in `main.tsx`) to new unauthenticated `POST /perf` in auth `app.ts`, logged `[perf] <iso> <json>`. +28 tests (useWhepStream +3, MissionTablet +6, MissionControl +11, perf_beacon webclient +5 / auth +3). | 49 auth pass (+3; 2 adversarial red) / 357 webclient pass (+5; same 10 baseline reds) / 19 video-bridge / 44 C++ | `feat/video-lazy-load` (not merged) |

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
| **Video lazy-load + NO SIGNAL plan (2026-06-05, ✅ built — `feat/video-lazy-load`, not merged)** | `docs/superpowers/plans/2026-06-05-video-lazy-load.md` |
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
