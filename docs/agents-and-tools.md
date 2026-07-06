# Agents and Tools in Openbuff

Openbuff operates as an orchestrator of specialized, local-first agents. Instead of running model orchestration on a hosted backend, all agent loops, prompt generation, tool calls, and model routing are processed locally on your machine via the `agent-runtime` and `sdk` packages, utilizing your Bring Your Own Key (BYOK) providers.

## Agents

Agents in Openbuff can be either prompt-based or programmatic (utilizing `handleSteps` generator functions).

- Shipped agents reside in the `agents/` monorepo package.
- Project-local or custom agents live in the `.agents/` folder of your project.
- Programmatic agent generator functions execute in a secure sandbox; agent templates define tool permissions and which subagents can be spawned.

### Orchestrator-spawnable vs. pattern-specific agents

Not every shipped agent is directly spawnable by the orchestrator (`base2` / `base-deep`). Agents fall into two categories:

**Orchestrator-spawnable agents** are listed in the `spawnableAgents` array of `base2.ts` and `base-deep.ts`. These are general-purpose specialists the orchestrator can delegate to at policy-defined phase boundaries: `file-picker`, `code-searcher`, `code-reviewer`, `editor`, `thinker`, `basher`, `researcher-web`, `researcher-docs`, `git-committer`, `debugger`, `doc-writer`, `security-reviewer`, `test-writer`, `librarian`, `context-pruner`, and others. Adding an agent to `spawnableAgents` means the orchestrator may spawn it when the current phase and task scope make its capabilities relevant; it does not mean agents should be spawned randomly or for tiny direct-answer tasks.

Common phase triggers and routing policies:

- `file-picker`, `code-searcher`, `researcher-web`, `researcher-docs` — discovery phase when files, APIs, docs, or commands are not already obvious. Scope first as `tiny`, `focused`, `multi-file`, `cross-subsystem`, or `unknown surface`; scale reads/searches and parallel shards accordingly.
- `thinker` — reasoning phase after context gathering for complex design, architecture, tradeoff, risk, spec/plan critique, or debugging strategy choices. Skip it for straightforward edits.
- `editor` — implementation phase for non-trivial source changes, with a self-contained implementation brief because it does not rely on parent context. Skip it for tiny one-file edits and direct answers.
- `basher` — validation phase for tests, typechecks, lints, builds, or command discovery that lacks a dedicated harness tool. Prefer configured hooks and deterministic path-to-suite routing first, such as agents/base2 prompt/gate checks, SDK checks for `packages/sdk/*`, runtime checks for `packages/agent-runtime/*`, common/dependent checks for `common/*`, and CLI typecheck plus visual smoke for `cli/src/components/*` or `cli/src/hooks/*`.
- `debugger` — repair phase after repeated validation failures, runtime failures, or unclear crash behavior.
- `code-reviewer`, `security-reviewer` — review phase after meaningful edits or security-sensitive changes; blocking findings prevent completion. Security review is required for auth, crypto, secrets, permissions, injection, sandboxing, path/process/network handling, supply-chain, or production-risk changes.
- `test-writer`, `doc-writer` — coverage phase when tests or docs are required or directly implied by acceptance criteria.
- `git-committer` and release/deployment workflows — only when explicitly requested or confirmed; follow status inspection, remote/tag fetch, rebase/merge decision, push, CI/CD wait, release trigger, artifact/tag/package verification, and local branch sync/reporting.

Cross-cutting orchestration policy:

- Ask the user before destructive commands, public API/contract changes, dependency additions, schema/data migrations, release/publish/deploy actions, production-affecting scripts, or ambiguous product behavior.
- Prefer dedicated tools over shell fallbacks: `git_status` for repo state, file/read/search tools for inspection, `read_image` for images, deterministic edit tools for edits, configured hooks for validation, and browser/CLI visual agents for smoke checks.
- Maintain durable plan artifacts in EXECUTE_PLAN at phase boundaries, blockers, validation/review results, and finalization.
- Parallelism is allowed for independent discovery shards, independent validation commands, and static review that does not depend on validation output. Dependent edits, fragile debug loops, and validation-repair cycles stay sequential.
- The orchestrator must join all required results before completion. Reviewers running alongside validation provide static review only; failed or timed-out validation still blocks a green finish.

