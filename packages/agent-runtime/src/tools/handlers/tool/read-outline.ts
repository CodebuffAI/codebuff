import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'

type ToolName = 'read_outline'

export const handleReadOutline = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: any
    requestOptionalFile: RequestOptionalFileFn
  },
): Promise<{ output: any }> => {
  const { previousToolCallFinished, toolCall, requestOptionalFile } = params
  const { path } = toolCall.input

  await previousToolCallFinished

  const rawContent = await requestOptionalFile({ ...params, filePath: path })
  if (rawContent === null) {
    return {
      output: jsonToolResult({
        path,
        outline: 'Error: File does not exist.',
      }),
    }
  }

  const lines = rawContent.split(/\r?\n/)
  const outlineLines: string[] = []

  let inCommentBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip multi-line comments
    if (trimmed.startsWith('/*')) {
      inCommentBlock = true
    }
    if (inCommentBlock) {
      if (trimmed.includes('*/')) {
        inCommentBlock = false
      }
      continue
    }
    if (trimmed.startsWith('//') || trimmed.length === 0) {
      continue
    }

    // Match imports
    if (trimmed.startsWith('import ')) {
      outlineLines.push(`Line ${i + 1}: ${trimmed}`)
      continue
    }

    // Match class, interface, type, function, and method definitions
    const classMatch = trimmed.match(/^(export\s+)?(default\s+)?class\s+(\w+)/)
    const interfaceMatch = trimmed.match(/^(export\s+)?(default\s+)?interface\s+(\w+)/)
    const typeMatch = trimmed.match(/^(export\s+)?type\s+(\w+)/)
    const functionMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/)
    const arrowFuncMatch = trimmed.match(/^(export\s+)?const\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*=>/)
    const methodMatch = trimmed.match(/^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*(\{|\b)/)

    if (classMatch) {
      outlineLines.push(`Line ${i + 1}: class ${classMatch[3]}`)
    } else if (interfaceMatch) {
      outlineLines.push(`Line ${i + 1}: interface ${interfaceMatch[3]}`)
    } else if (typeMatch) {
      outlineLines.push(`Line ${i + 1}: type ${typeMatch[2]}`)
    } else if (functionMatch) {
      outlineLines.push(`Line ${i + 1}: function ${functionMatch[3]}(...)`)
    } else if (arrowFuncMatch) {
      outlineLines.push(`Line ${i + 1}: const ${arrowFuncMatch[2]} = (...) =>`)
    } else if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[2])) {
      const indent = ' '.repeat(line.length - trimmed.length)
      outlineLines.push(`${indent}Line ${i + 1}: method ${methodMatch[2]}(...)`)
    }
  }

  return {
    output: jsonToolResult({
      path,
      outline: outlineLines.join('\n') || '[No structural components found in this file]',
    }),
  }
}) satisfies CodebuffToolHandlerFunction<any>
