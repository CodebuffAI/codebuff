import { FILE_READ_STATUS } from '@codebuff/common/constants/paths'
import {
  buildReadFilesResultV1,
  isReadFilesResultV1,
} from '@codebuff/common/tools/results/filesystem'

import type {
  FilesystemError,
  ReadFilesItemV1,
  ReadFilesResultV1,
} from '@codebuff/common/tools/results/filesystem'
import type {
  FileLineRange,
  LegacyReadFilesMap,
  RequestFilesFn,
} from '@codebuff/common/types/contracts/client'
import type { ReadCapabilityIssuer } from '@codebuff/common/util/content-hash'

const RANGE_BLOCK_MARKER = '[RANGE_BLOCK '

function legacyReadError(
  value: string | null | undefined,
): FilesystemError | null {
  if (value === null || value === undefined) {
    return {
      code: 'not_found',
      message: FILE_READ_STATUS.DOES_NOT_EXIST,
      retryable: true,
      recovery: 'discover_path',
    }
  }
  const trimmed = value.trim()
  if (trimmed.startsWith(FILE_READ_STATUS.DOES_NOT_EXIST)) {
    return {
      code: 'not_found',
      message: value,
      retryable: true,
      recovery: 'discover_path',
    }
  }
  if (trimmed.startsWith(FILE_READ_STATUS.IGNORED)) {
    return { code: 'blocked', message: value, retryable: false }
  }
  if (trimmed.startsWith(FILE_READ_STATUS.OUTSIDE_PROJECT)) {
    return { code: 'outside_project', message: value, retryable: false }
  }
  if (trimmed.startsWith(FILE_READ_STATUS.TOO_LARGE)) {
    return {
      code: 'too_large',
      message: value,
      retryable: true,
      recovery: 'read_smaller_range',
    }
  }
  if (trimmed.startsWith(FILE_READ_STATUS.ERROR)) {
    return {
      code: 'io_error',
      message: value,
      retryable: true,
      recovery: 'read_again',
    }
  }
  return null
}

// Adversarial-input guard for legacy path-keyed results: the map is an
// untrusted plain object whose keys are attacker-influenced file paths.
// Only own-enumerable properties may satisfy a lookup — an `in` check (or a
// bare index) would resolve through the prototype chain, so a requested path
// colliding with a prototype member name (e.g. "constructor", "toString",
// "hasOwnProperty", "__proto__") would read an inherited function/object as
// file content. Non-string values are equally untrusted and treated as
// missing so normalization fails closed to not_found.
function legacyValueForPath(
  result: LegacyReadFilesMap,
  path: string,
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(result, path)) return undefined
  const value = result[path]
  return typeof value === 'string' ? value : undefined
}

