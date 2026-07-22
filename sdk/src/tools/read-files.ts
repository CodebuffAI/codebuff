import path from 'node:path'

import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import {
  buildReadFilesResultV1,
  isReadFilesResultV1,
  type FilesystemError,
  type ReadFilesItemV1,
  type ReadFilesResultV1,
} from '@codebuff/common/tools/results/filesystem'
import {
  encodeReadCapabilityToken,
  getContentHash,
  normalizeLineEndings,
} from '@codebuff/common/util/content-hash'
import {
  isEnvTemplatePath,
  isMandatorySensitiveReadPath,
} from '@codebuff/common/util/sensitive-paths'

import {
  isSafeProjectRelativePath,
  resolveFilePathForFileSystemOperation,
} from './path-utils'

import type { FileLineRange } from '@codebuff/common/types/contracts/client'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { ReadCapabilityIssuer } from '@codebuff/common/util/content-hash'

export type FileFilterResult = {
  status: 'blocked' | 'allow-example' | 'allow'
}

export type FileFilter = (filePath: string) => FileFilterResult

export type { FileLineRange }

export const READ_SNAPSHOT_CONCURRENCY = 8
export const MAX_RANGE_READ_BYTES = 1_048_576

const MAX_FILE_BYTES = 10 * 1024 * 1024
// The 10MB byte gate (MAX_FILE_BYTES) is now the single read ceiling: any file
// that passes it renders fully (whole-file and range reads) so reviewers and
// agents can read and attest to large source files. content.length is a
// UTF-16 code-unit count that is always <= the file's byte size, so equating
// the char render cap to the byte gate means "never truncate on characters
// below the 10MB byte ceiling."
const MAX_RENDER_CHARS = MAX_FILE_BYTES
const numFmt = new Intl.NumberFormat('en-US')

/** Stable marker for rendered range reads. */
export const RANGE_BLOCK_MARKER = '[RANGE_BLOCK '

const BINARY_MARKER = '[FILE_BINARY]'
const UNSUPPORTED_ENCODING_MARKER = '[FILE_UNSUPPORTED_ENCODING]'

type AuthorizedReadTarget = {
  displayPath: string
  operationPath: string
  isExampleFile: boolean
}

type ResolvedReadTarget =
  | { ok: true; target: AuthorizedReadTarget }
  | { ok: false; displayPath: string; error: FilesystemError }

type PlannedSelector =
  | {
      selector: 'file'
      requestIndex: number
      requestedPath: string
      resolved: ResolvedReadTarget
    }
  | {
      selector: 'range'
      requestIndex: number
      requestedPath: string
      range: FileLineRange
      resolved: ResolvedReadTarget
    }

type FullSnapshot = {
  state: 'full'
  content: string
  sizeBytes: number
}

type RangeWindow = {
  content: string
  startLine: number
  endLine: number
  totalLines: number
  complete: boolean
}

type LargeSnapshot = {
  state: 'large'
  sizeBytes: number
  windows?: Map<number, RangeWindow>
  rangeErrors?: Map<number, FilesystemError>
}

type FailedSnapshot = {
  state: 'error'
  error: FilesystemError
}

type ReadSnapshot = FullSnapshot | LargeSnapshot | FailedSnapshot

export type OptionalFileReadResult =
  | {
      status: 'found'
      path: string
      content: string
      template: boolean
    }
  | {
      status:
        | 'not_found'
        | 'blocked'
        | 'outside_project'
        | 'too_large'
        | 'io_error'
        | 'binary'
        | 'unsupported_encoding'
      path: string
      error: FilesystemError
    }

function filesystemError(
  code: FilesystemError['code'],
  message: string,
  options: Pick<FilesystemError, 'retryable' | 'recovery'>,
): FilesystemError {
  return { code, message, ...options }
}

