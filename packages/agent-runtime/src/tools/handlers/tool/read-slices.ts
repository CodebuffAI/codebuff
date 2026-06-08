import { jsonToolResult } from '@codebuff/common/util/messages'

import { getFileStructure, mintSliceCapability } from '../../../structural-read'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'

type ToolName = 'read_slices'

type Slice = {
  symbol: string
  kind?: string
  content: string
  startLine: number
  endLine: number
  readCapability?: string
}

const MAX_MATCHES_PER_SYMBOL = 5

export const handleReadSlices = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: any
    requestOptionalFile: RequestOptionalFileFn
  },
): Promise<{ output: any }> => {
  const { previousToolCallFinished, toolCall, requestOptionalFile } = params
  const { path, symbols } = toolCall.input

  await previousToolCallFinished

  const rawContent = await requestOptionalFile({ ...params, filePath: path })
  if (rawContent === null) {
    return { output: jsonToolResult({ path, slices: [] }) }
  }

  const slices: Slice[] = []
  const structure = await getFileStructure(rawContent, path)

  for (const symbol of symbols) {
    const astMatches =
      structure?.filter((s) => s.name === symbol).slice(0, MAX_MATCHES_PER_SYMBOL) ?? []

    if (astMatches.length > 0) {
      for (const match of astMatches) {
        const { readCapability, sliceContent } = mintSliceCapability({
          content: rawContent,
          startLine: match.startLine,
          endLine: match.endLine,
        })
        slices.push({
          symbol,
          kind: match.kind,
          content: sliceContent,
          startLine: match.startLine,
          endLine: match.endLine,
          readCapability,
        })
      }
      continue
    }

    // Fallback for unparseable files or symbols tree-sitter did not surface
    // (e.g. a const not captured as a definition): heuristic range detection.
    const fallback = regexSlice(rawContent, symbol, path)
    if (fallback) {
      const { readCapability, sliceContent } = mintSliceCapability({
        content: rawContent,
        startLine: fallback.startLine,
        endLine: fallback.endLine,
      })
      slices.push({
        symbol,
        content: sliceContent,
        startLine: fallback.startLine,
        endLine: fallback.endLine,
        readCapability,
      })
    }
  }

  return { output: jsonToolResult({ path, slices }) }
}) satisfies CodebuffToolHandlerFunction<any>

/**
 * Heuristic single-symbol slicer used only when tree-sitter cannot provide a
 * range. Returns a 1-indexed inclusive line span or null. Brace-based for
 * C-family languages, indentation-based for Python.
 */
function regexSlice(
  rawContent: string,
  symbol: string,
  path: string,
): { startLine: number; endLine: number } | null {
  const lines = rawContent.split(/\r?\n/)
  const isPython = path.endsWith('.py')
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const symbolRegex = new RegExp(`\\b${escaped}\\b`)

  let startLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (symbolRegex.test(lines[i])) {
      const line = lines[i]
      if (
        /\b(function|class|const|let|var|def|interface|type|struct|fn|func)\b/.test(
          line,
        ) ||
        /^\s*\w+\s*\(/.test(line)
      ) {
        startLine = i
        break
      }
    }
  }
  if (startLine === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (symbolRegex.test(lines[i])) {
        startLine = i
        break
      }
    }
  }
  if (startLine === -1) return null

  let endLine = startLine
  if (isPython) {
    const startIndent =
      lines[startLine].length - lines[startLine].trimStart().length
    for (let j = startLine + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim()
      if (trimmed.length === 0) {
        endLine = j
        continue
      }
      const indent = lines[j].length - lines[j].trimStart().length
      if (indent <= startIndent) break
      endLine = j
    }
  } else {
    let braceCount = 0
    let foundBrace = false
    for (let j = startLine; j < lines.length; j++) {
      for (const char of lines[j]) {
        if (char === '{') {
          braceCount++
          foundBrace = true
        } else if (char === '}') {
          braceCount--
        }
      }
      endLine = j
      if (foundBrace && braceCount <= 0) break
    }
  }

  return { startLine: startLine + 1, endLine: endLine + 1 }
}
