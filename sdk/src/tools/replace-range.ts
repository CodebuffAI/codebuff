import { replaceRangeParams } from '@codebuff/common/tools/params/tool/replace-range'
import {
  decodeReadCapabilityToken,
  getContentHash,
  normalizeLineEndings,
  readCapabilityMatchesScope,
} from '@codebuff/common/util/content-hash'
import { resolveFilePathForFileSystemOperation } from './path-utils'
import { changeFile } from './change-file'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { ReadCapabilityIssuer } from '@codebuff/common/util/content-hash'
import type { FileFilter } from './read-files'
import type { FilesystemAuthorityPolicy } from './filesystem-authority'

function errorResult(
  file: string,
  errorMessage: string,
): CodebuffToolOutput<'replace_range'> {
  return [{ type: 'json', value: { file, errorMessage } }]
}

function getDisplayLineCount(
  lines: string[],
  normalizedContent: string,
): number {
  if (normalizedContent.length === 0) return 0
  return lines.at(-1) === '' ? lines.length - 1 : lines.length
}

export async function replaceRange(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
  capabilityIssuer: ReadCapabilityIssuer
  signal?: AbortSignal
  fileFilter?: FileFilter
  callId?: string
  filesystemPolicy?: FilesystemAuthorityPolicy
}): Promise<CodebuffToolOutput<'replace_range'>> {
  const parsed = replaceRangeParams.inputSchema.safeParse(params.parameters)
  if (!parsed.success) {
    return errorResult('', 'Missing or invalid replace_range parameters.')
  }
  const input = parsed.data

  const resolvedPath = await resolveFilePathForFileSystemOperation(
    params.cwd,
    input.path,
    params.fs,
  )
  if (!resolvedPath) {
    return errorResult(input.path, 'file path is outside the project directory')
  }

  const { operationPath: fullPath, relativePath } = resolvedPath
  const decoded = decodeReadCapabilityToken(input.readCapability)
  if (
    typeof decoded === 'string' ||
    !readCapabilityMatchesScope(decoded, {
      ...params.capabilityIssuer,
      path: relativePath,
    })
  ) {
    return errorResult(
      relativePath,
      typeof decoded === 'string'
        ? decoded
        : `replace_range blocked: the readCapability belongs to a different project, path, or agent run. Re-read ${relativePath} in this run and copy its cap.v3 token.`,
    )
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

  if (
    input.capabilityStartLine > lines.length ||
    input.capabilityEndLine > lines.length
  ) {
    return errorResult(
      relativePath,
      `replace_range rejected: the capability-covered range ${input.capabilityStartLine}-${input.capabilityEndLine} is beyond the current file length (${displayLineCount} lines). Re-read the target range before editing.`,
    )
  }

  if (input.startLine > lines.length || input.endLine > lines.length) {
    return errorResult(
      relativePath,
      `replace_range rejected: the target range ${input.startLine}-${input.endLine} is beyond the current file length (${displayLineCount} lines). Re-read the target range before editing.`,
    )
  }

  const capabilityContent = lines
    .slice(input.capabilityStartLine - 1, input.capabilityEndLine)
    .join('\n')
  if (getContentHash(capabilityContent) !== input.capabilityHash) {
    return errorResult(
      relativePath,
      `replace_range rejected: ${relativePath} changed after the readCapability was issued. Re-read the exact target in this run and retry with the fresh cap.v3 token.`,
    )
  }

  const currentRange = lines.slice(input.startLine - 1, input.endLine).join('\n')
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
    ...lines.slice(input.endLine),
  ]
  const updatedContent = updatedLines.join('\n').replaceAll('\n', lineEnding)
  return changeFile({
    parameters: {
      type: 'file',
      path: relativePath,
      content: updatedContent,
      expectedHash: getContentHash(oldContent),
    },
    cwd: params.cwd,
    fs: params.fs,
    signal: params.signal,
    fileFilter: params.fileFilter,
    callId: params.callId,
    filesystemPolicy: params.filesystemPolicy,
    capabilityIssuer: params.capabilityIssuer,
  }) as Promise<CodebuffToolOutput<'replace_range'>>
}
