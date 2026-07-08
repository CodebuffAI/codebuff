# LESSONS: Game Development CLI + Research-Web Upgrade

## Planning Lessons
- The game-development request spans at least six subsystems: researcher agent, agent-runtime web search, common language/project context, indexer, CLI/task UX, SDK terminal/background jobs, and docs. Treat it as a phased cross-subsystem effort, not a one-file change.
- Research-web's current failure is not mainly a provider issue. The product-level issue is that broad prompts are used as literal queries and the agent only performs one web-search step.
- Game development support should be implemented as general primitives: framework/engine profiles, asset-aware indexing, reference graphs, and task presets. These will also help mobile apps, design-heavy repos, ML repos, generated-code repos, and monorepos.
- Asset-heavy repositories require metadata-first indexing. Large/binary files should contribute safe metadata and references, not be read as source text.
- Background job primitives already exist and should be reused for game workflows. The missing layer is discoverable presets, naming, wait patterns, lifecycle guidance, and docs.

## Gotchas
- Do not test researcher-web with live web search in unit tests; use mocked search/tool outputs to avoid flaky network/provider behavior.
- Do not assume proprietary asset formats are parseable. Start with path/type/metadata and only parse text-like manifests or references.
- Do not run Unity/Godot/Unreal build/export/editor commands automatically from task presets. Require explicit user confirmation because these can be slow, stateful, or license/environment dependent.
- CLI visual smoke via `codebuff-local-cli` is only needed if implementation changes visible CLI components or hooks.
- Re-read all target source files before implementation. The current plan is based on discovery context and may drift.

## Decisions To Preserve
- Prefer M1 first: fix research-web decomposition because it directly addresses the user-observed failure and is isolated enough to validate quickly.
- Implement engine support as profiles rather than special-casing every downstream consumer independently.
- Represent game assets in index/file tree via metadata and lightweight reference extraction before pursuing deeper parsers.
- Keep docs and validation as part of the main rollout, not optional cleanup.

<!-- update_plan_status:appended -->
## M1 Implementation Lessons — 2026-07-07T21:55:00.569Z

## M1 Implementation Lessons — 2026-07-07

### L4. `isBroadPrompt` is defined but not wired into the flow
`isBroadPrompt()` performs the detection heuristics (length, question marks, lists, comparisons, sentences), but `handleSteps` triggers the broad path based solely on `decomposePrompt` returning ≥2 subquestions. This is pragmatic — if decomposition succeeds, the prompt is effectively broad regardless of heuristics. Whether to also gate on `isBroadPrompt` to avoid over-decomposing edge cases is a design decision (currently, decomposition is bounded by MAX_TOTAL_CALLS=3, so over-decomposition is self-limiting).

### L5. Numbered-item regex requires newlines
`/(?:^|\n)\s*\d+[.)]\s+/m` matches numbered items at line starts. A single-line concatenation like `'1. A 2. B 3. C'` won't split because items 2 and 3 don't follow newlines. Tests should use `\n` between items or use a different split strategy for inline numbered items.

### L6. Generator type narrowing in tests
`handleSteps` yields `ToolCall | StepText | GenerateN | ...`. In tests, accessing `.toolName` requires `'toolName' in value` narrowing, and `.input.query` requires `(val as any).input?.query`. The `done` property on `IteratorResult` is `boolean | undefined`, not `boolean`.

### L7. MAX_TOTAL_CALLS=3 with MAX_SUBQUERIES=5
Even a prompt decomposing into 5 subquestions only makes at most 3 web_search calls. This bound ensures broad prompts don't overload the search provider while still doing more than a single lookup. The subquestions beyond the cap are silently dropped — a future iteration could synthesize the uncalled questions into the report as "not searched due to limits" for transparency.

### L8. Simple prompt edge case — passing `cleanedPrompt` as query when no URL
When no URL is present and decomposition yields <2 subquestions, the simple path passes the cleaned prompt as a query to web_search. This preserves the original single-lookup behavior for narrow prompts.

### L9. The doc-writer agent independently updated `docs/agents-and-tools.md`
Between the original implementation turn and this resume, a doc-writer agent was spawned and modified `docs/agents-and-tools.md` with a section describing the researcher-web agent contract (decomposition, citations, SSRF guard). This is M5.1 progress and should be reviewed for accuracy after M1 validation passes.