**Pattern-specific agents** are intentionally **excluded** from `spawnableAgents` because they have a narrow contract that only makes sense within a specific workflow pattern. They are spawned by the pattern flow itself, not by the orchestrator:

- **`synthesizer`** — the "reduce" half of the [`audit-codebase`](../agents/patterns/audit-codebase.md) map-reduce pattern. It reads ONLY finding files from a scratchpad directory (`.agents/sessions/<slug>/findings/*.md`) and produces a single cross-cutting audit report. It never reads raw source, has `includeMessageHistory: false`, and uses `outputMode: 'structured_output'`. Spawning it outside the audit pattern would be a misuse: it lacks source-reading tools (no `code_search`, `read_outline`, `query_index`, etc.) and its prompt is scoped to a findings directory, so it cannot perform general review or analysis tasks. The `audit-codebase` pattern spawns it directly in Step 4 (Synthesize) after all shard auditors have written their findings to disk.

The distinction matters because adding a pattern-specific agent to `spawnableAgents` would let the orchestrator spawn it in contexts where its contract doesn't apply, producing confusing or empty results. If you add a new pattern-specific agent, follow the same convention: register it in `openbuff.d/routes.json` so the pattern can route it, but leave it out of `base2`/`base-deep` `spawnableAgents`.

### Model Routing and Configuration

Because Openbuff does not rely on a hosted model registry or credit-balance router, all agent routing is configured directly in your local configuration (`openbuff.json`, the only config file read; no `codebuff.json` fallback). Under [Local BYOK Mode](./local-mode.md), you map individual agents (e.g., `thinker`, `code-reviewer`, or custom agents) to specific providers and models.

### Shared Prompt Sections

Several shipped agents share prompt text through centralized sections rather than maintaining separate copies:

- `agents/base2/quality-prompt-section.ts` exports the shared Code Craftsmanship guidance used by `base2`, `base-deep`, and the `editor` agent. This section is byte-frozen by snapshot tests so the three consumers do not drift accidentally.
- The same file also exports orchestrator-only guidance for gate awareness, security-sensitive file review, and git discipline. `base2` and `base-deep` interpolate those sections; the `editor` intentionally does not, because validation/review, security triage, and git workflow orchestration remain parent-agent responsibilities.
- `common/src/constants/prompt-sections.ts` owns the shared Frontend Development section. `packages/agent-runtime/src/templates/types.ts` exposes it as the `{CODEBUFF_FRONTEND_SECTION}` placeholder, and `packages/agent-runtime/src/templates/strings.ts` replaces that placeholder only when `fileTreeHasFrontendFiles` detects `.tsx` or `.jsx` files in the project tree.
- `common/src/util/language-profiles.ts` owns the `{CODEBUFF_LANGUAGE_PROFILE}` placeholder behavior. It detects TypeScript/JavaScript, Python, Rust, Go, Java, C#/.NET, C/C++, Ruby, PHP, Swift, and Kotlin from `ProjectFileContext.fileTree`, renders only a compact language profile, and tells agents to `read_files` the matching `agents/idioms/<lang>.md` file before non-trivial edits instead of injecting full idiom bodies. To add another first-class language, add a compact `agents/idioms/<lang>.md` contract, extend the language profile mappings, and cover both extension and manifest detection where applicable.
  - Public inputs are file-tree nodes (`FileTreeNode[]`) or an explicit `LanguageProfile[]`; public outputs are stable-order `LanguageProfile` objects or a Markdown prompt string. No supported languages detected returns an empty string.
  - Detection uses source extensions plus common manifests. Source extensions are case-normalized; manifest names are matched exactly (for example, `Package.swift` is Swift, while differently-cased manifest names are not treated as manifests).
  - The rendered prompt lists detected display names, compact per-language guidance, and the matching idiom file path. It intentionally says not to load every idiom file up front.
  - Example output shape:

    ```md
    ## Language profile

    Detected: Rust. Use language-native idioms and existing project conventions. Do not load every idiom file up front.

    - Rust: Respect ownership and borrowing, return Result/Option idiomatically, and keep error handling explicit and precise. Before non-trivial Rust edits, `read_files` `agents/idioms/rust.md`.
    ```
