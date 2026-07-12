# Deterministic Edit System

This document records usage guidance for deterministic harness tools that should be consistently registered before agent prompts recommend them.

## Search before editing

Use `find_files_matching_content` when you need the unique set of files whose contents match a ripgrep pattern, without dumping every matching line. This is useful for refactor planning and follow-up targeted reads:

```json
{
  "pattern": "handleCodeSearch",
  "cwd": "packages/agent-runtime/src",
  "groupBySymbol": true
}
```

Prefer `code_search` when the matching lines and surrounding context are needed. Prefer `find_files_matching_content` when the next step is deduping file paths and reading or editing those files. The tool streams ripgrep output internally into bounded, deduped file sets so large searches do not require holding the full stdout payload in memory; future client protocols can expose those internal progress updates incrementally.

## Background jobs at turn boundaries

`run_terminal_command` with `process_type: "BACKGROUND"` registers running jobs in a shared process registry. `end_turn` surfaces any still-running job IDs so agents do not silently leak dev servers, watchers, or log tails across turns. Use `check_job`, `read_logs`, or `kill_job` to inspect or stop them before finishing when appropriate.

## Staged read-before-edit enforcement

Active edit tools (`str_replace`, `write_file`, `replace_range`,
`rewrite_symbol`, `edit_transaction`, and `apply_patch`) participate in a
staged read-before-edit policy. `apply_smart_patch` remains registered for
persisted/external compatibility but is quarantined from shipped agents so new
workflows use the single authority-backed `apply_patch` surface.
Under strict-mode edit flows, the runtime requires a recent `read_files`
authorization for each touched path before accepting an edit:

- A successful complete whole-file `read_files.paths` call mints a per-path
  authorization for follow-up exact-match edits and returns a short
  `readCapability` that can be copied directly when explicit proof is needed.
  Truncated reads expose no capability. Range and symbol reads stay scoped:
  follow-up edits must carry their `readCapability`/`rangeHash` rather than
  receiving whole-file authorization.
- `basedOnRead` (the read capability returned from a `read_files` range
  header, or the freshly echoed capability on a successful large-file
  edit) is the explicit authorization path. The runtime verifies the
  embedded hash and rejects stale or mismatched anchors before any file
  is changed.
- A successful edit keeps the path-level authorization during the editing
  flow, and exact-match edits chain from the latest prepared content. This
  authorization is not a content-freshness proof; carry forward the echoed
  post-edit `basedOnRead` for the same region or re-read before a
  large/ambiguous follow-up edit.
- On a stale-anchor or anchor-not-found failure, re-read the exact target
  range and retry with the new `basedOnRead` rather than guessing from
  memory. The diagnostic always lists the closest candidate range to
  re-read.

This policy is staged/strict-mode only; tools still apply unique-anchor
`str_replace` edits without `basedOnRead` when ambiguity is not a risk.

## Explicit elision markers

`str_replace.oldString` supports a narrow `...` elision marker after exact
matching fails. The marker is special only when a line's trimmed content is
exactly `...`, and it must be surrounded by exact literal anchor segments.
Each literal segment must contain at least 10 non-whitespace characters,
and the full elided range must resolve to exactly one deterministic match.
Ambiguous or weak elision anchors fail with recovery guidance rather than
falling back to broad fuzzy matching. `replace_range` remains strict: it
uses explicit `startLine`, `endLine`, and `expectedHash`, and does not
accept `...` in place of a range or hash.

## Reviewer / validation gate semantics

The reviewer/validation gate tracks pending gate files, validation hooks,
and a reviewer gate to decide whether a turn may finish green:

- Each pending gate file is recorded with a working-tree content marker
  of the form `sha256:<hash>:<byteLength>` taken from the on-disk
  contents at the time of the pass.
- Durable pass freshness compares the current file's marker against the
  recorded marker. If the marker has changed (edit, truncation, byte
  drift), the prior pass is discarded and the gate must re-run.
- Missing or unreadable files fail closed: the gate refuses to mark the
  turn green rather than treating an absent file as implicitly passing.
- The user-visible contract is a structured `<gate-state>` block.
  Downstream tooling and agents should parse that block rather than
  scraping surrounding prose.
- File contents themselves are not logged into gate state or
  transcripts. Only the marker (hash + byte length) and pass/fail
  status are recorded.

### Subagent and parallelism policy

Subagent use is phase-triggered orchestration policy, not a random choice. The policy covers every high-impact orchestration candidate:

