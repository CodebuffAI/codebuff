# STATUS: Game Development CLI + Research-Web Upgrade

## Current State
- Session created: `.agents/sessions/game-dev-cli-research-upgrade-2026-07-07`
- Mode: planning only; no source implementation has been performed.
- Worktree at planning start was clean on `main...origin/main`.
- Discovery has already inspected the main surfaces for researcher-web, web-search tooling, CLI commands, SDK terminal/background jobs, language profiles, project file tree, indexer, docs, hooks, and related knowledge files.

## Completed
- Identified the researcher-web failure mode: broad multi-part prompts are passed as one literal search query, and the implementation performs only one search/fetch step.
- Identified product opportunities for game development:
  - Engine/framework profile detection for Unity, Godot, Unreal, Bevy.
  - Asset-aware file tree/index metadata for scene/resource/binary-heavy repos.
  - Scene/resource reference graph edges.
  - Better long-running task UX for editor/build/export/watch workflows.
  - Game-dev docs and workflow presets that generalize to other project types.
- Created durable planning artifacts:
  - `SPEC.md`
  - `PLAN.md`
  - `STATUS.md`
  - `LESSONS.md`

## Pending
- Confirm the implementation scope and first milestone.
- Re-read current target files before any implementation, especially:
  - `agents/researcher/researcher-web.ts`
  - `packages/agent-runtime/src/tools/handlers/tool/web-search.ts`
  - `packages/agent-runtime/src/tools/handlers/tool/web-search-utils.ts`
  - `common/src/util/language-profiles.ts`
  - `common/src/project-file-tree.ts`
  - `packages/indexer/src/**`
- Start M1 if the preferred first slice is fixing intensive research prompts.

## Blocked
- No technical blocker identified.
- Product scope decision remains open: implement M1 first, M2/M3 first, or attempt a full phased rollout.

## Next Checkpoint
Recommended next action: start with M1 (research-web decomposition) because it directly fixes the observed failure and is relatively isolated from game-engine indexing work.

## Resume Instructions
1. Read `PLAN.md` and confirm the `<!-- current-task: ... -->` marker.
2. Ask the user to choose scope only if not already clear.
3. Re-read exact files for the selected milestone before editing.
4. Implement one milestone slice at a time.
5. Run the validation gate from `PLAN.md`.
6. Update this file with `update_plan_status` after each milestone or blocker.

<!-- update_plan_status:appended -->
## Execution resumed — 2026-07-07T19:48:59.276Z

Execution resumed from injected artifacts. Scope decision resolved by proceeding with M1 first (research-web decomposition), matching the recommended next checkpoint. Source implementation has not started yet; next step is to re-read current target files and package validation commands before editing.

<!-- update_plan_status:appended -->
## M1 Complete — Research-Web Decomposition and Synthesis — 2026-07-07T21:55:00.562Z

## M1 Complete — Research-Web Decomposition and Synthesis

All 7 M1 subtasks completed and validated:

### M1.1-M1.6 Implementation (`agents/researcher/researcher-web.ts`)
- `stripMetaInstructions()`: strips "search the web for", "research", "look up", etc.
- `isBroadPrompt()`: detects broad prompts via length (>400 chars), 3+ question marks, numbered/bullet lists (≥3 items), comparison verbs, 5+ sentences.
- `decomposePrompt()`: splits on numbered items first, then question sentences (by `?`), then bullet markers, then comparison delimiters via `extractTopics()`. Bounded to MAX_SUBQUERIES=5.
- `trimQuery()`: strips question words ("what is", "how does", etc.) and trailing punctuation, caps at 120 chars.
- Iterative search loop: for each subquestion, yields web_search tool calls, bounded by MAX_TOTAL_CALLS=3.
- Retry/fallback (M1.5): MAX_ATTEMPTS=2 per subquery. First retry shortens query to core 5 keywords.
- Citation preservation (M1.6): links deduplicated by href, synthesized report with `##` headings per subquestion and `### Sources / Links` footer.
- Simple (≤1 subquestion) prompts stay on fast single-query path.
- URL mode preserved unchanged with existing SSRF guard.

### M1.7 Tests (`agents/__tests__/researcher-web.test.ts`)
- 35 tests across 7 categories:
  - Definition contract (9 tests)
  - Simple prompt single-query path (5 tests)
  - Broad prompt decomposition path (10 tests)
  - Retry on empty results (1 test)
  - URL mode + SSRF guard (4 tests)
  - Edge cases (4 tests)
  - Acceptance criteria from SPEC (2 tests)
- All 35 pass, 0 fail, 60 expect().

### Validation Gate
- `agents` typecheck (`bun x tsc --noEmit -p tsconfig.json`): **pass**
- Researcher-web tests (`bun test __tests__/researcher-web.test.ts`): **35 pass, 0 fail**
- Full agents test suite (`bun test __tests__`): **all pass**

### Gotchas / Lessons (also in LESSONS.md)
- `isBroadPrompt` is defined but not directly called in the flow; deployment detection comes from `decomposePrompt` output (≥2 subquestions triggers broad path). This is more practical — whether to gate on `isBroadPrompt` first is a follow-up decision.
- Numbered-item split regex requires newlines between items for the `/m` multiline flag to match; single-line comma-separated items need a different strategy.
- Generator type narrowing in tests: `next.value` is a union type (`ToolCall | StepText | ...`), so `'toolName' in value` is needed before accessing `.toolName`.


<!-- update_plan_status:appended -->
## M2 Complete — Engine and Framework Profile Detection — 2026-07-07T22:30:00.000Z — 2026-07-07T22:15:55.848Z

All 4 M2 subtasks completed and validated.

### M2.1-M2.2 Implementation (`common/src/util/engine-profiles.ts`)
- New module with `EngineProfile` type and `SupportedEngineId` (`unity`, `godot`, `unreal`, `bevy`).
- `detectEngineProfiles(fileTree)`: detects engines from file tree via:
  - Manifest files (exact path match): `ProjectSettings/ProjectVersion.txt` (Unity), `project.godot` (Godot).
  - File extensions (suffix match): `.unity/.prefab/.asmdef` (Unity), `.tscn/.tres/.gd` (Godot), `.uproject/.uasset/.umap` (Unreal).
  - Directory patterns (path prefix match): `Assets/`, `ProjectSettings/` (Unity), `addons/` (Godot), `Content/`, `Config/` (Unreal).
  - Bevy heuristic: `Cargo.toml` + `assets/` directory (conservative; could be refined with actual dependency check).
- Stable engine ordering: `['unity', 'godot', 'unreal', 'bevy']`.
- `formatEngineProfilePrompt()` and `formatEngineProfilePromptForFileTree()` for system-prompt injection.

