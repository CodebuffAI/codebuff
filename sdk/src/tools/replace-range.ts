import { createHash } from 'crypto'

import { createPatch } from 'diff'

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

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

export function getRangeContentHash(content: string): string {
  return `sha256:${createHash('sha256').update(normalizeLineEndings(content)).digest('hex')}`
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

  try {
    const oldContent = await params.fs.readFile(fullPath, 'utf-8')
    const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'
    const normalizedOldContent = normalizeLineEndings(oldContent)
    const lines = normalizedOldContent.split('\n')

    if (input.startLine > lines.length) {
      return errorResult(
        relativePath,
        `replace_range rejected: startLine ${input.startLine} is beyond the current file length (${lines.length} lines). Re-read the target range before editing.`,
      )
    }

    const endLine = Math.min(input.endLine, lines.length)
    const currentRange = lines.slice(input.startLine - 1, endLine).join('\n')
    const currentHash = getRangeContentHash(currentRange)
    if (currentHash !== input.expectedHash) {
      return errorResult(
        relativePath,
        [
          'replace_range rejected: the target range is stale.',
          `Expected ${input.expectedHash} for lines ${input.startLine}-${input.endLine}, but current hash is ${currentHash}.`,
          `Re-read with read_files ranges: [{ path: "${relativePath}", startLine: ${input.startLine}, endLine: ${input.endLine} }] and retry with the new rangeHash.`,
        ].join('\n'),
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
  } catch (error) {
    return errorResult(
      relativePath,
      error instanceof Error ? error.message : String(error),
    )
  }
}