- Context-gathering breadth: classify each task as `tiny`, `focused`,
  `multi-file`, `cross-subsystem`, or `unknown surface` before editing.
  Tiny tasks read the directly relevant file; focused tasks also inspect
  adjacent tests/callers; multi-file tasks search and read representative
  files; cross-subsystem or unknown-surface tasks use `query_index`,
  `list_directory`, `glob`, and parallel file-picker/code-searcher shards.
- Tool choice: route repository state to `git_status`, source inspection to
  `read_files`/`read_outline`/`read_subtree`/`glob`/`list_directory`/
  `query_index`, images to `read_image`, whole-symbol edits to
  `rewrite_symbol`, related edits to `edit_transaction`, configured hooks
  to `run_file_change_hooks`, visual smoke tests to browser/CLI visual
  agents, and only use shell commands through `basher` when no dedicated
  tool exists.
- Ask-user decisions: require confirmation for destructive commands,
  public API or contract changes, dependency additions, schema/data
  migrations, release/publish/deploy actions, production-affecting scripts,
  and ambiguous product behavior. For reversible or obvious choices,
  choose the conservative path and proceed.
- Discovery phase: use `query_index` directly, then spawn file-picker,
  code-searcher, or researcher agents when relevant files, APIs, or
  commands are not already obvious.
- Reasoning phase: spawn `thinker` after context discovery for complex
  design, architecture, risk, tradeoff, spec/plan critique, or debugging
  strategy decisions. Explicitly skip it for straightforward edits.
- Implementation phase: spawn `editor` for non-trivial source changes
  with a self-contained implementation brief. Preserve simple-task
  exceptions for direct answers and tiny edits.
- Validation selection: map changed paths to the narrowest deterministic
  suite where possible: `agents/base2/*` to agents typecheck plus prompt,
  gate, or e2e subsets when behavior changes; `agents/*` to agents
  typecheck and relevant agent tests; `packages/sdk/*` to SDK checks;
  `packages/agent-runtime/*` to runtime checks; `common/*` to common
  checks plus dependent package typechecks; `cli/src/components/*` and
  `cli/src/hooks/*` to CLI typecheck plus visual smoke; docs/prompt-only
  changes to configured hooks or a recorded skip reason.
- Repair phase: validation failures and timeouts block completion. Repair
  the exact failure, re-run the relevant validation, and use `debugger`
  when repeated failures or unclear runtime behavior need focused
  diagnosis.
- Reviewer selection: use the automated `code-reviewer` gate for edited
  code; use `security-reviewer` for auth, crypto, secrets, permissions,
  injection, sandboxing, path/process/network handling, supply-chain, or
  production-risk changes; use `test-writer` when behavior changes lack
  coverage; use `debugger` after repeated validation/runtime failures.
- Release/deployment flow: for requested push, release, deployment, or
  publish work, follow status inspection, remote/tag fetch, rebase/merge
  decision, push, CI/CD wait, release trigger, artifact/tag/package
  verification, and local branch sync/reporting. Ask before resolving
  non-fast-forward or conflict decisions unless the user already gave an
  explicit strategy.
- Plan artifact maintenance: in EXECUTE_PLAN update `STATUS.md` and
  `LESSONS.md` at phase boundaries, blockers, validation/review results,
  and finalization. Prefer `update_plan_status` for incremental updates.
- Subagent parallelism: parallelize independent discovery shards,
  independent validation commands, and static review that does not depend
  on validation output. Keep dependent edits, fragile debug loops, and
  validation-repair cycles sequential.
- Join discipline: reviewers spawned in parallel with validation provide
  static review only. Reviewer approval cannot certify still-running or
  failed validation; validation failure/timeout and reviewer/security
  blockers both prevent a green finish.

## Plan artifacts and PlanLink wiring

Durable plan artifacts under `.agents/sessions/<plan>/` are wired into the
TUI through PlanLink slash commands:

- `/resume-plan` — re-attach the current session to an existing plan
  artifact and rehydrate its working context.
- `/update-plan` — open the plan artifact for an incremental edit pass.
- `/plan-status` — print the current task/milestone status, derived from
  `STATUS.md`.
- `/lessons` — append or review lesson notes captured during the plan.

For mutations to plan artifacts:

- Prefer `update_plan_status` for incremental updates to `STATUS.md`
  task lines and append-only lesson notes. It preserves surrounding user
  prose, ordering, and any manual edits the user has already made.
- Use `create_plan` only when creating a new plan artifact or doing a
  whole-artifact rewrite. `create_plan` overwrites; it is not the right
  tool for incremental task or lesson updates.
