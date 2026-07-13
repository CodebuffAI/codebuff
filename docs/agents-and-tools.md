# Agents and Tools in Openbuff

Openbuff operates as an orchestrator of specialized, local-first agents. Instead of running model orchestration on a hosted backend, all agent loops, prompt generation, tool calls, and model routing are processed locally on your machine via the `agent-runtime` and `sdk` packages, utilizing your Bring Your Own Key (BYOK) providers.

## Agents

Agents in Openbuff can be either prompt-based or programmatic (utilizing `handleSteps` generator functions).

- Shipped agents reside in the `agents/` monorepo package.
- Project-local or custom agents live in the `.agents/` folder of your project.
- Programmatic agent generator functions execute in a secure sandbox. Calls yielded by `handleSteps` are restricted to declared `toolNames`, declared hidden `programmaticToolNames`, and a small runtime context-management allowlist; templates also define which subagents can be spawned.
- Local agent precedence is project `.agents` → parent `.agents` → home `~/.agents`. The loader preserves the winning source path for UI links, supports `.ts`, `.tsx`, `.js`, `.mjs`, and `.cjs`, and reports per-agent validation diagnostics instead of failing the entire registry.

### Orchestrator-spawnable vs. pattern-specific agents

Not every shipped agent is directly spawnable by the orchestrator (`base2` / `base-deep`). Agents fall into two categories:

**Orchestrator-spawnable agents** are listed in the `spawnableAgents` array of `base2.ts` and `base-deep.ts`. These are general-purpose specialists the orchestrator can delegate to at policy-defined phase boundaries: `file-picker`, `code-searcher`, `code-reviewer`, `editor`, `thinker`, `basher`, `researcher-web`, `researcher-docs`, `git-committer`, `debugger`, `doc-writer`, `security-reviewer`, `test-writer`, `librarian`, and others. `context-pruner` is runtime-internal and is not publicly spawnable. Adding an agent to `spawnableAgents` means the orchestrator may spawn it when the current phase and task scope make its capabilities relevant; it does not mean agents should be spawned randomly or for tiny direct-answer tasks.

Common phase triggers and routing policies:

- `file-picker`, `code-searcher`, `researcher-web`, `researcher-docs` — discovery phase when files, APIs, docs, or commands are not already obvious. Scope first as `tiny`, `focused`, `multi-file`, `cross-subsystem`, or `unknown surface`; scale reads/searches and parallel shards accordingly. For large-repo planning, do not use file-pickers as the only shards: they are discovery-focused and should be paired with code-searchers plus reasoning-capable shards when analysis is required.
- `general-agent` — focused reasoning/audit shards after discovery for larger repositories or complex domains. Give each shard explicit files or a narrow subsystem, and when compaction could lose results, instruct it to write findings to `.agents/sessions/<slug>/findings/*.md` instead of returning everything in chat.
- `thinker` — reasoning phase after context gathering for complex design, architecture, tradeoff, risk, spec/plan critique, or debugging strategy choices. Use it to synthesize discovered evidence when no file writes are needed; skip it for straightforward edits and never use it as a replacement for reading files.
- `editor` — implementation phase for non-trivial source changes, with a self-contained implementation brief because it does not rely on parent context. The five brief fields accept either colon labels (`Requirements:`) or normal Markdown headings (`## Requirements`). Skip it for tiny one-file edits and direct answers.
- `basher` — validation phase for tests, typechecks, lints, builds, or command discovery that lacks a dedicated harness tool. Prefer configured hooks and deterministic path-to-suite routing first, such as agents/base2 prompt/gate checks, SDK checks for `packages/sdk/*`, runtime checks for `packages/agent-runtime/*`, common/dependent checks for `common/*`, and CLI typecheck plus visual smoke for `cli/src/components/*` or `cli/src/hooks/*`.
  Basher requires `params.command`. For compatibility, `spawn_agents` repairs an explicit string-valued top-level `command` into `params.command`, but it never treats prompt prose as executable input. A spawn whose required params are genuinely absent is published with a structured failure result so the parent can inspect the validation error and retry safely.
- `set_output` expects native object fields. Complete stringified JSON objects and exact JSON code-fence/comment wrappers are decoded for compatibility. Malformed or incomplete string data is never accepted as agent output; the call receives a recoverable tool result so the agent can retry without losing the structured-output contract.
- `dependency-manager` — explicit dependency-mutation phase only. It receives structured manager/operation/package/workspace inputs, constructs one bounded ecosystem-native command, and supports npm/pnpm/Yarn/Bun, uv/Poetry/pip, Cargo, Go modules, .NET, Bundler, Composer, SwiftPM, Dart/Flutter Pub, Mix, Maven dependency resolution, and Gradle dependency inspection. It cannot run arbitrary shell or global installs, and a missing-package diagnostic alone is not authorization to spawn it.
- `debugger` — repair phase after repeated validation failures, runtime failures, or unclear crash behavior.
- `code-reviewer`, `security-reviewer` — review phase after meaningful edits or security-sensitive changes; blocking findings prevent completion. Security review is required for auth, crypto, secrets, permissions, injection, sandboxing, path/process/network handling, supply-chain, or production-risk changes.
- `test-writer`, `doc-writer` — coverage phase when tests or docs are required or directly implied by acceptance criteria.
- `git-committer` and release/deployment workflows — only when explicitly requested or confirmed; follow status inspection, remote/tag fetch, rebase/merge decision, push, CI/CD wait, release trigger, artifact/tag/package verification, and local branch sync/reporting.

Cross-cutting orchestration policy:

- Ask the user before destructive commands, public API/contract changes, dependency additions, schema/data migrations, release/publish/deploy actions, production-affecting scripts, or ambiguous product behavior.
- Terminal execution is enforced by runtime permission profiles, not prompt text alone: `read-only`, the clone-scoped `librarian-read-only`, `workspace-write`, and explicit `full-access`. Background commands are request-owned unless `detach` is explicitly requested.
- Browser-use defaults to `params.interactionPolicy: "read-only"`. Clicks, typing, uploads, evaluation, and other browser-state mutations require `allow-interactions`; each run receives an isolated browser session that is closed with the owning SDK run.
- Prefer dedicated tools over shell fallbacks: `git_status` for repo state, file/read/search tools for inspection, `read_image` for images, deterministic edit tools for edits, configured hooks for validation, and browser/CLI visual agents for smoke checks.
- Maintain durable plan artifacts in EXECUTE_PLAN at phase boundaries, blockers, validation/review results, and finalization.
- Parallelism is allowed for independent discovery shards, independent validation commands, and static review that does not depend on validation output. Dependent edits, fragile debug loops, and validation-repair cycles stay sequential.
- The orchestrator must join all required results before completion. Reviewers running alongside validation provide static review only; failed or timed-out validation still blocks a green finish.

### Harness control plane and specialist intelligence

The root orchestrator has a versioned, local control-plane surface for work that must survive compaction or concurrent worktree activity:

- `inspect_workspace` records repository/worktree identity, branch state, and a content snapshot.
- `get_task` reads the current durable task and lifecycle revision.
- `get_change_review_bundle` produces snapshot-bound changed-file and diff evidence for reviewers.
- `inspect_environment` recursively reports nested JavaScript, Python, Rust, Go, Maven/Gradle, .NET, and Swift workspaces, their manifests/lockfiles, inferred managers with explicit confidence, and locally available toolchains without executing project code.
- `get_affected_tests` and `get_build_targets` map changed files to the nearest workspace, existing test candidates, and manager-specific validation/build commands. Targets report `confirmed`, `inferred`, or `unknown` confidence instead of presenting guesses as discovered facts.
- `run_targeted_validation` executes only an explicitly selected target against an expected snapshot and rejects stale or mid-run-mutated snapshots.
- `inspect_codebase_structure` creates the authoritative snapshot-bound audit inventory, including subsystems, entrypoints, routes, commands, public APIs, tests, generated sources, and a detected language/framework capability packet.
- `inspect_feature_completeness` follows a claimed feature vertically across runtime wiring, consumers, tests, docs, and failure-state evidence.
- `evaluate_audit_coverage` blocks a complete audit while structural receipts, feature evidence, or explicit out-of-scope decisions are missing.