- The `editor` prompt includes Code Craftsmanship plus the conditional language and frontend placeholders, so implementation agents get the same style guidance as the orchestrator without inheriting the parent system prompt.

### Shell Shims

You can run individual specialized agents as direct terminal commands without the `openbuff` prefix. This is handled by shell shims:

```bash
openbuff shims install openbuff/base2@1.0.0
eval "$(openbuff shims env)"
base2 "fix this bug"
```

For backward compatibility, the `codebuff` command prefix may still work as a compatibility alias where the shim is installed; prefer `openbuff`.

## Automated phase-gates

The orchestrator (`base2` / `base-deep`, via the shared `createBase2` generator) runs three automated phase-gates around the existing validation + code-reviewer gate. Each gate is idempotent per pending gate-file set: it fires exactly once for a given set of edited files, and its done-flag resets only when the pending file set changes (order-insensitive). All three gates are guarded by the `runValidationGate` flag, so `base2-fast` / `base2-fast-no-validation` skip them.

The gate predicates are self-contained string/regex matchers defined inline inside `createBase2.handleSteps`. They intentionally do NOT import `micromatch` or any module-scope binding, because `handleSteps` is serialized via `.toString()` and reconstructed with `new Function(...)`; module-scope imports would be `undefined` at reconstruction time. The glob list mirrors the advisory `securityReviewSection` in `agents/base2/quality-prompt-section.ts` so the automated gate and the advisory prompt agree on what counts as security-sensitive.

The three aux gates all fire BEFORE the validation + code-reviewer gate, in this order: `test-writer` → `doc-writer` → `security-reviewer`. After all three aux gates complete (or skip via predicate), the existing validation hooks + `code-reviewer` gate run unchanged as the FINAL gate. The orchestrator's loop waits for each aux spawn to complete before proceeding to the next gate, so the orchestrator does not race `test-writer`, `doc-writer`, or `security-reviewer` and does not duplicate their work during finalization.

1. **`testWriterGate` (pre-reviewer, R1b)** — fires BEFORE the validation/reviewer gate when any pending gate file is a non-test source file in a package with a known test command. Maps file paths to per-package test commands. For each package, the orchestrator runs that package's own `typecheck` and `test` scripts (for example, in `packages/agent-runtime`, `packages/internal`, `common`, `agents`, or `cli`). Files under `__tests__/`, `*.test.ts(x)`, `*.spec.ts(x)`, `*.generated.*`, docs/JSON/YAML/TOML, `.env*`, `docs/`, `evals/`, and `.agents/` are excluded. Spawns `test-writer` with the target files and the inferred `test_command`.
2. **`docWriterGate` (pre-reviewer, R1c)** — fires BEFORE the validation/reviewer gate when any pending gate file is a public-API source file: `packages/<name>/src/`, `agents/` (non-test), `common/src/`, or `cli/src/`. Spawns `doc-writer` with the source files and `docs/agents-and-tools.md` as the default target doc.
3. **`securityReviewerGate` (pre-reviewer, R1a)** — fires BEFORE the validation/reviewer gate when any pending gate file matches a security-sensitive pattern: `.env*` files; basenames containing `secret`, `token`, or `apikey`; or any path segment equal to `auth`, `oauth`, `credentials`, `session`, `crypto`, `keys`, `secrets`, `vault`, `billing`, `payment`, `stripe`, `permissions`, `rbac`, or `policy`. Spawns `security-reviewer` with the changed files. The orchestrator waits for `security-reviewer` to finish before proceeding to the final code-reviewer gate.

