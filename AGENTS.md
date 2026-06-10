# pocket-teleop — agent guide

> Progressive disclosure. Read what you need. Start at **Layer 1**, drill deeper only if stuck.

---

## Rules for changing this file

**`CLAUDE.md` is a symlink to `AGENTS.md`. Edit `AGENTS.md`. Never touch `CLAUDE.md` directly.**

**Code change ships with doc change in same commit.** Third person, zero-context reader. Per-feature rationale goes to [deviations.md](memory/agent-guides/deviations.md) (one row per deviation, with a reason a cold reviewer would accept); finished work goes to the Milestones table. Details: [version-control.md](memory/agent-guides/version-control.md).

---

## Handover state — continue from here

> **Current state (2026-06-10):** **SLAM minimap shipped + follow-ups** — MiniMap renders the real occupancy grid (transient_local `/map`, crop window, trinary RLE), tf2 `map→base_link` pose (odom fallback), lidar overlay; base_link-fixed view (robot centered + unrotated, map rotates) with pinch-to-zoom (1 m … 1.2× map extent). Topics/frames deployer-configurable via env (`MAP_TOPIC`, `SCAN_TOPIC`, `ODOM_TOPIC`, `MAP_FRAME`, `ODOM_FRAME`, `BASE_FRAME`, `MAP_WINDOW_M`). Server side live-verified against a real SLAM stack. **Hardware-verify open:** screen-direction conventions (forward → map flows down, left turn → map turns clockwise) — see deviations. `v1.0.0` tag still gated on operator hardware checks.
>
> **Run stack:** `docker compose -p pocket-teleop --env-file ./.env up --build -d` from repo root (`-p` pin keeps the `auth-data` volume; `down -v` resets creds). **Restart `teleop-server` after any sim restart** — tf2 rejects post-restart transforms as TF_OLD_DATA (see TROUBLESHOOTING).
>
> **Deployment must-do (host, not repo):** `sudo ufw allow from <lan-subnet>/24 to any port 8891 proto udp` — else video ICE fails.
>
> **Product decisions — do NOT re-ask:** E-STOP stays tappable on top while the drawer is open. E-STOP label is `■ STOP` (engaged → `■ RESET`).
>
> **Test baseline:** webclient **556** pass / **11** skipped / auth **51** / video-bridge **19** / C++ **69**. Docker only; `--build` required after edits or `compose run` reuses a stale image. Iterate with a targeted vitest file list. Known reds that are not regressions: auth `mediamtx_integration.test.ts` (3) needs the full `--profile test` stack; `integration.test.ts` self-skips without a live server.
>
> **Subagent/worktree gotchas:** (0) Subagents never run git — controller stages by explicit path + commits (a blanket `git add` once swept 2754 worktree files). (1) A Haiku's cwd can pin to the **main repo instead of the worktree** — check `git status` in BOTH before trusting reports; it may also "re-create" files that already exist on the branch (one re-invented the RLE codec in a wrong format — canonical impl lives on the branch, transfer only the new wiring). (2) Docker runs may leave root-owned `node_modules` in a worktree; chown back before `git worktree remove`: `docker run --rm -v <path>:/w alpine chown -R 1000:1000 /w`.
>
> **Next — operator to pick:** Feature plan pool below (HTTPS/TLS = top safety gap; battery telemetry retires the `BAT —` placeholder), the **robot footprint outline + service worker precache** plan (`docs/superpowers/plans/2026-06-11-footprint-outline-sw-precache.md`), or the **gamepad cold-start detection** fix (`docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md`). Safety + health pool plans carry a 2026-06-11 addendum (execution rules: worktrees, trophy TDD, Haiku wenyan-ultra; staleness warning — re-verify file refs against current code).

### Milestones done (recent)

Full history: [milestones.md](memory/agent-guides/milestones.md). Tests column = webclient / auth / video-bridge / C++.

