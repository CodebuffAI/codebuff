# Harness Weakness Fixes — LESSONS

## Planning decisions
- Use a new durable session `harness-weakness-fixes-2026-06` rather than overwriting the existing audit session. The audit packet remains historical source context; this packet is the implementation roadmap for the weaknesses called out in the final audit summary.
- Prioritize runtime-enforced invariants over prompt text. Prompt mandates remain useful for guidance, but correctness should live in tools, typed state, and tests.
- Decompose `base2.ts` behavior-preservingly before deeper gate changes where practical. This reduces risk when implementing fingerprints and telemetry.
- Treat read-before-edit enforcement as the highest-value but highest-risk change. It should get focused tests and may need a staged/feature-flagged rollout.
- Reviewer freshness should hash working-tree content, not git index/status alone, because unstaged edits are the normal agent workflow.
- Plan artifact auto-updates should be conservative: update matching task lines and append lesson blocks, but preserve user prose.

## Context gathered
- Existing audit artifacts already identify the same weaknesses and partial implementation status:
  - `.agents/sessions/harness-audit-2026-06/SPEC.md`
  - `.agents/sessions/harness-audit-2026-06/PLAN.md`
  - `.agents/sessions/harness-audit-2026-06/STATUS.md`
  - `.agents/sessions/harness-audit-2026-06/LESSONS.md`
- File-picker agents confirmed primary source surfaces:
  - `agents/base2/base2.ts`
  - `agents/context-pruner.ts`
  - `agents/reviewer/code-reviewer.ts`
  - `agents/editor/editor.ts`
  - `packages/agent-runtime/src/process-str-replace.ts`
  - `packages/agent-runtime/src/process-edit-transaction.ts`
  - `packages/agent-runtime/src/run-agent-step.ts`
  - `packages/agent-runtime/src/tools/handlers/tool/read-files.ts`
  - `packages/agent-runtime/src/tools/handlers/tool/write-file.ts`
  - `cli/src/commands/plan-artifacts.ts`
  - `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts`
- Code-search confirmed relevant terms and existing tests around `basedOnRead`, `readCapability`, `run_file_change_hooks`, reviewer verdicts, fingerprints, create_plan, and update_plan_status.

## Gotchas to remember during implementation
- The repository has a large pre-existing dirty working tree. Do not make assumptions from broad diff output; always inspect exact target files and avoid unrelated cleanup.
- CLI release/build follow-up: verify regenerated bundled agents include the `base2.ts` changes. Do not imply or require manual edits to generated bundled-agent output unless the build/release process explicitly calls for it; if the bundle is generated during normal CLI build/release, document that path rather than editing generated output by hand.
- Some current tests intentionally allow unique large-file edits without `basedOnRead` or ignore stale anchors in specific cases. Read-before-edit enforcement will need to update those expectations deliberately rather than accidentally.
- Capability tracking must be scoped per turn and invalidated after edits to the same path; otherwise stale reads become a false sense of safety.
- Reviewer structured output must remain backward compatible with prose prefixes, and ambiguous output should continue to fail closed.
- Fingerprint telemetry must not log file contents. Hash prefixes and normalized paths are enough.
- PlanLink auto-update must reject path traversal and symlink escapes; existing `update_plan_status` reportedly already hardened this area.