Each aux gate is predicate-gated: if no pending file matches its relevance predicate (non-test source with a package test command for `test-writer`, public-API source for `doc-writer`, security-sensitive path for `security-reviewer`), it skips silently. The three predicates overlap on common package source paths (`packages/<name>/src/`, `agents/` non-test, `common/src/`, `cli/src/` are all both non-test source and public-API source), so a single edited file in one of those directories typically fires both `test-writer` and `doc-writer`. For example, a `cli/src/components/*.tsx` change fires `test-writer` (the `cli` package test command resolves) and `doc-writer` (`cli/src/` is a public-API source path), and skips `security-reviewer` (no security-sensitive glob). Only files outside all three predicates — e.g. a `docs/*.md` edit or a `*.generated.ts` file — skip every aux gate; the final `code-reviewer` gate runs unconditionally on the full set of edited files regardless.

The three done-flags (`testWriterGateDone`, `docWriterGateDone`, `preEditSecurityReviewDone`) and the `auxGatesLastPendingFiles` snapshot live on `Base2ActiveWorkState` (`agents/base2/gate-state.ts`). `detectPendingGateFileSetChange` + `resetAuxGateFlags` reset the flags when the pending file set changes (compared via `gateFileSetsEqual`, order-insensitive). The reset predicate compares the AUX-RELEVANT subset of pending files — files that at least one aux predicate would act on — so newly-written aux outputs (test files created by `test-writer`, doc files updated by `doc-writer`) do not perturb the snapshot and do not re-trigger the aux gates for the same pending file set.

## Tools

Tools represent the capabilities given to agents to interact with your system.

- Tool schemas and validators live in `common/src/tools` as Zod definitions.
- Tool executions are handled securely by the SDK on your local machine (reading/writing files, executing commands, searching codebase).
- Since Openbuff has no hosted proxy backend, tool execution is extremely low-latency, and all outputs are processed directly by your locally configured models.

### `query_index`

`query_index` queries the local codebase graph index. It is intended for retrieval-led context gathering before reading or editing files.

The index tracks file paths, extensions, symbols, imports, markdown headings, documentation concepts, package scripts, CI workflow commands, task-runner files, and graph relationships between files/symbols/imports/calls/headings/concepts. Results are discovery hints: always verify returned files with `read_files` or `read_subtree` before editing.

Supported modes:

- `search` — default ranked file search for a natural-language or keyword `query`.
- `explain` — ranked search plus an `explanation` for why each file matched.
- `neighbors` — graph-adjacent files for a `from` path, or neighbors around files matching `query`.
- `path` — shortest graph path between `from` and `to`, or a graph path inferred from `query` matches.
- `references` — files that reference (import/call) the `from` path, expanding outward from a known symbol or file.
- `commands` — command-discovery search that prioritizes package manifests, CI workflows, task runners, and testing/contributing docs; useful for prompts like “run the broader validation suite”.

Examples:

```json
{ "query": "authentication flow", "limit": 10 }
{ "query": "editor proposal logic", "mode": "explain", "fileTypes": ["ts"] }
{ "mode": "neighbors", "from": "packages/indexer/src/query.ts", "limit": 8 }
{ "mode": "path", "from": "packages/indexer/src/metadata-indexer.ts", "to": "packages/indexer/src/query.ts" }
{ "query": "broader validation suite", "mode": "commands" }
```

Results may include `relatedFiles`, each with a relationship reason and optional `via` symbol/import/concept. Use those related files to expand context around likely entry points.

#### Repo-map comparison helpers

`packages/indexer/src/repo-map.ts` exports package-level helpers for retrieval evaluation and reporting. These helpers are available from the `@codebuff/indexer` entrypoint, but they do not change the default `query_index` search path.

Public helpers:

- `buildRepoMap(index, options)` — renders indexed structural metadata into a deterministic text map and returns both the `map` string and structured `entries`.
- `queryRepoMap(index, query, options)` — scores repo-map entries for a query and returns `QueryIndexResult[]`-shaped results.
- `compareRetrievalStrategies(index, cases)` — runs each case through existing `queryIndex` and repo-map retrieval, then reports pass counts, failures, and mean reciprocal rank for both strategies.
- `formatRetrievalComparisonReport(report)` — renders the comparison report as Markdown.

