import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import { isFileIgnored } from '@codebuff/common/project-file-tree'

import { getContentHash, normalizeLineEndings } from '@codebuff/common/util/content-hash'
import { resolveFilePathWithinProject } from './path-utils'

import type { FileLineRange } from '@codebuff/common/types/contracts/client'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

export type FileFilterResult = {
  status: 'blocked' | 'allow-example' | 'allow'
}

export type FileFilter = (filePath: string) => FileFilterResult

export type { FileLineRange }

// normalizeLineEndings + getContentHash are now imported from
// @codebuff/common/util/content-hash (canonical shared implementation).

// Mints a single opaque capability token that self-encodes the range and its
// hash. str_replace decodes and re-validates this statelessly, so the model
// copies ONE value instead of three coupled fields. Keep this format in sync
// with decodeReadCapabilityToken in process-str-replace.ts.
function encodeReadCapabilityToken(
  startLine: number,
  endLine: number,
  rangeHash: string,
): string {
  return (
    'cap.' +
    Buffer.from(`${startLine}:${endLine}:${rangeHash}`).toString('base64url')
  )
}

// 10MB - skip reading entirely to avoid OOM.
const MAX_FILE_BYTES = 10 * 1024 * 1024

type ReadOneFileResult = {
  relativePath: string
  content?: string
  status?: string
  isExampleFile: boolean
}

/**
 * Reads a single file, applying the resolve -> filter -> gitignore -> stat ->
 * read pipeline. Returns either the full file content or a FILE_READ_STATUS
 * marker keyed by `relativePath`. The 100k truncation is NOT applied here so
 * callers can slice/truncate as appropriate (or read full content for editing).
 */
async function readOneFile(params: {
  filePath: string
  cwd: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
}): Promise<ReadOneFileResult | null> {
  const { filePath, cwd, fs, fileFilter } = params
  const hasCustomFilter = fileFilter !== undefined

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
      return {
        relativePath,
        status: FILE_READ_STATUS.DOES_NOT_EXIST,
        isExampleFile,
      }
    }
    return { relativePath, status: FILE_READ_STATUS.ERROR, isExampleFile }
  }
}

/**
 * Returns the FULL, untruncated content of a single file (or null when it does
 * not exist / is blocked / errored). This is the correct source of truth for
 * file-editing tools (str_replace / write_file / apply_patch): the regular
 * `getFiles` rendering truncates large files at 100k chars for the model, which
 * would corrupt edit validation (e.g. reporting far fewer lines than the file
 * actually has and rejecting valid basedOnRead anchors).
 */
export async function getFileForEdit(params: {
  filePath: string
  cwd: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
}): Promise<string | null> {
  const read = await readOneFile(params)
  if (!read) {
    return null
  }
  if (read.content === undefined) {
    return read.status ?? FILE_READ_STATUS.ERROR
  }
  return read.content
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

  const result: Record<string, string | null> = {}
  const wholeFileReadPaths = new Set<string>()
  const MAX_CHARS = 100_000 // 100k characters threshold
  const numFmt = new Intl.NumberFormat('en-US')
  const fmtNum = (n: number) => numFmt.format(n)

  const readOne = (filePath: string) =>
    readOneFile({ filePath, cwd, fs, fileFilter })

  // Concurrently read all requested whole files and ranges. File I/O is
  // independent across paths, so we run them in parallel via Promise.all and
  // reassemble results in input order (index-aligned) to preserve the
  // existing output contract. Each result is rendered into `result` in input
  // order so ranged reads that share a path with a whole-file read still
  // concatenate deterministically.
  const rangeList = ranges ?? []
  const [wholeResults, rangeResults] = await Promise.all([
    Promise.all(filePaths.map((filePath) => readOne(filePath))),
    Promise.all(rangeList.map((range) => readOne(range.path))),
  ])

  // Render whole-file reads in input order (unchanged behavior).
  for (const read of wholeResults) {
    if (!read) {
      continue
    }
    const { relativePath, content, status, isExampleFile } = read
    wholeFileReadPaths.add(relativePath)
    if (content === undefined) {
      result[relativePath] = status ?? FILE_READ_STATUS.ERROR
      continue
    }

    if (content.length > MAX_CHARS) {
      const truncated = content.slice(0, MAX_CHARS)
      const totalLines = content.split('\n').length
      result[relativePath] =
        truncated +
        '\n\n[FILE_TOO_LARGE: This file is ' +
        fmtNum(content.length) +
        ' chars (' +
        fmtNum(totalLines) +
        ' lines), exceeding the ' +
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
  // Render ranged reads in input order. Additive; if a path appears in both,
  // the ranged value wins (it's the more specific request). Multiple ranges
  // for the same file are concatenated instead of overwriting each other so
  // every requested range header/hash remains visible to the caller.
  for (let i = 0; i < rangeList.length; i++) {
    const range = rangeList[i]
    const read = rangeResults[i]
    if (!read) {
      continue
    }
    const { relativePath, content, status } = read
    if (content === undefined) {
      const renderedStatus = status ?? FILE_READ_STATUS.ERROR
      result[relativePath] = result[relativePath]
        ? `${result[relativePath]}\n\n${renderedStatus}`
        : renderedStatus
      continue
    }

    const lines = content.split('\n')
    const totalLines = lines.length
    const start = Math.max(1, range.startLine ?? 1)
    const end = Math.min(totalLines, range.endLine ?? totalLines)

    let renderedRange: string
    if (start > totalLines || end < start) {
      renderedRange = `[Requested lines ${start}-${range.endLine ?? totalLines} but file has only ${fmtNum(totalLines)} lines.]`
    } else {
      const slice = lines.slice(start - 1, end).join('\n')
      const rangeHash = getContentHash(slice)
      const readCapability = encodeReadCapabilityToken(start, end, rangeHash)
      // Surface a copy-safe edit snippet right under the header so the model
      // can paste the exact basedOnRead value into a str_replace replacement
      // without re-deriving startLine/endLine/hash (the historical source of
      // mispaired/stale anchors). The oldString should be copied from the
      // range body immediately below this snippet.
      const editSnippet = [
        '[Copy-safe str_replace replacement template:',
        '  {',
        '    oldString: <copy exact text from the range body below>,',
        '    newString: <replacement text>,',
        '    allowMultiple: false,',
        `    basedOnRead: "${readCapability}",`,
        '  }',
        ']\n',
      ].join('\n')
      const header = `[Lines ${start}-${end} of ${fmtNum(totalLines)} in ${relativePath}; rangeHash=${rangeHash}; readCapability=${readCapability}]\n${editSnippet}`
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
      renderedRange = header + body
    }

    const existing = result[relativePath]
    const shouldReplaceWholeFileRead =
      wholeFileReadPaths.has(relativePath) && !isRenderedRangeResult(existing)
    result[relativePath] =
      existing && !shouldReplaceWholeFileRead
        ? `${existing}\n\n${renderedRange}`
        : renderedRange
  }

  return result
}

function isRenderedRangeResult(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('[Lines ')
}
