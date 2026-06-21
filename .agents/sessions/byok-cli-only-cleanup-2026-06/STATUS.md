# STATUS — BYOK-only CLI/SDK cleanup

## Current state
- Phase: executing Milestone 0 — rollback checkpoint.
- Source cleanup edits: not started.
- Required next action: commit the current worktree as a rollback checkpoint before any cleanup edits.

## Milestone checklist
- [ ] Milestone 0 — Rollback checkpoint
  - [ ] Verify current git status and staged state.
  - [ ] Commit the current worktree before cleanup edits.
  - [ ] Record checkpoint commit hash here.
- [ ] Milestone 1 — Dependency and surface inventory
- [ ] Milestone 2 — Remove hosted product surfaces
- [ ] Milestone 3 — CLI hosted-credit cleanup
- [ ] Milestone 4 — SDK/provider cleanup
- [ ] Milestone 5 — Documentation and agent prompt invariant
- [ ] Milestone 6 — Static guardrails
- [ ] Milestone 7 — Rebuild and final validation

## Validation log
- No cleanup validation has run yet.

## Checkpoint commit
- Pending.

## Resume instructions
1. Continue at the first unchecked milestone above.
2. Do not start cleanup edits until Milestone 0 is complete.
3. After each milestone, update this file with current status, validation results, and next checkpoint.