`RepoMapOptions` accepts `maxFiles`, `maxSymbolsPerFile`, `maxImportsPerFile`, `maxHeadingsPerFile`, and `fileTypes`. `fileTypes` may include values with or without a leading dot and is matched against indexed file extensions. `RetrievalComparisonCase` accepts a `query`, `expectedPaths`, optional `queryOptions` for `queryIndex`, and optional `repoMapOptions` for the repo-map side.

Example:

```ts
import {
  compareRetrievalStrategies,
  formatRetrievalComparisonReport,
} from '@codebuff/indexer'

const report = compareRetrievalStrategies(index, [
  {
    query: 'rust auth session token',
    expectedPaths: ['crates/auth/src/session.rs'],
    repoMapOptions: { fileTypes: ['rs'] },
  },
])

console.log(formatRetrievalComparisonReport(report))
```

Gotchas: repo-map helpers operate on an already-built `MetadataIndex`; they do not read files or rebuild the index. `queryRepoMap` tokenizes the query and returns only positive-score matches, so blank or stop-word-only queries return no results. `buildRepoMap` sorts files by path before applying `maxFiles`, while `queryRepoMap` scores the full candidate set before applying its result limit.

### `read_outline`

`read_outline` returns a structural AST-like outline of imports, exports, classes, methods, and function signatures in a source file. It allows understanding the composition of large files without loading their entire implementations, saving significant token counts and processing time.

Example:

```json
{
  "path": "sdk/src/provider-config.ts"
}
```

### `read_slices`

`read_slices` retrieves exact targeted implementation slices for specified function, class, or method names in a file rather than reading the entire file. This is highly effective when used in combination with `read_outline` to load only the specific segments of code relevant to a task.

Example:

```json
{
  "path": "sdk/src/provider-config.ts",
  "symbols": ["resolveConfigFragmentPath", "loadProviderConfigSync"]
}
```

### `str_replace` and `edit_transaction`

`str_replace` and `edit_transaction` are the primary deterministic edit
tools. Under strict-mode edit flows they participate in staged
read-before-edit enforcement:

- A recent `read_files` call on the target path authorizes a subsequent
  edit to that path.
- `basedOnRead` accepts either a `readCapability` token copied from a
  fresh `read_files` range header or an explicit `{ startLine, endLine,
  hash }` object. The runtime verifies the embedded hash for large-file
  edits before applying the edit.
- A successful edit invalidates the per-path authorization. Editing the
  same path again requires a new `read_files` call (or carrying the
  echoed post-edit `basedOnRead` forward).
- Stale or failed edits should be recovered by re-reading the exact
  target range named in the diagnostic and retrying with the new
  `basedOnRead`, not by guessing from memory.

`str_replace` inputs:

- `path` (string, required) — target file path.
- `replacements` (array, required) — each entry includes `oldString`,
  `newString`, and `allowMultiple`; optional fields are `occurrenceIndex`,
  `basedOnRead`, and `skipIfMissing`.
- `atomic` (boolean, default `false`) — when `true`, any failed
  replacement aborts the whole batch. Large files are always atomic.

On success, `str_replace` returns the updated `content`, a unified-diff
`patch`, and informational `messages`. On failure it returns an `error`
with recovery guidance and does not apply an atomic batch.

Matching behavior:

- `oldString` must be non-empty and is matched exactly after line-ending
  normalization; the result preserves the file's original line endings.
- `allowMultiple: true` replaces every exact occurrence. Without it,
  multiple matches fail with occurrence-range diagnostics.
- `occurrenceIndex` is 1-indexed and targets exactly one repeated exact
  match; when combined with a fresh `basedOnRead`, the index is counted
  within that anchored range.
- `skipIfMissing: true` is only an idempotency helper for deletions
  (`newString: ""`): if the old text is already absent, the replacement is
  reported as a successful no-op instead of a failure.
- Tiny repeated anchors are refused: an `oldString` shorter than 10
  trimmed characters that matches more than once fails even when
  `allowMultiple: true`. Use a longer `oldString` or `occurrenceIndex`.
