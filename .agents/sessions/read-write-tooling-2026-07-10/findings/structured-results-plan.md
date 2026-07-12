# Structured filesystem result contracts: inventory and migration plan

Date: 2026-07-10

## Decision

This is primarily a harness/contract issue, with a secondary model-recovery issue.

The model can still choose stale replacements or retry an atomic batch poorly, but the harness currently makes recovery harder than it should be: read failures are embedded in content strings, write success/failure is inferred from prose fields, several consumers recursively guess status from arbitrary JSON, and declared output schemas are not validated before native results are streamed. The repeated `str_replace` pattern in the motivating trace is therefore best understood as a model retry weakness amplified by ambiguous harness feedback.

The recommended fix is to introduce versioned, discriminated filesystem result payloads while retaining adapters for every current envelope. Do not change the outer `ToolResultOutput[]` transport in this migration; keep the existing single JSON part (`[{ type: 'json', value: ... }]`) and version the JSON value inside it.

## Scope and non-goals

In scope:

- `read_files`, including whole-file, range, and symbol selectors.
- `read_subtree`.
- Closely related filesystem reads: `read_outline`, `read_slices`, `find_files`, `list_directory`, and `glob`.
- File-edit result status shared by `str_replace`, `write_file`, `replace_range`, `rewrite_symbol`, `apply_patch`, and `edit_transaction`.
- SDK override compatibility, runtime authorization, context pruning/simplification, print-mode events, and CLI rendering.
- Generated agent tool types.

Non-goals for the first implementation slice:

- Replacing the general `ToolResultOutput[]` media/JSON transport.
- Changing MCP/custom-tool result contracts.
- Removing legacy result decoding in the same release that structured results are introduced.
- Combining this work with the separate realpath-containment or unified edit-coordinator projects.

## Current result-flow inventory

### Shared transport and type layer

- `common/src/types/messages/content-part.ts:48-59` defines only the outer JSON/media result parts. A JSON result can contain any `JSONValue`; it has no filesystem status semantics.
- `common/src/tools/params/utils.ts:123-133` wraps a value in the stable one-part JSON transport.
- `common/src/util/messages.ts:788-805` likewise preserves a bare array or object as the JSON `value`; there is no additional envelope.
- `common/src/tools/list.ts:117-132` infers `CodebuffToolOutput<T>` from each tool's Zod `outputSchema`.
- `packages/agent-runtime/src/tools/tool-executor.ts:587-630` accepts a native handler's output, streams it, and appends it to history without parsing it through `toolParams[toolName].outputSchema`.
- `common/src/tools/compile-tool-definitions.ts:10-66` generates input parameter types only. Programmatic agent templates receive no generated `ToolResultMap`/`GetToolResult<T>` contract.

### SDK `read_files`

`sdk/src/tools/read-files.ts:33-38,208-399` currently returns `Record<string, string | null>`:

- A successful whole-file read is the raw content string.
- A blocked, missing, outside-root, over-10-MB, or I/O failure is a marker-prefixed string from `FILE_READ_STATUS` (`common/src/constants/paths.ts:43-64`).
- An example/template file is a success string prefixed with `[TEMPLATE]`.
- A range read is a rendered string with an embedded `[RANGE_BLOCK ...]` header, hash, capability, and numbered body (`sdk/src/tools/read-files.ts:349-396`).
- Multiple ranges for one path are concatenated into one string; a range result replaces a whole-file result for the same path.
- `null` remains possible for SDK overrides and empty/missing map entries, but the native reader usually uses marker strings for failures.

The public and runtime-facing contracts preserve this map:

- `common/src/types/contracts/client.ts:26-35` (`FileLineRange`, `RequestFilesFn`).
- `sdk/src/run.ts:85-95` (`OpenbuffClientOptions.overrideTools.read_files`).
- `sdk/src/run.ts:494-524,689-715` (runtime dependency wiring and legacy override lookup).
- `sdk/src/index.ts:9-11` publicly exports `getFiles`.

This means failures have at least three representations before the runtime builds its tool result: a marker string, `null`, or a missing key.

### Runtime `read_files`