function toPortablePath(value: string): string {
  return value.split(path.sep).join('/').replace(/^\.\//, '')
}

export { isMandatorySensitiveReadPath }

function uniquePolicyAliases(...values: string[]): string[] {
  const aliases = new Set<string>()
  for (const value of values) {
    const portable = toPortablePath(value)
    aliases.add(portable)
    aliases.add(portable.toLowerCase())
  }
  return [...aliases]
}

async function authorizeReadTarget(params: {
  requestedPath: string
  cwd: string
  canonicalRoot: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
}): Promise<ResolvedReadTarget> {
  const { requestedPath, cwd, canonicalRoot, fs, fileFilter } = params
  if (!isSafeProjectRelativePath(requestedPath)) {
    return {
      ok: false,
      displayPath: requestedPath,
      error: filesystemError(
        'outside_project',
        FILE_READ_STATUS.OUTSIDE_PROJECT,
        { retryable: false },
      ),
    }
  }

  const resolved = await resolveFilePathForFileSystemOperation(
    cwd,
    requestedPath,
    fs,
  )
  if (!resolved) {
    return {
      ok: false,
      displayPath: requestedPath,
      error: filesystemError(
        'outside_project',
        FILE_READ_STATUS.OUTSIDE_PROJECT,
        { retryable: false },
      ),
    }
  }

  const canonicalRelative = path.relative(canonicalRoot, resolved.operationPath)
  const aliases = uniquePolicyAliases(
    resolved.relativePath,
    canonicalRelative || resolved.relativePath,
  )
  if (aliases.some(isMandatorySensitiveReadPath)) {
    return {
      ok: false,
      displayPath: resolved.relativePath,
      error: filesystemError('blocked', FILE_READ_STATUS.IGNORED, {
        retryable: false,
      }),
    }
  }

  const filterResults = fileFilter
    ? aliases.map((alias) => fileFilter(alias))
    : []
  if (filterResults.some((result) => result.status === 'blocked')) {
    return {
      ok: false,
      displayPath: resolved.relativePath,
      error: filesystemError('blocked', FILE_READ_STATUS.IGNORED, {
        retryable: false,
      }),
    }
  }

  // Ignore files are a discovery preference, not an authorization boundary.
  // Explicit project-contained reads remain available; mandatory sensitive
  // paths and host filters above continue to fail closed.
  const isExampleFile =
    aliases.every(isEnvTemplatePath) &&
    filterResults.some((result) => result.status === 'allow-example')

  return {
    ok: true,
    target: {
      displayPath: resolved.relativePath,
      operationPath: resolved.operationPath,
      isExampleFile,
    },
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined
}

function toBytes(value: string | NodeJS.ArrayBufferView): Uint8Array {
  if (typeof value === 'string') return Buffer.from(value)
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

function decodeText(
  bytes: Uint8Array,
): { ok: true; content: string } | { ok: false; error: FilesystemError } {
  if (bytes.includes(0)) {
    return {
      ok: false,
      error: filesystemError(
        'binary',
        `${BINARY_MARKER} Binary content cannot be read with read_files.`,
        { retryable: false },
      ),
    }
  }
  if (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  ) {
    return {
      ok: false,
      error: filesystemError(
        'unsupported_encoding',
        `${UNSUPPORTED_ENCODING_MARKER} UTF-16 text is not supported by read_files.`,
        { retryable: false, recovery: 'use_supported_encoding' },
      ),
    }
  }
  try {
    return {
      ok: true,
      content: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    }
  } catch {
    return {
      ok: false,
      error: filesystemError(
        'unsupported_encoding',
        `${UNSUPPORTED_ENCODING_MARKER} The file is not valid UTF-8 text.`,
        { retryable: false, recovery: 'use_supported_encoding' },
      ),
    }
  }
}

async function readCanonicalSnapshot(params: {
  operationPath: string
  selectors: PlannedSelector[]
  fs: CodebuffFileSystem
  signal?: AbortSignal
}): Promise<ReadSnapshot> {
  const { operationPath, selectors, fs, signal } = params
  throwIfAborted(signal)
  let sizeBytes: number
  try {
    sizeBytes = (await fs.stat(operationPath)).size
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return {
        state: 'error',
        error: filesystemError('not_found', FILE_READ_STATUS.DOES_NOT_EXIST, {
          retryable: true,
          recovery: 'discover_path',
        }),
      }
    }
    return {
      state: 'error',
      error: filesystemError('io_error', FILE_READ_STATUS.ERROR, {
        retryable: true,
        recovery: 'read_again',
      }),
    }
  }

  if (sizeBytes > MAX_FILE_BYTES) {
    const ranges = selectors.filter(
      (selector): selector is Extract<PlannedSelector, { selector: 'range' }> =>
        selector.selector === 'range',
    )
    if (ranges.length === 0) return { state: 'large', sizeBytes }
    const readTextRange = fs.readTextRange
    if (!readTextRange) {
      return {
        state: 'large',
        sizeBytes,
        rangeErrors: new Map(
          ranges.map((selector) => [
            selector.requestIndex,
            filesystemError(
              'unsupported',
              'This filesystem does not advertise bounded text range reads for oversized files.',
              { retryable: false },
            ),
          ]),
        ),
      }
    }
    const windows = new Map<number, RangeWindow>()
    const rangeErrors = new Map<number, FilesystemError>()

    // Oversized selectors are independent bounded reads. This deliberately
    // avoids collapsing distant ranges into one min..max window whose byte
    // budget can be consumed entirely by the unrelated gap.
    for (const selector of ranges) {
      const startLine = Math.max(1, selector.range.startLine ?? 1)
      const endLine = selector.range.endLine ?? Number.MAX_SAFE_INTEGER
      try {
        throwIfAborted(signal)
        const range = await readTextRange.call(
          fs,
          operationPath,
          startLine,
          endLine,
          MAX_RANGE_READ_BYTES,
        )
        if (
          range.data.byteLength > MAX_RANGE_READ_BYTES ||
          range.startLine < 1 ||
          range.endLine < 0 ||
          range.endLine < range.startLine - 1 ||
          range.totalLines < range.endLine
        ) {
          rangeErrors.set(
            selector.requestIndex,
            filesystemError(
              'io_error',
              'The filesystem returned an invalid bounded text range result.',
              { retryable: true, recovery: 'read_again' },
            ),
          )
          continue
        }
        const decoded = decodeText(range.data)
        if (!decoded.ok) {
          rangeErrors.set(selector.requestIndex, decoded.error)
          continue
        }
        windows.set(selector.requestIndex, {
          ...range,
          content: decoded.content,
        })
      } catch (error) {
        rangeErrors.set(
          selector.requestIndex,
          errorCode(error) === 'ENOENT'
            ? filesystemError('not_found', FILE_READ_STATUS.DOES_NOT_EXIST, {
                retryable: true,
                recovery: 'discover_path',
              })
            : filesystemError('io_error', FILE_READ_STATUS.ERROR, {
                retryable: true,
                recovery: 'read_again',
              }),
        )
      }
    }
    return { state: 'large', sizeBytes, windows, rangeErrors }
  }

  try {
    throwIfAborted(signal)
    const bytes = toBytes(await fs.readFile(operationPath))
    if (bytes.byteLength > MAX_FILE_BYTES) {
      return { state: 'large', sizeBytes: bytes.byteLength }
    }
    const decoded = decodeText(bytes)
    return decoded.ok
      ? { state: 'full', content: decoded.content, sizeBytes: bytes.byteLength }
      : { state: 'error', error: decoded.error }
  } catch (error) {
    return {
      state: 'error',
      error:
        errorCode(error) === 'ENOENT'
          ? filesystemError('not_found', FILE_READ_STATUS.DOES_NOT_EXIST, {
              retryable: true,
              recovery: 'discover_path',
            })
          : filesystemError('io_error', FILE_READ_STATUS.ERROR, {
              retryable: true,
              recovery: 'read_again',
            }),
    }
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        throwIfAborted(signal)
        const index = nextIndex++
        results[index] = await map(values[index]!, index)
      }
    }),
  )
  return results
}

