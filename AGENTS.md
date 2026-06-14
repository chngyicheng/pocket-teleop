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

> **Current state (2026-06-13):** Robot config settings page shipped — operator edits robot identity / footprint / video source from the web Settings drawer; auth-server `GET`/`PUT /auth/robot-config` writes a secret-free `config/robot.env` (env_file overrides, atomic, allowlisted), teleop-server + video-bridge load it on (re)start. Built atop footprint outline + SW precache + the security sweep (HTTPS/TLS, login rate limit, session idle timeout). Per-feature contracts live in the child AGENTS.md ([web-client](web-client/AGENTS.md), [auth-server](auth-server/AGENTS.md), [server](server/AGENTS.md)); shipped detail in [milestones.md](memory/agent-guides/milestones.md). `v1.0.0` gated on operator hardware checks — open: robot-config end-to-end (edit → restart → new values in `status` JSON + video bridge), footprint screen-direction (Waffle wider than long → long axis must render horizontal), SW real-device behavior, TLS phone root-CA + real ACME, minimap screen-direction.
>
> **Robot config (new):** Tunable keys live in `config/robot.env` (gitignored; seed from `config/robot.env.example`), **not** `.env` — `.env` keeps only secrets + ROS/network/TLS. Edited from the web Settings drawer: **Video** section owns `VIDEO_TOPIC`/`VIDEO_TOPIC_TYPE` (grouped under the runtime Source picker), **Robot** section owns identity + footprint; each Save is a partial PUT to `/auth/robot-config`. Changes apply on next `docker compose ... up -d` (live runtime apply deferred; front-end restart button rejected as host-root risk). **Upgrade migration:** existing deployments must copy their seven `.env` values into `config/robot.env` once, else video/identity revert to defaults (TROUBLESHOOTING).
>
> **Run stack:** `docker compose -p pocket-teleop --env-file ./.env up --build -d` (`-p` keeps the `auth-data` volume; `down -v` resets creds). **Restart `teleop-server` after any sim restart** — tf2 rejects post-restart transforms as TF_OLD_DATA (TROUBLESHOOTING).
>
> **Deployment must-do (host):** `sudo ufw allow from <lan-subnet>/24 to any port 8891 proto udp` — else video ICE fails.
>
> **Test baseline:** webclient **602** pass / **11** skipped / auth **96** / video-bridge **20** / C++ **72**. Docker only; `--build` required after edits. Known non-regression reds: auth `mediamtx_integration.test.ts` (3, needs `--profile integration` + live MediaMTX); `integration.test.ts` self-skips without a live server.
>
> **Subagent/worktree gotchas:** (0) subagents never run git — controller stages by explicit path (a blanket `git add` once swept 2754 files). (1) a Haiku's cwd can pin to the main repo instead of the worktree — check `git status` in BOTH; it may "re-create" files already on the branch (transfer only new wiring). (2) Docker may leave root-owned `node_modules` in a worktree — `docker run --rm -v <path>:/w alpine chown -R 1000:1000 /w` before `git worktree remove`.
>
> **Next — operator to pick (2026-06-14).** Remaining security/health pool: geofence → disconnect behavior → battery telemetry → diagnostics panel → network quality. Open plans: scan↔map sync fix A (`docs/superpowers/plans/2026-06-14-scan-map-sync-implementation.md` — pairs each scan with its capture pose so scan overlays map walls; hardware-verify); gamepad cold-start detection (`docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md`). Pool plans carry a 2026-06-11 execution addendum — re-verify file refs against current code.

### Milestones + deviations

Full history + per-feature detail: [milestones.md](memory/agent-guides/milestones.md). Accepted deviations: [deviations.md](memory/agent-guides/deviations.md) (append new ones there). Most recent: robot config settings page + post-merge fixes (602/96/20/72), footprint outline + SW precache (599/64/20/72), session idle timeout (570/64/20/69).

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
| Pending plan: gamepad cold-start detection | `docs/superpowers/plans/2026-06-07-gamepad-cold-start-detection.md` |
| Shipped plans + specs | `docs/superpowers/{plans,specs}/` — dated filenames; feature → plan mapping via [milestones.md](memory/agent-guides/milestones.md) |
| Code review report + fix plan (2026-05-27) | `docs/2026-05-27-codebase-review.md`, `docs/superpowers/plans/2026-05-27-codebase-review-fixes.md` |

### Feature plan pool (waiting on user to pick priority)

**Safety + control**
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