function splitLegacyRangeBlocks(value: string): string[] {
  if (!value.includes(RANGE_BLOCK_MARKER)) return [value]
  return value
    .split(/\n\n(?=\[RANGE_BLOCK )/)
    .filter((part) => part.startsWith(RANGE_BLOCK_MARKER))
}

function normalizeLegacyReadFilesResult(params: {
  result: LegacyReadFilesMap
  filePaths: string[]
  ranges: FileLineRange[]
}): ReadFilesResultV1 {
  const { result, filePaths, ranges } = params
  const items: ReadFilesItemV1[] = []
  const rangeIndexByPath = new Map<string, number>()
  // Adversarial-input guard: a legacy path-keyed map stores exactly one value
  // per path, so it cannot safely correlate a batch that requests a whole
  // file AND one or more ranges for the same path — whichever selector reads
  // the shared value second would silently consume content minted for the
  // other selector shape (e.g. a range block leaking into a whole-file item,
  // or whole-file content leaking into a range item). Fail closed for every
  // selector on that path instead of guessing.
  const ambiguousLegacyPaths = new Set(
    filePaths.filter((path) =>
      ranges.some((range) => range.path === path),
    ),
  )

  for (let requestIndex = 0; requestIndex < filePaths.length; requestIndex++) {
    const path = filePaths[requestIndex]!
    if (ambiguousLegacyPaths.has(path)) {
      items.push({
        selector: 'file',
        requestIndex,
        path,
        status: 'error',
        error: {
          code: 'invalid_request',
          message:
            'Legacy path-keyed read_files results cannot safely correlate a whole-file read and range reads for the same path. Request the file and its ranges in separate batches.',
          retryable: true,
          recovery: 'read_again',
        },
      })
      continue
    }
    const value = legacyValueForPath(result, path)
    const error = legacyReadError(value)
    if (error) {
      items.push({
        selector: 'file',
        requestIndex,
        path,
        status: 'error',
        error,
      })
      continue
    }
    const content = value ?? ''
    if (content.startsWith(RANGE_BLOCK_MARKER)) {
      items.push({
        selector: 'file',
        requestIndex,
        path,
        status: 'error',
        error: {
          code: 'invalid_request',
          message:
            'A legacy read_files result replaced the requested whole-file content with a range block. Re-read the whole file separately before using whole-file authorization.',
          retryable: true,
          recovery: 'read_again',
        },
      })
      continue
    }
    const template = content.startsWith(FILE_READ_STATUS.TEMPLATE)
    const renderedContent = template
      ? content.slice(FILE_READ_STATUS.TEMPLATE.length).replace(/^\n/, '')
      : content
    const partial = renderedContent.includes('[FILE_TOO_LARGE:')
    items.push({
      selector: 'file',
      requestIndex,
      path,
      status: partial ? 'partial' : 'ok',
      content: renderedContent,
      complete: !partial,
      template,
      ...(partial
        ? { truncation: { reason: 'character_limit' as const } }
        : {}),
    })
  }

  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index]!
    const requestIndex = filePaths.length + index
    if (ambiguousLegacyPaths.has(range.path)) {
      items.push({
        selector: 'range',
        requestIndex,
        path: range.path,
        status: 'error',
        error: {
          code: 'invalid_request',
          message:
            'Legacy path-keyed read_files results cannot safely correlate a whole-file read and range reads for the same path. Request the file and its ranges in separate batches.',
          retryable: true,
          recovery: 'read_again',
        },
      })
      continue
    }
    const value = legacyValueForPath(result, range.path)
    const error = legacyReadError(value)
    if (error) {
      items.push({
        selector: 'range',
        requestIndex,
        path: range.path,
        status: 'error',
        error,
      })
      continue
    }
    const blocks = splitLegacyRangeBlocks(value ?? '')
    const pathRangeIndex = rangeIndexByPath.get(range.path) ?? 0
    rangeIndexByPath.set(range.path, pathRangeIndex + 1)
    const content = blocks[pathRangeIndex] ?? blocks.at(-1) ?? ''
    if (content.startsWith(`${RANGE_BLOCK_MARKER}requested lines`)) {
      items.push({
        selector: 'range',
        requestIndex,
        path: range.path,
        status: 'error',
        error: {
          code: 'invalid_request',
          message: content,
          retryable: true,
          recovery: 'read_smaller_range',
        },
      })
      continue
    }
    const header = content.match(
      /^\[RANGE_BLOCK lines (\d+)-(\d+) of ([\d,]+).*?rangeHash=([^;\]]+); readCapability=([^;\]]+)/,
    )
    const startLine = Number(header?.[1] ?? range.startLine ?? 1)
    const endLine = Number(header?.[2] ?? range.endLine ?? startLine)
    const totalLines = Number((header?.[3] ?? '0').replaceAll(',', ''))
    const partial = content.includes('[FILE_TOO_LARGE:')
    const structuredContent = partial
      ? content.replace(
          /rangeHash=[^;\]]+; readCapability=[^;\]]+;[^\]]*/,
          'rangeHash=omitted; readCapability=omitted; NO edit capability or read authorization was minted by this truncated read — request a smaller, fully-covered range before editing to obtain a fresh basedOnRead capability',
        )
      : content
    items.push({
      selector: 'range',
      requestIndex,
      path: range.path,
      status: partial ? 'partial' : 'ok',
      content: structuredContent,
      startLine,
      endLine,
      totalLines,
      complete: !partial,
      ...(!partial && header?.[4] ? { rangeHash: header[4] } : {}),
      ...(!partial && header?.[5] ? { readCapability: header[5] } : {}),
      ...(partial
        ? { truncation: { reason: 'character_limit' as const } }
        : {}),
    })
  }

  return buildReadFilesResultV1(items)
}