Cross-subsystem requests automatically invoke the structural inventory before the first model step. The legacy structural-map script is only a human-readable renderer over this inventory; normal CLI correctness does not depend on running it or writing into `.agents/`.

Specialists receive only the read intelligence their role requires. For example, dependency and performance review can inspect environment/build targets, while integration and release review can also inspect affected tests. Specialists cannot edit files, approve their own work, or run the validation gate. The orchestrator owns task state, mutation delegation, validation, review reconciliation, approvals, and final user-visible evidence.

Control-plane records use compare-and-swap revisions, atomic local persistence, content hashes, expiring verified knowledge, single-use approvals, ownership receipts, and exclusive workspace leases. High-impact operations and external connector mutations are classified centrally rather than authorized by prompt wording alone.

`run_file_change_hooks` runs user-configured hooks and, only when a trusted
project explicitly sets `autoFileChangeHooks: true`, combines them with bounded
manifest inference. The opt-in is required because compilers, plugins, build
scripts, and tests can execute repository-controlled code. Inference prefers explicit project scripts and supports native checks for
JavaScript/TypeScript, Python, Rust, Go, Java/Kotlin, .NET, C/C++, Ruby, PHP,
Swift, and Godot. Compiler and linter output is normalized into structured
diagnostics (`file`, range, severity, code, message, command, source) while the
original bounded stdout/stderr remains available for recovery.

- Automated security/test/doc auxiliary agents have explicit lifecycle handling. Their done flags are written only after successful completion; crashes and blocking security verdicts persist as blockers. Test/doc writers run automatically only when the user request explicitly includes those deliverables, and mixed-package test targets are routed to package-specific commands.
- Productive agent steps are unlimited by default. A repeated-step watchdog stops identical no-progress loops, while cancellation, subagent wall-clock timeouts, cost/token budgets, spawn-depth limits, and context compaction remain independent safeguards. Users may still configure a positive `maxAgentSteps` fixed cap; `-1` explicitly selects unlimited mode. Reviewer crashes retry once; repeated crashes require the explicit user phrase `bypass reviewer gate` before finalization can continue.

**Pattern-specific agents** are intentionally **excluded** from `spawnableAgents` because they have a narrow contract that only makes sense within a specific workflow pattern. They are spawned by the pattern flow itself, not by the orchestrator:

- **`synthesizer`** — the "reduce" half of the [`audit-codebase`](../agents/patterns/audit-codebase.md) map-reduce pattern. It reads ONLY finding files from a scratchpad directory (`.agents/sessions/<slug>/findings/*.md`) and produces a single cross-cutting audit report. It never reads raw source, has `includeMessageHistory: false`, and uses `outputMode: 'structured_output'`. Spawning it outside the audit pattern would be a misuse: it lacks source-reading tools (no `code_search`, `read_outline`, `query_index`, etc.) and its prompt is scoped to a findings directory, so it cannot perform general review or analysis tasks. The `audit-codebase` pattern spawns it directly in Step 4 (Synthesize) after all shard auditors have written their findings to disk.

The distinction matters because adding a pattern-specific agent to `spawnableAgents` would let the orchestrator spawn it in contexts where its contract doesn't apply, producing confusing or empty results. If you add a new pattern-specific agent, follow the same convention: register it in `openbuff.d/routes.json` so the pattern can route it, but leave it out of `base2`/`base-deep` `spawnableAgents`.

### Model Routing and Configuration

Because Openbuff does not rely on a hosted model registry or credit-balance router, all agent routing is configured directly in your local configuration (`openbuff.json`, the only config file read; no `codebuff.json` fallback). Under [Local BYOK Mode](./local-mode.md), you map individual agents (e.g., `thinker`, `code-reviewer`, or custom agents) to specific providers and models.

### Shared Prompt Sections

Several shipped agents share prompt text through centralized sections rather than maintaining separate copies:

- `agents/base2/quality-prompt-section.ts` exports the shared Code Craftsmanship guidance used by `base2`, `base-deep`, and the `editor` agent. This section is byte-frozen by snapshot tests so the three consumers do not drift accidentally.
- The same file also exports `buildBroadAuditSection(finalizeClause)`, which injects the orchestrator's scope-then-shard contract for broad, open-ended, and audit-style requests. The generated section tells `base2` / `base-deep` to measure repository breadth before synthesis, cover frontend/page/route/UI wiring when a frontend exists, spawn file-picker and code-searcher shards by subsystem, add general-agent reasoning/audit shards that can write durable findings files for whole-codebase or production-readiness audits, use thinker for post-discovery synthesis when useful, and interpolate `finalizeClause` for the current prompt path.
- The same file also exports orchestrator-only guidance for gate awareness, security-sensitive file review, and git discipline. `base2` and `base-deep` interpolate those sections; the `editor` intentionally does not, because validation/review, security triage, and git workflow orchestration remain parent-agent responsibilities.
- `common/src/constants/prompt-sections.ts` owns the shared Frontend Development section. `packages/agent-runtime/src/templates/types.ts` exposes it as the `{CODEBUFF_FRONTEND_SECTION}` placeholder, and `packages/agent-runtime/src/templates/strings.ts` replaces that placeholder only when `fileTreeHasFrontendFiles` detects `.tsx` or `.jsx` files in the project tree.
- `common/src/util/language-capabilities.ts` is the canonical registry for TypeScript/JavaScript, Python, Rust, Go, Java, C#/.NET, C/C++, Ruby, PHP, Swift, Kotlin, and GDScript. It owns extensions, manifests, bundled idioms, language-server/compiler/formatter/linter/test metadata, and focused/project validation stages. `common/src/util/language-profiles.ts` derives `{CODEBUFF_LANGUAGE_PROFILE}` detection from that registry.
  - Guidance is self-contained and bundled with Openbuff; agents no longer attempt to read `agents/idioms/*` from the user's repository.
  - Explicit target paths and task-language signals take precedence over repository-wide detection, limiting prompt noise in polyglot repositories. The whole file tree remains the fallback when no focused signal exists.
  - The same scoped language profile is available to the orchestrator, editor, test writer, and reviewer.
  - GDScript is detected via `.gd` source files (extension is case-normalized, so `.GD` also matches) and the `project.godot` manifest (exact filename match, case-sensitive). The idiom file is `agents/idioms/gdscript.md`.
  - Public inputs are file-tree nodes (`FileTreeNode[]`) or an explicit `LanguageProfile[]`; public outputs are stable-order `LanguageProfile` objects or a Markdown prompt string. No supported languages detected returns an empty string.
  - Detection uses source extensions plus common manifests. Source extensions are case-normalized; manifest names are matched exactly (for example, `Package.swift` is Swift, while differently-cased manifest names are not treated as manifests).
  - The rendered prompt lists detected display names plus compact bundled idiom guidance, while explicitly preferring more-specific repository compiler, framework, formatter, linter, and test conventions.
  - Example output shape:

    ```md
    ## Language profile

    Detected: Rust. Prefer repository-local compiler, framework, API, formatter, linter, and test conventions when they are more specific than this bundled guidance.

    - Rust: Respect ownership and borrowing, return Result/Option idiomatically, and keep error handling explicit and precise. Let ownership and borrowing drive the design; clone only when the cost and intent are clear.
    ```

