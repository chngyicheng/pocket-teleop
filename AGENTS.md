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

- **`git push` approval is PER-ACTION, never a standing session license.** A go-ahead like "merge and push" authorizes exactly that one push of the work in hand — it does NOT license pushing later commits made afterward. Every subsequent push needs its own fresh approval, no matter how small or docs-only the new commits are. Committing locally is fine without asking; after ANY commit, stop and ask before pushing, every time. When unsure whether a prior "push" still applies, it does not — ask.

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

> **LATEST (2026-07-13).** **backlog six** — branch `feat/backlog-6`, ready to merge; all client-side, operator-unverified on hardware. **(1)** nav sends report a dead socket ('Not connected' toast). **(2)** waypoint occupancy check — taps on occupied/unknown cells rejected with a 'Blocked' hint (`cellAtWorld`). **(3)** latency sparkline (rolling 60 RTTs) under the LAT readout in the rails. **(4)** CAM/MAP header toggle — main viewport swaps video for a pannable full-size MiniMap. **(5)** geofence (SAFETY): keep-out polygons in map frame, publisher output scaled by `speedScale` (buffer 0.5 m, inside = 0 + 'Geofence limit' toast); fence editor in the expanded map; localStorage-persisted; guards teleop twist only, NOT nav2 (deviations). **(6)** Diagnostics section in Settings — local freshness rows (ws/video/odom/pose/scan/map/battery). Plan: `docs/superpowers/plans/2026-07-13-backlog-six-implementation.md`.
>
> **Prior (2026-07-13).** **nav feedback** — merged: `nav_state` gains terminal `succeeded`/`failed` (server broadcasts on nav2 result, goal-reject, and action-server-not-ready — fixes silent finish + stuck-`active`); bridge maps them to a transient `navNotice` (4 s auto-clear) rendered by `HudToast` in both views; estop-blocked `sendNavGoal` raises a warn toast instead of a console-only warn. **Operator-unverified on hardware.** Plan: `docs/superpowers/plans/2026-07-10-nav-feedback-implementation.md`; wire contract in server/web-client AGENTS.md.
>
> **Prior (2026-06-22).** **nav2 waypoint send** — merged to `main`; **autonomous drive hardware-confirmed on the real robot.** Tap the expanded minimap → drop a goal (ghost-arrow marker + tip-grip heading) → Send issues a `NavigateToPose` action; Pause/Resume/Stop by nav state; E-STOP cancels + clears; the nav2 global path draws on the map. `NAV_ACTION` web-editable (Settings → Robot); `NAV_PATH_TOPIC`/`NAV_GOAL_FRAME` are `.env`-level. Minimap UX shipped alongside (corner-dock in every layout, expand→pan/zoom, RViz-style heading + ghost-arrow icon). **Tagged `v1.1.0`** (2026-06-22). Detail: [milestones.md](memory/agent-guides/milestones.md); contracts in the child AGENTS.md.
>
> **Run stack:** `docker compose -p pocket-teleop --env-file ./.env up --build -d` (`-p` keeps the `auth-data` volume; `down -v` resets creds). Restart `teleop-server` after any sim restart (tf2 rejects post-restart transforms — TROUBLESHOOTING). **Host once:** `sudo ufw allow from <lan-subnet>/24 to any port 8891 proto udp` (else video ICE fails).
>
> **Robot config:** UI-tunable keys live in `config/robot.env` (gitignored; seed from `config/robot.env.example`), **not** `.env`. Edited from the web Settings drawer (partial PUT to `/auth/robot-config`); applies on next `up -d`. Upgrade: copy old `.env` tunables into `config/robot.env` once (TROUBLESHOOTING).
>
> **Test baseline:** webclient **1013** / auth **98** / video-bridge **20** / C++ **107** (TEST-macro count; `colcon test-result` says 111 — it also counts wrapper layers). Docker only; `--build` after edits. Known reds (not regressions): auth `mediamtx_integration.test.ts` (3, needs `--profile integration` + live MediaMTX); `integration.test.ts` self-skips without a live server.
>
> **Carry-forward:**
> - Pre-existing `npx tsc --noEmit` red in `web-client/test/useTeleopBridge.test.tsx` (`FakeTeleopClient` missing members); vitest `npm test` is the green gate. Worth a cleanup.
> - `return_home` disconnect auto-trigger intentionally OFF (one-line re-enable in `teleop_node.cpp`).
> - HTTPS-only, still operator-unverified: TLS phone root-CA/ACME + service-worker precache (activate only under `--profile tls`; deviations SW row).
>
> **Subagent/worktree gotchas:** subagents never run git (controller stages by explicit path) and **never spawn their own subagents** (no Agent tool — controller is the only dispatcher; say so in every prompt); a Haiku's cwd can pin to the main repo instead of the worktree (check `git status` in both); Docker may leave root-owned `node_modules` in a worktree (`chown` before `git worktree remove`).
>
> **Build next** (latency graph / map view / geofence / diagnostics shipped in backlog-six): action macros / multi-camera / session recording; PTZ/aux/audio need real hardware — don't build blind. Remaining plans under `docs/superpowers/plans/` predate the React migration — re-cast before building. `v1.0.0` released 2026-06-21 (live system confirmed over HTTP; milestones).

### Milestones + deviations

Full history + per-feature detail: [milestones.md](memory/agent-guides/milestones.md). Accepted deviations: [deviations.md](memory/agent-guides/deviations.md) (append new ones there). Most recent: **backlog six** (send feedback / occupancy / sparkline / map view / geofence / diagnostics) — hardware-verify pending, 2026-07-13 (999/98/20/107).

---

## Document index

| Need | Read |
|---|---|
| Run stack now | Layer 1 (below) |
| Software architecture (modules, `/ws` protocol, ROS2 params, data flow) | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Build, test, docker commands | [repository-structure.md](memory/agent-guides/repository-structure.md) |
| Deviations / milestones | [deviations.md](memory/agent-guides/deviations.md) / [milestones.md](memory/agent-guides/milestones.md) |
| Tech stack + dependencies | [techstack.md](memory/agent-guides/techstack.md) |
| Message protocol + data types | [data-schema.md](memory/agent-guides/data-schema.md) |
| Git workflow + doc-update rules | [version-control.md](memory/agent-guides/version-control.md) |
| TDD standard, guardrails, task guides | [project-skills.md](memory/agent-guides/project-skills.md) |
| Shipped: gamepad cold-start detection (operator cold-browser verified; `v1.0.0`) | `docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md` |
| Shipped plans + specs | `docs/superpowers/{plans,specs}/` — dated filenames; feature → plan mapping via [milestones.md](memory/agent-guides/milestones.md) |
| Code review report + fix plan (2026-05-27) | `docs/2026-05-27-codebase-review.md`, `docs/superpowers/plans/2026-05-27-codebase-review-fixes.md` |

### Feature plan pool (waiting on user to pick priority)

**Safety + control**
- Geofence: `docs/superpowers/plans/2026-05-06-geofence-implementation.md`

**Observation**
- Map view: `docs/superpowers/plans/2026-05-06-map-view-implementation.md` (can now reuse the minimap's map/pose/scan transport)
- Multi-camera: `docs/superpowers/plans/2026-05-06-multi-camera-implementation.md`
- Latency history graph: `docs/superpowers/plans/2026-05-06-latency-graph-implementation.md`
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
