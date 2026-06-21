# LESSONS — BYOK-only CLI/SDK cleanup

## Decisions
- Openbuff product scope is CLI/SDK local BYOK.
- Hosted web, billing, credits, subscriptions, freebuff, hosted dashboard, and product OAuth login are out of scope unless proven necessary for CLI/SDK development.
- Provider-owned OAuth/subscription access, such as ChatGPT/OpenAI subscription-style model access, must be preserved.
- Compatibility names such as `@codebuff/*`, `CodebuffClient`, `CODEBUFF_*`, `codebuff.json`, and `codebuff --local` may remain only as explicit legacy compatibility surfaces.

## Gotchas
- The worktree is already large before this cleanup. The rollback checkpoint must be committed before source cleanup so deletions and rewrites can be reverted independently.
- Updating STATUS.md with the checkpoint hash after committing will create a small post-checkpoint plan-artifact change unless recorded in a follow-up commit.

## Follow-up notes
- During inventory, verify imports before deleting large directories; do not assume `web/` or hosted packages are unreferenced without checking root scripts, package references, and TypeScript project references.