async function planNativeReads(params: {
  filePaths: string[]
  ranges: FileLineRange[]
  cwd: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
  signal?: AbortSignal
}): Promise<{
  selectors: PlannedSelector[]
  snapshots: Map<string, ReadSnapshot>
}> {
  const { filePaths, ranges, cwd, fs, fileFilter, signal } = params
  throwIfAborted(signal)
  const requestedPaths = [
    ...new Set([...filePaths, ...ranges.map((range) => range.path)]),
  ]
  const root = await resolveFilePathForFileSystemOperation(cwd, '.', fs)
  const canonicalRoot = root?.operationPath ?? path.resolve(cwd)
  const resolvedValues = await mapWithConcurrency(
    requestedPaths,
    READ_SNAPSHOT_CONCURRENCY,
    (requestedPath) =>
      authorizeReadTarget({
        requestedPath,
        cwd,
        canonicalRoot,
        fs,
        fileFilter,
      }),
    signal,
  )
  const resolvedByPath = new Map(
    requestedPaths.map((requestedPath, index) => [
      requestedPath,
      resolvedValues[index]!,
    ]),
  )
  const selectors: PlannedSelector[] = [
    ...filePaths.map((requestedPath, requestIndex) => ({
      selector: 'file' as const,
      requestIndex,
      requestedPath,
      resolved: resolvedByPath.get(requestedPath)!,
    })),
    ...ranges.map((range, index) => ({
      selector: 'range' as const,
      requestIndex: filePaths.length + index,
      requestedPath: range.path,
      range,
      resolved: resolvedByPath.get(range.path)!,
    })),
  ]

  const groups = new Map<
    string,
    { operationPath: string; selectors: PlannedSelector[] }
  >()
  for (const selector of selectors) {
    if (!selector.resolved.ok) continue
    const { operationPath } = selector.resolved.target
    const group = groups.get(operationPath) ?? { operationPath, selectors: [] }
    group.selectors.push(selector)
    groups.set(operationPath, group)
  }
  const groupValues = [...groups.values()]
  const snapshots = await mapWithConcurrency(
    groupValues,
    READ_SNAPSHOT_CONCURRENCY,
    (group) => readCanonicalSnapshot({ ...group, fs, signal }),
    signal,
  )
  return {
    selectors,
    snapshots: new Map(
      groupValues.map((group, index) => [
        group.operationPath,
        snapshots[index]!,
      ]),
    ),
  }
}

function renderWithLinePrefixes(
  lines: string[],
  startIdx: number,
  endIdx: number,
  maxLineForWidth: number,
  lineOffset = 0,
): string {
  const width = String(maxLineForWidth).length
  const output: string[] = []
  for (let index = startIdx; index <= endIdx; index++) {
    const lineNumber = String(index + 1 + lineOffset).padStart(width, ' ')
    output.push(`${lineNumber}\t${lines[index] ?? ''}`)
  }
  return output.join('\n')
}

