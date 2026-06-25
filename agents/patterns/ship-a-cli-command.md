# Pattern: Ship a CLI slash command

## When to use
You need to add a new slash command (e.g. `/plan-timeline`, `/plans`) that
users can invoke from the Openbuff CLI input box.

## Steps

1. **Implement the command** in `cli/src/commands/<command-name>.ts`.
   - Export a function that takes parsed args and returns a result.
   - Follow the pattern of `plan-timeline.ts` or `plan-artifacts.ts`:
     define `parse<Command>Args(argv: string[])`, a `run<Command>(...)`
     function, and a metadata object.

2. **Register the command** in `cli/src/commands/command-registry.ts`.
   - Add an entry with the command name, aliases, description, and a
     reference to your runner.
   - Add any argument schema to the registry's arg-parsing map.

3. **Register slash metadata** so the input bar surfaces it (autocomplete +
   description). The registry wiring test at
   `cli/src/commands/__tests__/command-args.test.ts` asserts every
   registered command exposes metadata — update it if you add a new command.

4. **Write tests** at
   `cli/src/commands/__tests__/<command-name>.test.ts`.
   - Cover argument parsing (valid, missing, invalid) and a round-trip of
     the runner against a temp project root.
   - Use `cli/src/__tests__/test-utils.ts` for stubbing the project root
     resolver.

5. **Document** user-facing commands in `docs/` or `cli/knowledge.md`.

## Validation
```bash
bun --cwd=cli run typecheck
bun --cwd=cli test src/commands
bun test cli/src/commands/__tests__/command-args.test.ts
```

## Conventions
- Command names are `kebab-case` after the leading `/`.
- Aliases are short forms (e.g. `tl` for `plan-timeline`).
- Commands that read durable state should resolve the project root via the
  shared resolver (`setProjectRootResolver`) so tests can stub it.
- Read-only commands return a result object; do not mutate session state
  unless the command is explicitly stateful.

## Risks
- Forgetting to update `command-args.test.ts` — the registry wiring test
  will fail if metadata is missing.
- Commands that call `setProjectRootResolver(...)` directly instead of
  relying on `cli/src/project-files.ts` create duplicate resolver state.
  Set the resolver once in `setProjectRoot`, not per-command.
