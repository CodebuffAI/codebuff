import { createHash } from 'crypto'

import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import { isFileIgnored } from '@codebuff/common/project-file-tree'

import { resolveFilePathWithinProject } from './path-utils'

import type { FileLineRange } from '@codebuff/common/types/contracts/client'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

export type FileFilterResult = {
  status: 'blocked' | 'allow-example' | 'allow'
}

export type FileFilter = (filePath: string) => FileFilterResult

export type { FileLineRange }

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

function getContentHash(content: string): string {
  return `sha256:${createHash('sha256').update(normalizeLineEndings(content)).digest('hex')}`
}

export async function getFiles(params: {
  filePaths: string[]
  cwd: string
  fs: CodebuffFileSystem
  /**
   * Filter to classify files before reading.
   * If provided, the caller takes full control of filtering (no gitignore check).
   * If not provided, the SDK applies gitignore checking automatically.
   */
  fileFilter?: FileFilter
  /**
   * Optional per-file 1-indexed inclusive line ranges. Each entry reads only
   * the requested slice of the file. Range reads are additive: they never
   * affect the plain `filePaths` reads (which keep their byte-for-byte
   * behavior), and if a path appears in both, the ranged value wins.
   */
  ranges?: FileLineRange[]
}) {
  const { filePaths, cwd, fs, fileFilter, ranges } = params
  // If caller provides a filter, they own all filtering decisions
  // If not, SDK applies default gitignore checking
  const hasCustomFilter = fileFilter !== undefined

  const result: Record<string, string | null> = {}
  const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB - skip reading entirely
  const MAX_CHARS = 100_000 // 100k characters threshold
  const numFmt = new Intl.NumberFormat('en-US')
  const fmtNum = (n: number) => numFmt.format(n)

  /**
   * Reads a single file, applying the same resolve -> filter -> gitignore ->
   * stat -> read pipeline used for every read. Returns either the file content
   * or a FILE_READ_STATUS marker keyed by `relativePath`. The 100k truncation
   * is NOT applied here so callers can slice/truncate as appropriate.
   */
  const readOne = async (
    filePath: string,
  ): Promise<{
    relativePath: string
    content?: string
    status?: string
    isExampleFile: boolean
  } | null> => {
    if (!filePath) {
      return null
    }

    const resolvedPath = resolveFilePathWithinProject(cwd, filePath)
    if (!resolvedPath) {
      return {
        relativePath: filePath,
        status: FILE_READ_STATUS.OUTSIDE_PROJECT,
        isExampleFile: false,
      }
    }
    const { relativePath, fullPath } = resolvedPath

    // Apply file filter if provided
    const filterResult = fileFilter?.(relativePath)
    if (filterResult?.status === 'blocked') {
      return {
        relativePath,
        status: FILE_READ_STATUS.IGNORED,
        isExampleFile: false,
      }
    }
    const isExampleFile = filterResult?.status === 'allow-example'

    // If no custom filter provided, apply default gitignore checking
    // (allow-example files skip gitignore since they need to bypass .env.* patterns)
    if (!hasCustomFilter && !isExampleFile) {
      const ignored = await isFileIgnored({
        filePath: relativePath,
        projectRoot: cwd,
        fs,
      })
      if (ignored) {
        return { relativePath, status: FILE_READ_STATUS.IGNORED, isExampleFile }
      }
    }

    try {
      // Safety check: skip reading files over 10MB to avoid OOM
      const stats = await fs.stat(fullPath)
      if (stats.size > MAX_FILE_BYTES) {
        return {
          relativePath,
          status:
            FILE_READ_STATUS.TOO_LARGE +
            ` [${(stats.size / (1024 * 1024)).toFixed(1)}MB exceeds 10MB limit. Use code_search or glob to find specific content, then read exact sections with read_files.ranges.]`,
          isExampleFile,
        }
      }

      const content = await fs.readFile(fullPath, 'utf8')
      return { relativePath, content, isExampleFile }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return { relativePath, status: FILE_READ_STATUS.DOES_NOT_EXIST, isExampleFile }
      }
      return { relativePath, status: FILE_READ_STATUS.ERROR, isExampleFile }
    }
  }

  // Loop 1: plain whole-file reads (unchanged behavior).
  for (const filePath of filePaths) {
    const read = await readOne(filePath)
    if (!read) {
      continue
    }
    const { relativePath, content, status, isExampleFile } = read
    if (content === undefined) {
      result[relativePath] = status ?? FILE_READ_STATUS.ERROR
      continue
    }

    if (content.length > MAX_CHARS) {
      const truncated = content.slice(0, MAX_CHARS)
      result[relativePath] =
        truncated +
        '\n\n[FILE_TOO_LARGE: This file is ' +
        fmtNum(content.length) +
        ' chars, exceeding the ' +
        fmtNum(MAX_CHARS) +
        ' char limit. The content above has been truncated. Re-read specific sections with read_files using the ranges parameter, e.g. ranges: [{ path: "' +
        relativePath +
        '", startLine, endLine }]. Do not edit from this truncated content. Large-file edits require basedOnRead from fresh range read headers: startLine, endLine, and rangeHash. For patch edits, include one basedOnRead read cap per touched hunk.]'
    } else {
      // Prepend TEMPLATE marker for example files
      result[relativePath] = isExampleFile
        ? FILE_READ_STATUS.TEMPLATE + '\n' + content
        : content
    }
  }

  // Loop 2: ranged reads. Additive; if a path appears in both, the ranged
  // value wins (it's the more specific request).
  for (const range of ranges ?? []) {
    const read = await readOne(range.path)
    if (!read) {
      continue
    }
    const { relativePath, content, status } = read
    if (content === undefined) {
      result[relativePath] = status ?? FILE_READ_STATUS.ERROR
      continue
    }

    const lines = content.split('\n')
    const totalLines = lines.length
    const start = Math.max(1, range.startLine ?? 1)
    const end = Math.min(totalLines, range.endLine ?? totalLines)

    if (start > totalLines || end < start) {
      result[relativePath] =
        `[Requested lines ${start}-${range.endLine ?? totalLines} but file has only ${fmtNum(totalLines)} lines.]`
      continue
    }

    const slice = lines.slice(start - 1, end).join('\n')
    const rangeHash = getContentHash(slice)
    const header = `[Lines ${start}-${end} of ${fmtNum(totalLines)} in ${relativePath}; rangeHash=${rangeHash}]\n`
    let body = slice
    if (body.length > MAX_CHARS) {
      body =
        body.slice(0, MAX_CHARS) +
        '\n\n[FILE_TOO_LARGE: This range is ' +
        fmtNum(slice.length) +
        ' chars, exceeding the ' +
        fmtNum(MAX_CHARS) +
        ' char limit. Request a smaller line range before editing; do not edit from this truncated range.]'
    }
    result[relativePath] = header + body
  }

  return result
}
