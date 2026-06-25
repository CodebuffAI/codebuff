# Openbuff ROUTER (P0.11, mex-borrowing)

Task-routed knowledge loader. Mirrors the mex `ROUTER.md` pattern: this
file maps each shipped agent identity to the subset of project knowledge
files it should load into its system prompt, so agents that only need a
subset of the docs don't pay the full context cost on every turn.

The runtime currently has no task-type discriminator, so the routing key
is the agent identity (`agentTemplate.id`). When this file is absent, the
loader falls back to today's behavior (all root knowledge files).

This file is consumed by `common/src/util/router.ts` and wired into the
agent runtime via the `{CODEBUFF_ROUTED_KNOWLEDGE_FILES}` placeholder in
`packages/agent-runtime/src/templates/strings.ts`. The P0.12 drift suite
(`scripts/memory-drift-guard.ts`) lints this file for entries that point
at files which no longer exist on disk.

| agent | knowledge_files |
| --- | --- |
| base2 | AGENTS.md, docs/architecture.md, docs/agents-and-tools.md, docs/deterministic-edit-system.md |
| base2-evals | AGENTS.md, docs/testing.md |
| base2-execute-plan | AGENTS.md, docs/architecture.md, docs/development.md |
| base2-fast | AGENTS.md |
| base2-fast-no-validation | AGENTS.md |
| base2-plan | AGENTS.md, docs/architecture.md, docs/development.md |

## Editing this file

- Add one row per shipped agent identity. Keep the table alphabetically
  sorted by agent so drift tools can diff against the registry.
- Files are listed comma-separated. Paths are repo-root-relative. Use the
  basename (`AGENTS.md`) for files at the project root; use the full path
  (`docs/architecture.md`) for subdirectory docs.
- Agents not listed here will fall back to the full root knowledge set,
  so this table should grow rather than shrink as we add new agents.
- The P0.12 `tool-config-sync` checker will warn when a row points at a
  file that no longer exists, so this file should not be a free-form
  scratchpad — keep it in sync with the repo.