- If exact matching fails, `oldString` may use `...` as an explicit
  line-level elision marker only when the marker is on a line by itself
  between exact literal anchor segments. Each literal segment must contain
  at least 10 non-whitespace characters, and the elided range must resolve
  to exactly one match. Ambiguous elision fails with recovery guidance;
  `allowMultiple` does not apply to elision matching.
- If exact and elision matching fail, the runtime may match
  indentation-adjusted content or a conservative near-match. Near-match
  success includes a warning and should be verified by re-reading the
  edited range.

Large-file and anchor behavior:

- Files over 1,000 lines or 100,000 characters are treated as large.
- Large-file edits use `basedOnRead` range hashes when supplied, and fall
  back only when `oldString` is deterministic: unique for single-target
  edits, or present with `allowMultiple: true` for replace-all edits.
- Valid `basedOnRead` anchors on small files are ignored after basic
  shape validation because exact `oldString` matching is sufficient.
- Placeholder or malformed string anchors such as `"dummy"` or invalid
  `cap.*` tokens are rejected on all files unless `oldString` uniquely
  matches the current file, in which case the bogus anchor is stripped and
  the edit proceeds as an unanchored replacement.
- Successful large-file edits return fresh read capability tokens for the
  edited hunk or region. Reuse those tokens for immediate follow-up edits;
  older tokens for the same file are stale.

Example:

```json
{
  "path": "src/example.ts",
  "atomic": true,
  "replacements": [
    {
      "oldString": "const value = 1",
      "newString": "const value = 2",
      "allowMultiple": false
    },
    {
      "oldString": "debugLog()",
      "newString": "",
      "allowMultiple": true,
      "skipIfMissing": true
    }
  ]
}
```

`edit_transaction` preflights every replacement against the same
in-memory snapshot, so related cross-file or dependent same-file edits
either all apply or none do. See
[Deterministic Edit System](./deterministic-edit-system.md) for the full
policy and gate semantics.

### `create_plan` and `update_plan_status`

Plan artifacts under `.agents/sessions/<plan>/` are managed with two
dedicated tools:

- `update_plan_status` — preferred for incremental updates to
  `STATUS.md` task lines and append-only lesson notes. It preserves
  surrounding user prose and ordering, so manual edits made by the user
  are not clobbered.
- `create_plan` — used to create a new plan artifact or perform a
  whole-artifact rewrite. It overwrites the target file and is not the
  right tool for incremental status or lesson updates.

These tools back the PlanLink slash commands (`/resume-plan`,
`/update-plan`, `/plan-status`, `/lessons`). See
[Local Mode](./local-mode.md) for the user-facing command list.

### `git_branch`

`git_branch` creates a new git branch in the current project, optionally switching to it. It is the first-class agent-side branch-creation tool (no `run_terminal_command` needed). Branch creation is a first-class agent operation that does NOT require `run_terminal_command`.