<!-- update_plan_status:appended -->
## M2 Implementation Lessons — 2026-07-07T22:30:00.000Z — 2026-07-07T22:16:07.670Z

## M2 Implementation Lessons — 2026-07-07

### L10. Trailing slash in directory patterns breaks path prefix matching
`pathStartsWith(filePath, prefix)` checked `normalized.startsWith(normalizedPrefix + '/')` but if the prefix already ends with `/` (e.g. `Assets/`), the concatenated check becomes `startsWith('Assets//'` which fails. Fix: strip trailing `/` from the normalized prefix before the `startsWith` check. This is a common bug when directory patterns are stored with trailing slashes for readability.

### L11. File extensions vs manifest paths — don't conflate
`.uproject` was initially placed in `ENGINE_MANIFEST_PATHS` (which does exact path match `path === '.uproject'`), but `.uproject` is a file extension, not a specific file name. A file named `MyGame.uproject` would never match the exact path `.uproject`. File extensions should always go in `ENGINE_EXTENSIONS` (which does `getFileExtension(p).includes(ext)` suffix matching). Manifest paths should only be used for specific files like `ProjectSettings/ProjectVersion.txt` or `project.godot`.

### L12. Bevy detection is conservative — Cargo.toml + assets/ heuristic only
The Bevy heuristic checks for `Cargo.toml` + `assets/` directory presence. This means any Rust project with an `assets/` folder will be flagged as Bevy. A more precise check would read `Cargo.toml` content for a `bevy` dependency, but the file tree alone doesn't provide file contents. The caller would need to supply actual file content for true dependency-based detection. For now, false positives on non-Bevy Rust projects with `assets/` dirs are the tradeoff.

### L13. Engine profiles parallel language profiles in API shape
`engine-profiles.ts` mirrors `language-profiles.ts`: same `detect*Profiles(fileTree)`, `format*Prompt()`, `format*PromptForFileTree()` API. This makes the two detection layers composable — they can be called independently and their prompt output concatenated.

### L14. Regex `.+` vs `.*` in test assertions
When asserting that a string pattern like `/Detected: .*Unity.*Godot.*Unreal/` matches a string starting with `Detected: Unity`, using `.+` before the first engine name fails because `.+` requires at least one character between `Detected: ` and `Unity`. Use `.*` (zero or more) instead of `.+` (one or more) when the pattern may start immediately after a fixed prefix.


<!-- update_plan_status:appended -->
## ## M2 Final Validation Lessons — 2026-07-07T23:10:00.000Z — 2026-07-07T22:21:34.404Z

### L15. Integration tests for template placeholder wiring are necessary, not just unit tests
The M2.3 wiring connects `formatEngineProfilePromptForFileTree` to the `LANGUAGE_PROFILE` placeholder in `strings.ts`. Unit tests on `engine-profiles.ts` alone (M2.4) verify detection and formatting in isolation, but don't prove the placeholder actually renders engine guidance in real agent prompts. Adding 2 integration tests to `strings.test.ts` (one positive: Unity project renders `## Engine profile`; one negative: non-game project omits it) gave end-to-end coverage of the wiring chain: `fileTree → detectEngineProfiles → formatEngineProfilePrompt → LANGUAGE_PROFILE placeholder → getAgentPrompt output`. This mirrors the existing frontend-section and language-profile placeholder tests already in `strings.test.ts`.

### L16. `LANGUAGE_PROFILE` placeholder renders both language AND engine profiles
The `LANGUAGE_PROFILE` placeholder in `strings.ts` now concatenates the output of `formatLanguageProfilePromptForFileTree` AND `formatEngineProfilePromptForFileTree`. Both return empty strings when no profile is detected, so non-game projects see only the language section (unchanged behavior), while game projects see both. The engine profile section appears as `## Engine profile` after the `## Language profile` section, maintaining visual separation without requiring a new placeholder.


<!-- update_plan_status:appended -->
## M3.1 Audit Lessons — 2026-07-07T23:45:00.000Z — 2026-07-07T22:32:32.848Z

## M3.1 Audit Lessons — 2026-07-07

### L17. The file tree builder has no binary file detection at all
`common/src/project-file-tree.ts` walks every file in the project using only gitignore patterns. There is no file extension check, no binary detection, and no size cap. This means a Unity project with thousands of `.png`/`.fbx`/`.prefab` files will fill the 10K file tree with mostly binary assets, leaving little room for source code. Any fix for M3.2 should add a binary extension skip here too, not just in the indexer.