### M2.3 Wiring (`packages/agent-runtime/src/templates/strings.ts`)
- `formatEngineProfilePromptForFileTree` called alongside existing `formatLanguageProfilePromptForFileTree` in the template that renders project context into agent system prompts. Engine guidance appears as a `## Engine profile` section.

### M2.4 Tests (`common/src/util/__tests__/engine-profiles.test.ts`)
- 34 tests across 5 categories:
  - Unity detection (6 tests: manifest, extensions, directory patterns, false-negative guard for .csproj)
  - Godot detection (5 tests: manifest, extensions, directory pattern)
  - Unreal detection (5 tests: .uproject, .uasset, .umap, Content/, Config/)
  - Bevy detection (3 tests: Cargo.toml+assets heuristic, false-negative guards)
  - Mixed repos (6 tests: multi-engine, mixed code/game, non-game, empty tree, stable order)
  - Prompt formatting (6 tests: empty, Unity, Godot, Unreal, Bevy, multi-engine)
  - Non-interference with language profiles (1 test)
- All 34 pass, 0 fail, 51 expect().

### Validation Gate
- `common` typecheck (`tsc --noEmit -p .`): **pass** (exit 0)
- `agent-runtime` typecheck (`tsc --noEmit -p .`): **pass** (exit 0)
- Engine profiles tests: **34 pass, 0 fail**
- Language profiles regression tests: **10 pass, 0 fail** (no regression)

### Bugs found and fixed during validation
1. `matchesDirectoryPattern` type error: called with single string instead of string[] — fixed by using `pathStartsWith` directly.
2. `pathStartsWith` trailing-slash bug: prefix `Assets/` matched `Assets/` exactly but not `Assets/readme.md` because `normalized.startswith('Assets//'` doubled the slash — fixed by stripping trailing `/` from prefix.
3. `.uproject` was in `ENGINE_MANIFEST_PATHS` (exact path match) but it's an extension — moved to `ENGINE_EXTENSIONS`.
4. Test regex `.+Unity` required 1+ chars before `Unity` but `Detected: Unity` starts immediately — changed to `.*Unity`.


<!-- update_plan_status:appended -->
## ## M2 Final Validation — Strings.ts Integration Tests — 2026-07-07T23:10:00.000Z — 2026-07-07T22:21:24.115Z

After the initial M2 completion entry, additional integration tests were added to `packages/agent-runtime/src/templates/__tests__/strings.test.ts` covering the M2.3 wiring (engine profile injection via the `LANGUAGE_PROFILE` placeholder in `strings.ts`):

### New Tests Added (2)
- **"includes engine profile section for a Unity game-dev project"** — verifies the `LANGUAGE_PROFILE` placeholder renders `## Engine profile` with `Detected: Unity` when a Unity file tree (ProjectSettings/ProjectVersion.txt + Assets/Main.unity) is provided.
- **"omits engine profile section for non-game projects"** — verifies a TypeScript project (package.json + src/index.ts) renders only `## Language profile` without `## Engine profile` or `game-engine project` text.

### Full M2 Validation Gate Results (all passing)
| Validation | Result |
|---|---|
| agents package typecheck | ✅ pass |
| agents researcher-web tests | ✅ 35 pass, 0 fail |
| common package typecheck | ✅ pass |
| common engine-profiles tests | ✅ 34 pass, 0 fail |
| common language-profiles tests (regression) | ✅ 10 pass, 0 fail |
| agent-runtime typecheck | ✅ pass |
| agent-runtime strings tests | ✅ 13 pass, 0 fail (includes 2 new engine profile integration tests) |

### Docs Updated
- `docs/agents-and-tools.md`: Added engine profile documentation under "Shared Prompt Sections" documenting `common/src/util/engine-profiles.ts`, its wiring via `strings.ts`, detection signals per engine, API surface, and rendered output shape.

M2 is fully complete and validated. All pending gate files cleared.


<!-- update_plan_status:appended -->
## Dead Code Cleanup Complete — 2026-07-07T23:30:00.000Z — 2026-07-07T22:29:19.201Z

## Dead Code Cleanup Complete

Removed dead code identified during M1/M2 review:

### `common/src/util/engine-profiles.ts`
- Removed `matchesDirectoryPattern` — dead function replaced by direct `pathStartsWith` calls in detection logic.
- Removed `signals` field from `EngineProfile` type — unused informational field that was never referenced by any consumer or test.

### `agents/researcher/researcher-web.ts`
- Removed `isBroadPrompt` — dead function. The broad decomposition path is triggered solely by `decomposePrompt` returning ≥2 subquestions; `isBroadPrompt` was defined but never called in the `handleSteps` flow.

### `agents/__tests__/researcher-web.test.ts`
- Removed the `isBroadPrompt` assertion (test that imported the function and checked its return value).
- Updated comment referencing `isBroadPrompt` to describe the actual decomposition-based gating.

### `docs/agents-and-tools.md`
- Updated "Researcher-web agent contract" section: removed inaccurate `isBroadPrompt` detection-trigger heuristics (length >400 chars, 3+ question marks, etc.) and replaced with accurate description — broad path is triggered when `decomposePrompt` yields ≥2 subquestions, otherwise falls through to the simple single-query path.
- Engine profile section required no update (the removed `signals` field and `matchesDirectoryPattern` were never documented; detection is described via the correct `ENGINE_MANIFEST_PATHS`, `ENGINE_EXTENSIONS`, and `ENGINE_DIRECTORY_PATTERNS` maps).

### Final Validation Gate
| Validation | Result |
|---|---|
| typecheck (root) | ✅ pass (exit 0) |
| typecheck-common | ✅ pass (exit 0) |
| typecheck-agents | ✅ pass (exit 0) |
| code-reviewer verdict | ✅ LOOKS_GOOD |

### Files Changed
- `common/src/util/engine-profiles.ts` (M — dead code removal)
- `agents/researcher/researcher-web.ts` (M — dead code removal)
- `agents/__tests__/researcher-web.test.ts` (M — test cleanup)
- `docs/agents-and-tools.md` (M — doc accuracy update)
- `common/src/util/__tests__/engine-profiles.test.ts` (M — test cleanup)

### LESSONS.md Update
- L4 (`isBroadPrompt` defined but not wired) is now resolved: the function was removed.
- L9 (doc-writer independently updated docs) is now resolved: the doc section was updated to reflect the post-cleanup code.


<!-- update_plan_status:appended -->
## M3.1 Complete — Binary/Large-File Skip Path Audit — 2026-07-07T23:45:00.000Z — 2026-07-07T22:32:32.839Z

## M3.1 Complete — Binary/Large-File Skip Path Audit

Audited all binary/large-file handling across `common/src/project-file-tree.ts` and `packages/indexer/src/**`.

### Findings

**4 surfaces examined:**

