# Version Control

## Branch strategy

- `main` — stable; never commit directly while a feature branch is in progress
- `feat/<feature>` — new work (e.g. `feat/server-implementation`)
- `fix/<issue>` — bug fixes

## Pre-commit checklist

Before every commit:

1. `docker build --target builder --network=host` — build must succeed
2. `docker run --rm --network=host <image> bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon test --event-handlers console_direct+"` — 0 test failures required
3. Docs updated (see table below)

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
| Task completed | `AGENTS.md` handoff table |
| New task added | `project-skills.md` task guides + `AGENTS.md` handoff table |
| New guardrail identified | `project-skills.md` guardrails table |
| New document created | `AGENTS.md` document map |

Do not append changelogs at the bottom of files. Edit the relevant section in place.

## Worktrees

Implementation work runs in a git worktree at `.worktrees/feat-server`. Do not recreate it if it already exists. Run `git worktree list` to check.
