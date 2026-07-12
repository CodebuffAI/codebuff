# Openbuff Patterns Library

Curated, reusable task guides for common implementation workflows. Each
pattern is a short markdown file describing the concrete steps, target
files, conventions, and validation commands for a recurring task type.

This INDEX is rendered into the agent system prompt (via the
`{CODEBUFF_PATTERNS_INDEX}` placeholder) so agents know which patterns
exist. Individual pattern files are **not** auto-loaded — agents should
`read_files` the specific pattern on demand when a task matches.

The `index-sync` checker in `scripts/memory-drift-guard.ts` lints this
file for entries pointing at files that no longer exist on disk.

| pattern            | file                                    | description                                                                            |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------------------- |
| audit-codebase     | `agents/patterns/audit-codebase.md`     | Run a comprehensive multi-domain codebase audit via a shard→scratchpad→synthesize flow |
| add-a-new-tool     | `agents/patterns/add-a-new-tool.md`     | Add a new tool to the agent runtime (params + handler + registration)                  |
| ship-a-cli-command | `agents/patterns/ship-a-cli-command.md` | Add a new CLI slash command with argument parsing                                      |
| extend-the-sdk     | `agents/patterns/extend-the-sdk.md`     | Extend the SDK provider/model layer                                                    |
| add-an-agent       | `agents/patterns/add-an-agent.md`       | Add a new agent template to the registry                                               |
| run-targeted-tests | `agents/patterns/run-targeted-tests.md` | Run focused typechecks and tests per package                                           |

## Editing this file

- Add one row per pattern. Keep the table alphabetically sorted by `pattern`.
- `file` is the repo-root-relative path to the pattern markdown.
- `description` is a single short sentence — keep it under ~80 chars so the
  rendered prompt section stays compact.
- When you remove a pattern, delete its row **and** its file in the same
  change so the `index-sync` checker stays green.