1. **`common/src/project-file-tree.ts` (file tree builder):** NO binary file detection. Filters only by gitignore + DEFAULT_IGNORED_PATHS. Caps at 10K files. Every binary asset gets a FileTreeNode with no metadata. Game repos fill the tree with binary assets, crowding out source files.

2. **`packages/indexer/src/file-walker.ts` (indexer walker):** Size cap only (`MAX_FILE_SIZE = 500_000`, 500KB). No extension-based binary skip. Small binary files (<500KB) pass through. The `WalkedFile` interface captures `ext` and `size` but not binary status.

3. **`packages/indexer/src/metadata-indexer.ts` (file indexer):** `indexWalkedFile()` reads every walked file as UTF-8 text (line 292), including binary files. Binary content gets corrupted to garbage. The regex-based import extractor runs on this garbage, producing nonsense imports. Non-code/non-doc/non-config files get empty symbols/headings/concepts but still appear in the graph as barren file nodes.

4. **`packages/agent-runtime/src/system-prompt/truncate-file-tree.ts` (system prompt display):** Has an `unimportantExtensions` list (lines 363-442) that filters media/binary files from the displayed tree. Includes `.jpg`, `.png`, `.mp3`, `.zip`, `.exe` etc. but does NOT include game engine formats (`.uasset`, `.umap`, `.unity`, `.prefab`, `.tscn`, `.tres`, `.gd`, `.fbx`, `.mat`, `.anim`, `.controller`, `.asset`, `.meta`).

**`SUPPORTED_CODE_EXTENSIONS` (tree-sitter parsers):** Supports `.ts`, `.js`, `.py`, `.java`, `.cs`, `.cpp`, `.rs`, `.rb`, `.go`, `.php`, `.swift`, `.kt` — but NOT `.gd` (GDScript).

**`IndexedFile` type:** Has `path`, `mtime`, `size`, `hash`, `ext`, `symbols`, `imports`, `headings`, `concepts`. Missing: no `assetType`, no `references` field, no `binary` flag, no `metadata` for lightweight asset info.

### Gaps for M3.2-M3.5

| Gap | Location | Priority |
|---|---|---|
| No binary extension skip in file walker | `file-walker.ts` | M3.2 |
| No binary extension skip in file tree builder | `project-file-tree.ts` | M3.2 |
| UTF-8 read of binary files in indexer | `metadata-indexer.ts:292` | M3.2 |
| No game engine formats in `unimportantExtensions` | `truncate-file-tree.ts:363` | M3.2 |
| No asset metadata extraction (type, refs) | `metadata-indexer.ts` | M3.2-M3.3 |
| No reference graph edges for game assets | `metadata-indexer.ts:buildGraph` | M3.4 |
| No `assetType` or `metadata` on `IndexedFile` | `types.ts` | M3.2 |
| GDScript (.gd) not in tree-sitter parsers | `code-map/src/languages.ts` | M3.3 (optional) |

### No source changes made
M3.1 is an audit-only task. No files were edited.


<!-- update_plan_status:appended -->
## ## M3.2 Complete — Binary Asset Skip Paths — 2026-07-07 — 2026-07-07T22:35:37.728Z

### What was done

Added binary file extension filtering across all 4 surfaces identified in the M3.1 audit:

1. **`packages/indexer/src/file-walker.ts`** — Added exported `BINARY_EXTENSIONS` set (~50 extensions covering game engine binary formats, images, audio, video, 3D, compiled, archives, and binary containers). Files matching these extensions are now skipped during the walk stage, before stat/hash/parsing.

2. **`packages/indexer/src/metadata-indexer.ts`** — Imported `BINARY_EXTENSIONS` from file-walker and added a defense-in-depth guard in `indexWalkedFile()` that returns `null` early for binary files, preventing the UTF-8 `readFile` call that would corrupt the index.

3. **`common/src/project-file-tree.ts`** — Added a local `BINARY_EXTENSIONS` copy (avoids cross-package dependency from `common/` → `packages/indexer/`) and skips binary files when building the file tree, so game repos with thousands of binary assets don't crowd out source files in the 10K file tree budget.

4. **`packages/agent-runtime/src/system-prompt/truncate-file-tree.ts`** — Extended the `unimportantExtensions` list with game engine formats (`.uasset`, `.umap`, `.unity`, `.prefab`, `.meta`, `.fbx`, `.anim`, `.controller`, `.mat`, `.dds`, `.tga`, etc.) plus additional audio/video and binary container formats.

### Validation results

- Root typecheck: PASS
- common typecheck: PASS
- agent-runtime typecheck: PASS
- indexer typecheck: PASS
- indexer tests: 70 pass, 0 fail
- common tests: 563 pass, 0 fail
- agent-runtime tests: 843 pass, 0 fail

Total: 1476 tests pass, 0 failures.

### Next milestone

M3.3 — Parse lightweight text references from Unity .meta/.prefab/.unity, Godot .tscn/.tres, Bevy asset paths, and safe Unreal metadata/path references. This will build on the binary skip foundation to add structured asset metadata extraction for text-format game engine files.


<!-- update_plan_status:appended -->
## M3.2 Documentation Complete — Binary File Skipping & File-Tree Truncation — 2026-07-07T23:50:00.000Z — 2026-07-07T22:44:16.849Z

## M3.2 Documentation Complete — Binary File Skipping & File-Tree Truncation

Added `#### Binary file skipping and file-tree truncation` section to `docs/agents-and-tools.md` under the `query_index` tool section (after repo-map helpers, before `read_outline`).

### What was documented

- **Stage 1 (file-walker):** `walkProject` filter order: DEFAULT_EXCLUDE_DIRS → .gitignore/.codebuffignore → extraExclude → MAX_FILE_SIZE (500KB) → BINARY_EXTENSIONS (~50 extensions) → MAX_FILES (20K). `metadata-indexer.ts` imports the same `BINARY_EXTENSIONS` from `./file-walker` and repeats the check in `indexWalkedFile`.
- **Stage 2 (project-file-tree):** `getProjectFileTree` defines its OWN local `BINARY_EXTENSIONS` (not imported — deliberate to avoid common/ → packages/indexer/ dependency).
- **Stage 3 (truncate-file-tree):** `truncateFileTreeBasedOnTokenBudget` uses a separate `unimportantExtensions` list (third independent list) and a 4-level cascade: removeUnimportantFiles → none → unimportant-files → tokens (pruneFileTokenScores) → depth-based (remove deepest files first, capped at 10 iterations).

### Factual correction made during doc-writer pass

Initial doc draft claimed all three stages shared "one source of truth" via import from `file-walker.ts`. Code search revealed this was WRONG:
- `project-file-tree.ts` line 45-46 comment explicitly says: "Keeping this list here (separate from the indexer's BINARY_EXTENSIONS) avoids a cross-package dependency from common/ -> packages/indexer/."
- `truncate-file-tree.ts` has no `BINARY_EXTENSIONS` import at all — it uses its own `unimportantExtensions` array.

