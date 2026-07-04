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

### Shell Shims

You can run individual specialized agents as direct terminal commands without the `openbuff` prefix. This is handled by shell shims:

```bash
openbuff shims install openbuff/base2@1.0.0
eval "$(openbuff shims env)"
base2 "fix this bug"
```

For backward compatibility, the `codebuff` command prefix may still work as a compatibility alias where the shim is installed; prefer `openbuff`.

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
- `basedOnRead` (copied from a fresh `read_files` range header, or from
  the echoed capability returned by a successful large-file edit) is the
  explicit authorization path for ambiguous or large-file edits. The
  runtime verifies the embedded hash before applying the edit.
- A successful edit invalidates the per-path authorization. Editing the
  same path again requires a new `read_files` call (or carrying the
  echoed post-edit `basedOnRead` forward).
- Stale or failed edits should be recovered by re-reading the exact
  target range named in the diagnostic and retrying with the new
  `basedOnRead`, not by guessing from memory.

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
