import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import { isFileIgnored } from '@codebuff/common/project-file-tree'

import {
  getContentHash,
  normalizeLineEndings,
  encodeReadCapabilityToken,
} from '@codebuff/common/util/content-hash'
import { resolveFilePathWithinProject } from './path-utils'

import type { FileLineRange } from '@codebuff/common/types/contracts/client'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

export type FileFilterResult = {
  status: 'blocked' | 'allow-example' | 'allow'
}

export type FileFilter = (filePath: string) => FileFilterResult

export type { FileLineRange }

// 10MB - skip reading entirely to avoid OOM.
const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Stable structured marker prefixed onto every rendered range-read result.
 * Consumers detect rendered ranges by checking this prefix rather than the
 * human-readable header text (which is allowed to change). Designed to never
 * collide with normal source content.
 */
export const RANGE_BLOCK_MARKER = '[RANGE_BLOCK '

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

/**
 * Render `lines[startIdx..endIdx]` (0-indexed inclusive) with right-aligned
 * 1-indexed line-number prefixes (`cat -n` style), where the column width is
 * derived from `maxLineForWidth` so prefixes line up across the rendered slice.
 */
function renderWithLinePrefixes(
  lines: string[],
  startIdx: number,
  endIdx: number,
  maxLineForWidth: number,
): string {
  const width = String(maxLineForWidth).length
  const out: string[] = []
  for (let i = startIdx; i <= endIdx; i++) {
    const lineNum = String(i + 1).padStart(width, ' ')
    out.push(`${lineNum}\t${lines[i] ?? ''}`)
  }
  return out.join('\n')
}

/**
 * Pick how many head/tail lines to keep for a too-large whole-file read so
 * that the total rendered budget stays under `maxChars`. Walks line-by-line
 * from each end and stops once adding the next line would blow the budget.
 * Reserves ~60% of the budget for the head and ~40% for the tail so model
 * context is biased toward the top of the file (imports/types/exports).
 */
function pickHeadTailLines(
  lines: string[],
  maxChars: number,
): { headEnd: number; tailStart: number } {
  const headBudget = Math.floor(maxChars * 0.6)
  const tailBudget = maxChars - headBudget
  let headChars = 0
  let headEnd = -1
  for (let i = 0; i < lines.length; i++) {
    const add = (lines[i]?.length ?? 0) + 1
    if (headChars + add > headBudget) break
    headChars += add
    headEnd = i
  }
  let tailChars = 0
  let tailStart = lines.length
  for (let i = lines.length - 1; i > headEnd; i--) {
    const add = (lines[i]?.length ?? 0) + 1
    if (tailChars + add > tailBudget) break
    tailChars += add
    tailStart = i
  }
  return { headEnd, tailStart }
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
      // Intelligent head+tail truncation: keep the top of the file (imports,
      // types, exports) AND the bottom (often the entry point / trailing
      // exports), with a clear truncation marker between them naming the
      // omitted line range. Line-number prefixes let the model spot exactly
      // which lines it has and which it does not.
      const lines = content.split('\n')
      const totalLines = lines.length
      const { headEnd, tailStart } = pickHeadTailLines(lines, MAX_CHARS)

      let rendered: string
      if (headEnd < 0 || tailStart > totalLines - 1 || tailStart <= headEnd + 1) {
        // Degenerate cases (e.g. one massive line). Fall back to a head-only
        // truncation with a single TRUNCATED marker and no line prefixes,
        // since prefix alignment is meaningless for a single huge line.
        rendered =
          content.slice(0, MAX_CHARS) +
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
        const head = renderWithLinePrefixes(lines, 0, headEnd, totalLines)
        const tail = renderWithLinePrefixes(
          lines,
          tailStart,
          totalLines - 1,
          totalLines,
        )
        const omittedStart = headEnd + 2 // 1-indexed first omitted line
        const omittedEnd = tailStart // 1-indexed last omitted line (tailStart is 0-indexed, so tailStart+1-1)
        const omittedCount = omittedEnd - omittedStart + 1
        rendered =
          head +
          '\n\n[FILE_TOO_LARGE: This file is ' +
          fmtNum(content.length) +
          ' chars (' +
          fmtNum(totalLines) +
          ' lines), exceeding the ' +
          fmtNum(MAX_CHARS) +
          ' char limit. Omitted lines ' +
          fmtNum(omittedStart) +
          '-' +
          fmtNum(omittedEnd) +
          ' (' +
          fmtNum(omittedCount) +
          ' lines). Re-read specific sections with read_files using the ranges parameter, e.g. ranges: [{ path: "' +
          relativePath +
          '", startLine, endLine }]. Do not edit from this truncated content. Large-file edits require basedOnRead from fresh range read headers: startLine, endLine, and rangeHash.]\n\n' +
          tail
      }

      result[relativePath] = rendered
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
      renderedRange = `${RANGE_BLOCK_MARKER}requested lines ${start}-${range.endLine ?? totalLines} but file ${relativePath} has only ${fmtNum(totalLines)} lines.]`
    } else {
      const slice = lines.slice(start - 1, end).join('\n')
      const rangeHash = getContentHash(slice)
      const readCapability = encodeReadCapabilityToken({
        startLine: start,
        endLine: end,
        hash: rangeHash,
      })
      // Single-line header with the readCapability inline so the model can
      // copy ONE value into `basedOnRead` instead of a 9-line copy-safe
      // template (which historically padded the read with format noise and
      // increased mispairs). The structured marker `[RANGE_BLOCK ` is a
      // stable prefix consumers can detect without parsing the header text.
      const header =
        `${RANGE_BLOCK_MARKER}lines ${start}-${end} of ${fmtNum(totalLines)} in ${relativePath}; rangeHash=${rangeHash}; readCapability=${readCapability}; ` +
        `for str_replace pass basedOnRead: "${readCapability}"]\n`
      // cat -n style numbered body — line numbers reflect the file's actual
      // 1-indexed lines so the model can refer to lines directly without
      // re-deriving them from the range header.
      let body = renderWithLinePrefixes(lines, start - 1, end - 1, end)
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

/**
 * Identifies a rendered range-read result by the stable structured marker
 * prefix. Use this instead of fragile header-text substring checks so the
 * human-readable portion of the header can evolve without breaking consumers.
 */
export function isRenderedRangeResult(
  value: string | null | undefined,
): boolean {
  return typeof value === 'string' && value.startsWith(RANGE_BLOCK_MARKER)
}