- `packages/agent-runtime/src/get-file-reading-updates.ts:20-39` drops `null`, `undefined`, and missing map entries, preserving marker strings as if they were ordinary content.
- `packages/agent-runtime/src/util/render-read-files-result.ts:17-48` constructs the current legacy value:

  ```ts
  [
    { summary: { ok, failed, requested } },
    { path, content, referencedBy? },
  ]
  ```

  It detects failures by a regular expression over `content`.
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts:41-77` combines whole, range, and symbol paths for path validation.
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts:93-125` uses `toOptionalFile()` marker parsing to clear edit gates and grant whole-file authorization.
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts:143-151` computes `requestedReadCount` from whole and range paths only. Symbol requests are excluded.
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts:159-201` appends `{ path, slices, errorMessage? }` entries after the legacy file array.

Two concrete inconsistencies follow:

1. `common/src/tools/params/tool/read-files.ts:11-43` does not declare `errorMessage` on the slice entry even though the runtime emits it.
2. `common/src/tools/params/tool/read-files.ts:47-113` requires `paths`, while the handler and tests support range-only and symbol-only calls. A true symbol-only model call without `paths: []` can be rejected before reaching the handler.

The motivating ambiguity is reproducible from the code: a symbol-only miss can append `{ path, slices: [], errorMessage }` after a summary computed as `{ ok: 0, failed: 0, requested: 0 }`.

### Runtime authorization and pruning

- `common/src/types/session-state.ts:101,197` stores sticky whole-file authorization as `Record<string, true>` rather than tying it to a content generation/hash.
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts:99-123` grants it from successful whole-file paths after marker-string classification.
- Range and symbol reads intentionally use scoped capabilities rather than whole-file authorization (`packages/agent-runtime/src/tools/handlers/tool/read-files.ts:190-198`).
- `packages/agent-runtime/src/util/simplify-tool-results.ts:24-41` turns every non-summary `read_files` entry into `{ path, contentOmittedForLength: true }`. That includes symbol results and symbol errors, so the simplifier can erase both selector kind and failure detail.
- `packages/agent-runtime/src/util/simplify-tool-results.ts:127-165` uses separate ad hoc omission variants for `read_subtree`.
- `agents/context-pruner.ts:763-879` recursively searches strings and fields for failure evidence.
- `agents/context-pruner.ts:935-995` separately reconstructs successful `read_files` paths from summary/content/slice heuristics, with a legacy fallback that treats an unrecognized non-failure result as success.
- `agents/context-pruner.ts:1547-1684` correctly correlates calls/results by `toolCallId`, but it still has to interpret the unstructured payloads described above.

### Runtime `read_subtree`

There is no SDK-native `read_subtree` implementation. It is a runtime-native operation over the cached/live project tree:

- `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:26-105` builds directory/file entries.
- `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:278-303` builds `{ path, errorMessage }` failures.
- `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:307-352` returns an array of directory, file, or error entries with no top-level summary/status.
- `common/src/tools/params/tool/read-subtree.ts:56-99` also declares pruned `printedTreeOmittedForLength` and `variablesOmittedForLength` variants that the handler itself never emits.

The current legacy value is therefore:

```ts
Array<
  | { path, type: 'directory', printedTree, tokenCount, truncationLevel }
  | { path, type: 'file', variables }
  | { path, errorMessage }
  | pruned omission variants
