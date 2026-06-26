import { jsonToolResult } from '@codebuff/common/util/messages'

import {
  getFileStructure,
  renderStructureOutline,
} from '../../../structural-read'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'

type ToolName = 'read_outline'

export const handleReadOutline = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>
    requestOptionalFile: RequestOptionalFileFn
  },
): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
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

  if (isMarkdownPath(path)) {
    return {
      output: jsonToolResult({
        path,
        outline: markdownOutline(rawContent),
      }),
    }
  }

  // Preferred path: accurate, multi-language structure from tree-sitter.
  const structure = await getFileStructure(rawContent, path)
  if (structure !== null) {
    const outline = renderStructureOutline(rawContent, structure)
    return {
      output: jsonToolResult({
        path,
        outline:
          outline || '[No structural components found in this file]',
      }),
    }
  }

  // Fallback: regex heuristic for files with no tree-sitter grammar (or when
  // tree-sitter is unavailable in this environment). TS/JS-oriented.
  return {
    output: jsonToolResult({
      path,
      outline: regexOutline(rawContent),
    }),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function isMarkdownPath(path: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(path)
}

function markdownOutline(rawContent: string): string {
  const lines = rawContent.split(/\r?\n/)
  const outlineLines: string[] = []
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (!headingMatch) continue

    const level = headingMatch[1].length
    const text = headingMatch[2]
      .replace(/\s+#+\s*$/, '')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!text) continue

    outlineLines.push(`${'  '.repeat(level - 1)}Line ${i + 1}: ${'#'.repeat(level)} ${text}`)
  }

  return outlineLines.join('\n') || '[No markdown headings found in this file]'
}

function regexOutline(rawContent: string): string {
  const lines = rawContent.split(/\r?\n/)
  const outlineLines: string[] = []

  let inCommentBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

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

    if (trimmed.startsWith('import ')) {
      outlineLines.push(`Line ${i + 1}: ${trimmed}`)
      continue
    }

    const classMatch = trimmed.match(/^(export\s+)?(default\s+)?class\s+(\w+)/)
    const interfaceMatch = trimmed.match(
      /^(export\s+)?(default\s+)?interface\s+(\w+)/,
    )
    const typeMatch = trimmed.match(/^(export\s+)?type\s+(\w+)/)
    const functionMatch = trimmed.match(
      /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/,
    )
    const arrowFuncMatch = trimmed.match(
      /^(export\s+)?const\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*=>/,
    )
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
    } else if (
      methodMatch &&
      !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[2])
    ) {
      const indent = ' '.repeat(line.length - trimmed.length)
      outlineLines.push(`${indent}Line ${i + 1}: method ${methodMatch[2]}(...)`)
    }
  }

  return outlineLines.join('\n') || '[No structural components found in this file]'
}