- `common/src/util/engine-profiles.ts` owns the engine profile detection layer. It is wired into the same `{CODEBUFF_LANGUAGE_PROFILE}` placeholder alongside the language profile: `strings.ts` concatenates `formatLanguageProfilePromptForFileTree(fileTree)` and `formatEngineProfilePromptForFileTree(fileTree)`, so agents receive both language and engine guidance in a single section. No game engine detected returns an empty string (no engine section is rendered).
  - Public inputs are file-tree nodes (`FileTreeNode[]`); public outputs are stable-order `EngineProfile` objects or a Markdown prompt string. The exported API mirrors `language-profiles.ts`: `detectEngineProfiles(fileTree)`, `formatEngineProfilePrompt({ profiles })`, and `formatEngineProfilePromptForFileTree(fileTree)`.
  - Detection signals per engine:
    - **Unity**: `ProjectSettings/ProjectVersion.txt` manifest, `.unity`/`.prefab`/`.asmdef` file extensions, `Assets/` or `ProjectSettings/` directory patterns.
    - **Godot**: `project.godot` manifest, `.tscn`/`.tres`/`.gd` file extensions, `addons/` directory pattern.
    - **Unreal Engine**: `.uproject`/`.uasset`/`.umap` file extensions, `Content/` or `Config/` directory patterns.
    - **Bevy**: `Cargo.toml` + `assets/` directory heuristic (conservative — any Rust project with an `assets/` directory will match; a true `bevy` dependency check requires file content not available from the file tree alone).
  - Detection priority: manifest files (exact path match) → file extensions (suffix match) → directory patterns (path prefix match). `.csproj` and `.rs` are intentionally excluded from standalone engine signals to avoid false positives on non-game C#/Rust projects.
  - Stable engine order: `unity`, `godot`, `unreal`, `bevy`.
  - Example output shape:

    ```md
    ## Engine profile

    Detected: Unity. This appears to be a game-engine project. Follow engine-specific conventions for assets, scenes, and build workflows.

    - Unity: Treat Unity assets (scenes, prefabs, ScriptableObjects) as first-class project files. GUID references in .meta files link assets; preserve them when moving or renaming. Avoid reading large binary assets (.png, .fbx, .prefab binary sections) as text — use path/metadata instead.
    ```

  - Gotcha: directory patterns are stored with trailing slashes (e.g. `Assets/`) but the matcher strips the trailing slash internally, so `Assets/` matches `Assets/Scripts/Player.cs` without doubling the separator.

- The `editor` prompt includes Code Craftsmanship plus the conditional language and frontend placeholders, so implementation agents get the same style guidance as the orchestrator without inheriting the parent system prompt.

### Researcher-web agent contract

The shipped `researcher-web` agent is the web-search specialist spawned
during the discovery phase. Its input schema accepts a `prompt` plus optional
depth, locale, preferred-domain, and date-range controls. The agent runs a programmatic `handleSteps` generator that
automatically routes between two modes depending on the prompt:

- **Simple (single-query) path** — for short, focused prompts (< 60
  chars, one question, no list structure). Makes one `web_search` call
  with the prompt as the query and returns the result directly. Matches
  the original fast-path behavior.