>
```

It cannot distinguish an empty successful result from a malformed/empty result, and request-to-result identity is only the normalized path string.

### Related read/filesystem contracts

- `read_outline` puts a failure string in the successful `outline` field (`packages/agent-runtime/src/tools/handlers/tool/read-outline.ts:46-62`; schema at `common/src/tools/params/tool/read-outline.ts:36-46`).
- `read_slices` uses `slices: []` for both a missing file and no matching symbols (`packages/agent-runtime/src/tools/handlers/tool/read-slices.ts:19-35`; schema at `common/src/tools/params/tool/read-slices.ts:46-68`).
- `find_files` reuses `fileContentsSchema.array()` or `{ message }` (`common/src/tools/params/tool/find-files.ts:47-59`) and shares `RequestFilesFn`/`renderReadFilesResult` (`packages/agent-runtime/src/tools/handlers/tool/find-files.ts:92-128`).
- `list_directory` and `glob` use success/error unions distinguished only by property presence (`common/src/tools/params/tool/list-directory.ts:41-58`; `common/src/tools/params/tool/glob.ts:55-74`).

### Write/edit contracts relevant to the observed retry loop

- `str_replace`, `write_file`, `replace_range`, `rewrite_symbol`, and several plan tools share `{ file, message } | { file, errorMessage, patch? }` (`common/src/tools/params/tool/str-replace.ts:13-23`).
- `apply_patch` uses `{ message, applied[] } | { errorMessage }` (`common/src/tools/params/tool/apply-patch.ts:8-21`).
- `edit_transaction` has another union with success files or failures (`common/src/tools/params/tool/edit-transaction.ts:139-162`).
- `cli/src/components/tools/str-replace.tsx:117-200` infers applied/failed from `message`, `errorMessage`, and formatted text.
- `cli/src/components/tools/apply-patch.tsx:121-210` recursively searches arbitrary nested output for failure and requires hand-coded positive success evidence.
- `agents/context-pruner.ts:769-875,997-1036` performs another independent prose/field heuristic for edit failure and success.

The runtime now emits better atomic diagnostics and maintains retry pressure, but the result contract still does not expose stable fields such as `atomic`, `changed`, `failedOperationIndex`, `retryable`, or `requiresFreshRead`. Those are exactly the facts a model, CLI, and pruner need to stop an unproductive retry pattern deterministically.

### CLI ingestion and rendering

- `common/src/types/print-mode.ts:51-59` transports the generic `ToolResultOutput[]` on `tool_result` events.
- `cli/src/utils/sdk-event-handlers.ts:560-590` passes the raw event output to block storage.
- `cli/src/utils/message-block-helpers.ts:1065-1090` stores both a JSON string and `outputRaw: unknown` without normalization.
- `cli/src/components/tools/read-files.tsx:97-181` recursively counts guessed successes/failures across summaries, content markers, errors, and slice arrays.
- `cli/src/components/tools/read-subtree.tsx:12-43` ignores output entirely and always renders `List deeply` with no pending/success/partial/failure state.
- `cli/src/types/chat.ts:37-53` types the raw result as `unknown`, so renderer contracts cannot be checked statically.

## Target contract

### Stable outer transport

Keep this unchanged for all phases:

```ts
type ToolResultOutput =
  | { type: 'json'; value: JSONValue }
  | { type: 'media'; data: string; mediaType: string }
```

Structured filesystem values live under the existing JSON part. Legacy unversioned values are called `v0`; the first structured contract is `version: 1`.

### Shared fields

Create `common/src/tools/results/filesystem.ts` with strict Zod schemas and inferred types:

```ts
type FilesystemResultStatus = 'ok' | 'partial' | 'error'

type FilesystemError = {
  code:
    | 'not_found'
    | 'blocked'
    | 'outside_project'
    | 'too_large'
    | 'io_error'
    | 'invalid_request'
    | 'stale_read'
    | 'no_match'
    | 'ambiguous_match'
    | 'application_rejected'
  message: string
  retryable: boolean
  requiresFreshRead?: boolean
  recovery?: 'discover_path' | 'read_again' | 'read_smaller_range' | 'choose_symbol' | 'change_edit_strategy'
}
```

The error `message` remains model-readable, but state machines must use `status`, `code`, and recovery fields rather than parse the prose.

### `ReadFilesResultV1`

```ts
type ReadFilesResultV1 = {
  kind: 'read_files_result'
  version: 1
  status: FilesystemResultStatus
  summary: {
    requested: number
    ok: number
    partial: number
    failed: number
    uniquePaths: number
  }
  results: ReadFilesItemV1[]
}
```

Every normalized selector produces exactly one result item, identified by its input order:

```ts
type ReadFilesItemV1 =
  | {
      selector: 'file'
      requestIndex: number
      path: string
      status: 'ok' | 'partial'
      content: string
      complete: boolean
      template: boolean
      truncation?: { reason: 'character_limit'; omittedStartLine?: number; omittedEndLine?: number }
      referencedBy?: Record<string, string[]>
    }
  | {
      selector: 'range'
      requestIndex: number
      path: string
      status: 'ok' | 'partial'
      content: string
      startLine: number
      endLine: number
      totalLines: number
      complete: boolean
      rangeHash?: string
      readCapability?: string
      truncation?: { reason: 'character_limit' }
    }
  | {
      selector: 'symbols'
      requestIndex: number
      path: string
      status: 'ok' | 'partial'
      requestedSymbols: string[]
      missingSymbols: string[]
      slices: ExtractedSlice[]
    }
  | {
      selector: 'file' | 'range' | 'symbols'
      requestIndex: number
      path: string
      status: 'error'
      error: FilesystemError
    }
