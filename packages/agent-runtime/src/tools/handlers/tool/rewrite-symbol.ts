import { handleStrReplace } from './str-replace'
import {
  extractSlices,
  extendRangeToPrecedingComment,
  getFileStructure,
  mintSliceCapability,
} from '../../../structural-read'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'

function errorResult(file: string, message: string) {
  return {
    output: [{ type: 'json' as const, value: { file, errorMessage: message } }],
  }
}

/**
 * Structural edit: replace a whole symbol's definition by name. Resolves the
 * symbol's exact AST range, then applies the change through the existing
 * str_replace machinery (atomic, capability-anchored, client-applied) using the
 * symbol's current text as a precise oldString — so the model never has to copy
 * the old text and the edit can't drift. If tree-sitter cannot parse the file,
 * fall back to the same heuristic slicer used by read_files(symbols).
 */
export const handleRewriteSymbol = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: any
  requestOptionalFile: RequestOptionalFileFn
}): Promise<{ output: any }> => {
  const { previousToolCallFinished, toolCall, requestOptionalFile } = params
  const {
    path,
    symbol,
    content: newContent,
    occurrence,
  } = toolCall.input as {
    path: string
    symbol: string
    content: string
    occurrence?: number
  }

  await previousToolCallFinished

  const raw = await requestOptionalFile({ ...params, filePath: path })
  if (raw === null) {
    return errorResult(
      path,
      'File does not exist. Use write_file to create it.',
    )
  }

  const normalized = raw.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const structure = await getFileStructure(raw, path)

  const astMatches = structure?.filter((s) => s.name === symbol) ?? []
  const matches =
    astMatches.length > 0
      ? astMatches.map((match) => {
          const { readCapability } = mintSliceCapability({
            content: raw,
            startLine: match.startLine,
            endLine: match.endLine,
          })
          return {
            kind: match.kind,
            startLine: match.startLine,
            endLine: match.endLine,
            oldString: lines
              .slice(match.startLine - 1, match.endLine)
              .join('\n'),
            readCapability,
          }
        })
      : (await extractSlices(raw, path, [symbol], occurrence ?? 5)).map(
          (slice) => ({
            kind: slice.kind ?? 'symbol',
            startLine: slice.startLine,
            endLine: slice.endLine,
            oldString: slice.content,
            readCapability:
              slice.readCapability ??
              mintSliceCapability({
                content: raw,
                startLine: slice.startLine,
                endLine: slice.endLine,
              }).readCapability,
          }),
        )

  if (matches.length === 0) {
    const parserContext =
      structure === null ? `rewrite_symbol could not parse ${path}, and ` : ''
    return errorResult(
      path,
      `${parserContext}symbol "${symbol}" was not found in ${path}. Run read_outline or read_files.ranges on this file, then retry with rewrite_symbol or use replace_range with the fresh rangeHash.`,
    )
  }
  if (matches.length > 1 && occurrence === undefined) {
    const lineList = matches
      .map((m) => `${m.kind} at lines ${m.startLine}-${m.endLine}`)
      .join('; ')
    return errorResult(
      path,
      `Multiple top-level symbols named "${symbol}" in ${path} (${lineList}). Pass occurrence (1-indexed) to choose one, or use replace_range.`,
    )
  }
  const match = occurrence !== undefined ? matches[occurrence - 1] : matches[0]
  if (!match) {
    return errorResult(
      path,
      `occurrence ${occurrence} is out of range; ${matches.length} symbol(s) named "${symbol}" exist in ${path}.`,
    )
  }

  // Extend the replacement range upward to include a contiguous preceding
  // comment/doc block (JSDoc `/** ... */`, block `/* ... */`, or `//` run).
  // Without this, rewrite_symbol would leave the old doc block orphaned while
  // the new content's own doc block duplicates it — shifting line numbers and
  // invalidating any cached anchors the agent holds for subsequent edits.
  const extended = extendRangeToPrecedingComment(lines, match.startLine)
  const oldString =
    extended.startLine === match.startLine
      ? match.oldString
      : lines.slice(extended.startLine - 1, match.endLine).join('\n')
  const basedOnRead =
    extended.startLine === match.startLine
      ? match.readCapability
      : mintSliceCapability({
          content: raw,
          startLine: extended.startLine,
          endLine: match.endLine,
        }).readCapability

  // Delegate to the str_replace handler: it owns atomic apply, stale detection,
  // capability validation, and the client write. The oldString is the symbol's
  // exact current text (plus any preceding doc block), so it matches uniquely;
  // basedOnRead anchors large files.
  return handleStrReplace({
    ...(params as any),
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      ...toolCall,
      toolName: 'str_replace',
      input: {
        path,
        replacements: [
          {
            oldString,
            newString: newContent,
            allowMultiple: false,
            basedOnRead,
          },
        ],
      },
    },
  } as any)
}) satisfies CodebuffToolHandlerFunction<any>
