import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'

type ToolName = 'read_slices'

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
    return {
      output: jsonToolResult({
        path,
        slices: [],
      }),
    }
  }

  const lines = rawContent.split(/\r?\n/)
  const slices: { symbol: string; content: string; startLine: number; endLine: number }[] = []

  const isPython = path.endsWith('.py')

  for (const symbol of symbols) {
    let startLine = -1
    const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    let symbolRegex = new RegExp(`\\b${escapedSymbol}\\b`)

    // Find the starting line for the symbol
    for (let i = 0; i < lines.length; i++) {
      if (symbolRegex.test(lines[i])) {
        // Double check it's a declaration/definition site
        const line = lines[i].trim()
        if (
          line.includes('function') ||
          line.includes('class') ||
          line.includes('const') ||
          line.includes('let') ||
          line.includes('var') ||
          line.includes('def ') ||
          // Or a method signature like methodName(params) {
          /^\s*\w+\s*\(/.test(lines[i])
        ) {
          startLine = i
          break
        }
      }
    }

    if (startLine === -1) {
      // Fallback: search for first occurrence of symbol anywhere if declaration pattern didn't match
      for (let i = 0; i < lines.length; i++) {
        if (symbolRegex.test(lines[i])) {
          startLine = i
          break
        }
      }
    }

    if (startLine !== -1) {
      let endLine = startLine
      let contentLines: string[] = []

      if (isPython) {
        // Python indentation-based block matching
        const startLineIndent = lines[startLine].length - lines[startLine].trimStart().length
        contentLines.push(lines[startLine])
        for (let j = startLine + 1; j < lines.length; j++) {
          const currentLine = lines[j]
          const trimmed = currentLine.trim()
          if (trimmed.length === 0) {
            contentLines.push(currentLine)
            endLine = j
            continue
          }
          const currentIndent = currentLine.length - currentLine.trimStart().length
          if (currentIndent <= startLineIndent) {
            break
          }
          contentLines.push(currentLine)
          endLine = j
        }
      } else {
        // Brace-delimited block matching (TypeScript, JavaScript, Go, etc.)
        let braceCount = 0
        let foundBrace = false
        for (let j = startLine; j < lines.length; j++) {
          const currentLine = lines[j]
          contentLines.push(currentLine)
          endLine = j

          for (let k = 0; k < currentLine.length; k++) {
            const char = currentLine[k]
            if (char === '{') {
              braceCount++
              foundBrace = true
            } else if (char === '}') {
              braceCount--
            }
          }

          if (foundBrace && braceCount <= 0) {
            break
          }
        }
      }

      slices.push({
        symbol,
        content: contentLines.join('\n'),
        startLine: startLine + 1,
        endLine: endLine + 1,
      })
    }
  }

  return {
    output: jsonToolResult({
      path,
      slices,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<any>