```

Counting rules:

- `requested` is the number of selector entries, not the number of unique paths. Each `paths[]` element, each `ranges[]` element, and each `symbols[]` group counts once.
- `summary.ok + summary.partial + summary.failed === summary.requested`.
- Duplicate paths remain distinct through `requestIndex`; do not concatenate ranges into an opaque string in the structured path.
- A symbol group with some slices found is `partial` and lists `missingSymbols`; no slices found is `error/no_match`.
- A 100k-character truncated whole/range read is `partial` with `complete: false`. It must not grant whole-file authorization. Do not emit a capability covering unseen range content; require a smaller range.
- An over-10-MB refusal is `error/too_large`, not a content string.

### `ReadSubtreeResultV1`

```ts
type ReadSubtreeResultV1 = {
  kind: 'read_subtree_result'
  version: 1
  status: FilesystemResultStatus
  summary: { requested: number; ok: number; partial: number; failed: number }
  results: Array<
    | { requestIndex: number; path: string; status: 'ok' | 'partial'; type: 'directory'; printedTree?: string; printedTreeOmittedForLength?: true; tokenCount: number; truncationLevel: ... }
    | { requestIndex: number; path: string; status: 'ok' | 'partial'; type: 'file'; variables?: string[]; variablesOmittedForLength?: true }
    | { requestIndex: number; path: string; status: 'error'; error: FilesystemError }
  >
}
```

Pruning changes payload presence (`printedTree` to `printedTreeOmittedForLength`, for example), never the status or error identity.

### Related reads

Use the same `{ kind, version, status, error? }` vocabulary for `read_outline`, `read_slices`, `list_directory`, and `glob`. `find_files` should return either a structured discovery result or reuse `ReadFilesResultV1`; it must not reuse the legacy array union indefinitely.

### `FileEditResultV1`

Introduce one shared write result for filesystem mutation tools:

```ts
type FileEditResultV1 = {
  kind: 'file_edit_result'
  version: 1
  tool: 'str_replace' | 'write_file' | 'replace_range' | 'rewrite_symbol' | 'apply_patch' | 'edit_transaction'
  status: FilesystemResultStatus
  atomic: boolean
  changed: boolean
  files: Array<{
    path: string
    status: 'applied' | 'unchanged' | 'error'
    action: 'create' | 'update' | 'delete'
    patch?: string
    error?: FilesystemError
  }>
  operations?: Array<{
    index: number
    status: 'applied' | 'skipped' | 'error'
    error?: FilesystemError
  }>
  failedOperationIndex?: number
  message: string
}
```

For an aborted atomic batch, require `status: 'error'`, `changed: false`, all non-failing operations marked `skipped`, the failing operation marked `error`, and `failedOperationIndex`. This lets the model and harness know that successful-looking earlier matches were not committed and that the whole batch must be rebuilt from a fresh read.

## Minimal migration sequence

### Phase 0: Freeze legacy behavior with characterization tests

No emitted shape changes yet.

1. Add fixtures covering every current `read_files` representation: content, template, marker failure, null/missing override, whole+range same path, multiple ranges, range truncation, symbol success, partial symbol match, symbol miss, and symbol-only input.
2. Add `read_subtree` fixtures for full/pruned directory, full/pruned file, mixed success/error, empty paths (root), and unsafe/missing paths.
3. Add edit fixtures for success, plain error, nested error, partial non-atomic result, and aborted atomic result.

Exact tests:

- Update `sdk/src/__tests__/read-files.test.ts`.
- Update `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts`.
- Create `packages/agent-runtime/src/util/__tests__/render-read-files-result.test.ts`.
- Update `packages/agent-runtime/src/tools/handlers/__tests__/read-subtree.test.ts`.
- Update `packages/agent-runtime/src/util/__tests__/simplify-tool-results.test.ts`.
- Update `agents/__tests__/context-pruner.test.ts`.
- Update `cli/src/components/tools/__tests__/read-files.test.tsx` and create `cli/src/components/tools/__tests__/read-subtree.test.tsx`.
- Update `cli/src/components/tools/__tests__/str-replace.test.tsx` and `cli/src/components/tools/__tests__/apply-patch.test.tsx`.

### Phase 1: Add shared schemas, decoders, and generated result types

Create:

- `common/src/tools/results/filesystem.ts`: strict v1 schemas/types, legacy v0 schemas, `decodeReadFilesResult`, `decodeReadSubtreeResult`, `decodeFileEditResult`, and status aggregation helpers.
- `common/src/tools/results/__tests__/filesystem.test.ts`: canonical parsing, legacy normalization, malformed payload rejection, idempotence, and summary-invariant tests.

Modify:

- `common/src/tools/params/tool/read-files.ts`: make `paths` default to `[]`; replace the current output union with `z.union([readFilesResultV1Schema, legacyReadFilesValueSchema])` during migration.
- `common/src/tools/params/tool/read-subtree.ts`: accept canonical v1 plus legacy v0.
- `common/src/tools/params/tool/read-outline.ts`, `read-slices.ts`, `find-files.ts`, `list-directory.ts`, and `glob.ts`: adopt the shared status/error vocabulary or explicitly register their legacy schemas for later conversion.
- `common/src/tools/params/tool/str-replace.ts`, `apply-patch.ts`, and `edit-transaction.ts`: export canonical-plus-legacy schemas; dependent write tools continue importing the shared schema.
- `common/src/tools/list.ts`: export named `ReadFilesResult`, `ReadSubtreeResult`, and `FileEditResult` aliases in addition to `CodebuffToolOutput<T>`.
- `common/src/tools/compile-tool-definitions.ts`: generate `ToolResultMap` and `GetToolResult<T>` from the JSON value schema, not only `ToolParamsMap`/`GetToolParams<T>`.
- `common/src/tools/__tests__/compile-tool-definitions.test.ts`: assert result-map generation and discriminants.
- Regenerate `agents/types/tools.ts` and `common/src/templates/initial-agents-dir/types/tools.ts`; re-export `GetToolResult` from both agent-definition templates.

Compatibility rule: all decoders return canonical v1 in memory, but schemas accept legacy v0. No native handler emits v1 yet.

### Phase 2: Structure SDK reads without breaking `getFiles` or overrides

Modify `sdk/src/tools/read-files.ts`:

- Refactor `ReadOneFileResult` into a structured internal result with explicit error code/status.
- Add `getFilesStructured(...) => Promise<ReadFilesResultV1>`.
- Keep `getFiles(...) => Promise<Record<string, string | null>>` as a deprecated legacy adapter implemented from the structured reader. Preserve byte-for-byte legacy rendering for existing public callers.
- Keep `getFileForEdit` as the full-content editing path, but use structured errors internally rather than converting through display strings.

Modify public/runtime wiring:

- `common/src/types/contracts/client.ts`: widen `RequestFilesFn` to return `ReadFilesResultV1 | LegacyReadFilesMap`; add named `LegacyReadFilesMap` and `RequestFilesResult` types.
- `sdk/src/run.ts`: widen `overrideTools.read_files` to accept existing legacy implementations and new structured implementations. Add `filesystemResultFormat?: 'legacy-v0' | 'structured-v1'` to `OpenbuffClientOptions`, initially defaulting to legacy for public SDK users.
- `sdk/src/impl/agent-runtime.ts` and `common/src/types/contracts/agent-runtime.ts`: thread the optional format capability into runtime scoped dependencies.
- `sdk/src/index.ts`: export `getFilesStructured` and the structured result types.
- `sdk/scripts/build.ts` and `sdk/test/esm-compatibility/test-types.ts`: include/check the new public exports.

Update tests:

- `sdk/src/__tests__/read-files.test.ts`: assert structured per-selector results and unchanged legacy `getFiles` snapshots.
- `sdk/src/__tests__/run-file-filter.test.ts`: assert blocked/template status in both formats.
- `sdk/src/__tests__/run-handle-event.test.ts`: assert legacy default and structured opt-in event payloads.
- Add a public type compatibility case to `sdk/test/esm-compatibility/test-types.ts` showing that the old override signature still typechecks.

### Phase 3: Normalize runtime reads and authorization

Modify:

- `packages/agent-runtime/src/get-file-reading-updates.ts`: accept `RequestFilesResult`, normalize legacy maps immediately, and return typed per-selector results instead of `{ path, content }[]`.
- `packages/agent-runtime/src/util/render-read-files-result.ts`: convert it into the canonical builder/legacy adapter boundary. Rename only if desired; avoiding a file rename reduces churn.
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts`: count all selectors, preserve `requestIndex`, emit canonical v1 when opted in, and derive edit-state updates from typed status/coverage rather than marker strings.
- `packages/agent-runtime/src/tools/handlers/tool/find-files.ts`: consume normalized results and either emit `ReadFilesResultV1` or adapt to its declared legacy shape.
- `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts`: build `ReadSubtreeResultV1` directly and adapt to v0 only at the compatibility boundary.
- `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts` and `read-slices.ts`: stop encoding failures in `outline`/empty slices.
- `packages/agent-runtime/src/util/simplify-tool-results.ts`: preserve `kind`, `version`, status, selector, request index, path, summary, and errors. Replace only large payload fields with omission metadata.
- `packages/agent-runtime/src/tools/tool-executor.ts`: for filesystem tools, decode/validate the handler output before streaming. During the compatibility window accept v0 and normalize it; malformed native output should become a logged harness error and a valid canonical error result, never an unvalidated payload.

