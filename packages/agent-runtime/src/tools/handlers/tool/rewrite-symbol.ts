import { handleStrReplace } from './str-replace'
import { getFileStructure, mintSliceCapability } from '../../../structural-read'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'

function errorResult(file: string, message: string) {
  return { output: [{ type: 'json' as const, value: { file, errorMessage: message } }] }
}

/**
 * Structural edit: replace a whole symbol's definition by name. Resolves the
 * symbol's exact AST range, then applies the change through the existing
 * str_replace machinery (atomic, capability-anchored, client-applied) using the
 * symbol's current text as a precise oldString — so the model never has to copy
 * the old text and the edit can't drift. Falls back with guidance when the file
 * has no tree-sitter grammar or the symbol isn't found.
 */
export const handleRewriteSymbol = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: any
    requestOptionalFile: RequestOptionalFileFn
  },
): Promise<{ output: any }> => {
  const { previousToolCallFinished, toolCall, requestOptionalFile } = params
  const { path, symbol, content: newContent, occurrence } = toolCall.input as {
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

  const structure = await getFileStructure(raw, path)
  if (structure === null) {
    return errorResult(
      path,
      `rewrite_symbol could not parse ${path} (no tree-sitter grammar for this file type). Use str_replace with an exact oldString instead.`,
    )
  }

  const matches = structure.filter((s) => s.name === symbol)
  if (matches.length === 0) {
    return errorResult(
      path,
      `Symbol "${symbol}" not found in ${path}. Run read_outline on this file to see available symbols, then retry (or use str_replace).`,
    )
  }
  if (matches.length > 1 && occurrence === undefined) {
    const lineList = matches.map((m) => `${m.kind} at lines ${m.startLine}-${m.endLine}`).join('; ')
    return errorResult(
      path,
      `Multiple top-level symbols named "${symbol}" in ${path} (${lineList}). Pass occurrence (1-indexed) to choose one, or use str_replace.`,
    )
  }
  const match = occurrence !== undefined ? matches[occurrence - 1] : matches[0]
  if (!match) {
    return errorResult(
      path,
      `occurrence ${occurrence} is out of range; ${matches.length} symbol(s) named "${symbol}" exist in ${path}.`,
    )
  }

  const normalized = raw.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const oldString = lines.slice(match.startLine - 1, match.endLine).join('\n')
  const { readCapability } = mintSliceCapability({
    content: raw,
    startLine: match.startLine,
    endLine: match.endLine,
  })

  // Delegate to the str_replace handler: it owns atomic apply, stale detection,
  // capability validation, and the client write. The oldString is the symbol's
  // exact current text, so it matches uniquely; basedOnRead anchors large files.
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
            basedOnRead: readCapability,
          },
        ],
      },
    },
  } as any)
}) satisfies CodebuffToolHandlerFunction<any>