### L18. The indexer reads binary files as UTF-8 text
`indexWalkedFile()` in `metadata-indexer.ts:292` calls `fs.promises.readFile(path, 'utf8')` on every walked file. Binary files that pass the 500KB size filter get their content corrupted into garbage strings. The regex-based import extractor then runs on this garbage, potentially producing nonsense import edges. The fix for M3.2 should add a binary extension skip BEFORE the `readFile` call — either in the file walker or at the top of `indexWalkedFile`.

### L19. The `unimportantExtensions` list in truncate-file-tree.ts is the closest existing binary filter — but it misses game engine formats
The list at lines 363-442 of `truncate-file-tree.ts` filters `.jpg`, `.png`, `.mp3`, `.zip`, `.exe` etc. from the system prompt file tree display. But it does NOT include game engine formats: `.uasset`, `.umap`, `.unity`, `.prefab`, `.tscn`, `.tres`, `.gd`, `.fbx`, `.mat`, `.anim`, `.controller`, `.asset`, `.meta`. This is a quick win for M3.2 — just add these extensions to the existing list.

### L20. `SUPPORTED_CODE_EXTENSIONS` does not include GDScript (.gd)
The tree-sitter parser table in `packages/code-map/src/languages.ts` supports 12 language families but not GDScript. Godot's `.gd` files will not get symbol/token parsing. Adding GDScript support would require a tree-sitter-wasm for GDScript and a tags query file. This is optional for M3.3 — the indexer still extracts imports and concepts from `.gd` files via regex; it just won't have tree-sitter symbol scoring.

### L21. `IndexedFile` type lacks fields needed for game asset metadata
The current `IndexedFile` interface has `symbols`, `imports`, `headings`, `concepts` but no fields for: binary asset type (texture/material/scene/prefab), lightweight reference information (Unity GUIDs, Godot ExtResource IDs), or a binary flag. M3.2 should extend this type (or add a sibling type) to carry asset metadata. The `buildGraph` function in `metadata-indexer.ts` is the integration point for adding reference edges from this metadata (M3.4).

### L22. Two separate file tree systems with different limits
The system has TWO independent file tree builders: (1) `common/src/project-file-tree.ts` which builds the `FileTreeNode[]` tree for system prompts (cap 10K files), and (2) `packages/indexer/src/file-walker.ts` which builds the `WalkedFile[]` list for indexing (cap 20K files). They have different ignore patterns, different size limits, and different exclude directories. Binary file handling must be addressed in BOTH, not just one.


<!-- update_plan_status:appended -->
## ## M3.2 Lessons — 2026-07-07 — 2026-07-07T22:35:57.754Z

### Key lessons from M3.2 implementation

1. **Duplicate `BINARY_EXTENSIONS` across packages instead of importing cross-package.** `common/src/project-file-tree.ts` cannot import from `packages/indexer/src/file-walker.ts` without creating a dependency direction violation (`common/` is a lower-level package). Solution: define the set locally in each package with a comment explaining why it's duplicated.

2. **Defense-in-depth binary guard in `indexWalkedFile`.** The file-walker already skips binary extensions, but `indexWalkedFile` has its own guard too — in case files reach it through a different path (e.g., incremental update index that re-uses cached file lists). Cost is negligible (one `Set.has()` check).

3. **`.meta` files are small but binary-purpose.** Unity `.meta` files contain GUID references but are not useful as text for code indexing. They're included in `BINARY_EXTENSIONS` to skip them from the indexer. M3.3 will handle GUID extraction from `.meta` files separately in the metadata extraction layer.

4. **`unimportantExtensions` in truncate-file-tree.ts uses suffix matching.** Extensions in this list are matched as path suffixes, not just file extensions. This means `.meta` will also match paths like `some.meta.json` if they existed — but in practice game repos don't have such naming, and the truncation filter is display-only (just hides nodes from the prompt), so false positives are low-risk.

5. **Test suite coverage for binary skip is deferred.** Existing tests (1476 total) all pass, confirming the binary skip doesn't break existing behavior. Dedicated tests for the binary skip paths would be valuable but are deferred to M3.5 which covers "tests for asset metadata extraction and reference graph queries."