Authorization rules after this phase:

- Only `selector: 'file'`, `status: 'ok'`, and `complete: true` grants sticky whole-file authorization.
- A truncated whole read is `partial` and does not grant whole-file authorization.
- Range/symbol results never grant whole-file authorization; their exact capabilities remain the proof for scoped edits.
- Error items never clear failed-edit gates.
- Replace `Record<string, true>` with a versioned authorization record in a follow-up-compatible shape, for example `{ contentHash, readAt, source: 'whole-file' }`, so external changes can invalidate it. This can land after structured results if kept as a separate risk-controlled change.

Update tests:

- `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts`: symbol-only counts, partial symbol match, truncated read authorization denial, marker-v0 compatibility, and canonical-v1 authorization.
- `packages/agent-runtime/src/tools/handlers/__tests__/read-subtree.test.ts`: canonical summary invariants and per-request error identity.
- `packages/agent-runtime/src/util/__tests__/simplify-tool-results.test.ts`: errors survive pruning; symbol entries do not become fake content omissions; simplification is idempotent.
- `packages/agent-runtime/src/__tests__/tool-validation-error.test.ts`: malformed native filesystem output is contained and a valid paired tool result remains.
- `packages/agent-runtime/src/tools/handlers/tool/__tests__/runtime-path-hardening.test.ts`: unsafe paths yield canonical `outside_project`/`invalid_request` codes without I/O.

