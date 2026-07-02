# S2 — agent-runtime deterministic edits & reads

## [HIGH] security — packages/agent-runtime/src/tools/handlers/tool/write-file.ts:154 — `basedOnRead` bypasses strict overwrite gate without freshness validation
- **Risk:** Any truthy `basedOnRead` value can authorize overwriting an existing file in strict read-before-edit mode even though the token/hash is never decoded or checked against current file content.
- **Fix:** Decode and validate `basedOnRead` against the existing file before treating it as a freshness capability, and reject invalid/stale anchors before calling `processFileBlock`.
- **Evidence:**
```ts
const path = normalizeToolPath(toolCall.input.path)
const { content } = toolCall.input
const { basedOnRead } = toolCall.input
const hasBasedOnRead = Boolean(basedOnRead)
...
if (
  fileProcessingState.strictReadBeforeEdit &&
  existingDiskContent !== null &&
  !hasBasedOnRead &&
  !fileProcessingState.readAuthorizationsByPath?.[path]
) {
```

## [HIGH] state-mutation — packages/agent-runtime/src/tools/handlers/tool/read-files.ts:70 — failed reads clear stale-edit guards and grant sticky edit authorization
- **Risk:** A blocked, missing, or otherwise failed `read_files` request clears `failedEditRequiresReadByPath` and sets `readAuthorizationsByPath` before the read result is known, allowing later edits from stale memory.
- **Fix:** Move guard clearing and read authorization until after `getFileReadingUpdates`, and apply them only to paths whose content was successfully read rather than failure-marker entries.
- **Evidence:**
```ts
for (const path of authorizedPaths) {
  delete fileProcessingState.failedEditRequiresReadByPath[path]
  // A fresh read means the next edit should anchor to the same disk content
  // the model just saw, not stale in-memory content from an earlier edit chain.
  delete fileProcessingState.promisesByPath[path]
}

if (fileProcessingState.strictReadBeforeEdit) {
  if (!fileProcessingState.readAuthorizationsByPath) {
    fileProcessingState.readAuthorizationsByPath = {}
  }
  for (const path of authorizedPaths) {
    fileProcessingState.readAuthorizationsByPath[path] = true
  }
}

const addedFiles = await getFileReadingUpdates({
```

## [HIGH] correctness — packages/agent-runtime/src/tools/handlers/tool/str-replace.ts:75 — invalid `basedOnRead` can unblock strict and failed-edit gates
- **Risk:** The handler treats mere presence of `basedOnRead` as proof of a fresh read and clears the failed-edit gate, while `processStrReplace` can auto-strip bogus anchors and still apply a naked unique replacement.
- **Fix:** Validate/decode `basedOnRead` before using it to bypass strict mode or clear `failedEditRequiresReadByPath`, and do not auto-strip bogus anchors when the handler relied on them for authorization.
- **Evidence:**
```ts
const hasReadCapability = replacements.some((replacement) =>
  Boolean(replacement.basedOnRead),
)
...
if (hasReadCapability) {
  delete fileProcessingState.failedEditRequiresReadByPath[path]
}
...
fileProcessingState.strictReadBeforeEdit &&
!hasReadCapability &&
!fileProcessingState.readAuthorizationsByPath?.[path]
```
```ts
if (uniquelyMatchable) {
  normalizedReplacements[i].basedOnRead = undefined
  autoStrippedBogusAnchor = true
  continue
}
```

## [MEDIUM] security — packages/agent-runtime/src/tools/handlers/tool/read-outline.ts:25 — `read_outline` path is not normalized before file access
- **Risk:** Unlike edit/read_files paths, `read_outline` passes the caller-supplied path directly to `requestOptionalFile`, so traversal or alternate path spellings depend entirely on lower layers to reject.
- **Fix:** Normalize with the same `normalizeToolPath` path-traversal defense used by edit handlers and return a blocked-path error when normalization fails.
- **Evidence:**
```ts
const { previousToolCallFinished, toolCall, requestOptionalFile } = params
const { path } = toolCall.input

await previousToolCallFinished

const rawContent = await requestOptionalFile({ ...params, filePath: path })
```

## [MEDIUM] correctness — packages/agent-runtime/src/process-str-replace.ts:291 — `occurrenceIndex` bypasses large-file freshness anchors
- **Risk:** On large files, an ordinal `occurrenceIndex` without a fresh `basedOnRead` can edit the wrong repeated block after insertions/deletions or external changes shift occurrence order.
- **Fix:** Require a validated `basedOnRead` range for `occurrenceIndex` edits on large files, or restrict the ordinal search to a freshly authorized range.
- **Evidence:**
```ts
// occurrenceIndex: the caller asserts EXACTLY which repeated occurrence to
// edit (1-indexed). This is a fully-specified target, so it bypasses the
// ambiguity gate AND the near-match auto-correction in tryMatchOldStr: it
// requires an exact literal match and fails cleanly if fewer than N exist.
// It is its own complete path — no basedOnRead anchor is required even on
// large files, because the index itself disambiguates.
if (occurrenceIndex !== undefined) {
```