## Implementation notes
- Reviewer durable pass freshness now hashes live working-tree file bytes as part of the gate fingerprint. This catches same-path edits that would be invisible to path-only durable pass reuse.
- The fingerprint marker intentionally records `sha256:<hash>:<byteLength>` plus status-line context and validation summary, not file contents.
- Missing files and unreadable files produce deterministic markers (`missing` or `unreadable:<code>`) so durable pass reuse fails closed.
- In serialized `handleSteps` execution, relying only on `globalThis.require` is brittle. Use `process.getBuiltinModule` when available for Node built-ins, with `require` as fallback.
- Regression tests should create real temporary files when validating content-hash behavior; synthetic paths are useful for gate flow, but cannot prove live working-tree hashing.
- `replace_range` stale hashes should remain blocking. The safe fix is better diagnostics and explicit fresh `read_files.ranges` retry guidance, not auto-applying against moved or changed content.
- For stale range failures, the diagnostic should name the requested span, checked span, current file length, expected hash, current hash, and a concrete re-read command shape so an agent can recover deterministically.
- Repeated durable-pass test setup should use a helper for the serialized `base2ActiveWork` shape; this keeps future fingerprint format changes localized.
- Splitting normalized content on `\n` produces a trailing empty element when the file ends with a newline. Report a human-friendly `displayLineCount` (drop a trailing empty element) in error messages and clamp stale-range checked spans to that visible line count, so agents do not see phantom lines that a fresh `read_files` result would not render.
- Only mention the "checked current lines" span when it actually differs from the requested span. Repeating the same span as noise distracts an agent that is recovering from a stale range.
- For replace_range stale recovery guidance, instruct agents to re-read first and only retry if the fresh read still contains the intended target; switching to `str_replace`/`rewrite_symbol` should be a fallback for confirmed movement, not a default shortcut.
- When narrowing a filesystem `try`/`catch`, surface the error `code` (e.g. `ENOENT`, `EACCES`) for read failures so the recovery agent can route on the cause instead of guessing; let write/patch failures surface normally rather than wrapping unrelated operations.
- `replace_range` guidance should consistently use human-visible line spans: if a file ends with a newline, do not instruct agents to re-read a trailing phantom split segment; clamp retry examples to `endLine <= Current file length` and mirror that rule in the tool description.
- For Milestone 1, type-only extraction is safe before runtime helper extraction: `import type` aliases are erased, so the serialized `handleSteps` test still passes. Runtime helpers must stay inline until the serialization boundary is redesigned or explicitly relaxed.
- A safe intermediate boundary is to extract pure helpers to tested modules while keeping exact inline mirrors in `handleSteps`; this documents and tests the target boundary without making serialized `handleSteps` depend on module-scope imports.
- For inline-mirror drift tests, prefer transpiling extracted TypeScript helper source with `Bun.Transpiler` before evaluating it. This avoids brittle hand-written TypeScript annotation stripping as helper signatures evolve.
- Milestone 2 landed as staged strict mode, not default-on enforcement. This preserves compatibility for existing agents/tests while proving the runtime can block unread `str_replace` / `edit_transaction` paths and invalidate per-path authorization after successful edits.
- Treat `basedOnRead` as an explicit authorization path for strict edit flows; it remains useful when a caller passes a concrete fresh range/symbol capability instead of relying on the per-turn read registry.
- Gate telemetry must be best-effort and non-blocking. In serialized `handleSteps`, keep telemetry helpers inline and wrap logging in `try`/`catch`; user-visible `<gate-state>` blocks are the reliable UI contract while console telemetry is diagnostic only.
- When exposing a new tool to bundled agents, update every generated/static tool-name surface, not only shared runtime registration. `update_plan_status` was already in common tool constants/list, but `agents/types/tools.ts` and `common/src/templates/initial-agents-dir/types/tools.ts` also needed union/map entries for `agents/` typecheck to pass.
- Deterministic lifecycle E2E can live at the Base2 generator boundary: feed synthetic tool results for `git_status`, `run_file_change_hooks`, and reviewer output instead of invoking live providers or timing-sensitive end-to-end flows.
- Base2 codebase-oriented prompts may yield an initial `query_index` before `git_status`; lifecycle tests for edit-oriented prompts should explicitly consume that indexed-context step, while generic/no-edit prompt tests can still assert the direct `git_status` path.
- Gate pass wording can differ between reviewer-only and validation+reviewer branches. Prefer asserting stable semantics (`<gate-state>` JSON and verdict/status fields) plus minimal user-facing phrasing rather than brittle full-message text.
- For root-level Markdown docs, run Prettier directly on the touched files. The web docs integrity script must be run from `web/` as `bun run test:docs:integrity`; `bun --cwd web run test:docs:integrity` printed Bun usage instead of executing the package script.

## Follow-up notes
- Consider adding a small architecture note after Milestone 1 showing the new gate helper boundaries.
- If read-before-edit strict mode is too disruptive, land it first as warning/telemetry, then flip to blocking once agents/tests are updated.
- Lifecycle E2E tests should use mocked/synthetic reviewer and validation outputs, not live model/provider calls.
- Docs should be updated after implementation, not before, to avoid documenting aspirational behavior.
- Milestone 0 baseline should remain bookkeeping-only: re-read `git_status` plus the historical audit packet, then explicitly isolate plan-owned files before touching central harness code.