### Phase 4: Move pruner and CLI consumers to one status decoder

Context pruning:

- Update the inline helpers in `agents/context-pruner.ts` to recognize canonical `kind/version/status/results` first and retain the existing v0 heuristics only as a fallback for old message history. This agent's `handleSteps` is serialized, so it cannot import the common decoder directly.
- Preserve the current `toolCallId` correlation.
- Record a read fact only for `ok` items and intentionally selected `partial` items; never infer success from an unknown canonical object.
- Preserve structured error code/recovery text within the existing bounded tool-error budget.
- Update `agents/__tests__/context-pruner.test.ts` and `agents/e2e/context-pruner.e2e.test.ts` with mixed v0/v1 histories and re-compaction.

CLI normalization:

- Create `cli/src/utils/filesystem-tool-results.ts` as the single UI decoder for canonical and legacy results.
- Change `cli/src/types/chat.ts` so `outputRaw` is typed as `ToolResultOutput[] | LegacyPersistedToolOutput`, rather than unconstrained `unknown`.
- Keep `cli/src/utils/message-block-helpers.ts:1065-1090` responsible for storage only; do not embed tool-specific status inference there.
- Update `cli/src/components/tools/read-files.tsx` to render the normalized aggregate status and optional `ok/partial/failed` counts without recursive JSON inspection.
- Update `cli/src/components/tools/read-subtree.tsx` to render queued/pending/listed/partial/failed states and the first bounded error.
- Update `cli/src/components/tools/str-replace.tsx`, `apply-patch.tsx`, and `edit-transaction.tsx` to use `FileEditResultV1`; retain v0 fallback in the decoder.
- Update `cli/src/utils/sdk-event-handlers.ts` only if normalization is chosen at ingestion time. Prefer decoding at render/use sites so persisted old blocks remain readable.

