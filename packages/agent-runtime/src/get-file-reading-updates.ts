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

function legacyValueForPath(
  result: LegacyReadFilesMap,
  path: string,
): string | null | undefined {
  if (path in result) return result[path]
  return undefined
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

  for (let requestIndex = 0; requestIndex < filePaths.length; requestIndex++) {
    const path = filePaths[requestIndex]!
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
          'rangeHash=omitted; readCapability=omitted; request a smaller range before editing',
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
          (expected.selector !== 'range' ||
            (result.selector === 'range' &&
              result.status !== 'error' &&
              result.startLine === Math.max(1, expected.range.startLine ?? 1) &&
              result.endLine <=
                (expected.range.endLine ?? Number.MAX_SAFE_INTEGER)))
        )
      })
    if (matchesRequest) return loadedFiles
    return buildReadFilesResultV1(
      expectedSelectors.map((selector, requestIndex) => ({
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
      })),
    )
  }
  return normalizeLegacyReadFilesResult({
    result: loadedFiles,
    filePaths: requestedFiles,
    ranges,
  })
}
