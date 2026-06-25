# Pattern: Add an agent template

## When to use
You need to add a new agent (e.g. a specialized reviewer, a plan executor,
or a custom domain agent) that can be spawned by the root agent or invoked
as a top-level agent.

## Steps

1. **Define the agent template** in `agents/<agent-name>/<agent-name>.ts`.
   - Export an `AgentTemplate` object with `id`, `displayName`, `model`,
     `systemPrompt`, `tools`, and `subagents` fields.
   - Follow the structure of `agents/editor/editor.ts` or
     `agents/base2/base2.ts`.

2. **Register the template** in
   `packages/agent-runtime/src/templates/agent-registry.ts`
   (`assembleLocalAgentTemplates`). Add your template to the merged set so
   it's discoverable by `getAgentTemplate`.

3. **Add to the enum** in `common/src/types/session-state.ts`
   (`AgentTemplateTypes`) if the agent is a first-class spawnable type.

4. **Wire spawnable agents** — if the root agent should be able to spawn it,
   add it to `baseAgentSubagents` in
   `packages/agent-runtime/src/templates/types.ts`.

5. **Wire the ROUTER.md table** — add a row for the new agent identity in
   `ROUTER.md` so it loads the correct knowledge files. The `tool-config-sync`
   drift checker will flag the row if it points at a missing file.

6. **Write tests** at `agents/__tests__/<agent-name>.test.ts` covering the
   template shape and (if it has custom step logic) a round-trip.

7. **Document** in `docs/agents-and-tools.md` or `AGENTS.md` if the agent is
   user-facing.

## Validation
```bash
bun --cwd=common run typecheck
bun --cwd=packages/agent-runtime run typecheck
bun test agents/__tests__/<agent-name>.test.ts
bun run --cwd=scripts guard:memory-drift
```

## Conventions
- Agent IDs are `kebab-case` and match the directory name
  (`agents/editor/editor.ts` → `editor`).
- System prompts use `{CODEBUFF_*}` placeholders, not hardcoded values.
- Tools lists reference `ToolName` values from `common/src/tools/constants.ts`.
- Subagents are `AgentTemplateType` enum values, not raw strings.

## Risks
- Forgetting the `ROUTER.md` row — the agent will fall back to all root
  knowledge files (higher token cost) but won't error. The drift guard
  `index-sync` checker won't catch a missing row, only a stale file path.
- Adding an agent to `baseAgentSubagents` without adding it to
  `AgentTemplateTypes` causes a type error — add both in the same change.