Tests:

- `cli/src/components/tools/__tests__/read-files.test.tsx`: canonical ok/partial/error, symbol miss, malformed canonical error, and v0 parity.
- New `cli/src/components/tools/__tests__/read-subtree.test.tsx`: pending/ok/partial/error and pruned results.
- `cli/src/components/tools/__tests__/str-replace.test.tsx`: aborted atomic batch shows failed index and no applied diff.
- `cli/src/components/tools/__tests__/apply-patch.test.tsx`: canonical positive success and canonical rejection.
- `cli/src/utils/__tests__/message-block-helpers.test.ts`: raw v1 payload preservation.
- `cli/src/utils/__tests__/sdk-event-handlers.test.ts`: v1 result pairing by `toolCallId`.

### Phase 5: Emit structured writes and turn retry guidance into state

Modify the common schemas and runtime handlers for the six edit tools listed above so native results emit `FileEditResultV1` in structured mode. The SDK application functions should return the same typed value before the JSON transport wrapper.

Key exact files:

- `sdk/src/tools/change-file.ts`, `sdk/src/tools/apply-patch.ts`, and `sdk/src/tools/replace-range.ts`.
- `packages/agent-runtime/src/tools/handlers/tool/str-replace.ts`, `write-file.ts`, `replace-range.ts`, `rewrite-symbol.ts`, `apply-patch.ts`, and `edit-transaction.ts`.
- `common/src/tools/params/tool/str-replace.ts`, `write-file.ts`, `replace-range.ts`, `rewrite-symbol.ts`, `apply-patch.ts`, and `edit-transaction.ts`.

For atomic `str_replace`, populate per-operation statuses from the existing batch diagnostics. The circuit breaker and model prompt can then key off `error.code`, `failedOperationIndex`, and `requiresFreshRead` instead of matching prose. Preserve the human message for readability.

Update the existing SDK/runtime edit tests rather than creating parallel suites:

- `sdk/src/__tests__/change-file.test.ts`, `apply-patch.test.ts`, and `replace-range.test.ts`.
- `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` for read/edit recovery state.
- `packages/agent-runtime/src/tools/handlers/tool/__tests__/str-replace-circuit-breaker.test.ts`.
- `packages/agent-runtime/src/__tests__/process-edit-transaction.test.ts` and `apply-smart-patch.test.ts` where they consume shared results.

### Phase 6: Default switch and eventual legacy removal

1. Ship at least one release with SDK default `legacy-v0`, CLI opting into `structured-v1`, and dual decoders everywhere.
2. Add telemetry/log counters for decoded v0, decoded v1, malformed, and adapter fallback. Do not include file content in telemetry.
3. In the next breaking SDK release, switch the public default to `structured-v1`; retain an explicit `legacy-v0` option for one deprecation cycle.
4. Remove v0 emission only after persisted-history, SDK override, CLI, and context-pruner compatibility tests demonstrate that old payloads still decode.
5. Keep v0 decoding longer than v0 emission because saved run states and copied message histories can outlive a release.

## Backward-compatibility strategy

- Preserve the outer `ToolResultOutput[]` transport and print-mode event fields.
- Preserve the public `getFiles()` return type and behavior; add `getFilesStructured()` rather than changing it in place.
- Widen `overrideTools.read_files` to accept legacy or v1 returns. Existing legacy override functions remain assignable.
- Treat missing `kind/version` as v0 and decode using a narrowly documented adapter.
- Never dual-emit v0 and v1 entries in the same result; that doubles model tokens and risks duplicate counting.
- Do not infer v1 success from absence of an error. Unknown/malformed v1 is a harness error. Only the v0 adapter may use legacy heuristics.
- Keep CLI and context-pruner v0 decoders for persisted histories after structured emission becomes the default.
- Use a format capability/option rather than user-agent/version guessing.

## Validation commands

Run in this order after each phase that touches the named package:

