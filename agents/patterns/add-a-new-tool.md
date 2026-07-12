# Pattern: Add a new tool to the agent runtime

## When to use

You need to add a new tool (e.g. a read-only query, a state mutation, or a
code-gen helper) that agents can call during a run.

## Steps

1. **Define the params schema** in `common/src/tools/params/tool/<tool-name>.ts`.
   - Export a Zod schema and an inferred `Params` type.
   - Follow the shape of a sibling file (e.g. `str-replace.ts`,
     `update-plan-status.ts`): `export const <tool>Params = z.object({...})`.
   - If the tool takes a `basedOnRead` anchor or `path`, reuse
     `common/src/tools/params/based-on-read.ts`.

2. **Register the tool name** in `common/src/tools/constants.ts`:
   - Add the tool to the `ToolName` union and any relevant allowlists
     (e.g. `TOOLS_WHICH_WONT_FORCE_NEXT_STEP` if it should not force a
     follow-up model step).
   - Add the params module to the params registry if one exists.

3. **Implement the handler** in
   `packages/agent-runtime/src/tools/handlers/tool/<tool-name>.ts`.
   - Follow the `ToolHandler` interface used by sibling handlers.
   - Return a structured result; do not throw for expected user errors —
     return a descriptive error result instead so the model can recover.
   - Use the shared `Logger` for warnings, not `console`.

4. **Wire the handler** in
   `packages/agent-runtime/src/tools/tool-executor.ts` (or the tool
   dispatch table it reads from). Add a case for the new tool name.

5. **Write tests** at
   `packages/agent-runtime/src/tools/handlers/tool/__tests__/<tool-name>.test.ts`.
   - Cover happy path + at least one validation-error case.
   - Use the existing test fixtures in `common/src/testing/fixtures/`.

6. **Document** in the tool's params file header comment and, if user-facing,
   in `docs/`.

## Validation

```bash
bun --cwd=common run typecheck
bun --cwd=packages/agent-runtime run typecheck
bun test packages/agent-runtime/src/tools/handlers/tool/__tests__/<tool-name>.test.ts
```

## Conventions

- Tool names are `kebab-case`.
- Params files live in `common/src/tools/params/tool/`; handlers in
  `packages/agent-runtime/src/tools/handlers/tool/`.
- Never cast to `any`; use Zod inference for the params type.
- Read-before-edit: if the tool mutates files, reuse the `basedOnRead`
  capability flow from `str_replace`/`replace_range`.

## Risks

- Forgetting to add the tool to `ToolName` causes a type error at the
  dispatch site — fix by extending the union in `constants.ts`.
- Tools that mutate durable state should also emit a plan event via
  `appendPlanEvent` if the change should appear in `/plan-timeline`.
