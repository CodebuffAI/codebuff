import { createPatch } from 'diff'

import { getContentHash as computeContentHash } from '@codebuff/common/util/content-hash'
import { normalizeLineEndings } from '@codebuff/common/util/content-hash'
import { resolveFilePathWithinProject } from './path-utils'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

type ReplaceRangeParams = {
  path: string
  startLine: number
  endLine: number
  expectedHash: string
  newContent: string
}

// normalizeLineEndings + content-hash now imported from @codebuff/common/util/content-hash.
// Thin re-export preserves the public name expected by callers/tests.
export function getRangeContentHash(content: string): string {
  return computeContentHash(content)
}

function parseReplaceRangeParams(parameters: unknown): ReplaceRangeParams | null {
  if (typeof parameters !== 'object' || parameters === null) {
    return null
  }

  const input = parameters as Record<string, unknown>
  if (
    typeof input.path !== 'string' ||
    typeof input.startLine !== 'number' ||
    !Number.isInteger(input.startLine) ||
    typeof input.endLine !== 'number' ||
    !Number.isInteger(input.endLine) ||
    typeof input.expectedHash !== 'string' ||
    typeof input.newContent !== 'string'
  ) {
    return null
  }

  return {
    path: input.path,
    startLine: input.startLine,
    endLine: input.endLine,
    expectedHash: input.expectedHash,
    newContent: input.newContent,
  }
}

function errorResult(
  file: string,
  errorMessage: string,
): CodebuffToolOutput<'replace_range'> {
  return [{ type: 'json', value: { file, errorMessage } }]
}

function getDisplayLineCount(lines: string[], normalizedContent: string): number {
  // split('\n') includes a trailing empty segment for files ending in a newline;
  // read_files renders the human-visible line count without that phantom line.
  if (normalizedContent.length === 0) {
    return 0
  }

  return lines.at(-1) === '' ? lines.length - 1 : lines.length
}

function buildStaleRangeError(params: {
  relativePath: string
  requestedStartLine: number
  requestedEndLine: number
  checkedEndLine: number
  fileLength: number
  expectedHash: string
  currentHash: string
}): string {
  const lines = [
    'replace_range rejected: the target range is stale; expectedHash does not match the current file contents.',
    `Requested lines: ${params.requestedStartLine}-${params.requestedEndLine}.`,
  ]

  const reReadEndLine = Math.min(params.requestedEndLine, params.fileLength)
  if (params.checkedEndLine !== params.requestedEndLine) {
    lines.push(
      `Checked current lines: ${params.requestedStartLine}-${params.checkedEndLine} because the requested endLine is beyond the current file length.`,
      `Use endLine <= ${params.fileLength} when re-reading; do not include a trailing phantom line beyond the visible file length.`,
    )
  }

  lines.push(
    `Current file length: ${params.fileLength} lines.`,
    `Expected hash from caller: ${params.expectedHash}.`,
    `Current hash for requested range: ${params.currentHash}.`,
    'Recovery: discard any old expectedHash/rangeHash and re-read this path with a visible line span first.',
    `Re-read with read_files ranges: [{ path: "${params.relativePath}", startLine: ${params.requestedStartLine}, endLine: ${reReadEndLine} }] and use the new rangeHash as expectedHash.`,
    'Retry replace_range only if the fresh read shows the selected range still contains the intended target.',
    'If the fresh read shows the target moved, re-read a wider nearby range or use str_replace/rewrite_symbol with fresh context.',
  )

  return lines.join('\n')
}

export async function replaceRange(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'replace_range'>> {
  const input = parseReplaceRangeParams(params.parameters)
  if (!input) {
    return errorResult('', 'Missing or invalid replace_range parameters.')
  }

  const resolvedPath = resolveFilePathWithinProject(params.cwd, input.path)
  if (!resolvedPath) {
    return errorResult(input.path, 'file path is outside the project directory')
  }

  const { fullPath, relativePath } = resolvedPath
  if (input.startLine < 1 || input.endLine < input.startLine) {
    return errorResult(relativePath, 'startLine must be >= 1 and <= endLine')
  }

  let oldContent: string
  try {
    oldContent = await params.fs.readFile(fullPath, 'utf-8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : null

    return errorResult(
      relativePath,
      code ? `replace_range failed with ${code}: ${message}` : message,
    )
  }

  const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizedOldContent = normalizeLineEndings(oldContent)
  const lines = normalizedOldContent.split('\n')
  const displayLineCount = getDisplayLineCount(lines, normalizedOldContent)

  if (input.startLine > displayLineCount) {
    return errorResult(
      relativePath,
      `replace_range rejected: startLine ${input.startLine} is beyond the current file length (${displayLineCount} lines). Re-read the target range before editing.`,
    )
  }

  const endLine = Math.min(input.endLine, displayLineCount)
  const currentRange = lines.slice(input.startLine - 1, endLine).join('\n')
  const currentHash = getRangeContentHash(currentRange)
  if (currentHash !== input.expectedHash) {
    return errorResult(
      relativePath,
      buildStaleRangeError({
        relativePath,
        requestedStartLine: input.startLine,
        requestedEndLine: input.endLine,
        checkedEndLine: endLine,
        fileLength: displayLineCount,
        expectedHash: input.expectedHash,
        currentHash,
      }),
    )
  }

  const normalizedNewContent = normalizeLineEndings(input.newContent)
  if (currentRange === normalizedNewContent) {
    return errorResult(
      relativePath,
      'replace_range rejected: newContent is identical to the current range; no change was made.',
    )
  }

  const updatedLines = [
    ...lines.slice(0, input.startLine - 1),
    ...normalizedNewContent.split('\n'),
    ...lines.slice(endLine),
  ]
  const updatedContent = updatedLines.join('\n').replaceAll('\n', lineEnding)
  await params.fs.writeFile(fullPath, updatedContent)

  let patch = createPatch(relativePath, oldContent, updatedContent)
  const patchLines = patch.split('\n')
  const hunkStartIndex = patchLines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = patchLines.slice(hunkStartIndex).join('\n')
  }

  return [
    {
      type: 'json',
      value: {
        file: relativePath,
        message: `Replaced lines ${input.startLine}-${endLine} successfully.`,
        patch,
      },
    },
  ]
}