```sh
bun test common/src/tools/results common/src/tools/__tests__/compile-tool-definitions.test.ts
bun run --cwd common typecheck
bun test sdk/src/__tests__/read-files.test.ts sdk/src/__tests__/run-file-filter.test.ts sdk/src/__tests__/run-handle-event.test.ts
bun run --cwd sdk typecheck
bun test packages/agent-runtime/src/util/__tests__/simplify-tool-results.test.ts packages/agent-runtime/src/tools/handlers/__tests__/read-subtree.test.ts packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts packages/agent-runtime/src/__tests__/tool-validation-error.test.ts
bun run --cwd packages/agent-runtime typecheck
bun test agents/__tests__/context-pruner.test.ts agents/e2e/context-pruner.e2e.test.ts
bun test cli/src/components/tools/__tests__/read-files.test.tsx cli/src/components/tools/__tests__/read-subtree.test.tsx cli/src/components/tools/__tests__/str-replace.test.tsx cli/src/components/tools/__tests__/apply-patch.test.tsx cli/src/utils/__tests__/sdk-event-handlers.test.ts
bun run --cwd cli typecheck
bun run --cwd sdk build
bun run --cwd sdk verify:skip-build
```

Use the repository's configured hooks/reviewer gate after the focused suites pass.

## Acceptance criteria

1. A symbol-only `read_files` call is valid without a synthetic `paths: []` field.
2. Every whole/range/symbol selector has exactly one typed result item and stable `requestIndex`.
3. Symbol misses cannot produce a zero-request/zero-failure summary.
4. `summary.ok + summary.partial + summary.failed === summary.requested` for every v1 batch.
5. Native v1 failures are never encoded solely inside `content`, `outline`, `message`, or an empty array.
6. Pruning/simplification preserves status, selector, path, request identity, and bounded error/recovery fields.
7. Whole-file authorization is granted only from complete successful whole reads; range/symbol/truncated reads do not grant it.
8. CLI read/subtree/write status is derived from normalized enums, not recursive string matching, when v1 is present.
9. An aborted atomic replacement result explicitly states `changed: false`, the failed operation index, skipped operations, and whether a fresh read is required.
10. Native filesystem outputs are schema-validated before being streamed or persisted.
11. Existing `getFiles()` callers and legacy `overrideTools.read_files` implementations continue to work unchanged during the compatibility window.
12. Old persisted v0 tool results still render and prune correctly after v1 becomes the CLI default.

## Risks and rollback boundaries

- The highest-risk semantic change is denying whole-file authorization for truncated reads. Land it behind focused authorization tests and, if necessary, a separate flag from result-format emission.
- Generating output types can expose existing schema/handler mismatches. Start with filesystem tools and strict canonical schemas; do not make all native tool outputs strict in one patch.
- The context-pruner cannot import common helpers because its generator is serialized. Keep its canonical decoder small and fixture-driven rather than duplicating the full general adapter.
- Public SDK event consumers may inspect `event.output[0].value` directly. The legacy-default/structured-opt-in release is the rollback boundary for this risk.
- Each phase can be reverted independently because the outer transport and v0 decoders remain stable until the final removal phase.

## Recommended first implementation slice

Implement Phases 0-3 for `read_files` only, plus the common decoder and CLI/pruner dual-read support. That fixes the clearest ambiguity (symbol-only counts and status-as-content) without simultaneously rewriting every edit handler. Follow immediately with `read_subtree`, then structured writes. This order gives the edit state machine trustworthy read evidence before changing write result semantics.

## Implementation status

Completed in this audit:

- The recommended `read_files` v1 compatibility slice is implemented across common schemas, SDK native/override adapters, runtime normalization and authorization, CLI rendering, and context pruning.
- Native structured reads are built from typed read metadata; marker-like ordinary source content is not interpreted as status.
- Summary counts and aggregate status are validated against actual result items.
- Structured results are reconciled with requested selector index, kind, and normalized path before authorization.
- Public SDK `getFiles()` remains legacy-compatible; `getFilesStructured()` and the format option are exported and packaged-consumer verification covers ESM/CJS/types.
- Content-hash authorization, injected-filesystem realpath containment, unified edit application coordination, and accurate rollback-failure reporting landed alongside the result-contract slice.

Still planned:

- `ReadSubtreeResultV1` and canonical contracts for outline/slices/discovery/listing tools.
- `FileEditResultV1` emission for every mutation tool, replacing heuristic success/error decoding in the coordinator, CLI, and pruner.
- Generated output/result maps for programmatic agent tool types.
- Shared snapshot/read deduplication for overlapping selectors in one request.
- Telemetry, deprecation milestones, default switching, and eventual legacy-emission removal.
