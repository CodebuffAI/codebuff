# Openbuff hardening completion plan

1. Validate the rebuilt CLI artifact
   - Run `cd cli && ./bin/openbuff --version`.
   - Run `cd cli && ./bin/openbuff --help` and check the banner/help renders with Openbuff branding.

2. Audit active references to removed agent variants
   - Search active source/config for `editor-multi-prompt`, `code-reviewer-multi-prompt`, `base2-max`, `file-picker-max`, `file-lister-max`, `thinker-best-of-n`, `thinker-selector`, and `best-of-n-selector`.
   - Treat matches in graveyard, backups, fixtures, and historical docs as allowed; active runtime routes/types/tests should either be removed or intentionally updated.

3. Audit Openbuff branding and compatibility aliases
   - Search for user-facing `Codebuff`, `codebuff`, `Freebuff`, and `freebuff` references.
   - Keep `@codebuff/*`, `CodebuffClient`, `CODEBUFF_*`, `codebuff.json`, and `codebuff-local-cli` only where documented as compatibility/internal names.
   - Prefer Openbuff/Openbuff-local terminology in new docs and CLI user-facing text.

4. Run broad validation for touched packages
   - Agents: `cd agents && bun run typecheck` and targeted agent tests already passed; run broader tests if time permits.
   - CLI: run `cd cli && bun run typecheck`, then focused or full CLI tests depending on runtime.
   - SDK: run `cd sdk && bun run typecheck` and provider/context-window tests.
   - Agent runtime/common: run typechecks and focused tests around edit transactions, str_replace, spawn agents, create_plan, suggest_followups, and write_todos.

5. CLI visual smoke check if UI changes remain in scope
   - Use the rebuilt CLI or dev CLI in tmux.
   - Capture `/help` and a short non-mutating prompt.
   - Confirm no obvious layout regression, raw structured payload leakage, or stale Codebuff branding in primary Openbuff UI.

6. Fix only concrete failures
   - For any test/typecheck/reviewer failure, read the exact failure and affected file lines.
   - Make one targeted fix, then rerun the same validation command.

7. Finalize
   - Summarize changed areas, validation commands and results, rebuilt CLI status, and any remaining known risks or intentionally retained compatibility names.