<!-- update_plan_status:appended -->
## L23 — Three independent binary extension lists, not one shared source of truth — 2026-07-07T22:44:25.658Z

## L23 — Three independent binary extension lists, not one

During the M3.2 doc-writer pass, the initial doc draft claimed all three binary-skip stages shared "one source of truth" via import from `file-walker.ts`. A code-searcher audit revealed this was factually wrong:

- `packages/indexer/src/file-walker.ts` exports `BINARY_EXTENSIONS` (used by itself + `metadata-indexer.ts` via `import { BINARY_EXTENSIONS } from './file-walker'`).
- `common/src/project-file-tree.ts` defines its OWN local `BINARY_EXTENSIONS` Set (line 48) with an explicit comment: "Keeping this list here (separate from the indexer's BINARY_EXTENSIONS) avoids a cross-package dependency from common/ -> packages/indexer/." No import.
- `packages/agent-runtime/src/system-prompt/truncate-file-tree.ts` has a separate `unimportantExtensions` array (line 363). No import of either.

**Lesson:** when documenting cross-module behavior, always verify import relationships with code-searcher before claiming shared source-of-truth. The three lists overlap heavily but are intentionally separate to avoid import cycles. Adding a new binary extension requires updating all three. Doc was corrected to state "three independent extension lists... kept in sync by convention, not by a single source of truth."

**Reusable:** before writing doc claims about shared imports/exports, spawn one code-searcher for `BINARY_EXTENSIONS|import.*from.*file-walker` to confirm the actual dependency graph.


<!-- update_plan_status:appended -->
## M3.3 Implementation Lessons — 2026-07-07T23:55:00.000Z — 2026-07-07T22:52:44.429Z

## M3.3 Lessons — 2026-07-07

### L24. Module-scope regex with `/g` flag causes stale `lastIndex` across calls

The most insidious bug in M3.3 was a classic JavaScript stateful-regex trap. `UNITY_GUID_REGEX` was defined at module scope as `/guid:\s*([0-9a-fA-F]{32})/g`. When `extractUnityRefs` called `UNITY_GUID_REGEX.exec(content)` for `.meta` extraction, the regex's `lastIndex` pointer advanced past the match. On the next invocation (e.g., from a different test or a subsequent file), `exec()` started from the stale `lastIndex` — past the end of the new (shorter) string — and returned `null`.

This produced a non-deterministic test failure: the first `.meta` test passed, but the dispatch test for `.meta` failed because `lastIndex` was stale from the prior call.

**Fix:** Store regex patterns as source strings (`const PATTERN_SOURCE = 'guid:\\s*([0-9a-fA-F]{32})'`) and create `new RegExp(PATTERN_SOURCE, 'g')` fresh inside each function call. This guarantees a clean regex object with `lastIndex = 0` every time. Never share a `/g`-flagged regex object across calls unless you manually reset `lastIndex = 0` after each use — and even then, don't, because it's a footgun.

**Reusable rule:** Any module-scope regex used with `exec()` in a loop or single-shot match MUST be either (1) stored as a source string with `new RegExp()` per call, or (2) stored without the `/g` flag and only `/g` added when needed. Option 1 is safer.

### L25. `[^]]` character class does NOT work as expected in Bun's regex engine

The Godot regex used `\[ext_resource[^]]*path="res:\/\/([^"]+)"` to match `[ext_resource type="Texture2D" path="res://..." id="1"]`. In standard JS/Node, `[^]]` means "any character except `]`" — the `]` closes the negated character class. In Bun's regex engine, `[^]]` was interpreted differently (likely as `[`, then `^]`, then `]` literally), causing the pattern to match nothing.

**Fix:** Use `[^\]]` (explicit escape of `]` inside the character class) or `[^\]\[]` if you also need to exclude `[`. Store as a source string: `'\\[ext_resource[^\\]]*path="res:\\/\\/([^"]+)"'`.

**Reusable rule:** When a regex contains `]` inside a character class, always escape it explicitly as `\]` even if the spec says bare `]` works. Bun's regex engine is stricter than V8's in this edge case.

### L26. Unity text-format files (`.meta`, `.prefab`, `.unity`) must be REMOVED from `BINARY_EXTENSIONS`, not added

