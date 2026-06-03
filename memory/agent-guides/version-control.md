# Version Control

## Branch strategy

- `main` — stable; never commit directly while a feature branch is in progress
- `feat/<feature>` — new work (e.g. `feat/server-implementation`)
- `fix/<issue>` — bug fixes

## Pre-commit checklist

Before every commit, in this order:

1. `docker build --target builder --network=host` — build must succeed
2. `docker run --rm --network=host <image> bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon test --event-handlers console_direct+"` — 0 test failures required
3. **Doc freshness check** — read "Keeping docs current" table below, update every applicable entry. Also verify:
   - `AGENTS.md` handoff table matches actual task state, written for new agent (see "Writing the handoff state for a new agent" below)
   - **Do not edit `CLAUDE.md` directly** — symlink to `AGENTS.md`; edit `AGENTS.md` only

All three steps must complete before `git commit`.

## Commit conventions

- **One commit per completed task**
- Prefix: `feat:` / `fix:` / `docs:`
- Imperative mood: "add X", "fix Y", not "added X" or "fixing Y"
- One logical change per commit — no bundling unrelated changes

```bash
git commit -m "feat: add Docker scaffolding for ROS2 server"
```

## Push workflow

After committing, ask user to review before pushing. No auto-push.

```
"Committed as <hash>. Ready to push — shall I?"
```

Push only after explicit confirmation.

After pushing, ask confirmation before next task.

```
"Pushed. Ready to move on to Task N — shall I?"
```

No next task until user confirms.

## Merge and tag

```bash
# After all tasks pass review
git checkout main
git merge --no-ff feat/server-implementation
git tag v0.1.0-server
```

## Keeping docs current

**Update docs in same commit as code change they document.** Before committing, check:

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
| User-visible feature added, changed, or removed | `README.md` — update relevant section in place |

No changelog appends. Edit relevant section in place.

### Writing the handoff state for a new agent

Handoff State in `CLAUDE.md` is first thing next agent reads. Must be self-contained — assume reader has zero context from this conversation.

**Task table rows:**
- Completed task → `✅ Done` with Notes naming what was created or key test names now passing
- Next task → `⬜ Next` (exactly one row)
- All others → `⬜ Pending`

**Known deviations:** Add row for any plan deviation. "Why accepted" column must be concrete enough that new agent reading cold would not second-guess or revert.

**Voice:** Third person ("the token guard fails loud" not "we added this so it fails loud"). No pronouns assuming shared context.

## Worktrees

Implementation runs in git worktree under `.worktrees/`. No recreating existing worktrees. Run `git worktree list` to check.

- `.worktrees/feat-server` — used for server implementation (complete)
- `.worktrees/feat-client` — used for web client implementation (complete)