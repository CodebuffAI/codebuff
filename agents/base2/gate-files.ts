/**
 * Pure file-extraction helpers shared between base agents (base2) and the
 * editor agent. These walk tool-call/tool-result shapes and collect changed
 * file paths so downstream agents can reuse a durable gate pass.
 *
 * NOTE: `agents/base2/base2.ts` keeps parallel inline copies of these
 * helpers inside `createBase2`'s `handleSteps` generator because that
 * function is serialized via `handleSteps.toString()` and reconstructed
 * with `new Function(...)`. Reconstructed functions lose their module
 * closure, so they cannot reference imports from this file. Keep the two
 * implementations in sync.
 *
 * `agents/editor/editor.ts` does NOT serialize its handleSteps and uses
 * these exports directly.
 */

/**
 * Returns true for tool names that mutate files on disk and therefore
 * count as a "changed file" source for the gate.
 */
export function isFileChangingTool(toolName: string): boolean {
  return (
    toolName === 'apply_patch' ||
    toolName === 'apply_smart_patch' ||
    toolName === 'edit_transaction' ||
    toolName === 'replace_range' ||
    toolName === 'rewrite_symbol' ||
    toolName === 'str_replace' ||
    toolName === 'write_file'
  )
}

/**
 * Returns true for tool-result records that represent a successful edit.
 *
 * - A unified diff/diff/patch field always counts as a successful edit.
 * - An explicit `success: true` field counts as a successful edit.
 * - An explicit `success: false` field or any `error` / `errorMessage`
 *   field is treated as a failure and never counts.
 * - Otherwise, a `message` field is matched against a regex of success
 *   verbs (success/successful/applied/wrote/written/edited/replaced).
 *
 * The failure-detection branch prevents stale failed-edit artifacts from
 * being recorded as changed files in the gate.
 */
export function hasEditArtifact(record: Record<string, unknown>): boolean {
  if (
    typeof record.unifiedDiff === 'string' ||
    typeof record.diff === 'string' ||
    typeof record.patch === 'string'
  ) {
    return true
  }
  if (record.success === true) return true
  if (record.success === false || 'error' in record || 'errorMessage' in record) {
    return false
  }
  if (typeof record.message !== 'string') return false
  // Prefer explicit success/error fields. Only trust the success-verb regex
  // when the message does not itself contain a failure indicator — otherwise
  // messages like "No edits were applied" or "Error: nothing was applied"
  // would false-positive on "applied".
  if (FAILURE_INDICATOR_RE.test(record.message)) return false
  return /\b(success|successful|applied|wrote|written|edited|replaced)\b/i.test(
    record.message,
  )
}

/**
 * Words that indicate a tool-result message is describing a failure or no-op
 * even when it mentions a success verb. Used to gate the success-verb regex
 * fallback in `hasEditArtifact`.
 */
const FAILURE_INDICATOR_RE =
  /\b(failed|failure|unable|could not|cannot|did not|was not|were not|skipped|no[- ]op|no changes|error)\b/i

/**
 * Walks a tool-call `input` payload and adds every file path it finds to
 * `out`. Handles the three edit-tool shapes used in this repo:
 *   - a top-level `path` (str_replace / replace_range / rewrite_symbol)
 *   - an `operation: { path }` wrapper (apply_patch / apply_smart_patch)
 *   - an `edits: [{ path }, ...]` array (edit_transaction)
 */
export function collectToolInputFiles(input: unknown, out: Set<string>): void {
  if (!input || typeof input !== 'object') return
  const record = input as Record<string, unknown>
  if (typeof record.path === 'string') out.add(record.path)
  const operation = record.operation
  if (
    operation &&
    typeof operation === 'object' &&
    typeof (operation as Record<string, unknown>).path === 'string'
  ) {
    out.add((operation as Record<string, string>).path)
  }
  const edits = record.edits
  if (Array.isArray(edits)) {
    for (const edit of edits) {
      if (
        edit &&
        typeof edit === 'object' &&
        typeof (edit as Record<string, unknown>).path === 'string'
      ) {
        out.add((edit as Record<string, string>).path)
      }
    }
  }
}

/**
 * Recursively visits any value (typically a tool-result or message-history
 * fragment) and adds every changed file path it finds to `out`.
 *
 * Recognized shapes:
 *   - file-changing tool calls with a structured `input`
 *   - tool-result records with a `file` or `path` artifact and success
 *     markers (see `hasEditArtifact`)
 *   - tool-result records with a `changedFiles: string[]` array (used by
 *     apply_smart_patch and replace_range summaries)
 *   - `type: 'json'` envelope parts where the inner `value` recurses
 *   - the `cb_tool_name` field as a fallback tool-name carrier (legacy
 *     non-`type: 'tool-call'` assistant parts)
 *
 * Recursion skips the `input` field of any object we already inspected
 * via `collectToolInputFiles` to avoid double-counting.
 */
export function visitToolValue(value: unknown, out: Set<string>): void {
  if (!value) return
  if (Array.isArray(value)) {
    for (const item of value) visitToolValue(item, out)
    return
  }
  if (typeof value !== 'object') return

  const record = value as Record<string, unknown>
  if (record.type === 'json' && 'value' in record) {
    visitToolValue(record.value, out)
  }
  const toolName =
    typeof record.toolName === 'string'
      ? record.toolName
      : typeof record.cb_tool_name === 'string'
        ? record.cb_tool_name
        : ''
  const input = record.input
  if (isFileChangingTool(toolName)) {
    collectToolInputFiles(input, out)
  }
  if (typeof record.file === 'string' && hasEditArtifact(record)) {
    out.add(record.file)
  }
  if (Array.isArray(record.changedFiles)) {
    for (const file of record.changedFiles) {
      if (typeof file === 'string') out.add(file)
    }
  }
  if (typeof record.path === 'string' && hasEditArtifact(record)) {
    out.add(record.path)
  }
  for (const nested of Object.values(record)) {
    if (nested !== input) visitToolValue(nested, out)
  }
}
