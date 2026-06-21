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

Edit tools (`str_replace`, `edit_transaction`, `apply_patch`,
`apply_smart_patch`) participate in a staged read-before-edit policy.
Under strict-mode edit flows, the runtime requires a recent `read_files`
authorization for each touched path before accepting an edit:

- A successful `read_files` call mints a per-path authorization for
  follow-up edits to that path.
- `basedOnRead` (the read capability returned from a `read_files` range
  header, or the freshly echoed capability on a successful large-file
  edit) is the explicit authorization path. The runtime verifies the
  embedded hash and rejects stale or mismatched anchors before any file
  is changed.
- A successful edit invalidates the per-path authorization. To edit the
  same path again, re-read it (or carry forward the echoed post-edit
  `basedOnRead` for the same region).
- On a stale-anchor or anchor-not-found failure, re-read the exact target
  range and retry with the new `basedOnRead` rather than guessing from
  memory. The diagnostic always lists the closest candidate range to
  re-read.

This policy is staged/strict-mode only; tools still apply unique-anchor
`str_replace` edits without `basedOnRead` when ambiguity is not a risk.

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