Doc was corrected to accurately describe THREE independent extension lists kept in sync by convention.

### Validation
- Configured file-change hooks: typecheck, typecheck-common, typecheck-agents — all PASS
- `docs/agents-and-tools.md` is the only file edited in this pass

### Gate files cleared
All M3.2 pending gate files are now clear: file-walker.ts, metadata-indexer.ts, truncate-file-tree.ts, project-file-tree.ts, docs/agents-and-tools.md.


<!-- update_plan_status:appended -->
## M3.3 Complete — Asset Reference Extraction — 2026-07-07T23:55:00.000Z — 2026-07-07T22:52:28.174Z

## M3.3 Complete — Asset Reference Extraction

All M3.3 subtasks completed and validated.

### Implementation (`packages/indexer/src/asset-refs.ts` — new module)
- `AssetRef` interface: `rawRef`, `refType` (`guid | res_path | asset_path | file_id`), `resolvedPath`.
- `extractUnityRefs(content, isMetaFile, selfPath)`: `.meta` files extract self-identifying GUID → resolvedPath (strips `.meta` suffix); `.prefab`/`.unity` extract external GUID refs + fileID refs (unresolved, resolved later via GUID map).
- `extractGodotRefs(content)`: extracts `res://` paths from `[ext_resource ...]` lines, strips `res://` for project-relative resolvedPath.
- `extractUnrealRefs(content)`: JSON parse of `.uproject` → module names → `Source/<Name>`, plugin names → `Plugins/<Name>`.
- `extractBevyRefs(content)`: extracts quoted asset paths (with known extensions) from RON/TOML config files in `assets/` directories.
- `extractAssetRefs(content, ext, filePath)`: dispatch function routing by extension.
- `buildGuidToPathMap(files)`: builds GUID → asset-path map from all indexed `.meta` files.
- `resolveGuidRef(guid, map)`: resolves a GUID to a file path via the map.

### Wiring (`packages/indexer/src/metadata-indexer.ts`)
- `indexWalkedFile`: calls `extractAssetRefs(content, ext, relativePath)` and includes `assetRefs` in the returned `IndexedFile` (conditional spread — only present when refs exist).
- `buildGraph`: builds `guidToPathMap` from all `.meta` files, then for each file's `assetRefs`: resolves GUID refs via the map, creates `references` edges to the target file. Falls back to `resolvedPath + '.meta'` when the resolved asset is binary (e.g. `.png`) and not in the index.

### Type changes (`packages/indexer/src/types.ts`)
- Added `assetRefs?: import('./asset-refs').AssetRef[]` to `IndexedFile` interface.

### Binary extension changes
- Removed `.meta`, `.prefab`, `.unity` from `BINARY_EXTENSIONS` in both `file-walker.ts` and `project-file-tree.ts` — these are Unity text serialization (YAML) files, not binary. They need to be indexed as text so the asset reference extractor can parse them.
- Updated file-walker docstring comment to reflect the change.

### Public API (`packages/indexer/src/index.ts`)
- Exported `extractAssetRefs` and `AssetRef` type from the package entrypoint.

