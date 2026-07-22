import {
  buildReadFilesResultV1,
  isReadFilesResultV1,
} from '@codebuff/common/tools/results/filesystem'

import type { ReadFilesResultV1 } from '@codebuff/common/tools/results/filesystem'
import type {
  FileLineRange,
  RequestFilesFn,
} from '@codebuff/common/types/contracts/client'
import type { ReadCapabilityIssuer } from '@codebuff/common/util/content-hash'

function sanitizePartialRangeContent(content: string): string {
  const headerEnd = content.indexOf('\n')
  const header = headerEnd === -1 ? content : content.slice(0, headerEnd)
  if (!header.startsWith('[RANGE_BLOCK ')) return content

  const sanitizedHeader = header.replace(
    /;\s*(?:rangeHash|readCapability|preferred block edit: replace_range|scoped str_replace: basedOnRead)\b[^\]]*(?=\])/, 
    '; rangeHash=omitted',
  )
  return headerEnd === -1
    ? sanitizedHeader
    : sanitizedHeader + content.slice(headerEnd)
}

export async function getFileReadingUpdates(params: {
  requestFiles: RequestFilesFn
  requestedFiles: string[]
  ranges?: FileLineRange[]
  capabilityIssuer?: ReadCapabilityIssuer
}): Promise<ReadFilesResultV1> {
  const { requestFiles, requestedFiles, ranges = [], capabilityIssuer } = params
  const loadedFiles: unknown = await requestFiles({
    filePaths: requestedFiles,
    ranges,
    ...(capabilityIssuer ? { capabilityIssuer } : {}),
  })
  const expectedSelectors = [
    ...requestedFiles.map((path) => ({ selector: 'file' as const, path })),
    ...ranges.map((range) => ({
      selector: 'range' as const,
      path: range.path,
      range,
    })),
  ]
  if (isReadFilesResultV1(loadedFiles)) {
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
    if (matchesRequest) {
      return {
        ...loadedFiles,
        results: loadedFiles.results.map((result) =>
          result.selector === 'range' &&
          result.status === 'partial' &&
          typeof result.content === 'string'
            ? {
                ...result,
                content: sanitizePartialRangeContent(result.content),
              }
            : result,
        ),
      }
    }
  }

  return buildReadFilesResultV1(
    expectedSelectors.map((selector, requestIndex) => {
      const returned = isReadFilesResultV1(loadedFiles)
        ? loadedFiles.results[requestIndex]
        : undefined
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
            'The structured read_files response was malformed or did not match the requested selector index, kind, or path. No read authorization was granted.',
          retryable: true,
          recovery: 'read_again' as const,
        },
      }
    }),
  )
}