During M3.2, `.meta` was added to `BINARY_EXTENSIONS` because it's "not useful as text for code indexing." M3.3 reversed this: Unity's text serialization mode stores `.meta`, `.prefab`, and `.unity` as YAML text files containing GUID references and fileID mappings. These files are critical for asset reference extraction — they must be indexed as text so `extractAssetRefs` can parse them.

Unity has TWO serialization modes: text (YAML) and binary (proprietary). In text mode, `.prefab` and `.unity` are parseable YAML. In binary mode, they're not — but binary-mode `.prefab`/`.unity` can't be reliably distinguished from text-mode by extension alone. The conservative approach: index all `.meta`/`.prefab`/`.unity` as text and let the regex extractor handle both cases (binary files will simply have no GUID refs, which is fine).

**Reusable rule:** When adding an extension to `BINARY_EXTENSIONS`, verify it's actually binary, not just "not useful for code." Game engine text formats like Unity YAML and Godot `.tscn` are text files that look binary from a code-indexing perspective but are essential for asset graph construction.

### L27. GUID reference edges need `.meta` fallback for binary assets

Unity GUIDs resolve to asset paths like `Assets/Textures/player.png`, but `.png` is in `BINARY_EXTENSIONS` and not in the index. The initial `buildGraph` logic only created edges when `files[resolvedPath]` existed, which excluded all GUID references to binary assets (textures, models, audio).