function splitVisibleLines(content: string): string[] {
  if (content.length === 0) return []
  const lines = normalizeLineEndings(content).split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

// Defensive/retained helper: only feeds the whole-file truncation branch
// above, which is unreachable while MAX_RENDER_CHARS === MAX_FILE_BYTES. Kept
// so it auto re-activates if MAX_RENDER_CHARS is ever lowered below the byte gate.
function pickHeadTailLines(
  lines: string[],
  maxChars: number,
): { headEnd: number; tailStart: number } {
  const headBudget = Math.floor(maxChars * 0.6)
  const tailBudget = maxChars - headBudget
  let headChars = 0
  let headEnd = -1
  for (let index = 0; index < lines.length; index++) {
    const added = (lines[index]?.length ?? 0) + 1
    if (headChars + added > headBudget) break
    headChars += added
    headEnd = index
  }
  let tailChars = 0
  let tailStart = lines.length
  for (let index = lines.length - 1; index > headEnd; index--) {
    const added = (lines[index]?.length ?? 0) + 1
    if (tailChars + added > tailBudget) break
    tailChars += added
    tailStart = index
  }
  return { headEnd, tailStart }
}

function errorItem(
  selector: PlannedSelector,
  pathValue: string,
  error: FilesystemError,
): ReadFilesItemV1 {
  return {
    selector: selector.selector,
    requestIndex: selector.requestIndex,
    path: pathValue,
    status: 'error',
    error,
  }
}

function renderWholeFileItem(
  selector: Extract<PlannedSelector, { selector: 'file' }>,
  snapshot: ReadSnapshot,
  capabilityIssuer?: ReadCapabilityIssuer,
): ReadFilesItemV1 {
  if (!selector.resolved.ok) {
    return errorItem(
      selector,
      selector.resolved.displayPath,
      selector.resolved.error,
    )
  }
  const { target } = selector.resolved
  if (snapshot.state === 'error') {
    return errorItem(selector, target.displayPath, snapshot.error)
  }
  if (snapshot.state === 'large') {
    return errorItem(
      selector,
      target.displayPath,
      filesystemError(
        'too_large',
        `${FILE_READ_STATUS.TOO_LARGE} [${(
          snapshot.sizeBytes /
          (1024 * 1024)
        ).toFixed(
          1,
        )}MB exceeds 10MB limit. Read an exact bounded range instead.]`,
        { retryable: true, recovery: 'read_smaller_range' },
      ),
    )
  }

  const { content } = snapshot
  const partial = content.length > MAX_RENDER_CHARS
  let renderedContent = content
  let truncation:
    | {
        reason: 'character_limit'
        omittedStartLine?: number
        omittedEndLine?: number
      }
    | undefined
  if (partial) {
    // Defensive/retained code: unreachable while MAX_RENDER_CHARS ===
    // MAX_FILE_BYTES, because content.length (UTF-16 code units) is always <=
    // the file's byte size, so a sub-10MB full snapshot never has
    // content.length > MAX_RENDER_CHARS. Kept intentionally so it auto
    // re-activates if MAX_RENDER_CHARS is ever lowered below the byte gate.
    const lines = splitVisibleLines(content)
    const totalLines = lines.length
    const { headEnd, tailStart } = pickHeadTailLines(lines, MAX_RENDER_CHARS)
    if (headEnd < 0 || tailStart > totalLines - 1 || tailStart <= headEnd + 1) {
      renderedContent = `${content.slice(0, MAX_RENDER_CHARS)}\n\n[FILE_TOO_LARGE: This file is ${numFmt.format(content.length)} chars (${numFmt.format(totalLines)} lines), exceeding the ${numFmt.format(MAX_RENDER_CHARS)} char limit. The content above has been truncated. Re-read specific sections with read_files using ranges: [{ path: "${target.displayPath}", startLine, endLine }]. Do not edit from this truncated content. Large-file edits require basedOnRead from fresh range reads.]`
      truncation = { reason: 'character_limit' }
    } else {
      const omittedStartLine = headEnd + 2
      const omittedEndLine = tailStart
      renderedContent = `${renderWithLinePrefixes(lines, 0, headEnd, totalLines)}\n\n[FILE_TOO_LARGE: This file is ${numFmt.format(content.length)} chars (${numFmt.format(totalLines)} lines), exceeding the ${numFmt.format(MAX_RENDER_CHARS)} char limit. Omitted lines ${numFmt.format(omittedStartLine)}-${numFmt.format(omittedEndLine)}. Re-read specific sections with read_files using ranges: [{ path: "${target.displayPath}", startLine, endLine }]. Do not edit from this truncated content. Large-file edits require basedOnRead from fresh range reads.]\n\n${renderWithLinePrefixes(lines, tailStart, totalLines - 1, totalLines)}`
      truncation = {
        reason: 'character_limit',
        omittedStartLine,
        omittedEndLine,
      }
    }
  }
  const contentHash = !partial ? getContentHash(content) : undefined
  const readCapability = contentHash
    ? encodeReadCapabilityToken({
        startLine: 1,
        endLine: normalizeLineEndings(content).split('\n').length,
        hash: contentHash,
        ...(capabilityIssuer
          ? {
              scope: {
                ...capabilityIssuer,
                path: target.displayPath,
              },
            }
          : {}),
      })
    : undefined
  return {
    selector: 'file',
    requestIndex: selector.requestIndex,
    path: target.displayPath,
    status: partial ? 'partial' : 'ok',
    content: renderedContent,
    complete: !partial,
    template: target.isExampleFile,
    ...(contentHash && readCapability
      ? {
          readCapability,
          editAnchor: {
            startLine: 1,
            endLine: normalizeLineEndings(content).split('\n').length,
            contentHash,
            readCapability,
          },
        }
      : {}),
    ...(truncation ? { truncation } : {}),
  }
}

function renderRangeItem(
  selector: Extract<PlannedSelector, { selector: 'range' }>,
  snapshot: ReadSnapshot,
  capabilityIssuer?: ReadCapabilityIssuer,
): ReadFilesItemV1 {
  if (!selector.resolved.ok) {
    return errorItem(
      selector,
      selector.resolved.displayPath,
      selector.resolved.error,
    )
  }
  const { target } = selector.resolved
  if (snapshot.state === 'error') {
    return errorItem(selector, target.displayPath, snapshot.error)
  }
  const largeWindow =
    snapshot.state === 'large'
      ? snapshot.windows?.get(selector.requestIndex)
      : undefined
  if (snapshot.state === 'large' && !largeWindow) {
    return errorItem(
      selector,
      target.displayPath,
      snapshot.rangeErrors?.get(selector.requestIndex) ??
        filesystemError(
          'unsupported',
          'Bounded range reading is unavailable for this oversized file.',
          { retryable: false },
        ),
    )
  }

  const fullContent = snapshot.state === 'full' ? snapshot.content : undefined
  const window = snapshot.state === 'large' ? largeWindow! : undefined
  const lines = splitVisibleLines(fullContent ?? window!.content)
  const totalLines =
    snapshot.state === 'full' ? lines.length : window!.totalLines
  const desiredStart = Math.max(1, selector.range.startLine ?? 1)
  const desiredEnd = Math.min(totalLines, selector.range.endLine ?? totalLines)
  if (desiredStart > totalLines || desiredEnd < desiredStart) {
    return errorItem(
      selector,
      target.displayPath,
      filesystemError(
        'invalid_request',
        `${RANGE_BLOCK_MARKER}requested lines ${desiredStart}-${selector.range.endLine ?? totalLines} but file ${target.displayPath} has only ${numFmt.format(totalLines)} lines.]`,
        { retryable: true, recovery: 'read_smaller_range' },
      ),
    )
  }

  const sourceStart = window?.startLine ?? 1
  const sourceEnd = window?.endLine ?? totalLines
  const returnedStart = Math.max(desiredStart, sourceStart)
  const returnedEnd = Math.min(desiredEnd, sourceEnd)
  if (returnedEnd < returnedStart) {
    return errorItem(
      selector,
      target.displayPath,
      filesystemError(
        'too_large',
        'The requested range was outside the bounded snapshot. Request a smaller range.',
        { retryable: true, recovery: 'read_smaller_range' },
      ),
    )
  }

  const startIndex = returnedStart - sourceStart
  const endIndex = returnedEnd - sourceStart
  const slice = lines.slice(startIndex, endIndex + 1).join('\n')
  let body = renderWithLinePrefixes(
    lines,
    startIndex,
    endIndex,
    returnedEnd,
    sourceStart - 1,
  )
  const covered = returnedStart === desiredStart && returnedEnd === desiredEnd
  const exceedsRenderLimit = body.length > MAX_RENDER_CHARS
  const complete = covered && !exceedsRenderLimit
  if (!complete) {
    body = `${body.slice(0, MAX_RENDER_CHARS)}\n\n[FILE_TOO_LARGE: This range exceeded a bounded read or render limit. Request a smaller line range before editing; do not edit from this truncated range.]`
  }
  const rangeHash = complete ? getContentHash(slice) : undefined
  const readCapability = rangeHash
    ? encodeReadCapabilityToken({
        startLine: desiredStart,
        endLine: desiredEnd,
        hash: rangeHash,
        ...(capabilityIssuer
          ? {
              scope: {
                ...capabilityIssuer,
                path: target.displayPath,
              },
            }
          : {}),
      })
    : undefined
  // When the range was read from a full-file snapshot (NOT an oversized
  // range-window read) AND the requested range is a proper subset of the file,
  // also mint a whole-file capability so the model can authorize further
  // sub-range edits without a re-read. The token is signed cap.v3 over the
  // ENTIRE current file content, minted under the same capabilityIssuer scope
  // as the range capability. SECURITY: never mint when capabilityIssuer is
  // undefined, never mint for 'large' (oversized) snapshots, and never mint
  // when the model could not have observed the whole file — i.e. when the
  // returned range body was clamped at the render limit (exceedsRenderLimit,
  // re-checked explicitly so a future refactor of `complete` cannot reopen
  // the hole) or when the full file itself exceeds the render limit. In each
  // of those cases the model has only seen a fragment, so a whole-file hash
  // would be a lie.
  const isFullFileSnapshot = snapshot.state === 'full'
  const requestedProperSubset = desiredStart > 1 || desiredEnd < totalLines
  const wholeFileReadCapability =
    complete &&
    !exceedsRenderLimit &&
    isFullFileSnapshot &&
    requestedProperSubset &&
    fullContent !== undefined &&
    fullContent.length <= MAX_RENDER_CHARS &&
    capabilityIssuer
      ? (() => {
          const wholeFileNormalized = normalizeLineEndings(fullContent)
          return encodeReadCapabilityToken({
            startLine: 1,
            endLine: wholeFileNormalized.split('\n').length,
            hash: getContentHash(wholeFileNormalized),
            scope: {
              ...capabilityIssuer,
              path: target.displayPath,
            },
          })
        })()
      : undefined
  // Range header: emitted as a single line so normalizeReadFilesOverrideResult's
  // regex still matches (lines N-M of X ... rangeHash=...; readCapability=...).
  // rangeHash and readCapability stay on that same line (separated by '; '),
  // followed by inline `preferred block edit:` and `scoped str_replace:`
  // guidance that repeats the readCapability for quick copy/paste.
  const header = complete
    ? `${RANGE_BLOCK_MARKER}lines ${desiredStart}-${desiredEnd} of ${numFmt.format(totalLines)} in ${target.displayPath}; rangeHash=${rangeHash}; readCapability=${readCapability}; preferred block edit: replace_range { readCapability: "${readCapability}", newContent: "..." }; scoped str_replace: basedOnRead="${readCapability}"]\n`
    : `${RANGE_BLOCK_MARKER}lines ${returnedStart}-${returnedEnd} of ${numFmt.format(totalLines)} in ${target.displayPath}; rangeHash=omitted; readCapability=omitted; NO edit capability or read authorization was minted by this truncated read — request a smaller, fully-covered range before editing to obtain a fresh basedOnRead capability]\n`
  return {
    selector: 'range',
    requestIndex: selector.requestIndex,
    path: target.displayPath,
    status: complete ? 'ok' : 'partial',
    content: header + body,
    ...(complete ? { sourceContent: slice } : {}),
    startLine: complete ? desiredStart : returnedStart,
    endLine: complete ? desiredEnd : returnedEnd,
    totalLines,
    complete,
    ...(rangeHash && readCapability
      ? {
          rangeHash,
          readCapability,
          editAnchor: {
            startLine: desiredStart,
            endLine: desiredEnd,
            contentHash: rangeHash,
            readCapability,
          },
        }
      : {}),
    ...(wholeFileReadCapability ? { wholeFileReadCapability } : {}),
    ...(!complete
      ? { truncation: { reason: 'character_limit' as const } }
      : {}),
  }
}

export async function getFilesStructured(params: {
  filePaths: string[]
  cwd: string
  fs: CodebuffFileSystem
  /** Custom policy composes with mandatory sensitive and ignore policy. */
  fileFilter?: FileFilter
  ranges?: FileLineRange[]
  signal?: AbortSignal
  capabilityIssuer?: ReadCapabilityIssuer
}): Promise<ReadFilesResultV1> {
  const {
    filePaths,
    cwd,
    fs,
    fileFilter,
    ranges = [],
    signal,
    capabilityIssuer,
  } = params
  const plan = await planNativeReads({
    filePaths,
    ranges,
    cwd,
    fs,
    fileFilter,
    signal,
  })
  const results = plan.selectors.map((selector) => {
    if (!selector.resolved.ok) {
      return errorItem(
        selector,
        selector.resolved.displayPath,
        selector.resolved.error,
      )
    }
    const snapshot = plan.snapshots.get(selector.resolved.target.operationPath)!
    return selector.selector === 'file'
      ? renderWholeFileItem(selector, snapshot, capabilityIssuer)
      : renderRangeItem(selector, snapshot, capabilityIssuer)
  })
  return buildReadFilesResultV1(results)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Operation aborted', 'AbortError')
}

function legacyErrorValue(error: FilesystemError): string {
  switch (error.code) {
    case 'not_found':
      return FILE_READ_STATUS.DOES_NOT_EXIST
    case 'blocked':
      return FILE_READ_STATUS.IGNORED
    case 'outside_project':
      return FILE_READ_STATUS.OUTSIDE_PROJECT
    case 'too_large':
    case 'unsupported':
      return `${FILE_READ_STATUS.TOO_LARGE} ${error.message}`
    default:
      return error.message === FILE_READ_STATUS.ERROR
        ? FILE_READ_STATUS.ERROR
        : `${FILE_READ_STATUS.ERROR} ${error.message}`
  }
}

export async function getFiles(
  params: Parameters<typeof getFilesStructured>[0],
): Promise<Record<string, string | null>> {
  const structured = await getFilesStructured({
    ...params,
    filePaths: params.filePaths.filter(Boolean),
    ranges: params.ranges?.filter((range) => Boolean(range.path)),
  })
  const result: Record<string, string | null> = {}
  const wholePaths = new Set<string>()
  for (const item of structured.results) {
    if (item.selector !== 'file') continue
    wholePaths.add(item.path)
    result[item.path] =
      item.status === 'error'
        ? legacyErrorValue(item.error)
        : item.template
          ? `${FILE_READ_STATUS.TEMPLATE}\n${item.content ?? ''}`
          : (item.content ?? '')
  }
  for (const item of structured.results) {
    if (item.selector !== 'range') continue
    const value =
      item.status === 'error'
        ? legacyErrorValue(item.error)
        : (item.content ?? '')
    const existing = result[item.path]
    const replaceWhole =
      wholePaths.has(item.path) && !isRenderedRangeResult(existing)
    result[item.path] =
      existing && !replaceWhole ? `${existing}\n\n${value}` : value
  }
  return result
}

export async function getFileForEditResult(params: {
  filePath: string
  cwd: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
}): Promise<OptionalFileReadResult> {
  const plan = await planNativeReads({
    filePaths: [params.filePath],
    ranges: [],
    cwd: params.cwd,
    fs: params.fs,
    fileFilter: params.fileFilter,
  })
  const selector = plan.selectors[0]!
  if (!selector.resolved.ok) {
    return {
      status: selector.resolved.error.code as Exclude<
        OptionalFileReadResult['status'],
        'found'
      >,
      path: selector.resolved.displayPath,
      error: selector.resolved.error,
    }
  }
  const snapshot = plan.snapshots.get(selector.resolved.target.operationPath)!
  if (snapshot.state !== 'full') {
    const error =
      snapshot.state === 'error'
        ? snapshot.error
        : filesystemError(
            'too_large',
            `${FILE_READ_STATUS.TOO_LARGE} Full-file editing is unavailable above 10MB.`,
            { retryable: true, recovery: 'read_smaller_range' },
          )
    return {
      status: error.code as Exclude<OptionalFileReadResult['status'], 'found'>,
      path: selector.resolved.target.displayPath,
      error,
    }
  }
  return {
    status: 'found',
    path: selector.resolved.target.displayPath,
    content: snapshot.content,
    template: selector.resolved.target.isExampleFile,
  }
}

/** Legacy optional-file adapter. Prefer getFileForEditResult for typed state. */
export async function getFileForEdit(
  params: Parameters<typeof getFileForEditResult>[0],
): Promise<string | null> {
  const result = await getFileForEditResult(params)
  return result.status === 'found'
    ? result.content
    : legacyErrorValue(result.error)
}

function legacyReadError(
  value: string | null | undefined,
): FilesystemError | null {
  if (value === null || value === undefined) {
    return filesystemError('not_found', FILE_READ_STATUS.DOES_NOT_EXIST, {
      retryable: true,
      recovery: 'discover_path',
    })
  }
  const trimmed = value.trim()
  if (trimmed.startsWith(FILE_READ_STATUS.DOES_NOT_EXIST)) {
    return filesystemError('not_found', value, {
      retryable: true,
      recovery: 'discover_path',
    })
  }
  if (trimmed.startsWith(FILE_READ_STATUS.IGNORED)) {
    return filesystemError('blocked', value, { retryable: false })
  }
  if (trimmed.startsWith(FILE_READ_STATUS.OUTSIDE_PROJECT)) {
    return filesystemError('outside_project', value, { retryable: false })
  }
  if (trimmed.startsWith(FILE_READ_STATUS.TOO_LARGE)) {
    return filesystemError('too_large', value, {
      retryable: true,
      recovery: 'read_smaller_range',
    })
  }
  if (trimmed.startsWith(BINARY_MARKER)) {
    return filesystemError('binary', value, { retryable: false })
  }
  if (trimmed.startsWith(UNSUPPORTED_ENCODING_MARKER)) {
    return filesystemError('unsupported_encoding', value, {
      retryable: false,
      recovery: 'use_supported_encoding',
    })
  }
  if (trimmed.startsWith(FILE_READ_STATUS.ERROR)) {
    return filesystemError('io_error', value, {
      retryable: true,
      recovery: 'read_again',
    })
  }
  return null
}

type ExpectedOverrideSelector =
  | { selector: 'file'; path: string }
  | { selector: 'range'; path: string; range: FileLineRange }

// Adversarial-input guard for legacy path-keyed overrides: the override
// result is an untrusted plain object whose keys are attacker-influenced file
// paths. Only own-enumerable properties may satisfy a lookup — a bare index
// would resolve through the prototype chain, so a requested path colliding
// with a prototype member name (e.g. "constructor", "toString",
// "hasOwnProperty", "__proto__") would read an inherited function/object as
// file content. Non-string values are equally untrusted and are normalized
// to null so legacyReadError fails closed to not_found.
function legacyOverrideValueForPath(
  raw: Record<string, string | null>,
  path: string,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(raw, path)) return null
  const value = raw[path]
  return typeof value === 'string' ? value : null
}