export async function getFileReadingUpdates(params: {
  requestFiles: RequestFilesFn
  requestedFiles: string[]
  ranges?: FileLineRange[]
  capabilityIssuer?: ReadCapabilityIssuer
}): Promise<ReadFilesResultV1> {
  const { requestFiles, requestedFiles, ranges = [], capabilityIssuer } = params
  const loadedFiles = await requestFiles({
    filePaths: requestedFiles,
    ranges,
    ...(capabilityIssuer ? { capabilityIssuer } : {}),
  })
  if (isReadFilesResultV1(loadedFiles)) {
    const expectedSelectors = [
      ...requestedFiles.map((path) => ({ selector: 'file' as const, path })),
      ...ranges.map((range) => ({
        selector: 'range' as const,
        path: range.path,
        range,
      })),
    ]
    const matchesRequest =
      loadedFiles.results.length === expectedSelectors.length &&
      loadedFiles.results.every((result, requestIndex) => {
        const expected = expectedSelectors[requestIndex]
        return (
          expected !== undefined &&
          result.requestIndex === requestIndex &&
          result.selector === expected.selector &&
          result.path === expected.path &&
          // Keep range correlation aligned with the SDK's
          // overrideRangeMatchesRequest (sdk/src/tools/read-files.ts): a
          // clamped/partial range is trusted when it starts at the requested
          // line and ends at-or-before the requested end; a complete range
          // must land exactly on the end clamped to the file's total lines.
          // Genuine range errors (e.g. not_found) skip bounds validation so
          // they do not cause the entire every() to return false, which would
          // discard correctly-matching non-error items in the same batch.
          (expected.selector !== 'range' ||
            (result.selector === 'range' &&
              (result.status === 'error' ||
                (result.startLine ===
                  Math.max(1, expected.range.startLine ?? 1) &&
                  result.endLine <=
                    (expected.range.endLine ?? result.totalLines) &&
                  (!result.complete ||
                    result.endLine ===
                      Math.min(
                        expected.range.endLine ?? result.totalLines,
                        result.totalLines,
                      ))))))
        )
      })
    if (matchesRequest) return loadedFiles
    // Fail closed on a mismatched structured v1 response: the runtime could
    // not correlate the batch to its requested selectors, so no item may
    // mint read authorization. Preserve per-item diagnostics where they are
    // genuine: when the returned item at a requested index individually
    // matches its selector and is itself an error, keep that real error
    // (e.g. not_found / blocked) instead of masking it with the blanket
    // mismatch message. Every other selector — mismatched, missing, or a
    // non-error item in an untrusted batch — is forced to a fail-closed
    // invalid_request error so no content or capability survives to grant
    // authorization downstream.
    return buildReadFilesResultV1(
      expectedSelectors.map((selector, requestIndex) => {
        const returned = loadedFiles.results[requestIndex]
        if (
          returned &&
          returned.requestIndex === requestIndex &&
          returned.selector === selector.selector &&
          returned.path === selector.path &&
          returned.status === 'error'
        ) {
          return returned
        }
        return {
          selector: selector.selector,
          path: selector.path,
          requestIndex,
          status: 'error' as const,
          error: {
            code: 'invalid_request' as const,
            message:
              'The structured read_files response did not match the requested selector index, kind, or path. No read authorization was granted.',
            retryable: true,
            recovery: 'read_again' as const,
          },
        }
      }),
    )
  }
  return normalizeLegacyReadFilesResult({
    result: loadedFiles,
    filePaths: requestedFiles,
    ranges,
  })
}
