# docs — plans, specs, review reports

## Purpose

Durable design materials: implementation plans, design specs, code-review reports, debug write-ups, and presentation assets. Plans/specs are the deep reference behind the root [milestones.md](../memory/agent-guides/milestones.md) and the feature plan pool.

## Ownership

Owns: `superpowers/plans/`, `superpowers/specs/`, dated review/debug docs (`2026-*.md`), the durable `ARCHITECTURE.md` reference, `assets/`, `screenshots/`. The condensed agent-facing guides live under `memory/agent-guides/`, not here.

## Local Contracts

- **Dated filenames**: `YYYY-MM-DD-<slug>.md`. Feature → plan mapping is via [milestones.md](../memory/agent-guides/milestones.md).
- **Plans are written in wenyan**; no code blocks inside plans (the code itself stays English). Per-feature execution addenda note worktree / trophy-TDD / Haiku rules.
- These are records, not live contracts — read a plan only when a guide/spec can't answer (progressive disclosure). Shipped plans stay for history; mark status in the root Document index, don't delete.
- **`ARCHITECTURE.md`** is the exception to dated naming: a durable, undated module-level reference (browser transport classes, C++ three-layer node, `/ws` wire protocol, ROS2 params). Its diagram source is `assets/architecture-detailed.drawio`; the high-level container view is `assets/architecture.drawio`. Keep both in sync with the child AGENTS.md contracts when those change.

## Work Guidance

(No verification framework — these are documents.)

## Child DOX Index

No children. Leaf boundary.
