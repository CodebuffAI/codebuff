# SPEC: Game Development CLI + Research-Web Upgrade

## Overview
Plan improvements that make Openbuff substantially better for game-development workflows while rippling the same primitives across the CLI, agent runtime, SDK, indexer, and docs. Also fix the observed researcher-web failure mode where broad multi-part research prompts are sent as one literal query and return no results.

## Goals
- Make Openbuff understand game projects as first-class workspaces: Unity, Godot 4, Unreal Engine 5, Bevy/Rust, and generic asset-heavy engines.
- Improve navigation and reasoning over game-specific assets, scenes, prefabs, resources, scripts, logs, exports, and long-running editor/build tasks.
- Add game-dev workflow affordances without hardcoding a narrow game-only path; generalize them as framework profiles, asset graph indexing, task presets, and research planning usable by all projects.
- Upgrade researcher-web from single-query lookup to decomposed, iterative research with source tracking and final synthesis.
- Document and validate the resulting workflows with targeted tests, docs, and CLI smoke coverage.

## Non-Goals
- Do not implement an actual game engine integration plugin inside Unity/Godot/Unreal editors in this phase.
- Do not add new paid external APIs or global dependencies without a separate dependency decision.
- Do not perform production deployments, package publishing, or git commits as part of implementation unless explicitly requested later.
- Do not attempt exhaustive binary parsing of proprietary asset formats; start with metadata/path/reference extraction and safe fallbacks.

## Requirements
- Engine/project detection:
  - Detect Unity via `ProjectSettings/ProjectVersion.txt`, `Assets/`, `.unity`, `.prefab`, `.meta`, `.asmdef`, `.csproj`.
  - Detect Godot via `project.godot`, `.tscn`, `.tres`, `.gd`, `addons/`.
  - Detect Unreal via `.uproject`, `Content/`, `Config/`, `.uasset`, `.umap`, C++ module files when present.
  - Detect Bevy via `Cargo.toml` dependencies and typical `assets/` layout.
  - Generalize as framework/engine profile metadata rather than a game-only special case.
- Indexing and file tree:
  - Preserve safe text indexing behavior, but add asset-aware summaries for large/binary files.
  - Avoid reading binary assets as UTF-8 for deep parsing.
  - Track path, extension/type, size, hash/mtime where available, and extract lightweight references from text-like asset manifests.
- Graph/navigation:
  - Add scene/resource reference edges where extractable: Unity GUID references via `.meta` files, Godot `ExtResource`/`SubResource`, Bevy asset paths, and Unreal metadata/path references where safe.
  - Support queries like “which scenes use this script?”, “which prefab references this texture?”, and “what assets changed around this gameplay script?”
- CLI/workflow UX:
  - Add command/task discovery recommendations for editor/build/test/export/watch flows.
  - Improve background job naming, wait patterns, log tailing, and stop guidance for long-running game workflows.
  - Add docs or prompts for using Openbuff with Unity/Godot/Unreal/Bevy projects.
- Research-web:
  - Detect broad/multi-question research requests.
  - Plan subquestions, generate short targeted queries, iterate through search/fetch/synthesis, and preserve evidence/citations.
  - Retry/fallback when a query returns no results instead of failing the whole request.
  - Keep simple one-off searches fast and direct.
- Testing and validation:
  - Add unit tests for project/engine profile detection and asset-reference extraction.
  - Add researcher-web tests that prove broad prompts decompose into multiple targeted web searches.
  - Run targeted package typechecks/tests for changed packages.
  - Use CLI visual smoke only if UI components/hooks are modified.

## Acceptance Criteria
- A sample Unity/Godot/Unreal/Bevy repo structure produces an engine/profile signal visible to file-tree/index/prompt consumers.
- Asset-heavy repos no longer rely solely on source-symbol indexing; binary and scene/resource files contribute safe metadata.
- Query/index tooling can answer at least one reference-style question per supported engine from fixture data.
- A pasted broad game-engine research prompt is decomposed into multiple focused queries and produces a synthesized answer instead of a literal “No search results found for <entire prompt>”.
- Documentation explains how game developers should use Openbuff and how the broader generalized improvements help non-game projects.
- Targeted tests/typechecks pass, or any skipped validation is explicitly justified.

## Relevant Systems and Files
- Research agent/tooling:
  - `agents/researcher/researcher-web.ts`
  - `packages/agent-runtime/src/tools/handlers/tool/web-search.ts`
  - `packages/agent-runtime/src/tools/handlers/tool/web-search-utils.ts`
  - `common/src/tools/params/tool/web-search.ts`
  - `packages/agent-runtime/src/util/simplify-tool-results.ts`
- Project/file/indexing:
  - `common/src/util/language-profiles.ts`
  - `common/src/project-file-tree.ts`
  - `packages/indexer/src/**`
- CLI and task workflows:
  - `cli/src/**`
  - `cli/src/data/slash-commands.ts`
  - `sdk/src/tools/run-terminal-command.ts`
  - `sdk/src/tools/background-jobs.ts`
  - `sdk/src/tools/check-job.ts`
  - `sdk/src/skills/load-skills.ts`
  - `scripts/tmux/**`
- Config/docs:
  - `openbuff.d/hooks.json`
  - `docs/agents-and-tools.md`
  - `docs/configuration.md`
  - `docs/development.md`
  - `cli/knowledge.md`

## Assumptions
- The first implementation pass should focus on static detection, metadata, and prompt/tool behavior rather than deep editor plugin protocols.
- Existing CLI primitives for background jobs and browser/tmux automation should be reused, not replaced.
- Research-web can initially use current search providers with better planning/retry logic before adding new providers.