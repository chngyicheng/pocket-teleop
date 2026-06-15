# pocket-teleop — agent guide

> Progressive disclosure. Read what you need. Start at **Layer 1**, drill deeper only if stuck.

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

Root owns project-wide rules, run stack, execution mode, handover state, and the document/plan indexes. Direct children own their subtree contracts:

| Child | Scope |
|---|---|
| [server/AGENTS.md](server/AGENTS.md) | C++ ROS2 teleop node — `CommandHandler` / `TeleopServer` / `TeleopNode`, WebSocket → `/cmd_vel` |
| [auth-server/AGENTS.md](auth-server/AGENTS.md) | Node/Express login + reverse proxy on 8080 (sessions, rate limit, idle timeout, `/ws` `/video` proxy) |
| [video-bridge/AGENTS.md](video-bridge/AGENTS.md) | Python rclpy + GStreamer ROS2-image → RTMP → MediaMTX WHEP |
| [web-client/AGENTS.md](web-client/AGENTS.md) | React 18 + Vite 5 mission UI + framework-free transport/logic modules + SW precache |
| [docs/AGENTS.md](docs/AGENTS.md) | Durable plans, specs, code-review/debug reports, assets |
| [memory/agent-guides/AGENTS.md](memory/agent-guides/AGENTS.md) | Condensed authoritative agent guides the indexes above link to |

---

## Rules for changing this file

**`CLAUDE.md` is a symlink to `AGENTS.md`. Edit `AGENTS.md`. Never touch `CLAUDE.md` directly.**

**Code change ships with doc change in same commit.** Third person, zero-context reader. Per-feature rationale goes to [deviations.md](memory/agent-guides/deviations.md) (one row per deviation, with a reason a cold reviewer would accept); finished work goes to the Milestones table. Details: [version-control.md](memory/agent-guides/version-control.md).

---

## Handover state — continue from here

> **Current state (2026-06-14):** Scan↔map sync (capture-pose overlay, plan A1) shipped — each `scan` message now carries the robot pose at its capture `header.stamp` (`pose_x`/`pose_y`/`pose_heading`/`pose_frame`, map-first/odom-fallback/omitted-on-tf-fail); the minimap projects scan rays base_link → world (via capture pose) → screen (via current map pose), so scan points land on map walls instead of trailing. `selectScanCapturePose` falls back to robot-centered on frame-mismatch/absent pose. Also now merged: the **gamepad cold-start detection fix** (3-task `fix/gamepad-*`, [plan](docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md)) — joysticks + LB E-STOP were dead on a cold browser until another gamepad page "primed" the device; detection now runs continuously, independent of the socket (`window` gamepadconnected events + resilient rAF loop), with a **🎮 GP** connected indicator. Built atop robot config settings page + footprint outline + SW precache + the security sweep (HTTPS/TLS, login rate limit, session idle timeout). Per-feature contracts live in the child AGENTS.md ([web-client](web-client/AGENTS.md), [auth-server](auth-server/AGENTS.md), [server](server/AGENTS.md)); shipped detail in [milestones.md](memory/agent-guides/milestones.md). **Not tagged yet — `v1.0.0` gated on one remaining hardware check.** Six of seven hardware-verify gate items confirmed on the real robot: scan-overlay screen-direction + tf-at-stamp behavior, robot-config end-to-end (edit → restart → new values in `status` JSON + video bridge), footprint screen-direction, SW real-device behavior, TLS phone root-CA + real ACME, and minimap screen-direction. **Sole remaining gate before `v1.0.0`: cold-browser gamepad/E-STOP activation without priming** (gamepad cold-start fix, merged 2026-06-14) — tag `v1.0.0` once an operator confirms a cold browser arms joysticks + LB E-STOP with no priming page.
>
> **Robot config (new):** Tunable keys live in `config/robot.env` (gitignored; seed from `config/robot.env.example`), **not** `.env` — `.env` keeps only secrets + ROS/network/TLS. Edited from the web Settings drawer: **Video** section owns `VIDEO_TOPIC`/`VIDEO_TOPIC_TYPE` (grouped under the runtime Source picker), **Robot** section owns identity + footprint; each Save is a partial PUT to `/auth/robot-config`. Changes apply on next `docker compose ... up -d` (live runtime apply deferred; front-end restart button rejected as host-root risk). **Upgrade migration:** existing deployments must copy their seven `.env` values into `config/robot.env` once, else video/identity revert to defaults (TROUBLESHOOTING).
>
> **Run stack:** `docker compose -p pocket-teleop --env-file ./.env up --build -d` (`-p` keeps the `auth-data` volume; `down -v` resets creds). **Restart `teleop-server` after any sim restart** — tf2 rejects post-restart transforms as TF_OLD_DATA (TROUBLESHOOTING).
>
> **Deployment must-do (host):** `sudo ufw allow from <lan-subnet>/24 to any port 8891 proto udp` — else video ICE fails.
>
> **Test baseline:** webclient **646** pass / **11** skipped / auth **96** / video-bridge **20** / C++ **84**. Docker only; `--build` required after edits. Known non-regression reds: auth `mediamtx_integration.test.ts` (3, needs `--profile integration` + live MediaMTX); `integration.test.ts` self-skips without a live server.
>
> **Subagent/worktree gotchas:** (0) subagents never run git — controller stages by explicit path (a blanket `git add` once swept 2754 files). (1) a Haiku's cwd can pin to the main repo instead of the worktree — check `git status` in BOTH; it may "re-create" files already on the branch (transfer only new wiring). (2) Docker may leave root-owned `node_modules` in a worktree — `docker run --rm -v <path>:/w alpine chown -R 1000:1000 /w` before `git worktree remove`.
>
> **Next — recommended build order (2026-06-15).** Scan↔map sync (plan A1) and the gamepad cold-start fix are both **merged to main**; sole open release gate is the cold-browser gamepad/E-STOP hardware check before `v1.0.0` (above). **Backlog pool re-verified 2026-06-15** (addendum appended to each plan under `docs/superpowers/plans/2026-05-06-*`): all cited source files still exist, but every plan's UI tasks predate the React migration and must be re-cast from `web-client/index.html` (now a bare React mount) onto `views/MissionControl.tsx` / `MissionTablet.tsx` / `components/`; framework-free logic + server C++ tasks remain valid.
>
> **Disconnect behavior (SAFETY) shipped 2026-06-15** — merged `feat/disconnect-behavior` (646/96/20/84). `DISCONNECT_ACTION` env (`stop`/`hold`/`continue`/`return_home`) drives the watchdog; `hold`/`continue` flagged as fail-stop violations; `return_home` calls a `std_srvs/Trigger` on `/return_home` (degrades to stop). Wired through **both** prod paths (Dockerfile CMD + launch file) + compose env; read-only in Settings → Robot. No hardware-verify gate (server logic, unit-covered) but a real-robot smoke (timeout → expected behavior per mode, esp. return_home service) is worth doing before relying on it operationally.
>
> **Build these next in order (fastest-to-ship value first; estimates are dev-only, exclude hardware-verify):**
> 1. **Battery telemetry** (~2 d) — fills the faked `BAT —` `<Readout>` (MissionControl.tsx:424/695); server C++ + `protocol.ts` exist. Plan: `docs/superpowers/plans/2026-05-06-battery-telemetry-implementation.md`
> 2. **Network quality** (~2 d) — fills the faked `SIG —` `<Readout>`; client-side. Plan: `docs/superpowers/plans/2026-05-06-network-quality-implementation.md`
> 3. **Latency history graph** (~2–3 d) — `useTeleopBridge` already exposes `latencyMs`; pure React chart. Plan: `docs/superpowers/plans/2026-05-06-latency-graph-implementation.md`
> 4. **Map view** (~3–5 d) — reuse the React MiniMap + `map_render.ts` transport (plan shrank); also unblocks geofence's editor. Plan: `docs/superpowers/plans/2026-05-06-map-view-implementation.md`
> 5. **Geofence** (~4–6 d) — SAFETY; standalone logic module, but its visual polygon editor needs Map view first. Plan: `docs/superpowers/plans/2026-05-06-geofence-implementation.md`
>
> **After geofence: on hold / unscheduled** — diagnostics, action macros, multi-camera, then the larger/hardware-or-infra items (PTZ + aux outputs need real hardware; session recording, multi-observer, bidirectional audio, OTA — defer + re-scope before estimating). Do not build PTZ/aux/audio blind — validate against hardware to avoid the "verified only in tests" trap.

