# Agents and Tools

## Agents

- Prompt/programmatic agents live in `.agents/` (programmatic agents use `handleSteps` generators).
- Generator functions execute in a sandbox; agent templates define tool access and subagents.

### Shell Shims

Direct commands without `codebuff` prefix:

```bash
codebuff shims install codebuff/base-lite@1.0.0
eval "$(codebuff shims env)"
base-lite "fix this bug"
```

## Tools

- Tool definitions live in `common/src/tools` and are executed via the SDK helpers + agent-runtime.