function overrideRangeMatchesRequest(
  item: ReadFilesItemV1,
  range: FileLineRange,
): boolean {
  if (item.selector !== 'range' || item.status === 'error') return false
  const requestedStart = Math.max(1, range.startLine ?? 1)
  const requestedEnd = range.endLine ?? item.totalLines
  const expectedEnd = Math.min(requestedEnd, item.totalLines)
  return (
    item.startLine === requestedStart &&
    item.endLine <= requestedEnd &&
    (!item.complete || item.endLine === expectedEnd)
  )
}

function missingOverrideItem(
  selector: ExpectedOverrideSelector,
  requestIndex: number,
  message = 'The read_files override did not return a result for the requested selector.',
): ReadFilesItemV1 {
  return {
    selector: selector.selector,
    requestIndex,
    path: selector.path,
    status: 'error',
    error: filesystemError('invalid_request', message, {
      retryable: true,
      recovery: 'read_again',
    }),
  }
}

export function normalizeReadFilesOverrideResult(params: {
  filePaths: string[]
  ranges?: FileLineRange[]
  raw: ReadFilesResultV1 | Record<string, string | null>
}): ReadFilesResultV1 {
  const { filePaths, ranges = [], raw } = params
  const selectors: ExpectedOverrideSelector[] = [
    ...filePaths.map((pathValue) => ({
      selector: 'file' as const,
      path: pathValue,
    })),
    ...ranges.map((range) => ({
      selector: 'range' as const,
      path: range.path,
      range,
    })),
  ]
  const results: ReadFilesItemV1[] = []

  if (isReadFilesResultV1(raw)) {
    const used = new Set<number>()
    for (
      let requestIndex = 0;
      requestIndex < selectors.length;
      requestIndex++
    ) {
      const selector = selectors[requestIndex]!
      let sourceIndex = requestIndex
      let item: ReadFilesItemV1 | undefined = raw.results[sourceIndex]
      if (
        !item ||
        item.selector !== selector.selector ||
        item.path !== selector.path ||
        (selector.selector === 'range' &&
          !overrideRangeMatchesRequest(item, selector.range) &&
          !(item.status === 'error')) ||
        used.has(sourceIndex)
      ) {
        sourceIndex = raw.results.findIndex(
          (candidate, index) =>
            !used.has(index) &&
            candidate.selector === selector.selector &&
            candidate.path === selector.path &&
            (selector.selector !== 'range' ||
              overrideRangeMatchesRequest(candidate, selector.range) ||
              candidate.status === 'error'),
        )
        item = sourceIndex >= 0 ? raw.results[sourceIndex] : undefined
      }
      if (!item) {
        results.push(missingOverrideItem(selector, requestIndex))
        continue
      }
      used.add(sourceIndex)
      results.push({ ...item, requestIndex })
    }
    return buildReadFilesResultV1(results)
  }

  for (let requestIndex = 0; requestIndex < selectors.length; requestIndex++) {
    const selector = selectors[requestIndex]!
    if (
      selector.selector === 'range' &&
      ranges.filter((range) => range.path === selector.path).length > 1
    ) {
      results.push(
        missingOverrideItem(
          selector,
          requestIndex,
          'Legacy path-keyed read_files overrides cannot safely correlate multiple ranges for the same path. Return structured-v1 results instead.',
        ),
      )
      continue
    }
    // A legacy path-keyed map stores one value per path, so it cannot
    // safely correlate a batch that requests a whole file AND a range for
    // the same path: the range selector would consume whole-file content (or
    // vice versa) under the wrong selector shape. (A range block in a
    // whole-file selector is already rejected by isRenderedRangeResult.)
    // Fail closed instead of guessing.
    if (
      selector.selector === 'range' &&
      filePaths.includes(selector.path)
    ) {
      results.push(
        missingOverrideItem(
          selector,
          requestIndex,
          'Legacy path-keyed read_files overrides cannot safely correlate a whole-file read and range reads for the same path. Return structured-v1 results instead.',
        ),
      )
      continue
    }
    const value = legacyOverrideValueForPath(raw, selector.path)
    const error = legacyReadError(value)
    if (error) {
      results.push({
        selector: selector.selector,
        requestIndex,
        path: selector.path,
        status: 'error',
        error,
      })
      continue
    }
    const content = value ?? ''
    if (selector.selector === 'file') {
      if (isRenderedRangeResult(content)) {
        results.push(
          missingOverrideItem(
            selector,
            requestIndex,
            'The legacy path-keyed override returned a range block for a whole-file selector.',
          ),
        )
        continue
      }
      const template = content.startsWith(FILE_READ_STATUS.TEMPLATE)
      const renderedContent = template
        ? content.slice(FILE_READ_STATUS.TEMPLATE.length).replace(/^\n/, '')
        : content
      const partial = renderedContent.includes('[FILE_TOO_LARGE:')
      results.push({
        selector: 'file',
        requestIndex,
        path: selector.path,
        status: partial ? 'partial' : 'ok',
        content: renderedContent,
        complete: !partial,
        template,
        ...(partial
          ? { truncation: { reason: 'character_limit' as const } }
          : {}),
      })
      continue
    }

    // The range header is a single line:
    // `[RANGE_BLOCK lines N-M of X in path; rangeHash=...; readCapability=...; preferred block edit: ...; scoped str_replace: ...]`.
    // `.*?` (dotall) skips ahead to the rangeHash/readCapability tokens, and
    // excluding \n from those capture groups keeps them from over-capturing
    // into the trailing guidance or the rendered body below the header.
    const header = content.match(
      /^\[RANGE_BLOCK lines (\d+)-(\d+) of ([\d,]+).*?rangeHash=([^;\]\n]+); readCapability=([^;\]\n]+)/s,
    )
    if (!header) {
      results.push(
        missingOverrideItem(
          selector,
          requestIndex,
          'The legacy read_files override did not return a valid range block for the requested range.',
        ),
      )
      continue
    }
    const partial =
      content.includes('[FILE_TOO_LARGE:') || header[4] === 'omitted'
    const startLine = Number(header[1])
    const endLine = Number(header[2])
    const requestedStart = Math.max(1, selector.range.startLine ?? 1)
    const requestedEnd = selector.range.endLine ?? Number.MAX_SAFE_INTEGER
    if (startLine !== requestedStart || endLine > requestedEnd) {
      results.push(
        missingOverrideItem(
          selector,
          requestIndex,
          'The legacy read_files override returned coordinates that do not match the requested range.',
        ),
      )
      continue
    }
    results.push({
      selector: 'range',
      requestIndex,
      path: selector.path,
      status: partial ? 'partial' : 'ok',
      content,
      startLine,
      endLine,
      totalLines: Number(header[3]!.replaceAll(',', '')),
      complete: !partial,
      ...(!partial ? { rangeHash: header[4], readCapability: header[5] } : {}),
      ...(partial
        ? { truncation: { reason: 'character_limit' as const } }
        : {}),
    })
  }
  return buildReadFilesResultV1(results)
}

/** v0 and v1 overrides keep one logical batch call and ordered adaptation. */
export async function getFilesStructuredFromOverride(params: {
  filePaths: string[]
  ranges?: FileLineRange[]
  override: (input: {
    filePaths: string[]
    ranges?: FileLineRange[]
  }) => Promise<ReadFilesResultV1 | Record<string, string | null>>
}): Promise<ReadFilesResultV1> {
  const { filePaths, ranges = [], override } = params
  const raw = await override({ filePaths, ranges })
  return normalizeReadFilesOverrideResult({ filePaths, ranges, raw })
}

export function isRenderedRangeResult(
  value: string | null | undefined,
): boolean {
  return typeof value === 'string' && value.startsWith(RANGE_BLOCK_MARKER)
}

export { legacyOverrideValueForPath }