### Milestones + deviations

Full history + per-feature detail: [milestones.md](memory/agent-guides/milestones.md). Accepted deviations: [deviations.md](memory/agent-guides/deviations.md) (append new ones there). Most recent: disconnect-after behavior — SAFETY (646/96/20/84), scan↔map sync capture-pose overlay (634/96/20/75), robot config settings page + post-merge fixes (602/96/20/72).

---

## Document index

| Need | Read |
|---|---|
| Run stack now | Layer 1 (below) |
| Build, test, docker commands | [repository-structure.md](memory/agent-guides/repository-structure.md) |
| Deviations / milestones | [deviations.md](memory/agent-guides/deviations.md) / [milestones.md](memory/agent-guides/milestones.md) |
| Tech stack + dependencies | [techstack.md](memory/agent-guides/techstack.md) |
| Message protocol + data types | [data-schema.md](memory/agent-guides/data-schema.md) |
| Git workflow + doc-update rules | [version-control.md](memory/agent-guides/version-control.md) |
| TDD standard, guardrails, task guides | [project-skills.md](memory/agent-guides/project-skills.md) |
| Shipped: gamepad cold-start detection (operator cold-browser verify pending) | `docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md` |
| Shipped plans + specs | `docs/superpowers/{plans,specs}/` — dated filenames; feature → plan mapping via [milestones.md](memory/agent-guides/milestones.md) |
| Code review report + fix plan (2026-05-27) | `docs/2026-05-27-codebase-review.md`, `docs/superpowers/plans/2026-05-27-codebase-review-fixes.md` |

### Feature plan pool (waiting on user to pick priority)

**Safety + control**
- Geofence: `docs/superpowers/plans/2026-05-06-geofence-implementation.md`
- ~~Disconnect behavior~~ — **shipped** 2026-06-15 (`feat/disconnect-behavior`); plan: `docs/superpowers/plans/2026-05-06-disconnect-behavior-implementation.md`

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