| Milestone | Tests (web/auth/vb/cpp) | Tag |
|---|---|---|
| SLAM minimap — 6 serial chain-branch tasks (Haiku + trophy TDD): protocol map/pose/scan + trinary `u3f2o1` RLE; C++ `/map` sub (transient_local) + crop window + delivery-aware broadcast; tf2 pose @5 Hz (odom fallback) + LaserScan decimate ≤120 pts; bridge `mapGrid`/`mapPose`/`scan`; `map_render.ts` transforms (vitest vectors lock conventions) + canvas MiniMap (Mission palette, MAP/ODOM/NO MAP label, old-grid fallback); views wired `navPose = mapPose ?? odom`; env passthrough for all topics/frames; server live-verified on real robot | 548 / 51 / 19 / 69 | `feat/map-*`, `feat/minimap-*` |
| Minimap follow-ups — arrow stays unrotated in map mode (base_link-fixed view; was double-rotating); two-finger pinch-to-zoom (clamped 1 m … 1.2× map extent, re-clamped per new map, no-op without map); TROUBLESHOOTING: multi-publisher `/cmd_vel` latch diagnosis (teleop_keyboard / nav2 spin recovery vs Gazebo's no-timeout plugin; twist_mux fix) + sim-restart TF_OLD_DATA freeze | 556 / 51 / 19 / 69 | — |

### Known deviations (still relevant)

See [deviations.md](memory/agent-guides/deviations.md). Append new ones there.

---

## Document index

| Need | Read |
|---|---|
| Run stack now | Layer 1 (below) |
| Build, test, docker commands | [repository-structure.md](memory/agent-guides/repository-structure.md) |
| Full deviation list | [deviations.md](memory/agent-guides/deviations.md) |
| Full milestone history | [milestones.md](memory/agent-guides/milestones.md) |
| Tech stack + dependencies | [techstack.md](memory/agent-guides/techstack.md) |
| Message protocol + data types | [data-schema.md](memory/agent-guides/data-schema.md) |
| Git workflow + doc-update rules | [version-control.md](memory/agent-guides/version-control.md) |
| TDD standard, guardrails, task guides | [project-skills.md](memory/agent-guides/project-skills.md) |
| **Footprint outline + SW precache plan (2026-06-11, ⏳ pending)** | `docs/superpowers/plans/2026-06-11-footprint-outline-sw-precache.md` |
| **Gamepad cold-start detection plan (2026-06-07, ⏳ pending)** | `docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md` |
| **SLAM minimap plan (2026-06-10, ✅ done)** | `docs/superpowers/plans/2026-06-10-slam-minimap.md` |
| **Gamepad controls plan (2026-06-06, ✅ done)** | `docs/superpowers/plans/2026-06-06-gamepad-controls-improvements.md` |
| Earlier plans + specs (all shipped) | `docs/superpowers/plans/` + `docs/superpowers/specs/` — dated filenames; feature → plan mapping via [milestones.md](memory/agent-guides/milestones.md) |
| Code review report + fix plan (2026-05-27) | `docs/2026-05-27-codebase-review.md`, `docs/superpowers/plans/2026-05-27-codebase-review-fixes.md` |

### Feature plan pool (waiting on user to pick priority)

**Safety + control**
- HTTPS/TLS: `docs/superpowers/plans/2026-05-06-https-tls-implementation.md`
- Login rate limit: `docs/superpowers/plans/2026-05-06-login-rate-limit-implementation.md`
- Session idle timeout: `docs/superpowers/plans/2026-05-06-session-timeout-implementation.md`
- Speed limit slider: `docs/superpowers/plans/2026-05-06-speed-limit-slider-implementation.md`
- Geofence: `docs/superpowers/plans/2026-05-06-geofence-implementation.md`
- Disconnect behavior: `docs/superpowers/plans/2026-05-06-disconnect-behavior-implementation.md`

**Observation**
- Map view: `docs/superpowers/plans/2026-05-06-map-view-implementation.md` (can now reuse the minimap's map/pose/scan transport)
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

**Credentials:** One operator per robot. First run: log in with `.env` values — server forces password change immediately. Credentials persist in the `auth-data` volume; reset with `docker compose down -v`.

Build commands, test commands, file layout → [repository-structure.md](memory/agent-guides/repository-structure.md)

---

## Execution mode — subagent-driven development

**All implementation work uses the `superpowers:subagent-driven-development` skill.** Controller dispatches a subagent per task; the subagent implements strictly to plan, runs tests (Docker only — never bare `npm`), and **reports** files changed + test results, leaving the tree dirty.

**Subagents MUST NOT run any git command (`add`/`commit`/`push`/`reset`) — no exceptions.** Prompts must say "do not stage or commit; leave changes in the working tree and report" and "on permission denial, stop and report". After each subagent the controller: (a) checks `git status` in main repo **and** worktree (cwd-pinning gotcha), (b) reviews for spec compliance then code quality, (c) stages intended files by explicit path (never `git add -A`/`.`) and commits.

### Communication modes (caveman skill rules)

| Channel | Mode |
|---|---|
| Controller ↔ user | `caveman full` (English) |
| Controller ↔ Haiku subagent | `caveman wenyan-ultra` (English technical terms stay English) |
| Code / commits / PRs / security warnings / irreversible-action confirmations | normal English |

User says `normal` or `stop caveman` → revert. Level holds until changed or session ends.

---

## Task completion protocol — enforced per task

1. **Run all tests** — zero failures before anything else moves.
2. **Update docs in the same commit** — AGENTS.md handover, plus any guide files that changed ([version-control.md](memory/agent-guides/version-control.md) "Keeping docs current").
3. **Commit (controller only)** — one commit per task, code + docs together, staged by explicit path.
4. **Ask to push** — say exactly: `"Committed as <hash>. Ready to push — shall I?"` and **wait** for explicit permission.

---

## Layer 2 — dev workflow

Build + test commands: [repository-structure.md](memory/agent-guides/repository-structure.md). Branch strategy, commit conventions, doc-update rules: [version-control.md](memory/agent-guides/version-control.md). TDD standard, quality bar, execution rules: [project-skills.md](memory/agent-guides/project-skills.md).

## Layer 3 — architecture + data

Tech stack: [techstack.md](memory/agent-guides/techstack.md). Component diagram + key file map: [repository-structure.md](memory/agent-guides/repository-structure.md). Protocol, C++ types, ROS2 params, env vars: [data-schema.md](memory/agent-guides/data-schema.md).

## Layer 4 — task guides

Task orientation table: [project-skills.md](memory/agent-guides/project-skills.md). Original server plan/spec: `docs/superpowers/plans/2026-03-27-server-implementation.md`, `docs/superpowers/specs/2026-03-27-server-design.md`.
