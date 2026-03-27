# Version Control

## Branch strategy

- `main` — stable; never commit directly while a feature branch is in progress
- `feat/<feature>` — new work (e.g. `feat/server-implementation`)
- `fix/<issue>` — bug fixes

## Pre-commit checklist

Before every commit, in this order:

1. `docker build --target builder --network=host` — build must succeed
2. `docker run --rm --network=host <image> bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon test --event-handlers console_direct+"` — 0 test failures required
3. **Doc freshness check** — read the "Keeping docs current" table below and update every entry that applies to this change. Also verify:
   - `AGENTS.md` handoff table matches actual task state and is written for a new agent (see "Writing the handoff state for a new agent" below)
   - Head SHA in `AGENTS.md` matches the commit just made
   - **Do not edit `CLAUDE.md` directly** — it is a symlink to `AGENTS.md`; editing `AGENTS.md` is sufficient

All three steps must complete before `git commit`.

## Commit conventions

- **One commit per completed task**
- Prefix: `feat:` / `fix:` / `docs:`
- Imperative mood: "add X", "fix Y", not "added X" or "fixing Y"
- One logical change per commit — do not bundle unrelated changes

```bash
git commit -m "feat: add Docker scaffolding for ROS2 server"
```

## Push workflow

After committing, ask the user to review the commit before pushing. Do not push automatically.

```
"Committed as <hash>. Ready to push — shall I?"
```

Only push after explicit confirmation.

After pushing, ask for confirmation before moving to the next task.

```
"Pushed. Ready to move on to Task N — shall I?"
```

Do not start the next task until the user confirms.

## Merge and tag

```bash
# After all tasks pass review
git checkout main
git merge --no-ff feat/server-implementation
git tag v0.1.0-server
```

## Keeping docs current

**Update docs in the same commit as the code change they document.** Before committing, check:

| Change | What to update |
|---|---|
| New ROS2 parameter | `data-schema.md` configuration table |
| Message type added or changed | `data-schema.md` protocol tables |
| Port number changed | `repository-structure.md` port table + `data-schema.md` |
| New file added to `server/` | `repository-structure.md` file map |
| Task completed | `AGENTS.md` handoff table (see below) — `CLAUDE.md` is a symlink, do not edit it directly |
| New task added | `project-skills.md` task guides + `AGENTS.md` handoff table |
| New guardrail identified | `project-skills.md` guardrails table |
| New document created | `AGENTS.md` document map |

Do not append changelogs at the bottom of files. Edit the relevant section in place.

### Writing the handoff state for a new agent

The Handoff State in `CLAUDE.md` is the first thing the next agent reads. It must be self-contained — assume the reader has no knowledge of this conversation.

**Head SHA:** After staging all files but before running `git commit`, run `git rev-parse --short HEAD` to get the current HEAD. The commit you are about to create will extend this — use `--short HEAD` *after* committing and update the SHA field accordingly (or use `$(git rev-parse --short HEAD)` in a post-commit edit).

**Task table rows:**
- Completed task → `✅ Done` with a Notes entry naming what was created or the key test names that now pass
- Next task → `⬜ Next` (exactly one row)
- All others → `⬜ Pending`

**Known deviations:** Add a row for any deviation from the plan. The "Why accepted" column must be concrete enough that a new agent reading it cold would not second-guess or revert the decision.

**Voice:** Write in third person ("the token guard fails loud" not "we added this so it fails loud"). No pronouns that assume shared context.

## Worktrees

Implementation work runs in a git worktree at `.worktrees/feat-server`. Do not recreate it if it already exists. Run `git worktree list` to check.
