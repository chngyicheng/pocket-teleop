# memory/agent-guides — condensed agent guides

## Purpose

The progressive-disclosure guide files the root AGENTS.md links to. Each is the authoritative, condensed reference for one concern; the root Document index routes here before anything in `docs/`.

## Ownership

Owns: `repository-structure.md` (build/test/file map), `techstack.md`, `data-schema.md` (protocol, C++ types, ROS2 params, env vars), `version-control.md` (git workflow + doc-update rules), `project-skills.md` (TDD standard, guardrails, task guides), `milestones.md` (full history), `deviations.md` (one row per accepted deviation).

## Local Contracts

- **Authoritative test counts live in the root AGENTS.md "Test baseline"** — guide files describe tests by purpose, not number (per-file counts rot).
- **Code change ships with a doc change in the same commit.** Per-feature rationale → `deviations.md` (reason a cold reviewer accepts); finished work → `milestones.md` + root Milestones table.
- Third person, zero-context reader. Document stable contracts, not diary entries. Delete stale notes rather than explaining history.

## Work Guidance

(No verification framework — these are documents. Verify by keeping them consistent with the code they describe.)

## Child DOX Index

No children. Leaf boundary.
