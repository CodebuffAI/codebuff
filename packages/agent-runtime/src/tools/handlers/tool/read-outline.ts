import { isPathInsideProject } from '@codebuff/common/util/project-path-containment'
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

export const handleReadOutline = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  requestOptionalFile: RequestOptionalFileFn
  fileContext: import('@codebuff/common/util/file').ProjectFileContext
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    requestOptionalFile,
    fileContext,
  } = params
  const { path } = toolCall.input

  await previousToolCallFinished

  // The schema promises `path` is "relative to the project root". Reject
  // absolute paths and `..` traversal up front using the shared containment
  // helper so the tool can't exfiltrate structure of files outside the
  // project. The legacy "Error: File does not exist." message keeps the
  // tool-call contract stable for the runtime.
  //
  // We use `fileContext.projectRoot` rather than `process.cwd()` because
  // the runtime can be invoked from a different working directory than the
  // project root (e.g. when run as a background worker, in a test harness,
  // or when the CLI is launched from a parent repo). The agent session
  // carries the canonical project root in `fileContext`, so the containment
  // check stays anchored to that regardless of `process.cwd()`.
  if (!isPathInsideProject(fileContext.projectRoot, path)) {
    return {
      output: jsonToolResult({
        path,
        outline: 'Error: File does not exist.',
      }),
    }
  }

  let rawContent: string | null
  try {
    rawContent = await requestOptionalFile({ ...params, filePath: path })
  } catch (error) {
    return {
      output: jsonToolResult({
        path,
        outline: '',
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    }
  }
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
        outline: limitOutline(markdownOutline(rawContent)),
      }),
    }
  }

  // Preferred path: accurate, multi-language structure from tree-sitter.
  const structure = await getFileStructure(rawContent, path)
  if (structure !== null) {
    const outline = limitOutline(renderStructureOutline(rawContent, structure))
    return {
      output: jsonToolResult({
        path,
        outline: outline || '[No structural components found in this file]',
      }),
    }
  }

  // Fallback: regex heuristic for files with no tree-sitter grammar (or when
  // tree-sitter is unavailable in this environment). TS/JS-oriented.
  return {
    output: jsonToolResult({
      path,
      outline: limitOutline(regexOutline(rawContent)),
    }),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function isMarkdownPath(path: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(path)
}

function limitOutline(outline: string): string {
  if (outline.length <= 100_000) return outline
  return `${outline.slice(0, 100_000)}\n[Outline truncated at 100,000 characters. Read a narrower symbol or range.]`
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

    outlineLines.push(
      `${'  '.repeat(level - 1)}Line ${i + 1}: ${'#'.repeat(level)} ${text}`,
    )
  }

  return outlineLines.join('\n') || '[No markdown headings found in this file]'
}

function regexOutline(rawContent: string): string {
  const lines = rawContent.split(/\r?\n/)
  const outlineLines: string[] = []

  let inCommentBlock = false

  // Statements/keywords that look like method declarations to the loose
  // `^\s*name(args)` regex but are actually control-flow / statement keywords.
  // Expanded beyond the original {if, for, while, switch, catch} list because
  // these previously appeared as bogus "method ..." entries in heuristic
  // outlines, which the model then mistook for callable symbols.
  const STATEMENT_DENYLIST = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'return',
    'throw',
    'new',
    'do',
    'try',
    'else',
    'yield',
    'await',
    'typeof',
    'delete',
    'void',
    'in',
    'of',
    'with',
  ])

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
    const methodMatch = trimmed.match(
      /^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*(\{|\b)/,
    )

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
    } else if (methodMatch && !STATEMENT_DENYLIST.has(methodMatch[2])) {
      const indent = ' '.repeat(line.length - trimmed.length)
      outlineLines.push(`${indent}Line ${i + 1}: method ${methodMatch[2]}(...)`)
    }
  }

  // Loud marker so the model knows this outline came from a brittle regex
  // (no tree-sitter grammar available for the file). Tells it to verify any
  // surfaced symbol against an actual ranged read before relying on it.
  const HEURISTIC_WARNING =
    '[heuristic outline: tree-sitter grammar unavailable for this file. Symbol kinds and line numbers may be approximate; verify before editing by reading the exact range with read_files.ranges.]'

  if (outlineLines.length === 0) {
    return `${HEURISTIC_WARNING}\n[No structural components found in this file]`
  }
  return `${HEURISTIC_WARNING}\n${outlineLines.join('\n')}`
}
