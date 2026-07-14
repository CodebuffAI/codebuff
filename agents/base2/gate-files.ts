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

import {
  fileMutationResultV1Schema,
  getConfirmedAppliedActionsV1,
} from '@codebuff/common/tools/results/filesystem'

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
 * Only canonical authority-backed mutation results with at least one applied
 * action count. Legacy diffs, prose, attempted inputs, and changedFiles arrays
 * are deliberately unconfirmed.
 */
export function hasEditArtifact(record: Record<string, unknown>): boolean {
  const parsed = fileMutationResultV1Schema.safeParse(record)
  return parsed.success && getConfirmedAppliedActionsV1(parsed.data).length > 0
}

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
 *   - canonical file_mutation_result actions whose outcome is `applied`
 *   - `type: 'json'` envelope parts where the inner `value` recurses
 * Legacy mutation-shaped fields are traversed but never counted.
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
  if (hasEditArtifact(record)) {
    for (const action of record.actions as Array<Record<string, unknown>>) {
      if (action.outcome !== 'applied') continue
      if (typeof action.path === 'string') out.add(action.path)
      if (
        action.action === 'move' &&
        typeof action.destinationPath === 'string'
      ) {
        out.add(action.destinationPath)
      }
    }
  }
  for (const nested of Object.values(record)) {
    visitToolValue(nested, out)
  }
}