**Fix:** After checking the resolved asset path, fall back to `resolvedPath + '.meta'`. The `.meta` file IS in the index (it's text YAML) and represents the asset in the graph. This means a `.prefab` referencing `player.png` via GUID creates a reference edge to `player.png.meta`, not to `player.png` itself.

**Reusable rule:** When building reference graphs in asset-heavy repos, always consider that the referenced target may be binary and not in the index. Fall back to the metadata sidecar file (`.meta` for Unity, or the resource file itself for Godot `.tscn`/`.tres`) to maintain graph connectivity.

### L28. Two independent `BINARY_EXTENSIONS` sets must be kept in sync

This was documented as L23 — `file-walker.ts` and `project-file-tree.ts` each have their own local `BINARY_EXTENSIONS`. M3.3's change (removing `.meta`/`.prefab`/`.unity`) had to be applied to BOTH sets. The `truncate-file-tree.ts` `unimportantExtensions` list was NOT changed — `.meta`/`.prefab`/`.unity` should still be in the unimportant list for system prompt display (these files are metadata, not source code the agent needs to see in the file tree).

**Reusable rule:** Any change to `BINARY_EXTENSIONS` requires updating both copies AND reviewing whether the `truncate-file-tree.ts` `unimportantExtensions` list needs the same change. The three lists serve different purposes: walker skip (don't even walk), tree builder skip (don't show in FileTreeNode tree), and prompt truncation (hide from displayed tree but keep in structure).

### L29. `assetRefs` field is conditionally spread to avoid polluting non-asset files

`IndexedFile.assetRefs` is `?: Optional` — only present when the file has asset references. The implementation uses `...(assetRefs.length > 0 ? { assetRefs } : {})` in the return object spread, so non-asset files (`.ts`, `.md`, `.json`) have NO `assetRefs` key at all, not an empty array. Tests verify this with `expect('assetRefs' in file).toBe(false)`.

**Reusable rule:** For optional indexed fields that only apply to a subset of files, use conditional spread rather than always including the field with an empty default. This keeps the index compact and makes it easy to distinguish "this file has no asset refs" from "this file's asset refs were not extracted."


<!-- update_plan_status:appended -->
## M3.4 Implementation Lessons — 2026-07-07T22:55:51.753Z

## M3.4 Lessons — 2026-07-07

### L30. M3.3 already delivered most of M3.4's scope — analyze overlap before implementing

M3.4's plan description was "Add graph edges for scene/resource/script/material references where extractable." But M3.3 already implemented the full `buildGraph` edge creation pipeline: Unity GUID resolution via GUID→path map with `.meta` fallback, Godot `res://` path resolution, Unreal module/plugin path resolution, and Bevy asset path resolution. All four engines already had `references` graph edges created in `buildGraph`.

The only genuinely missing piece was Godot `.gd` `preload()`/`load()` extraction. The other two candidate items (Godot `sub_resource` and Unity `m_Script` labeling) were analyzed and determined to be either not applicable (sub_resource is intra-file) or already covered (m_Script GUIDs are captured by the generic `guid:` regex).

**Reusable rule:** When a milestone's scope overlaps significantly with the prior milestone, analyze the overlap first. Don't re-implement what's already done — identify only the incremental gaps.

### L31. Godot `[sub_resource]` references are intra-file, not cross-file

Godot `.tscn` files contain two types of resource declarations:
- `[ext_resource path="res://..."]` — EXTERNAL references to other files. These create cross-file graph edges.
- `[sub_resource type="..." id="..."]` — INTERNAL references to sub-resources defined within the same `.tscn` file. These do NOT create cross-file edges because both source and target are the same file.

Only `ext_resource` declarations are extracted as asset refs. `sub_resource` declarations are correctly excluded.

### L32. Unity `m_Script` GUIDs are already captured by the generic GUID extractor

Unity `.prefab`/`.unity` files reference MonoBehaviours via `m_Script: {fileID: N, guid: GUID}`. The existing `UNITY_GUID_REGEX_SOURCE` matches any `guid:` followed by 32 hex chars, regardless of context. So `m_Script` GUIDs are already extracted alongside material, texture, and other GUIDs. No separate regex or labeling is needed — all Unity GUID refs use the same `refType: 'guid'` and resolve through the same GUID→path map.

**Reusable rule:** When adding a new reference type, check whether existing generic extractors already capture it. Don't add special-case extraction for patterns that are already matched generically.

### L33. `preload()`/`load()` regex must be specific enough to avoid plain string literals

The Godot `.gd` preload regex `(?:preload|load)\(\s*"res:\/\/([^"]+)"` requires the `preload(` or `load(` prefix before the `res://` string. A plain string assignment like `var path = "res://some/path"` does NOT match because it lacks the function call prefix. This is the correct behavior — only actual `preload()`/`load()` calls are asset references, not arbitrary string assignments that happen to contain `res://`.

**Reusable rule:** Code-level asset reference extraction should match function calls (`preload()`, `load()`), not bare string literals, to avoid false positives from path-like string constants.


<!-- update_plan_status:appended -->
## M4.1 Implementation Lessons — 2026-07-07T23:00:00.000Z — 2026-07-07T23:06:14.950Z

## M4.1 Lessons — 2026-07-07

### L32. Slash command `insertText` pattern is the right way to add task presets

The existing `agent:general` slash command uses `insertText` to insert `@general-agent ` into the input field — the user reviews and sends it. M4.1 reused this pattern for game-dev presets: each preset (`unity:build`, `godot:run`, etc.) inserts a natural-language prompt, not a raw command. The agent receives the prompt, inspects the project to find the correct build system, and runs commands with the user's confirmation.

This respects the plan risk constraint: 'CLI task presets must avoid running editor/build commands automatically without user confirmation.' The preset is a suggestion, not an auto-execution.

**Reusable:** Use `insertText` for any new slash command that helps users compose prompts. Use command handlers only for immediate UI actions (clear, navigate, open picker).

### L33. Avoid cross-package type imports — use structural compatibility

`getGameDevSlashCommands` in `common/src/util/game-dev-presets.ts` returns `Array<{ id, label, description, insertText }>` instead of importing `SlashCommand` from `cli/src/data/slash-commands.ts`. This avoids a `common/ → cli/` circular dependency. The CLI's `getSlashCommandsWithSkills` accepts the structurally-compatible objects directly since TypeScript uses structural typing.

**Reusable:** When a `common/` module needs to produce objects that the CLI consumes as a specific type, define the return type structurally (matching field names and types) rather than importing the CLI type. TypeScript's structural typing makes this work without an explicit interface match.

### L34. CLI palette description limit is 50 chars (strict `>`, not `>=`)

The slash command palette truncates descriptions longer than 50 characters to 49 chars + `…`. Descriptions of exactly 50 chars are left unchanged. The test `< 50` boundary is strict greater-than, not `>=`. One preset description ('Launch the Godot project in the editor or as a game') was 51 chars and failed the test.

**Reusable:** Keep slash command descriptions at 50 chars or fewer. The truncation happens in `getSlashCommandsWithSkills` when appending skill commands, but the same limit applies to all palette entries.

### L35. Preset `insertText` should be natural language, not tool names

Tests assert `insertText.includes('run_terminal_command')` is `false` — presets should be prompts an agent interprets, not raw tool invocations. The initial implementation used phrases like 'Use SYNC run_terminal_command' which failed this check. Fix: replace with 'Use a synchronous terminal command'. The keyword `BACKGROUND` (uppercase) is kept since it's a parameter value the agent needs, not a tool name.

**Reusable:** When writing prompt presets for agents, write imperative natural-language instructions. Reference tool concepts by their English meaning ('background terminal command') not by their API name ('run_terminal_command with process_type=BACKGROUND'). The agent already knows its tools — the prompt should describe intent, not mechanism.


<!-- update_plan_status:appended -->
## M4.2 Lessons — 2026-07-07T23:11:01.694Z

## M4.2 Lessons — 2026-07-07T23:15:00.000Z

### L30: Job guidance belongs alongside presets, not in tool descriptions
The existing `check_job`, `kill_job`, and `run_terminal_command` tool descriptions are generic and engine-agnostic. Embedding engine-specific patterns (Unity's `CompilerError`, Godot's `SCRIPT ERROR`, Unreal's `LogScriptCompiler: Error`) directly in those tool descriptions would bloat them for non-game projects that never touch a game engine. Instead, the `GameDevJobGuidance` structured data acts as a companion to the presets — the preset `insertText` strings reference the specific patterns, so the agent receives actionable engine-specific guidance only when a game-dev preset is selected.

### L31: Readiness patterns and error patterns must not overlap
A key test asserts that no string in `readinessPatterns` also appears in `errorPatterns` for the same engine. This prevents ambiguity — e.g., if `"Compilation succeeded"` were also an error pattern, the agent would not know whether to interpret it as ready or failed. The test `no readiness pattern is also an error pattern` guards against this regression.

### L32: Preset insertText updates must be validated against existing content tests
When updating the 8 watch/run preset `insertText` strings to reference job guidance patterns, the existing M4.1 content tests (e.g. `Unity watch preset references Editor.log and tail -f`, `Bevy run preset references cargo run and BACKGROUND`) continued to pass because the new text is a superset of the old — the original keywords are still present, just surrounded by more specific patterns. This confirms the incremental-update approach: enriching prompts with engine-specific patterns doesn't break existing structural assertions.


<!-- update_plan_status:appended -->
## GDScript Tree-Sitter Lessons — 2026-07-07 — 2026-07-08T00:18:18.059Z

Key lessons from GDScript tree-sitter integration:

1. **Tree-sitter query fields must match actual AST structure**: The initial .scm query used `function: (identifier)` on `call` nodes, but the GDScript grammar's `call` node has no `function` field — the `identifier` is a direct child. This caused `new Query()` to throw with 'Bad field name', which `getLanguageConfig` silently caught and returned `undefined`, making it look like the WASM was missing. Fix: dump the actual AST nodes (using a temporary debug test) and write patterns that match the real tree structure.

2. **GDScript grammar uses non-standard node names**: Unlike Python which shares `function_definition` and `class_definition` with other grammars, GDScript has `class_name_statement`, `variable_statement`, `const_statement`, `signal_statement`, `enum_definition` — these must be explicitly added to `DEFINITION_NODE_KINDS` in `structure.ts` for `parseFileStructure` to extract them.

3. **Attribute calls have a different AST shape**: GDScript `obj.method()` parses as `(attribute (identifier) (attribute_call (identifier)))`, NOT `(call (function: (attribute (identifier))))`. The `attribute_call` is a separate node type containing the method name identifier.

4. **build.ts copyWasmFiles was silently missing entries**: Kotlin, PHP, and Swift WASM files were in `WASM_FILES` and `languageTable` but never added to the `copyWasmFiles()` list. The `try/catch` around `cp` means the build silently warns and continues — a missing WASM file would go unnoticed until runtime. The build list should be validated against `WASM_FILES` entries.

5. **Bun .scm imports may resolve to file paths**: In Bun's test environment, `.scm` imports can resolve to a file path string rather than the file content. Tests that inspect query content should use `fs.readFileSync` to read the `.scm` file directly, or only check `typeof === 'string'` and `length > 0`.

6. **languageTable is a mutable singleton**: `createLanguageConfig` mutates `cfg.parser` on the shared `languageTable` entry. Tests that later call `createLanguageConfig` with a mock loader will find `cfg.parser` already set and skip the loader block. Fix: reset `cfg.parser = undefined` in the test before asserting mock behavior.