- **Broad decomposition path** — for broad, multi-part prompts.
  The prompt is first stripped of meta-instructions ("search the web
  for", "find information about", etc.), then decomposed into focused
  subquestions. If decomposition yields 2 or more subquestions, each is
  searched iteratively (max 3 total `web_search` calls). Each
  subquestion is trimmed to a concise search query by stripping
  question-words ("what is", "how does", etc.) and trailing
  punctuation, capped at 120 characters.
  If decomposition yields fewer than 2 subquestions, the prompt falls
  through to the simple single-query path.

The decomposition uses four strategies in priority order:
numbered items → question-mark sentences → bullet markers →
comparison topic extraction. The first strategy that yields 2+
subquestions wins.

**Retry on empty results:** when a subquestion search returns no
results, the query is retried with a shorter keyword-based version.
Failed subquestions are included in the final report with their error
message.

**Output format:** every path returns structured output. Each question records
`answered`, `failed`, or `skipped`, its answer, and citations tied to that
question. A deduplicated source list and explicit `skippedQuestions` array make
bounded-call omissions visible to the parent agent.

Gotchas: the decomposer uses heuristic regex, not an LLM, so unusual
prompt structures may stay on the simple path. The max-call bounds (5
subquestions, 3 total calls) prevent unbounded search loops. URL
prompts ("fetch this page") use the unchanged URL-fetch path regardless
of prompt breadth.

### Test-writer agent contract

The shipped `test-writer` agent is the coverage specialist used by the
orchestrator and by explicit subagent calls. Its input schema accepts an
optional `params.target_files` array and an optional `params.test_command`.
When `target_files` is present, the agent reads those source files before
writing tests so it can match the changed public surface and edge cases.
It is intentionally read/write-only for files plus search/outline tools:
it does **not** run terminal commands itself. If `test_command` is
provided, the agent reports that command back for the parent or `basher`
to run during validation.

The agent's prompt contract is narrow: read the changed source, find an
existing test in the same package, mimic that harness and assertion style,
write focused behavior-oriented tests, and stop rather than modifying the
source under test if it discovers a product bug. Its final response should
name the test files changed and state whether validation is parent-owned,
not run by `test-writer`, or skipped because no command was supplied.

### CLI Agent/Tool Block Rendering

The CLI renders nested agent activity as a hierarchy of content blocks:
`AgentBranchWrapper` owns each agent card, `AgentBlockGrid` lays sibling
agents into responsive groups, and `AgentBranchItem` provides the
collapsible bordered card with status, prompt, preview text, and expanded
children. Agent cards compute their own streaming state from the chat
store, wrap prompts/previews to the available column width, and pass a
reduced body width to nested markdown, tool, thinking, and child-agent
renderers so long paths and command output stay inside the card.

Inside an agent card, `processBlocks` routes grouped content to specialized
renderers: `ThinkingBlock` collapses reasoning text through the shared
`Thinking` component, `ToolBlockGroup` renders consecutive tool calls,
and nested agent groups recurse through `AgentBlockGrid`. Tool rendering
uses `ToolBranch`: hidden tools such as `end_turn`, `ask_user`, and blocks
with `includeToolCall === false` are skipped; registered tool components
render their custom content; unregistered tools fall back to `ToolCallItem`
with JSON input, optional result output, streaming previews, finished
previews, and default collapsed state.

`Thinking` normalizes reasoning text for compact previews, shows the last
few visual lines while collapsed, preserves original line breaks in the
expanded view, and uses explicit available-width calculations instead of
terminal-wide defaults when embedded inside an agent card. `ToolCallItem`
uses display-cell widths for toggle indentation and wraps collapsed and
expanded content separately, so bullets, disclosure arrows, dense mode,
and nested code blocks align predictably in narrow terminal layouts.

#### Plan blocks and execution affordance

Durable plan execution uses versioned `STATE.json` state. Schema version 2
adds execution phases (`draft`, `ready`, `executing`, `validating`,
`reviewing`, `blocked`, `paused`, and terminal states), a monotonic revision
for compare-and-swap updates, and validation/review checkpoint evidence.
Executable PLAN.md checklist items should begin with a stable task ID and
include indented `Depends on`, `Acceptance`, and `Validate` fields. Resume
prompts include a deterministic preflight summary that rejects duplicate IDs
or missing dependencies and identifies the next dependency-ready task.

`update_plan_status` accepts `taskId` for exact task targeting (legacy
substring `task` matching remains compatible), `expectedRevision` to reject
stale writers, and `checkpoint` to persist validation/review evidence. Execute
Plan should keep at most one task in progress and only mark it done after its
validation gate passes.

The CLI treats a complete `<PLAN>...</PLAN>` response as a structured plan
block instead of ordinary prose. `extractPlanFromBuffer(buffer)` returns
the trimmed text between the exact uppercase tags, and `insertPlanBlock`
appends that text as a `PlanContentBlock` after scrubbing the raw plan tags
from neighboring text blocks.

Public block shape:

```ts
type PlanContentBlock = {
  type: 'plan'
  content: string
  metadata?: PlanArtifactMetadata
}

type PlanArtifactMetadata = {
  sessionPath?: string
  specPath?: string
  planPath?: string
  statusPath?: string
  lessonsPath?: string
  customArtifacts?: Array<{ label: string; path: string }>
  customArtifactCommands?: string[]
  executeCommand?: string
  resumeCommand?: string
  updateCommand?: string
  statusCommand?: string
  lessonsCommand?: string
}
```

`PlanBox` renders `content` as Markdown, renders an `Artifacts` section
when metadata is present, and shows an `Execute Plan` button. The button
uses the chat input build-fast handler: it switches the current mode to
`EXECUTE_PLAN`, submits the prompt `Build it!`, then clears the input. On
extra-narrow terminal widths the helper text above the button is hidden;
the button remains visible.

In addition to the `Execute Plan` button, all plan commands (execute,
resume, update, status, lessons, and custom artifact commands) render as
**clickable buttons** with per-command hover highlighting. Clicking a
command button calls the `onInsertCommand` callback, which inserts the
command string into the chat input bar with the cursor at the end and
focuses the input — it does **not** auto-submit. The user can then hit
Enter to submit the command or edit the text first. This is distinct from
the `Execute Plan` button's `onBuildFast` handler, which auto-submits in
`EXECUTE_PLAN` mode.

Known artifact paths (Session, SPEC/PLAN/STATUS/LESSONS.md) and custom
artifact entries render as static `label: path` text rows (not clickable),
so users can read which files the plan created without accidentally
inserting their paths into the input.

The `onInsertCommand` callback is threaded through the component chain
via the `MessageBlockStore` Zustand store:

1. `Chat` (`cli/src/chat.tsx`) defines `handleInsertCommand(command)` and
   registers it on the store via `setMessageBlockCallbacks`.
2. `useMessageBlockStore` (`cli/src/state/message-block-store.ts`) holds
   it in `MessageBlockCallbacks.onInsertCommand` alongside the other
   stable callbacks (`onToggleCollapsed`, `onBuildFast`, `onFeedback`,
   `onEditMessage`). The default is a noop.
3. `MessageWithAgents` reads it from the store and passes it to
   `MessageBlock`.
4. `MessageBlock` → `BlocksRenderer` → `SingleBlock` (for `plan` block
   type) → `PlanBox`.
5. For nested agent blocks, `BlocksRenderer` → `AgentBranchWrapper` →
   `AgentBody` → recursive `AgentBranchWrapper` threads it through the
   agent tree.

`extractPlanMetadata(planContent)` returns `undefined` when no recognized
metadata is present. Otherwise it returns a `PlanArtifactMetadata` object.
Recognized labels are `Session`, `Session Path`, `Session Directory`,
`Session Dir`, `SPEC.md` / `Spec`, `PLAN.md` / `Plan`, `STATUS.md` /
`Status`, and `LESSONS.md` / `Lessons`. Bare `.agents/sessions/...` paths
also infer the session path, and paths ending in `/SPEC.md`, `/PLAN.md`,
`/STATUS.md`, or `/LESSONS.md` fill the matching artifact field.

Unrecognized `Label: value` bullet lines are captured as **custom artifacts**
(`metadata.customArtifacts`, an array of `{ label, path }`) when the value
looks path-like — it contains at least one `/` or ends with `.md`. This lets
plans declare extra artifacts beyond the fixed SPEC/PLAN/STATUS/LESSONS set
(e.g. `- Architecture: .agents/sessions/auth-refresh/architecture.md` or
`- Wireframe: .agents/sessions/auth-refresh/wireframe.png`) and have them
rendered in the `PlanBox` Artifacts section alongside the known artifacts.
The known-label check always takes precedence, so custom artifacts never
override or collide with the fixed fields. Custom artifact capture works
with both bullet (`-`/`*`/`+`) and numbered-list (`1.`/`2.`) prefixes, as
well as bare `Label: value` lines with no prefix. Prose lines whose value
has spaces but no path separators (e.g. `Note: this is important prose`)
are NOT captured. The label keeps its original casing; only markdown
formatting marks (`*_` and leading `#`) are stripped from the label, and
markdown link wrappers (label plus parenthesized path) and trailing
`.`/`,`/`;` are stripped from the path value. An empty `customArtifacts`
array is treated
as empty by `isNonEmptyPlanMetadata`.

When custom artifacts are present, `withPlanCommands` also generates a
`customArtifactCommands` array — one natural-language prompt per custom
artifact. For paths ending in `.md`, the command is `Read <path>`; for all
other file types (`.png`, `.yaml`, etc.), it is `Open <path>`. These are
display-only informational strings rendered in the PlanBox Artifacts section
alongside the known plan commands. Like the known commands, custom artifact
commands render as clickable buttons — clicking inserts the command string
into the chat input without submitting. They are not registered slash
commands. Custom artifact commands are generated even when no session path
is found — the only prerequisite is that `customArtifacts` is non-empty.

When a session or artifact path is found, command fields are generated
with the session target:

```text
/mode:execute_plan Build it!
/resume-plan <session>
/update-plan <session>
/plan-status <session>
/lessons <session>
```

Minimal plan response with artifact metadata:

```md
<PLAN>
# Plan

## Artifacts

- Session: .agents/sessions/auth-refresh
- SPEC.md: .agents/sessions/auth-refresh/SPEC.md
- PLAN.md: .agents/sessions/auth-refresh/PLAN.md
- STATUS.md: .agents/sessions/auth-refresh/STATUS.md
- LESSONS.md: .agents/sessions/auth-refresh/LESSONS.md
  </PLAN>
```

Gotchas:

- `<PLAN>` and `</PLAN>` extraction is case-sensitive.
- `</cb_plan>` is scrubbed from rendered prose for legacy compatibility,
  but it does not make `extractPlanFromBuffer` return plan content.
- Markdown link targets and simple formatting marks are normalized away
  during metadata parsing; trailing `.`, `,`, and `;` are dropped from
  metadata values.
- `isPlanBlock(block)` narrows a content block to `PlanContentBlock` by
  checking `block.type === 'plan'`.

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

## Reviewer verdict contract

Shipped reviewers use a structured, versioned verdict. Code-reviewer reports
the reviewed snapshot fingerprint and files, separate correctness/security/
tests/API-compatibility/performance dimensions, requirement coverage with
evidence, findings, and test-coverage classification. Missing or uncertain
requirements, a blocked dimension, or missing behavior coverage block
finalization regardless of the overall verdict. Security-reviewer similarly
reports input-boundary, authorization, secret-handling, resource-safety, and
fail-closed dimensions. Legacy label and compact-JSON parsing remains as a
compatibility fallback for custom reviewers.

For schema-version 1 results, the runtime verifies `snapshotFingerprint`
against the pending working-tree snapshot and requires `reviewedFiles` to
include every pending file. Review guidance also covers meaningful test
assertions, public and persisted compatibility, package boundaries,
generated-artifact freshness, migration safety, and bounded resource use.

The `code-reviewer` gate decides whether a turn may finish green. The orchestrator parses the reviewer's tool result to extract a finalization verdict (`LOOKS_GOOD`, `NON_BLOCKING`, or empty string `''`) and to surface any blocking findings. The parser prefers structured (parsed-object) verdicts over text-mode fallbacks, in this order: structured JSON verdict → line-verdict text → embedded JSON verdict in prose. The parsing helpers live in `agents/base2/gate-reviewer.ts` and are mirrored inline inside `createBase2.handleSteps` (the mirror is parity-tested by `agents/__tests__/gate-reviewer.test.ts`).

A reviewer may emit its verdict in either text mode or structured (JSON) mode:

- **Text mode** — the first visible token of the reply is a verdict label followed by `:` (the orchestrator strips any leading `` block first):
  - `LOOKS_GOOD:` or `NON_BLOCKING:` → permits finalization.
  - `BLOCKING:` → reopens the turn; the labels are surfaced to the orchestrator as `BLOCKING: <finding>` entries.
- **Structured (JSON) mode** — a single JSON object with a `verdict` field (`"LOOKS_GOOD"`, `"NON_BLOCKING"`, or `"BLOCKING"`, case-insensitive, trimmed), an optional `findings` array (or string) of human-readable findings, and an optional `coverage` field (`"covered"`, `"missing"`, or `"n/a"`, case-insensitive).

```json
{"verdict":"LOOKS_GOOD","findings":[],"coverage":"covered"}
{"verdict":"NON_BLOCKING","findings":["minor naming nit"],"coverage":"covered"}
{"verdict":"BLOCKING","findings":["unhandled null case in parseFoo"],"coverage":"covered"}
```

### Embedded JSON verdict fallback

When a reviewer emits a short prose preamble before its JSON verdict object (e.g. "I now have full context. … {"verdict":"LOOKS_GOOD",…}"), the structured (parsed-object) path only sees parsed JSON nodes, so a verdict embedded in a plain string is invisible to it. The text-mode fallback scans the raw reply text for an embedded `{"verdict"…}` object and honors it as a finalization verdict.

Behavior of the embedded-verdict scanner:

- Finds every `{"verdict"` opener and spans to its matching closing `}`, tracking brace depth with respect for `\"` escapes and JSON string boundaries (a `}` inside a JSON string value does not prematurely close the object).
- Uses the **last** embedded verdict if multiple appear, so a reviewer that echoes a prior `BLOCKING` before a final `LOOKS_GOOD` yields the final `LOOKS_GOOD`.
- A truncated object (opener with no matching `}`) yields no verdict (`''`), so a malformed reviewer reply is treated as no-verdict (re-prompt for format) rather than silently finalized.
- Parses the captured object with `JSON.parse`; an unknown `verdict` value (not one of the three known labels) is rejected as a finalization verdict, matching the structured and line-verdict paths.

### Coverage-adequacy contract

`coverage: "missing"` is **BLOCKING regardless of the text verdict**: a reviewer that emits `{"verdict":"LOOKS_GOOD","coverage":"missing"}` does NOT permit finalization. The orchestrator surfaces this as `BLOCKING: test coverage missing for changed behavior (add a case to the relevant *.test.ts)`. This enforces the shared expectation that behavior-changing edits add a corresponding test case.

### Crash vs. no-verdict

`detectReviewerCrash` distinguishes a reviewer-agent crash from a reviewer that ran but emitted no recognizable verdict:

- **Crash** — any object in the tool-result tree carrying an `errorMessage` string or `type === 'error'`. The message is surfaced verbatim; the orchestrator reports the reviewer crashed and the verdict cannot be trusted.
- **No-verdict** — the reviewer replied without a recognizable verdict label or JSON object. The orchestrator re-prompts for format rather than treating the reply as a crash.

The crash heuristic is depth-capped at 8 levels and will also classify an unrelated nested `errorMessage` (e.g. a failed inner tool call the reviewer made) as a reviewer-agent crash when the reviewer also produced no recognizable verdict; a reviewer whose inner tool call errored AND who produced no verdict is effectively crashed from the operator's perspective.

## Tools

Tools represent the capabilities given to agents to interact with your system.

- Tool schemas and validators live in `common/src/tools` as Zod definitions.
- Tool executions are handled securely by the SDK on your local machine (reading/writing files, executing commands, searching codebase).
- Since Openbuff has no hosted proxy backend, tool execution is extremely low-latency, and all outputs are processed directly by your locally configured models.

### `query_index`

`query_index` queries the local codebase graph index. It is intended for retrieval-led context gathering before reading or editing files.

The index tracks file paths, extensions, symbols, imports, markdown headings, documentation concepts, package scripts, CI workflow commands, task-runner files, and graph relationships between files/symbols/imports/calls/headings/concepts. Import/reference extraction covers JavaScript/TypeScript, Python, Rust, Go, Java/Kotlin packages, C/C++ includes, C# namespaces, Ruby requires, PHP namespaces/includes, Swift modules, and GDScript resources. Results are discovery hints: always verify returned files with `read_files` or `read_subtree` before editing.

Supported modes:

- `search` — default ranked file search for a natural-language or keyword `query`.
- `explain` — ranked search plus an `explanation` for why each file matched.
- `neighbors` — graph-adjacent files for a `from` path, or neighbors around files matching `query`.
- `path` — shortest graph path between `from` and `to`, or a graph path inferred from `query` matches.
- `references` — files that reference (import/call) the `from` path, expanding outward from a known symbol or file.
- `commands` — command-discovery search that prioritizes package manifests, CI workflows, task runners, and testing/contributing docs. Cargo, Go, Python, Maven/Gradle, .NET, Composer, SwiftPM, CMake, Ruby, and Godot manifests contribute native validation concepts.

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

#### Binary file skipping and file-tree truncation

Three independent stages keep binary and oversized files out of the index AND out of the project file tree shown to agents at runtime. Each stage owns its own extension list (no shared import) so there is no cross-package dependency between `common/` and `packages/indexer/`; the lists intentionally overlap but are kept in sync by convention, not by a single source of truth.

**Stage 1 — file-walker (`packages/indexer/src/file-walker.ts`).** `walkProject(projectRoot, extraExclude)` is the filesystem walker that feeds `buildMetadataIndex` / `updateMetadataIndex`. It applies, in order:

- `DEFAULT_EXCLUDE_DIRS` — `node_modules`, `.git`, `dist`, `build`, `.next`, `.nuxt`, `.output`, `.turbo`, `coverage`, `.cache`, `.codebuff-index`, `tmp`, `.tmp`, `out`, and others.
- nested `.gitignore`, `.openbuffignore`, and legacy `.codebuffignore`
  patterns, plus the same mandatory sensitive-path policy enforced by file-read
  tools.
- `extraExclude` directory names passed by the caller (the indexer uses this for the cache directory).
- `MAX_FILE_SIZE` — files larger than 500 KB are skipped (never `stat`-hashed).
- `BINARY_EXTENSIONS` — after stat, files whose lowercase extension is in this set are skipped before they are ever hashed or read. The set covers game-engine binary assets (`.uasset`, `.umap`, `.unity`, `.prefab`, `.fbx`, `.obj`, `.blend`, `.meta`, ...), images/textures, audio, video, 3D/animation, compiled/packaged, compressed archives, and binary containers (`.pdf`, `.sqlite`, `.bin`, ...). See the `BINARY_EXTENSIONS` export in `file-walker.ts` for the full list.
- the configured `maxFiles` limit (20,000 by default). Traversal is sorted and
  status reports partial coverage, skipped counts, and uncovered prefixes when
  the limit is reached.

`walkProject` returns `WalkedFile[]` (`absolutePath`, `relativePath`, `ext`, `mtime`, `size`). `metadata-indexer.ts` imports the same `BINARY_EXTENSIONS` from `./file-walker` and repeats the check inside `indexWalkedFile` as a second line of defense, so files added through a path other than the walker are still dropped before being read as UTF-8.

**Stage 2 — project file tree (`common/src/project-file-tree.ts`).** `getProjectFileTree` builds the tree shown in agent system prompts. It applies `DEFAULT_IGNORED_PATHS` and nested `.gitignore` / `.openbuffignore` rules. It also defines its **own** local `BINARY_EXTENSIONS` Set (not imported from `file-walker.ts`) — this is deliberate, to avoid a cross-package dependency from `common/` → `packages/indexer/`. The two lists overlap intentionally and are kept in sync by convention. Binary files never appear as tree nodes.

**Stage 3 — file-tree truncation (`packages/agent-runtime/src/system-prompt/truncate-file-tree.ts`).** `truncateFileTreeBasedOnTokenBudget` shrinks the already-built tree to a token budget with a 4-level cascade, stopping at the first level that fits:

1. `removeUnimportantFiles` — always applied first. Drops files matching a separate `unimportantExtensions` list (generated/minified JS, `.map`, `.d.ts`, `.pyc`, build output dirs like `/dist/` `/build/` `/node_modules/`, logs, media, game-engine binary assets, binary containers). This is a **third** independent extension list — again deliberately local to avoid a cross-package import. Empty directories after filtering are pruned. The tree is rebuilt immutably so the caller's tree stays pristine for other consumers.
2. `none` — if the token-annotated filtered tree fits the budget, render it as-is.
3. `unimportant-files` — if the no-token filtered tree fits, render it without per-file token scores.
4. `tokens` (`pruneFileTokenScores`) — iteratively strip the lowest-scoring per-file token annotations (batched, with a 5-tokens-per-name estimate) until the annotated tree fits.
5. `depth-based` — if tokens pruning alone is not enough, remove the deepest files first (sorted by depth, sampled to estimate avg tokens per filename, removed in batches of `0.5 × tokensToRemove / avgTokensPerFileName + 100`, capped at 10 iterations). A no-progress safety break stops the loop if token count stops decreasing.

Gotchas:

- There are **three** independent binary/unimportant extension lists: `BINARY_EXTENSIONS` in `file-walker.ts` (used by the walker + `metadata-indexer.ts`), the local `BINARY_EXTENSIONS` in `project-file-tree.ts` (used by the tree builder), and `unimportantExtensions` in `truncate-file-tree.ts` (used by the truncator). They overlap heavily but are not unified; adding a new binary extension means updating all three. The separation is intentional to avoid `common/` → `packages/indexer/` and `packages/agent-runtime/` → `common/` import cycles.
- `.meta`, `.prefab`, and `.unity` (Unity text serialization formats) are intentionally **excluded** from the `BINARY_EXTENSIONS` sets in both `file-walker.ts` and `project-file-tree.ts` so the indexer and file tree include them as text — they are YAML in Unity's text serialization mode and are parsed for asset references (see "Asset reference extraction" below). They **are** included in `truncate-file-tree.ts`'s `unimportantExtensions` list, so they are dropped from the agent-facing system-prompt file tree even though they remain in the indexer's graph. This split is deliberate: the indexer needs them for the asset reference graph; the system prompt does not need them because they are not source files an agent would edit.
- The 500 KB `MAX_FILE_SIZE` and configurable `maxFiles` caps are walk-time
  limits for the indexer only; `truncate-file-tree.ts` has its own token-budget
  limits that are independent of file count. Configuration defaults, semantic
  privacy/cost behavior, lifecycle states, and repair commands are documented
  canonically in [Configuration: Indexing and retrieval](configuration.md#indexing-and-retrieval).
- All extension matching is case-normalized (lowercased before lookup) and is a coarse extension allowlist, not a content sniff. A text file renamed `.bin` is skipped; a binary file with a non-binary extension is caught by the size limit (or by UTF-8 read failure inside `indexWalkedFile`).
- `truncate-file-tree.ts` rebuilds the tree immutably in `removeUnimportantFiles`; it does not mutate the input `fileTree` so other consumers of `ProjectFileContext.fileTree` are unaffected.

#### Asset reference extraction

`packages/indexer/src/asset-refs.ts` extracts lightweight text references from
game engine asset files so the indexer can create `references` edges in the
codebase graph. The extractor is purely text-based — it never reads binary
payloads. Binary formats (`.uasset`, `.umap`, `.fbx`, etc.) are skipped by
`BINARY_EXTENSIONS` before they reach this module.

The public API (exported from `@codebuff/indexer`) includes:

- `extractAssetRefs(content, ext, filePath): AssetRef[]` — dispatch by
  extension to the engine-specific extractor. Returns `[]` for non-asset
  files or unsupported formats.
- `extractGodotScriptRefs(content): AssetRef[]` — extract `preload("res://…")`
  / `load("res://…")` references from `.gd` GDScript files.
- `AssetRef` (type) — `{ rawRef, refType, resolvedPath }`.

Two internal helpers are used by `metadata-indexer.ts` to build the graph
edges and are NOT exported from the package entrypoint:

- `buildGuidToPathMap(files): Map<string, string>` — build a Unity GUID →
  project-relative path map from all indexed `.meta` files. Called inside
  `buildGraph` to resolve GUID refs in `.prefab`/`.unity` files.
- `resolveGuidRef(guid, guidMap): string | null` — resolve a Unity GUID to a
  file path via the map.

`AssetRef.refType` is one of:

| `refType`    | Source format                    | Example raw ref                        |
| ------------ | -------------------------------- | -------------------------------------- |
| `guid`       | Unity `.meta`/`.prefab`/`.unity` | 32-char hex GUID                       |
| `res_path`   | Godot `.tscn`/`.tres`/`.gd`      | `res://textures/player.png`            |
| `asset_path` | Unreal `.uproject`, Bevy configs | `Source/MyModule`, `assets/sprite.png` |
| `file_id`    | Unity `.prefab`/`.unity` (local) | integer `{fileID: 12345}`              |

Per-engine extraction strategy:

- **Unity `.meta`**: extracts the `guid:` field as a self-identifying `guid`
  ref with `resolvedPath` set to the `.meta` file's path with the `.meta`
  suffix stripped (the GUID belongs to this asset). Other files referencing
  this GUID resolve via the GUID → path map in `buildGraph`.
- **Unity `.prefab`/`.unity`** (text serialization): extracts external `guid:`
  references as `guid` refs (resolved later via the GUID → path map) and
  `fileID:` local references as `file_id` refs (always unresolved — they are
  intra-file references, not cross-file).
- **Godot `.tscn`/`.tres`**: extracts `[ext_resource path="res://…"]`
  declarations. `resolvedPath` is the `res://` path with the protocol
  stripped (project-relative).
- **Godot `.gd`** (GDScript): extracts `preload("res://…")` / `load("res://…")`
  calls, creating script→asset edges.
- **Unreal `.uproject`** (JSON): parses `Modules` and `Plugins` arrays, each
  name mapped to `Source/<Name>` or `Plugins/<Name>`.
- **Bevy**: extracts quoted asset paths from `.ron`/`.toml` config files that
  live under an `assets/` directory, resolving to `assets/<path>`.

Graph integration: `metadata-indexer.ts` stores `AssetRef[]` on
`IndexedFile.assetRefs` (only present when non-empty). `buildGraph` uses the
GUID → path map to resolve Unity `guid` refs, then creates `references` edges
from the referencing file to the target asset. If the target asset itself is a
binary file (e.g. `.png`) not in the index, the edge falls back to the
`.meta` sidecar file (which IS indexed as text YAML), so the reference still
connects to a real graph node.

Gotchas:

- Only `.meta`, `.prefab`, `.unity`, `.tscn`, `.tres`, `.gd`, `.uproject`, and
  Bevy `.ron`/`.toml` (under `assets/`) produce asset refs; all other
  extensions return `[]`.
- Up to 80 asset refs per file (`MAX_ASSET_REFS_PER_FILE`), deduplicated by
  `rawRef`, to bound index growth.
- `fileID` refs are always `resolvedPath: null` — they are local references
  within a single serialized file and do not create cross-file edges.

### `read_outline`

`read_outline` returns a structural AST-like outline of imports, exports, classes, methods, and function signatures in a source file. It allows understanding the composition of large files without loading their entire implementations, saving significant token counts and processing time.

Example:

```json
{
  "path": "sdk/src/provider-config.ts"
}
```

### `read_slices` (deprecated compatibility alias)

`read_slices` remains registered but is not prompt-visible for compatibility
after its shared path-policy and read-only scheduling migration. Prefer `read_files`
with `symbols: [{ path, names }]` for new targeted-read workflows.

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

- A recent complete whole-file `read_files.paths` call authorizes subsequent
  exact-match edits to that path and returns a short `readCapability` that can
  be copied when explicit proof is useful. Truncated reads expose no
  capability. Range and symbol reads remain scoped and require their
  `readCapability`/`rangeHash` on the follow-up edit.
- `basedOnRead` accepts either a `readCapability` token copied from a
  fresh `read_files` range header or an explicit `{ startLine, endLine,
hash }` object. The runtime verifies the embedded hash for large-file
  edits before applying the edit.
- A successful edit keeps path-level authorization during the editing flow,
  while exact-match follow-up edits chain from the latest prepared content.
  For large or ambiguous follow-up edits, carry the echoed post-edit
  `basedOnRead` forward or re-read the target range.
- Stale or failed edits should be recovered by re-reading the exact
  target range named in the diagnostic and retrying with the new
  `basedOnRead`, not by guessing from memory.
- Recovery reads tolerate the common one-file shorthand
  `{ paths: ["file"], ranges: [{ startLine, endLine }] }`: when there is
  exactly one unambiguous path, the harness assigns it to the range and treats
  the request as range-only. Missing paths remain invalid for multi-file
  requests.
- Cross-turn authorization is persisted only after all in-flight read/edit
  tools settle, so the next model step receives the post-tool content hash.

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

`apply_smart_patch` applies a range-scoped unified diff with bounded local
alignment. It routes the final whole-file content through the shared filesystem
authority with an expected-content hash, never performs global syntax healing,
and fails closed when a hunk has no unique match unless positional fallback is
explicitly enabled. Validation reports `passed | failed | skipped` plus the
validator identity; unsupported file types are reported as skipped rather than
as compiler-validated.

Example:

```json
{
  "path": "sdk/src/provider-config.ts",
  "patch": "@@ -120,6 +120,7 @@\\n-  const lineEnding = \"\\\\n\"\\n+  const lineEnding = currentContent.includes(\"\\\\r\\\\n\") ? \"\\\\r\\\\n\" : \"\\\\n\"\\n   const initialContentLineCount = 100\\n",
  "fuzzFactor": 3,
  "autoHeal": false,
  "preflightCompile": true,
  "allowPositionalFallback": false
}
```

### Proposal review and application

Proposal tools maintain a per-run overlay and typed ledger without changing
the real workspace. `propose_str_replace`, `propose_write_file`, and
`propose_edit_transaction` return a `proposal_result` containing a stable id,
revision, aggregate base hash, ordered operations, and state. Use
`read_proposal_workspace` for the read-your-own-writes view and
`read_proposals` to refresh proposal state.

State changes use compare-and-swap fields: `proposalId`, `expectedRevision`,
and `expectedBaseHash`. `accept_proposal` and `reject_proposal` do not write
files. `apply_proposal` is valid only after acceptance; it revalidates every
base path, sends one coordinated authority-backed transaction, verifies the
post-commit state, and records a commit receipt. Repeated apply is idempotent.
Base drift transitions the proposal to `stale`; proposal previews and rejected
or stale records never count as applied mutations, changed files, or edit
memory.

### Direct subagent tool calls

Spawnable agents are also exposed to the model as direct tool aliases. The
runtime derives each alias from the agent id's short name by replacing
hyphens with underscores; for example, `openbuff/file-picker@1.0.0`
becomes the `file_picker` tool. The direct call is transformed into a
single-entry `spawn_agents` call before execution, so normal spawn
permissions and agent-template validation still apply.

Input fields:

- `prompt` (string, optional) — the prompt forwarded to the child agent.
- `params` (object, optional) — parameters object for the child agent.
  Direct agent schemas also accept a stringified JSON object for `params`
  and parse it before validation; malformed JSON, arrays, and objects that
  do not match the child agent's schema still fail validation.
- `handoff` (object, optional) — structured handoff payload forwarded to
  the child spawn entry.
- `background` (boolean, optional) — launches the child as a background job.
- `timeout_seconds` (number, optional) — per-spawn wall-clock deadline; `-1`
  disables the deadline.

`spawn_agents.agents` also performs bounded repair for one- or
double-stringified arrays and stringified object entries. Malformed or
truncated JSON remains rejected; the runtime never fabricates an empty agent
entry or silently drops required parameters.

Example:

```json
{
  "prompt": "Run pwd",
  "params": { "command": "pwd" }
}
```

Equivalent tolerated form when a provider serializes nested params as a
string:

```json
{
  "prompt": "Run pwd",
  "params": "{\"command\":\"pwd\"}"
}
```

Gotchas: the alias name is only for the provider-facing tool call; the
spawn entry keeps the original agent id. Explicit `params` values are
preserved and validated downstream, including invalid primitive values,
so this compatibility layer does not weaken required agent parameters.

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

| Event type                                           | injected field                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `subagent_start` / `subagent_finish`                 | `parentAgentId` set to the **parent orchestrator's** `agentId` (or the event's existing `parentAgentId` if already set), so the child block nests under the orchestrator |
| `tool_call` / `tool_result`                          | `parentAgentId` set to the **child's** `agentId`, so the child's tool calls render inside the child's own agent block, not the orchestrator's                            |
| `text`                                               | `agentId` set to the **child's** `agentId` (empty `text` is dropped), so child prose attributes to the child block                                                       |
| other events (e.g. `reasoning_delta`, plain strings) | forwarded verbatim, no field injected                                                                                                                                    |

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

### Tool-result message builders

Tool handlers build structured tool results and convert the internal
`Message[]` history into the shape the AI SDK sends to providers. The
public contract lives in `common/src/util/messages.ts` and is consumed by
every tool handler in `packages/agent-runtime/src/tools/handlers/tool/`.

#### `jsonToolResult`

`jsonToolResult<T>(value: T)` returns a one-element tuple shaped as the
`json` variant of `ToolResultOutput` for a `tool`-role message's `content`
array. It is the single constructor tool handlers use to produce JSON
results (e.g. `read_files`, `read_subtree`, `spawn_agents`,
`web-search`).

```ts
import { jsonToolResult } from '@codebuff/common/src/util/messages'

// Object value — passes through unchanged.
return { output: jsonToolResult({ result: 'success', count: 3 }) }

// Primitive value — passes through unchanged.
return { output: jsonToolResult('terminal output') }
```

The value is run through `sanitizeJsonToolResultValue` before being
wrapped in the `{ type: 'json', value }` tuple. Sanitization rules
applied to every value (top-level and nested):

- `null`, `string`, `boolean`, finite `number` pass through.
- `bigint` is stringified; `function` and `symbol` are dropped from
  object properties.
- `undefined` object keys are omitted; `undefined` values in arrays or
  at the top level become `null`, matching JSON array semantics.
- Circular references become the string `"[Circular]"`.
- Values with a custom `toJSON()` are invoked and the result is
  sanitized recursively.

**Top-level arrays pass through unchanged.** The AI SDK's
`modelMessageSchema` accepts bare-array tool-result values, so
`jsonToolResult` does **not** wrap a top-level array in an envelope. A
handler that returns `jsonToolResult(reports)` where `reports` is an
array will appear to the model as the bare array. Nested arrays (arrays
that live inside an object value) are also preserved as arrays.

```ts
// Top-level array — passes through unchanged.
jsonToolResult([{ path: 'a.ts' }, { path: 'b.ts' }])
// → [{ type: 'json', value: [{ path: 'a.ts' }, { path: 'b.ts' }] }]

// Nested array inside an object — preserved as-is.
jsonToolResult({ files: ['a.ts', 'b.ts'] })
// → [{ type: 'json', value: { files: ['a.ts', 'b.ts'] } }]
```

This contract is regression-tested in
`common/src/util/__tests__/messages.test.ts` (unit tests on
`jsonToolResult` plus an integration test through
`convertCbToModelMessages`).

#### `mediaToolResult`

`mediaToolResult({ data, mediaType })` returns the `media` variant of
`ToolResultOutput`, used by tool handlers that return image or file
binary content. The `data` is a base64 string and `mediaType` is the
MIME type (e.g. `image/png`).

#### `convertCbToModelMessages`

`convertCbToModelMessages({ messages, includeCacheControl?, logger? })`
is the boundary that shapes the internal `Message[]` history into the AI
SDK's `ModelMessage[]` for a provider request. It is the sole caller of
`jsonToolResult`'s schema-validation path and is invoked by
`sdk/src/impl/llm.ts` before each model call.

Behavior:

- Converts each role: `system` flattens its text parts, `user` and
  `assistant` pass through (string assistant content is wrapped in a
  text part), and `tool` is split into `tool-result` parts (or `file`
  parts for media results). JSON `tool-result` values are sanitized at
  this conversion boundary too, so raw or persisted tool outputs that
  bypassed `jsonToolResult` cannot send `undefined`, functions, symbols,
  non-finite numbers, or circular objects into `modelMessageSchema`.
- Filters **orphan tool results** — `tool`-role messages whose
  `toolCallId` has no preceding `assistant` tool-call with the same id
  are dropped before validation, with a debug log when a `logger` is
  supplied. This prevents persisted history from carrying stale tool
  results that would fail the SDK schema.
- Aggregates consecutive same-role messages (system/user/assistant) only
  when their `timeToLive`, `providerOptions`, and `tags` are equal, so
  tag-bearing prompt boundaries are never merged together.
- When `includeCacheControl` is `true` (default), applies up to 3
  Anthropic prompt-cache breakpoints on stable prefix boundaries:
  system message, last message before the earliest live-prompt tag
  (`USER_PROMPT` / `STEP_PROMPT`), and the tail message. Set-dedup
  keeps the count within Anthropic's 4-breakpoint limit.
- Runs every aggregated message through `modelMessageSchema.safeParse`
  and throws `convertCbToModelMessages: Message at index N failed
schema validation.` on failure, with the full message, aggregated
  array, and zod error logged when a `logger` is supplied.

#### `getCacheAnchorSummary`

`getCacheAnchorSummary(messages: Message[])` is the crash-safe telemetry
egress for the cache-control strategy above. It returns the anchor
metadata (type, index, djb2 content hash, reason) that
`convertCbToModelMessages` would apply, without mutating the messages.
It is used by the cache-debug snapshots in
`packages/agent-runtime/src/util/cache-debug.ts` so developers can diff
which message indices received cache control and whether they stay
stable across requests (cache hits) or churn every turn (cache misses).
On any internal conversion error it returns `[]`, so telemetry never
breaks the request flow.

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
- `getSlashCommandsWithSkills(skills, fileTree?): SlashCommand[]` —
  returns the base `SLASH_COMMANDS` with one `skill:<name>` entry appended
  per discovered skill, plus (when `fileTree` is provided) game-dev task
  preset commands for each detected game engine. The CLI's `Chat`
  component calls this with the project file tree so engine-detected
  commands appear in the palette.

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

| Group              | Commands                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Diagnostics / info | `info` (`status`), `help` (`h`, `?`, implicit), `setup`, `models`, `provider`                       |
| Project scaffold   | `init` (implicit)                                                                                   |
| Provider account   | `connect` (`chatgpt`, `connect:chatgpt`) — only present when `CHATGPT_OAUTH_ENABLED` is `true`      |
| Edit history       | `undo`, `redo`                                                                                      |
| Durable plans      | `interview`, `resume-plan` (`rp`), `update-plan` (`up`), `plan-status` (`ps`), `lessons` (`lesson`) |
| Code review        | `review`                                                                                            |
| Conversation       | `new` (`n`, `clear`, `c`, `reset`, implicit), `history` (`chats`), `prompts` (`prompt-search`)      |
| Agent shortcuts    | `agent:general` (inserts `@general-agent `)                                                         |
| Feedback / misc    | `feedback`, `bash` (`!`), `diff`, `changes`, `image` (`img`, `attach`)                              |
| Mode switching     | `mode:<mode>` for every mode in `AGENT_MODES`, each with a `model:<mode>` alias                     |
| Theme / session    | `theme:toggle`, `exit` (`quit`, `q`, implicit)                                                      |

Starting a new durable plan is done by switching to plan MODE via
`mode:plan` (documented in the Mode switching row below); the standalone
`/plan` slash command has been removed because plan MODE already covers
that entry path and produces structured plan artifacts. The durable-plan
quartet (`/resume-plan`, `/update-plan`, `/plan-status`, `/lessons`) is
backed by the `update_plan_status` and `create_plan` tools documented
above and is the user-facing surface to the PlanLink artifact flow.
`/resume-plan`, `/update-plan`, `/plan-status`, and `/lessons` accept a
session target (slug or `.agents/sessions/<slug>` path) plus an optional
trailing note via `splitPlanCommandArgs`. With no target, they open the
plan-session picker instead of sending a prompt.

`review` uses a model-agnostic description ("with the configured
reviewer"); it never claims a specific hosted model.

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

### Game-dev preset commands

When `getSlashCommandsWithSkills` is called with a `fileTree` argument, it
runs `detectEngineProfiles(fileTree)` (from
`common/src/util/engine-profiles.ts`, documented in the Shared Prompt
Sections above) and appends 4 task-preset slash commands per detected
engine: `<engine>:build`, `<engine>:run`, `<engine>:test`,
`<engine>:watch`. No game engine detected → no game-dev commands.

The presets live in `common/src/util/game-dev-presets.ts`. Public API:

- `getGameDevPresets(engineIds): GameDevPreset[]` — 4 presets per engine,
  ordered `build`, `run`, `test`, `watch`, in stable engine order
  (`unity`, `godot`, `unreal`, `bevy`).
- `getGameDevSlashCommands(engineIds)` — convenience wrapper returning the
  same presets in slash-command shape (`id`, `label`, `description`,
  `insertText`).
- `GameDevPreset` (type) — `{ id, label, description, insertText }`.

Each preset carries an `insertText` — a natural-language prompt (NOT a raw
shell command) that the agent receives and acts on by inspecting the
project to find the correct build system and commands. Selecting the
command inserts the prompt into the input field for review before sending.
This avoids hardcoding commands that may not match the project's actual
setup.

| Engine | Commands                                                    |
| ------ | ----------------------------------------------------------- |
| Unity  | `unity:build`, `unity:run`, `unity:test`, `unity:watch`     |
| Godot  | `godot:build`, `godot:run`, `godot:test`, `godot:watch`     |
| Unreal | `unreal:build`, `unreal:run`, `unreal:test`, `unreal:watch` |
| Bevy   | `bevy:build`, `bevy:run`, `bevy:test`, `bevy:watch`         |

The same module exports `getGameDevJobGuidance(engineIds)`, which returns
`GameDevJobGuidance[]` — engine-specific readiness patterns, error
patterns, log file paths, and stop instructions for managing long-running
editor/build/watch/export processes with `check_job` / `kill_job` /
`read_logs`. This is consumed by the agent at runtime when a game-dev
preset command spawns a background build or editor process.

Gotcha: game-dev command descriptions undergo the same ≤50-char
`truncateDescription` as skill commands.

### Aliases vs. implicit commands

`aliases` and `implicitCommand` are independent: a command may have
aliases that resolve inside the registry without being reachable
slashless, and an implicit command's aliases are never themselves
implicit. `SLASHLESS_COMMAND_IDS` is built from the lowercased `id` of
every `implicitCommand: true` entry only.