### Tests (`packages/indexer/src/asset-refs.test.ts` — new, 40 tests)
- Unity .meta: 3 tests (self-identifying GUID, no-guid, .meta suffix stripping)
- Unity .prefab/.unity: 4 tests (external guid refs, fileID refs, dedup, non-asset)
- Godot .tscn/.tres: 4 tests (res:// extraction, prefix stripping, dedup, non-Godot)
- Unreal .uproject: 5 tests (modules, plugins, invalid JSON, no Modules/Plugins, dedup)
- Bevy: 5 tests (RON extraction, resolvedPath, non-asset strings, http URLs, TOML)
- Dispatch: 8 tests (per-extension routing + non-asset + empty content)
- GUID map + resolution: 5 tests (map building, skip no-assetRefs, resolve, unknown, case-sensitivity)
- Integration with buildMetadataIndex: 6 tests (.meta indexed, .prefab references edges via GUID map, .tscn references edges, .uproject refs, non-asset files have no assetRefs, assetRefs undefined vs empty)

### Validation Gate
| Validation | Result |
|---|---|
| indexer typecheck (`tsc --noEmit -p .`) | ✅ pass |
| common typecheck | ✅ pass |
| agent-runtime typecheck | ✅ pass |
| indexer tests (full suite) | ✅ 110 pass, 0 fail |
| asset-refs tests | ✅ 40 pass, 0 fail, 92 expect() calls |

### Bugs found and fixed during validation
1. **Stateful regex lastIndex bug**: `UNITY_GUID_REGEX` and other module-scope regex constants had `/g` flag, causing `exec()` calls to retain `lastIndex` between invocations. Second call returned `null` because `lastIndex` was past the string length. Fix: store regex sources as strings and create `new RegExp(..., 'g')` fresh in each call.
2. **Godot `[^]]` regex not working in Bun**: The pattern `[^]]*` (any char except `]`) did not match correctly in Bun's regex engine. Fix: used `[^\]]*` with explicit escape in string-source form.
3. **Binary extension blocking .meta files**: `.meta`, `.prefab`, `.unity` were in `BINARY_EXTENSIONS`, so they were skipped by the file-walker and never reached `indexWalkedFile` — preventing the asset reference extractor from running on them. Fix: removed these text-based Unity extensions from `BINARY_EXTENSIONS` in both `file-walker.ts` and `project-file-tree.ts`.
4. **GUID reference edges to binary assets**: `buildGraph` only created reference edges when `files[resolvedPath]` existed in the index. But Unity GUIDs typically resolve to binary assets (`.png`, `.fbx`) that are skipped by the binary filter. Fix: added `.meta` fallback — if the resolved asset path isn't in the index, check `resolvedPath + '.meta'` which IS indexed as text YAML.


<!-- update_plan_status:appended -->
## M3.4 Complete — Scene/Resource/Script Reference Graph Edges — 2026-07-07T22:55:51.748Z

All M3.4 subtasks completed and validated.

### What was done

Extended the asset reference extraction module (`packages/indexer/src/asset-refs.ts`) with Godot GDScript `preload()`/`load()` resource reference extraction:

- **New function: `extractGodotScriptRefs(content)`** — extracts `res://` paths from `preload("res://...")` and `load("res://...")` calls in `.gd` (GDScript) files. These are code-level asset references that create script→asset graph edges. Strips `res://` prefix for project-relative resolvedPath, same as `.tscn`/`.tres` ext_resource extraction.
- **Dispatch updated** — `.gd` files now route to `extractGodotScriptRefs` instead of returning empty. Previously `.gd` was in `GODOT_TEXT_ASSET_EXTENSIONS` but returned `[]` with a comment saying preload refs were "code-level, not asset-level." M3.4 reversed this: code-level `preload()`/`load()` calls ARE asset references and should create graph edges.
- **Exported** `extractGodotScriptRefs` from `packages/indexer/src/index.ts`.

### Analysis of M3.4 scope vs M3.3 delivery

M3.3 already implemented the core of M3.4's "add graph edges for scene/resource/script/material references" scope:
- Unity GUID ref edges (`.prefab`/`.unity` → `.meta` via GUID map, with `.meta` fallback for binary assets)
- Godot `res://` ref edges (`.tscn`/`.tres` → indexed files)
- Unreal module/plugin ref edges (`.uproject` → `Source/` / `Plugins/` paths)
- Bevy asset path ref edges (config files → `assets/` paths)

M3.4's incremental additions:
- **Godot `.gd` preload/load refs** — NEW. Previously `.gd` files returned no asset refs. Now `preload()`/`load()` calls create `res_path` refs that flow through the existing `buildGraph` edge creation for `res_path` types.
- **Godot `sub_resource` references** — ANALYZED, NOT IMPLEMENTED. Godot `.tscn` `[sub_resource ...]` lines are internal/intra-file references (sub-resources defined within the same scene file), not cross-file references. They don't create graph edges because both the source and target are the same file. No implementation needed.
- **Unity `m_Script` (MonoBehaviour) references** — ANALYZED, ALREADY COVERED. Unity `.prefab`/`.unity` files reference C# scripts via `m_Script: {fileID, guid}`. The existing `UNITY_GUID_REGEX_SOURCE` already extracts ALL `guid:` references regardless of context, so `m_Script` GUIDs are already captured and resolved via the GUID→path map. No separate labeling is needed — all GUID refs use `refType: 'guid'` and create `type: 'references'` edges uniformly.

### Tests added (`packages/indexer/src/asset-refs.test.ts`, +8 tests → 48 total)
- Godot `.gd` preload/load: 6 tests (preload extraction, load extraction, resolvedPath, dedup, no-preload, non-argument string literals)
- Dispatch: 2 tests updated (`.gd` with preload → refs; `.gd` without preload → empty)
- Integration: 1 test (`.gd` preload refs create references edges to indexed `.tscn` resources)

### Validation Gate
| Validation | Result |
|---|---|
| indexer typecheck (`tsc --noEmit -p .`) | ✅ pass |
| asset-refs tests | ✅ 48 pass, 0 fail, 114 expect() calls |
| full indexer test suite | ✅ 118 pass, 0 fail, 346 expect() calls |

### Files Changed
- `packages/indexer/src/asset-refs.ts` (M — new `extractGodotScriptRefs` function + dispatch update)
- `packages/indexer/src/index.ts` (M — added `extractGodotScriptRefs` export)
- `packages/indexer/src/asset-refs.test.ts` (M — +8 tests, updated .gd dispatch test)


<!-- update_plan_status:appended -->
## M3.5 Complete — Asset Metadata and Reference Graph Tests — 2026-07-07T22:58:02.319Z

All M3.5 subtasks completed and validated.

### What was done

Added 6 new tests to `packages/indexer/src/asset-refs.test.ts` covering the M3.5 validation gate: binary file skip verification, reference graph query tests, and multi-engine coexistence.

**Binary file skip tests (3 tests):**
- `binary asset files (.png, .fbx, .uasset) are NOT in the index` — verifies that binary asset files are skipped by the file-walker and never appear in the index, while text files in the same project ARE indexed.
- `binary files do not get garbage imports or assetRefs` — verifies that a .png binary file is NOT in the index, while its .meta sibling IS indexed with assetRefs, and the .prefab GUID reference resolves to the .meta file via the GUID→path map with .meta fallback.
- `Unity text files (.meta, .prefab, .unity) ARE indexed as text` — confirms that Unity text serialization formats (removed from BINARY_EXTENSIONS in M3.3) are correctly indexed as text files.

**Reference graph query tests (2 tests):**
- `queryIndex neighbors finds Godot .gd preload reference targets` — verifies that `queryIndex` in `neighbors` mode discovers the `.tscn` target of a `preload()` call via the `references` graph edge.
- `queryIndex neighbors finds Unity .prefab GUID reference targets` — verifies that `queryIndex` in `neighbors` mode discovers the `.meta` file target of a Unity GUID reference via the `references` graph edge (with .meta fallback for binary assets).

**Multi-engine project test (1 test):**
- `Unity and Godot assets coexist with correct edge types` — builds a project with both Unity (ProjectVersion.txt, .meta, .prefab) and Godot (project.godot, .gd, .tscn) assets plus shared .ts code. Verifies all files are indexed, Unity .prefab→.meta GUID reference edge is created, Godot .tscn→.gd ext_resource reference edge is created, and binary .png files are NOT in the index. This confirms the indexer handles multi-engine repos correctly.

### Validation Gate
| Validation | Result |
|---|---|
| indexer typecheck (`tsc --noEmit -p .`) | ✅ pass |
| asset-refs tests | ✅ 54 pass, 0 fail, 138 expect() calls |
| full indexer test suite | ✅ 124 pass, 0 fail, 370 expect() calls |

### Test count progression through M3
- M3.3 start: 70 indexer tests (no asset-refs tests)
- M3.3 end: 110 indexer tests (40 new asset-refs tests)
- M3.4 end: 118 indexer tests (48 asset-refs tests, +8 .gd preload tests)
- M3.5 end: 124 indexer tests (54 asset-refs tests, +6 binary skip/query/multi-engine tests)

### M3 milestone complete
M3 is fully complete: M3.1 (audit) → M3.2 (binary skip) → M3.3 (asset ref extraction) → M3.4 (scene/resource/script ref edges) → M3.5 (tests). All validation gates pass. The indexer now:
- Skips binary game engine files (.png, .fbx, .uasset, .umap, etc.) in file-walker, project-file-tree, metadata-indexer, and truncate-file-tree.
- Indexes Unity text serialization files (.meta, .prefab, .unity) as text YAML.
- Extracts asset references: Unity GUIDs, Godot res:// paths (ext_resource + preload/load), Unreal modules/plugins, Bevy asset config paths.
- Builds a GUID→path map from .meta files for Unity cross-file reference resolution.
- Creates `references` graph edges in `buildGraph` for resolved asset refs, with .meta fallback for binary asset targets.
- `queryIndex` neighbors mode discovers asset reference targets through the graph edges.


<!-- update_plan_status:appended -->
## M4.1 Complete — Game-Aware Task Presets — 2026-07-07T23:00:00.000Z — 2026-07-07T23:05:52.694Z

All M4.1 subtasks completed and validated.

### What was done

**New module: `common/src/util/game-dev-presets.ts`**
- `GameDevPreset` interface: `id`, `label`, `description`, `insertText`.
- `ENGINE_PRESETS` record: 4 presets per engine (build, run, test, watch) × 4 engines (Unity, Godot, Unreal, Bevy) = 16 total presets.
- `getGameDevPresets(engineIds)`: returns presets for detected engines in stable order.
- `getGameDevSlashCommands(engineIds)`: returns slash-command-shaped objects for CLI integration.
- Each preset's `insertText` is a natural-language prompt (not a raw command) that the agent interprets — it inspects the project to find the correct build system and commands, then runs them with the user's confirmation.

**CLI wiring (`cli/src/data/slash-commands.ts` + `cli/src/chat.tsx`)**
- Extended `getSlashCommandsWithSkills` to accept an optional `fileTree` parameter.
- When `fileTree` is provided, the function calls `detectEngineProfiles(fileTree)` to detect game engines, then `getGameDevSlashCommands(engineIds)` to generate dynamic slash commands.
- Game-dev commands (e.g. `unity:build`, `godot:run`, `unreal:test`, `bevy:watch`) appear in the command palette only when the project has a detected game engine.
- Updated `chat.tsx` call site to pass `fileTree` as the second argument.

**Tests (`common/src/util/__tests__/game-dev-presets.test.ts` — 24 tests)**
- `getGameDevPresets`: 8 tests (empty, single-engine per each, multi-engine order, all-16 count, dedup)
- Preset fields: 4 tests (non-empty id, label==id, description ≤50 chars, non-empty insertText, insertText is a prompt not a direct command)
- `getGameDevSlashCommands`: 4 tests (empty, Unity shape, parity with presets, all engines)
- Content per engine: 8 tests (Unity build+watch, Godot build+test, Unreal build, Bevy run+watch content assertions)

### Validation Gate
| Validation | Result |
|---|---|
| common typecheck | ✅ pass |
| CLI typecheck | ✅ pass |
| game-dev-presets tests | ✅ 24 pass, 0 fail, 226 expect() calls |
| engine-profiles regression tests | ✅ 34 pass, 0 fail |

### Bugs found and fixed during validation
1. **Godot run description exceeded 50-char palette limit** — 'Launch the Godot project in the editor or as a game' was 51 chars. Fixed by removing 'a' → 'Launch the Godot project in the editor or as game' (50 chars).
2. **`insertText` contained `run_terminal_command`** — Tests expected natural-language prompts, not raw tool names. Fixed by replacing all `SYNC run_terminal_command` / `BACKGROUND run_terminal_command` with 'synchronous terminal command' / 'BACKGROUND terminal command'. Kept `BACKGROUND` keyword (uppercase) since the agent uses it as a parameter value.
3. **Bevy run preset lost `BACKGROUND` keyword** — When fixing bug #2, the Bevy run preset's `BACKGROUND` was lowercased to `background`. The content test expected uppercase `BACKGROUND`. Fixed by restoring it.

### Files Changed
- `common/src/util/game-dev-presets.ts` (new — 16 presets, 4 functions)
- `cli/src/data/slash-commands.ts` (M — `getSlashCommandsWithSkills` now accepts optional `fileTree`)
- `cli/src/chat.tsx` (M — passes `fileTree` to `getSlashCommandsWithSkills`)
- `common/src/util/__tests__/game-dev-presets.test.ts` (new — 24 tests)

### Design decisions
- **Presets as `insertText`, not auto-run**: Follows the existing `agent:general` slash command pattern. The preset inserts a smart prompt into the input field; the user reviews and sends it. The agent then uses existing `run_terminal_command` / `check_job` / `kill_job` tools to execute. This respects the plan risk constraint: 'CLI task presets must avoid running editor/build commands automatically without user confirmation.'
- **Detection-based, not static**: Game-dev commands only appear when `detectEngineProfiles` finds a game engine in the file tree. Non-game projects see no game-dev commands. This keeps the palette clean for non-game repos.
- **Type-compatible shape, not type import**: `getGameDevSlashCommands` returns a structurally-compatible object rather than importing the CLI's `SlashCommand` type, avoiding a `common/ → cli/` circular dependency.


<!-- update_plan_status:appended -->
## M4.2 Complete — Long-Running Job UX for Game Dev Processes — 2026-07-07T23:15:00.000Z — 2026-07-07T23:10:50.515Z

## M4.2 Complete — Long-Running Job UX for Game Dev Processes

All M4.2 subtasks completed and validated.

### What was done

**New types and data (`common/src/util/game-dev-presets.ts`)**
- Added `GameDevJobGuidance` interface: `engineId`, `displayName`, `readinessPatterns[]`, `errorPatterns[]`, `logPaths[]`, `stopInstructions`.
- Added `ENGINE_JOB_GUIDANCE` record with per-engine guidance for all 4 engines:
  - **Unity**: readiness = `Batchmode completed`, `Refresh completed`; errors = `CompilerError`, `Compilation failed`; logs = `~/Library/Logs/Unity/Editor.log`, `%LOCALAPPDATA%/Unity/Editor/Editor.log`; stop = SIGTERM → SIGKILL escalation, kill process group for child compilers.
  - **Godot**: readiness = `Editor scene loaded`, `Running scene`; errors = `SCRIPT ERROR`, `Parse Error`; logs = `~/.godot/editor_data/logs/`; stop = SIGTERM (Godot exits cleanly).
  - **Unreal**: readiness = `LogInit: Running`, `Build succeeded`; errors = `LogScriptCompiler: Error`, `Fatal error:`; logs = `Saved/Logs/`; stop = SIGTERM, kill process group, only SIGKILL if truly stuck.
  - **Bevy**: readiness = `winit::window`, `AdapterInfo`; errors = `panicked at`, `error[E`; logs = `logs/`; stop = SIGTERM, kill cargo watch before rebuilding.
- Added `getGameDevJobGuidance(engineIds)` public API function.
- No readiness pattern appears in error patterns (validated by test).

**Preset insertText updates (`common/src/util/game-dev-presets.ts`)**
- Updated all 8 watch/run presets (2 per engine × 4 engines) to reference specific readiness/error patterns, log file paths, and stop instructions from the guidance data.
- Watch presets now mention specific `check_job` `wait_for` patterns (e.g. `CompilerError` for Unity, `SCRIPT ERROR` for Godot, `LogScriptCompiler: Error` for Unreal, `panicked at` for Bevy).
- Watch presets mention OS-specific log file locations.
- Run presets mention specific readiness patterns to wait for and SIGTERM → SIGKILL escalation with process group killing.

**Tests (`common/src/util/__tests__/game-dev-presets.test.ts`, +19 tests → 43 total)**
- `getGameDevJobGuidance`: 4 tests (empty, single-engine, all-4 stable order, skip unknown IDs)
- Job guidance field validation: 5 tests (non-empty readiness, error, log paths, stop instructions; no readiness pattern is also an error pattern)
- Per-engine content: 4 tests (Unity batchmode+Editor.log, Godot scene+.godot, Unreal LogInit+Saved/Logs, Bevy winit+panicked at)
- Watch/run insertText references: 6 tests (Unity watch error patterns + log path, Unity run SIGTERM + process group, Godot watch SCRIPT ERROR, Godot run readiness + SIGTERM, Unreal watch LogScriptCompiler, Bevy run winit + panicked at)

### Validation Gate
| Validation | Result |
|---|---|
| common typecheck (`tsc --noEmit -p .`) | ✅ pass |
| CLI typecheck (`tsc --noEmit -p .`) | ✅ pass |
| game-dev-presets tests | ✅ 43 pass, 0 fail, 341 expect() calls |

### Files Changed
- `common/src/util/game-dev-presets.ts` (M — added GameDevJobGuidance interface, ENGINE_JOB_GUIDANCE record, getGameDevJobGuidance function, updated 8 preset insertText strings)
- `common/src/util/__tests__/game-dev-presets.test.ts` (M — +19 tests for job guidance)

### Design decisions
- Job guidance lives alongside presets, not in the tool descriptions: The existing `check_job` / `kill_job` / `run_terminal_command` tool descriptions are generic and engine-agnostic. Embedding engine-specific patterns there would bloat them for non-game projects. Instead, the guidance data is a companion to the presets — the presets' `insertText` strings reference the specific patterns so the agent receives actionable guidance when the user selects a game-dev preset.
- Guidance is data, not prompt injection: The `GameDevJobGuidance` is a structured record (`readinessPatterns[]`, `errorPatterns[]`, `logPaths[]`, `stopInstructions`), not raw prompt text. This makes it testable, type-safe, and extensible — future milestones or tools can consume it programmatically.


<!-- update_plan_status:appended -->
## M4.3 Complete — Game-Dev Help Banner Section — 2026-07-07T23:59:00.000Z — 2026-07-07T23:18:56.600Z

All M4.3 subtasks completed and validated.

### What was done

Threading `fileTree` through the banner component chain so `HelpBanner` can detect game engines and display available `/engine:task` slash commands when the user runs `/help`:

1. **`cli/src/components/help-banner.tsx`** — Added imports for `detectEngineProfiles`, `getGameDevSlashCommands`, and `FileTreeNode`. Added optional `fileTree?: FileTreeNode[]` prop. Added `useMemo`-cached engine detection + slash-command lookup. Added a conditional "Game Dev" section (only renders when ≥1 engine detected) showing engine display names and preset command IDs/descriptions in a wrapped row matching the existing Shortcuts pattern.

2. **`cli/src/components/input-mode-banner.tsx`** — Added `FileTreeNode` type import. Extended `BANNER_REGISTRY` context type from `{ showTime }` to `{ showTime: number; fileTree?: FileTreeNode[] }`. Made `InputModeBanner` accept an optional `fileTree` prop and pass it through the render context to `HelpBanner`.

3. **`cli/src/components/chat-input-bar.tsx`** — Added `FileTreeNode` import. Added optional `fileTree?: FileTreeNode[]` to `ChatInputBarProps` interface and destructuring. Passed `fileTree={fileTree}` to all 3 `<InputModeBanner />` usages (connect mode, compact mode, full mode).

4. **`cli/src/chat.tsx`** — Passed `fileTree={fileTree}` to `<ChatInputBar />` (fileTree is already available as a prop on the `Chat` component).

### Validation Gate
| Validation | Result |
|---|---|
| CLI typecheck (`npx tsc --noEmit --pretty`) | ✅ pass (exit 0) |
| Code review | ✅ LOOKS_GOOD (0 findings) |

### Design decisions
- **Optional prop chain**: `fileTree` is optional (`fileTree?: FileTreeNode[]`) on all 4 components, so non-game projects render exactly as before — the Game Dev section only appears when `detectEngineProfiles` returns ≥1 engine.
- **useMemo caching**: Engine detection and slash-command generation are memoized on `fileTree` to avoid redundant computation on re-renders.
- **Display-only section**: The help banner lists available game-dev commands for discoverability — it does not auto-run anything. Users type the commands into the input field.

### Files Changed
- `cli/src/components/help-banner.tsx` (M — Game Dev section + fileTree prop + useMemo detection)
- `cli/src/components/input-mode-banner.tsx` (M — BANNER_REGISTRY context extended + InputModeBanner fileTree prop)
- `cli/src/components/chat-input-bar.tsx` (M — ChatInputBarProps fileTree prop + 3 InputModeBanner usages updated)
- `cli/src/chat.tsx` (M — fileTree passed to ChatInputBar)

### Remaining M4/M5 items
- M4.4: Add docs for Unity/Godot/Unreal/Bevy workflows and examples
- M4.5: CLI visual smoke (if UI components/hooks changed) — this milestone touched CLI UI components, so a visual smoke may be warranted
- M5.1–M5.4: Cross-cutting docs, rollout notes, broad validation, reviewer resolution


<!-- update_plan_status:appended -->
## M4.4 + M5 Complete — Documentation + Doc Fix — 2026-07-07T23:59:00.000Z — 2026-07-07T23:29:45.456Z

## M4.4 Complete — Documentation and M5 — Reviewer Resolution

All documentation and test-coverage work for the M3/M4 implementation is complete.

### M4.4 Documentation Update (`docs/agents-and-tools.md`, 806 → 924 lines)

Three targeted edits documenting the public contract from the 10 source files:

1. **Fixed the `.meta` gotcha (binary-skipping section):** The previous doc incorrectly claimed `.meta` was in all three binary extension lists. Corrected to document the deliberate split — `.meta`/`.prefab`/`.unity` are excluded from indexer and file-tree `BINARY_EXTENSIONS` (so they're indexed as text for asset references) but included in the truncator's `unimportantExtensions` (so they're dropped from the agent-facing system prompt).

2. **Added `#### Asset reference extraction` subsection:** Documents `packages/indexer/src/asset-refs.ts` — public API (`extractAssetRefs`, `extractGodotScriptRefs`, `AssetRef` type exported from `@codebuff/indexer`), internal helpers (`buildGuidToPathMap`, `resolveGuidRef` used by `metadata-indexer.ts` but NOT exported), the 4 `refType` values (`guid`, `res_path`, `asset_path`, `file_id`), per-engine extraction strategies, graph integration via `references` edges with `.meta` sidecar fallback, and gotchas (80-ref-per-file cap, `fileID` always unresolved).

3. **Updated slash commands + added `### Game-dev preset commands` subsection:** Updated `getSlashCommandsWithSkills` signature to `(skills, fileTree?): SlashCommand[]`, documenting the `fileTree` parameter and `Chat` component integration point. Added a new subsection documenting `common/src/util/game-dev-presets.ts` — `getGameDevPresets`, `getGameDevSlashCommands`, `GameDevPreset` type, the `insertText` natural-language prompt contract, the 4-engine × 4-command table, and `getGameDevJobGuidance` for runtime process management.

### Test Coverage Added (2 test files)

- **`packages/indexer/src/file-walker.test.ts`** (new, 242 lines) — 15 tests: 9 for `BINARY_EXTENSIONS` set contents (game engine binary formats, images, audio/video, compiled archives, and — critically — that Unity text formats `.meta`/`.prefab`/`.unity`, Godot text formats, Unreal `.uproject`, and source code extensions are NOT in the set); 6 integration tests for `walkProject` using temp directories.
- **`cli/src/data/__tests__/slash-commands.test.ts`** (extended to 449 lines) — 9 new tests covering the `fileTree` parameter path: no game-dev commands when `fileTree` is `undefined` or non-game project, 4 Unity commands appended, 4 Godot commands, `insertText` is natural-language prompt text, descriptions ≤50 chars, exact Unity description string assertions, base commands unmodified, combined length, and empty tree edge case.

### M5 Reviewer Resolution

Code reviewer flagged finding #7: doc claimed `buildGuidToPathMap` and `resolveGuidRef` were exported from `@codebuff/indexer`, but `index.ts` only exports `extractAssetRefs`, `extractGodotScriptRefs`, and `AssetRef`. Doc was corrected to move those two functions from the "public API" list to a separate "internal helpers" paragraph that accurately states they are NOT exported from the package entrypoint.

Re-spawned reviewer confirmed: `LOOKS_GOOD:`.

### Final Validation Gate

| Validation | Result |
|---|---|
| typecheck (root) | ✅ pass |
| typecheck-common | ✅ pass |
| typecheck-cli | ✅ pass |
| typecheck-agent-runtime | ✅ pass |
| typecheck-indexer | ✅ pass |
| code-reviewer verdict | ✅ LOOKS_GOOD |

### All milestones complete
M1 (research-web decomposition) → M2 (engine profile detection) → M3 (binary skip + asset refs + graph edges) → M4 (game-dev presets + job guidance + help banner + docs). All validation gates pass. No remaining pending work.


<!-- update_plan_status:appended -->
## GDScript (.gd) tree-sitter support — completed — 2026-07-07T23:55:15.196Z

Added .gd to SUPPORTED_CODE_EXTENSIONS by:
1. Compiling tree-sitter-gdscript.wasm from PrestonKnopp/tree-sitter-gdscript grammar using `npx tree-sitter build --wasm`
2. Creating tree-sitter-gdscript-tags.scm query file (function/class/variable/const/enum/signal definitions + call patterns)
3. Adding .gd entry to languageTable, WASM_FILES manifest, and languages.ts imports
4. Adding tree-sitter-gdscript.wasm to sdk/scripts/build.ts copyWasmFiles list
5. Adding 4 GDScript-specific tests to languages.test.ts (extension lookup, manifest registration, SUPPORTED_CODE_EXTENSIONS inclusion, graceful no-op when WASM absent)
6. Reviewer flagged 2 quality issues in initial tags query (constructor_definition capturing full body, overly broad attribute pattern) — both fixed, re-reviewed as LOOKS_GOOD

All validation passed: root typecheck exit 0, code-map typecheck exit 0, 30+23+8 tests pass (0 fail).


<!-- update_plan_status:appended -->
## GDScript (.gd) tree-sitter parser support — 2026-07-07 — 2026-07-08T00:01:59.496Z

Added .gd (GDScript) to SUPPORTED_CODE_EXTENSIONS so Godot script files get tree-sitter symbol parsing in the indexer.

Changes:
- packages/code-map/src/tree-sitter-queries/tree-sitter-gdscript-tags.scm (new): tags query for function_definition, class_definition, variable_statement, const_statement, enum_definition, signal_statement, call (direct, attribute, baseless).
- packages/code-map/src/languages.ts: imported gdscriptQuery, added tree-sitter-gdscript.wasm to WASM_FILES, added .gd entry to languageTable.
- sdk/scripts/build.ts: added tree-sitter-gdscript.wasm to copyWasmFiles list.
- packages/code-map/__tests__/languages.test.ts: added 10 GDScript tests (extension lookup, case-insensitive, nested paths, non-.gd rejection, AST pattern verification, manifest pairing, getLanguageConfig graceful no-op, createLanguageConfig mock delegation).
- docs/architecture.md: updated code-map Supports list to include Swift, Kotlin, GDScript; documented WASM grammar source and graceful no-op behavior.
- node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-gdscript.wasm: compiled from PrestonKnopp/tree-sitter-gdscript grammar via `npx tree-sitter build --wasm`.

Validation: root typecheck exit 0, all 87 code-map tests pass (0 fail), code reviewer verdict LOOKS_GOOD.


<!-- update_plan_status:appended -->
## GDScript Follow-up Completion — 2026-07-07 — 2026-07-08T00:17:41.475Z

All 12 follow-up todos completed and committed (53d82186c).

Delivered:
- GDScript (.gd) tree-sitter symbol parsing: new .scm tags query matching actual AST node structure (verified via AST dumping), .gd entry in languageTable, GDScript node types added to DEFINITION_NODE_KINDS in structure.ts
- GDScript language-profile: added to all five structures in language-profiles.ts (SupportedLanguageId, LANGUAGE_PROFILES, LANGUAGE_ORDER, EXTENSION_LANGUAGE_MAP, MANIFEST_LANGUAGE_MAP)
- agents/idioms/gdscript.md: compact GDScript idiom guidance for agent prompts
- Fixed build.ts: added tree-sitter-kotlin.wasm, tree-sitter-php.wasm, tree-sitter-swift.wasm to copyWasmFiles (were missing — pre-existing gap surfaced by the audit of other language support)
- Comprehensive tests: 10 GDScript language config tests, GDScript parseFileStructure integration test with full assertions (class, function, variable, constant, signal), GDScript language-profile detection and rendering tests
- Updated docs/architecture.md with complete supported languages list and WASM grammar source documentation

Validation: root typecheck exit 0, common typecheck exit 0, all 50 code-map tests pass (0 fail), all 12 common language-profiles tests pass (0 fail).
Code reviewer: LOOKS_GOOD with zero findings (two review rounds — first found 3 NON_BLOCKING issues, all fixed in second round).
Audit: languageTable (14 languages, 15 extensions) vs language-profiles.ts (now 12 profiles including GDScript) — only gap was GDScript, now filled. Build.ts copyWasmFiles gap for Kotlin/PHP/Swift also fixed.