By default the tool refuses to branch when the working tree is dirty (uncommitted changes) — pass `allow_dirty: true` to override (useful when intentionally moving uncommitted work to a new branch). Branch names must start with an alphanumeric character and contain only `[a-zA-Z0-9._/-]` (intentionally stricter than git's own rules, to keep names predictable and shell-safe).

Input fields:

- `branch_name` (string, required) — name of the branch to create.
- `switch` (boolean, default `true`) — when `true`, create AND switch to the branch (`git checkout -b`); when `false`, only create the branch (`git branch`), leaving the current branch checked out.
- `allow_dirty` (boolean, default `false`) — when `true`, skip the dirty-tree refusal check.

Example:

```json
{
  "branch_name": "feat/my-feature",
  "switch": true
}
```

On success the result carries `branch`, `created: true`, `switched`, and (when switching) `previousBranch`. On failure it carries an `errorMessage` (invalid name, dirty tree, or non-zero git exit). `git_branch` is registered as an orchestrator tool and is available to `git-committer` (which yields a `git_branch` step before its `git status --short` step when `branch_name` is supplied via its input schema).

### `apply_smart_patch`

`apply_smart_patch` is a highly robust, self-healing unified-diff patch applicator. It applies unified diff hunk(s) containing changes to a file using three advanced protection layers:

1. **Fuzzy Line Alignment (Layer A & B):** Uses fuzz factor constraints to locate the target lines even if they have shifted due to other modifications in the file.
2. **AST-Aware Syntax Auto-Correction (Layer C):** Automatically repairs minor syntax formatting mistakes or closing bracket/brace/parenthesis mismatches to prevent syntax errors.
3. **Preflight Compile Validation:** Runs a virtual preflight compilation/syntax check before writing the changes to disk. It will fail closed if the edit would corrupt the file or break compilation.

Example:

```json
{
  "path": "sdk/src/provider-config.ts",
  "patch": "@@ -120,6 +120,7 @@\\n-  const lineEnding = \"\\\\n\"\\n+  const lineEnding = currentContent.includes(\"\\\\r\\\\n\") ? \"\\\\r\\\\n\" : \"\\\\n\"\\n   const initialContentLineCount = 100\\n",
  "fuzzFactor": 3,
  "autoHeal": true,
  "preflightCompile": true,
  "allowPositionalFallback": false
}
```

### `spawn_agent_inline`

`spawn_agent_inline` is an orchestrator-internal tool that spawns a single
child agent that runs **within the parent's message history**. Its schema
lives in `common/src/tools/params/tool/spawn-agent-inline.ts` and its
handler in
`packages/agent-runtime/src/tools/handlers/tool/spawn-agent-inline.ts`.
It is distinct from `spawn_agents` (the visible multi-agent spawn tool):
`spawn_agent_inline` is hidden from the TUI tool palette and is used by
the automated phase-gates and the `context-pruner` flow, where the child
must share the parent's conversation context.

Input fields:

- `agent_type` (string, required) — the child agent id to spawn.
- `prompt` (string, optional) — the prompt forwarded to the child.
- `params` (object, optional) — parameters object for the child agent.
- `handoff` (object, optional) — structured handoff payload, merged into
  the child's `spawnParams` (purely additive; children that do not
  consume `handoff` still receive `prompt` and `params`).

Example:

```json
{
  "agent_type": "file-picker",
  "prompt": "Find files related to authentication",
  "params": { "paths": ["src/auth.ts", "src/user.ts"] }
}
```

The child's template overrides are forced by the inline handler:
`includeMessageHistory: true` and `inheritParentSystemPrompt: true`,
regardless of what the agent template declares. The child shares the
parent's `systemPrompt` and `messageHistory`, and any messages the child
adds are written back to the parent's `messageHistory` after execution
(`clearUserPromptMessagesAfterResponse: false`).

There is no tool result for this tool — it returns a fixed
`{ message: 'Agent spawned.' }` ack. The child runs until it calls
`end_turn`, then control returns to the parent. Because the spawn ends
the current agent step (`endsAgentStep: true`), the parent emits a new
step after the child returns.

#### Event nesting (`parentAgentId`)

The handler's `onResponseChunk` callback tags each forwarded
`PrintModeEvent` with a `parentAgentId` so the CLI can nest the child's
output under the correct agent block:

| Event type | injected field |
|---|---|
| `subagent_start` / `subagent_finish` | `parentAgentId` set to the **parent orchestrator's** `agentId` (or the event's existing `parentAgentId` if already set), so the child block nests under the orchestrator |
| `tool_call` / `tool_result` | `parentAgentId` set to the **child's** `agentId`, so the child's tool calls render inside the child's own agent block, not the orchestrator's |
| `text` | `agentId` set to the **child's** `agentId` (empty `text` is dropped), so child prose attributes to the child block |
| other events (e.g. `reasoning_delta`, plain strings) | forwarded verbatim, no field injected |

This mirrors the `ensureParentAgentId` logic the `spawn_agents` handler
applies, and is what makes an aux-gate `test-writer` / `doc-writer` /
`security-reviewer` spawn render inside its own labeled box in the TUI
rather than blending into the orchestrator's turn.

#### `context-pruner` silencing

When `agent_type === 'context-pruner'`, the handler suppresses **all**
forwarded chunks (including the child's `subagent_start` /
`subagent_finish` emitted by `executeSubagent`), so the pruner runs
silently and produces no TUI output. This is the existing behavior; the
`TODO` in source notes a future option may make this configurable.

