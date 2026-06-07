# Agents and Tools in Openbuff

Openbuff operates as an orchestrator of specialized, local-first agents. Instead of running model orchestration on a hosted backend, all agent loops, prompt generation, tool calls, and model routing are processed locally on your machine via the `agent-runtime` and `sdk` packages, utilizing your Bring Your Own Key (BYOK) providers.

## Agents

Agents in Openbuff can be either prompt-based or programmatic (utilizing `handleSteps` generator functions).
- Shipped agents reside in the `agents/` monorepo package.
- Project-local or custom agents live in the `.agents/` folder of your project.
- Programmatic agent generator functions execute in a secure sandbox; agent templates define tool permissions and which subagents can be spawned.

### Model Routing and Configuration

Because Openbuff does not rely on a hosted model registry or credit-balance router, all agent routing is configured directly in your local configuration (`openbuff.json` or its legacy alias `codebuff.json`). Under [Local BYOK Mode](./local-mode.md), you map individual agents (e.g., `thinker`, `code-reviewer`, or custom agents) to specific providers and models.

### Shell Shims

You can run individual specialized agents as direct terminal commands without the `openbuff` prefix. This is handled by shell shims:

```bash
openbuff shims install openbuff/base-lite@1.0.0
eval "$(openbuff shims env)"
base-lite "fix this bug"
```

For backward compatibility, the `codebuff` command prefix and legacy shims continue to function identically.

## Tools

Tools represent the capabilities given to agents to interact with your system.
- Tool schemas and validators live in `common/src/tools` as Zod definitions.
- Tool executions are handled securely by the SDK on your local machine (reading/writing files, executing commands, searching codebase).
- Since Openbuff has no hosted proxy backend, tool execution is extremely low-latency, and all outputs are processed directly by your locally configured models.

### `query_index`

`query_index` queries the local codebase graph index. It is intended for retrieval-led context gathering before reading or editing files.

The index tracks file paths, extensions, symbols, imports, markdown headings, documentation concepts, and graph relationships between files/symbols/imports/calls/headings/concepts. Results are discovery hints: always verify returned files with `read_files` or `read_subtree` before editing.

Supported modes:

- `search` — default ranked file search for a natural-language or keyword `query`.
- `explain` — ranked search plus an `explanation` for why each file matched.
- `neighbors` — graph-adjacent files for a `from` path, or neighbors around files matching `query`.
- `path` — shortest graph path between `from` and `to`, or a graph path inferred from `query` matches.

Examples:

```json
{ "query": "authentication flow", "limit": 10 }
{ "query": "editor proposal logic", "mode": "explain", "fileTypes": ["ts"] }
{ "mode": "neighbors", "from": "packages/indexer/src/query.ts", "limit": 8 }
{ "mode": "path", "from": "packages/indexer/src/metadata-indexer.ts", "to": "packages/indexer/src/query.ts" }
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