## Slash Commands

Slash commands are the TUI-level command surface (the `/<id>` entries in
the command palette). Their static registry lives in
`cli/src/data/slash-commands.ts` and is exported as one array plus two
derived helpers:

- `SLASH_COMMANDS: SlashCommand[]` — the authoritative list of every
  registered command (mode commands are generated from `AGENT_MODES`).
- `SLASHLESS_COMMAND_IDS: Set<string>` — the lowercased ids of every
  command flagged `implicitCommand: true`. These are the commands that
  can be invoked without a leading `/` when the input matches the id
  exactly with no arguments (e.g. `init` or `new`).
- `getSlashCommandsWithSkills(skills): SlashCommand[]` — returns the
  base `SLASH_COMMANDS` with one `skill:<name>` entry appended per
  discovered skill, so user-installed skills show up in the palette as
  slash commands.

### `SlashCommand` shape

Every entry conforms to the `SlashCommand` interface:

- `id` / `label` — the command id and palette label (lowercased for
  matching).
- `description` — one-line text shown in the palette.
- `aliases` (optional) — alternate ids that resolve to the same handler.
- `implicitCommand` (optional) — when `true`, the command is also
  reachable without the `/` prefix if the input is exactly the id (no
  args). Aliases are never implicit.
- `insertText` (optional) — when set, selecting the command inserts this
  text into the input field instead of executing a handler. Used for
  agent shortcuts (e.g. `agent:general` inserts `@general-agent `).

### Registered commands

The static command set (current as of the source file) is grouped by
purpose:

| Group | Commands |
|---|---|
| Diagnostics / info | `info` (`status`), `help` (`h`, `?`, implicit), `setup`, `models`, `provider` |
| Project scaffold | `init` (implicit) |
| Provider account | `connect` (`chatgpt`, `connect:chatgpt`) — only present when `CHATGPT_OAUTH_ENABLED` is `true` |
| Edit history | `undo`, `redo` |
| Durable plans | `interview`, `plan`, `resume-plan` (`rp`), `update-plan` (`up`), `plan-status` (`ps`), `lessons` (`lesson`) |
| Code review | `review` |
| Conversation | `new` (`n`, `clear`, `c`, `reset`, implicit), `history` (`chats`), `prompts` (`prompt-search`) |
| Agent shortcuts | `agent:general` (inserts `@general-agent `) |
| Feedback / misc | `feedback`, `bash` (`!`), `diff`, `changes`, `image` (`img`, `attach`) |
| Mode switching | `mode:<mode>` for every mode in `AGENT_MODES`, each with a `model:<mode>` alias |
| Theme / session | `theme:toggle`, `exit` (`quit`, `q`, implicit) |

`review` and `plan` use model-agnostic descriptions ("with the configured
reviewer" / "with the configured planner"); they never claim a specific
hosted model. The durable-plan quartet (`/resume-plan`, `/update-plan`,
`/plan-status`, `/lessons`) is backed by the `update_plan_status` and
`create_plan` tools documented above and is the user-facing surface to
the PlanLink artifact flow.

### Skill commands

`getSlashCommandsWithSkills` appends one entry per discovered skill
(loaded from `.agents/skills/`, `~/.agents/skills/`, or
`{cwd}/.claude/skills/`). Each skill command has id `skill:<name>`,
label `skill:<name>`, and a description derived from the skill's
frontmatter.

Gotcha: skill descriptions are truncated for the palette. Descriptions
longer than 50 characters are shortened to 49 characters plus a trailing
`…`. Descriptions of exactly 50 characters are left unchanged; this is a
strict greater-than comparison, not a `>=` boundary.

### Aliases vs. implicit commands

`aliases` and `implicitCommand` are independent: a command may have
aliases that resolve inside the registry without being reachable
slashless, and an implicit command's aliases are never themselves
implicit. `SLASHLESS_COMMAND_IDS` is built from the lowercased `id` of
every `implicitCommand: true` entry only.
