import {
  buildReadFilesResultV1,
  type ReadFilesItemV1,
} from '@codebuff/common/tools/results/filesystem'
import {
  encodeReadCapabilityToken,
  getContentHash,
  normalizeLineEndings,
} from '@codebuff/common/util/content-hash'
import { jsonToolResult } from '@codebuff/common/util/messages'

import {
  formatUnsafeToolPathError,
  grantWholeFileReadAuthorization,
  normalizeToolPath,
} from './write-file'
import { clearEditRereadRequirement } from './edit-read-state'
import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { extractSlices } from '../../../structural-read'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type ToolName = 'read_files'

const CHANGED_SINCE_LAST_READ_MARKER =
  '[NOTE — changed since last read: you have already edited this file in the current turn. The content below reflects the CURRENT post-edit state; line numbers may have shifted from any earlier read of this path. Anchor your next edit on THIS read.]'

export const handleReadFiles = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>
    requestOptionalFile: RequestOptionalFileFn

    fileContext: ProjectFileContext
    fileProcessingState: FileProcessingState
  } & ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    requestOptionalFile,
    fileContext,
    fileProcessingState,
  } = params
  const pathInputs = toolCall.input.paths ?? []
  const rangeInputs = toolCall.input.ranges ?? []
  const symbolInputs = toolCall.input.symbols ?? []
  const allSelectors = [
    ...pathInputs.map((path, requestIndex) => ({
      selector: 'file' as const,
      requestIndex,
      path,
    })),
    ...rangeInputs.map((range, index) => ({
      selector: 'range' as const,
      requestIndex: pathInputs.length + index,
      path: range.path,
    })),
    ...symbolInputs.map((symbol, index) => ({
      selector: 'symbols' as const,
      requestIndex: pathInputs.length + rangeInputs.length + index,
      path: symbol.path,
    })),
  ]
  const invalidSelector = allSelectors.find(
    (selector) => !normalizeToolPath(selector.path),
  )
  if (invalidSelector) {
    const results: ReadFilesItemV1[] = allSelectors.map((selector) => ({
      selector: selector.selector,
      requestIndex: selector.requestIndex,
      path: selector.path,
      status: 'error',
      error:
        selector === invalidSelector
          ? {
              code: 'outside_project',
              message: formatUnsafeToolPathError('read_files', selector.path),
              retryable: false,
            }
          : {
              code: 'invalid_request',
              message: `read_files batch was not executed because selector ${invalidSelector.requestIndex} has an unsafe path.`,
              retryable: true,
            },
    }))
    return {
      output: jsonToolResult(
        buildReadFilesResultV1(results),
      ) as CodebuffToolOutput<ToolName>,
    }
  }

  const paths = pathInputs.map(normalizeToolPath)
  const ranges = rangeInputs.map((range) => ({
    ...range,
    path: normalizeToolPath(range.path),
  }))
  const symbolRequests = symbolInputs.map((entry) => ({
    path: normalizeToolPath(entry.path),
    names: entry.names,
  }))

  await previousToolCallFinished

  const requestedPaths = new Set([
    ...paths,
    ...ranges.map((range) => range.path),
    ...symbolRequests.map((entry) => entry.path),
  ])
  const editedSinceLastRead = new Set<string>()
  for (const path of requestedPaths) {
    if ((fileProcessingState.promisesByPath[path]?.length ?? 0) > 0) {
      editedSinceLastRead.add(path)
    }
  }

  const fileReadResult = await getFileReadingUpdates({
    ...params,
    requestedFiles: paths,
    ranges,
  })
  const fileResults = fileReadResult.results.map((result) => {
    if (result.selector !== 'file' || result.status === 'error') return result
    const completeReadCapability =
      result.complete && typeof result.content === 'string'
        ? encodeReadCapabilityToken({
            startLine: 1,
            endLine: normalizeLineEndings(result.content).split('\n').length,
            hash: getContentHash(result.content),
          })
        : undefined
    const refs = fileContext.tokenCallers?.[result.path]
    return {
      ...result,
      ...(completeReadCapability
        ? { readCapability: completeReadCapability }
        : {}),
      ...(refs && Object.keys(refs).length > 0 ? { referencedBy: refs } : {}),
    }
  })

  const successfulReadPaths = new Set(
    fileResults
      .filter((result) => result.status !== 'error')
      .map((result) => result.path),
  )

  for (const path of successfulReadPaths) {
    clearEditRereadRequirement(fileProcessingState, path)
    delete fileProcessingState.promisesByPath[path]
  }

  if (fileProcessingState.strictReadBeforeEdit) {
    for (const result of fileResults) {
      if (
        result.selector === 'file' &&
        result.status === 'ok' &&
        result.complete &&
        typeof result.content === 'string'
      ) {
        grantWholeFileReadAuthorization(
          fileProcessingState,
          result.path,
          result.content,
        )
      }
    }
  }

  const renderedFileResults = fileResults.map((result) => {
    if (
      result.status !== 'error' &&
      result.selector !== 'symbols' &&
      typeof result.content === 'string' &&
      editedSinceLastRead.has(result.path)
    ) {
      return {
        ...result,
        content: `${CHANGED_SINCE_LAST_READ_MARKER}\n${result.content}`,
      }
    }
    return result
  })

  const symbolResults: ReadFilesItemV1[] = []
  for (let index = 0; index < symbolRequests.length; index++) {
    const request = symbolRequests[index]!
    const requestIndex = paths.length + ranges.length + index
    let rawContent: string | null
    try {
      rawContent = await requestOptionalFile({
        ...params,
        filePath: request.path,
      })
    } catch (error) {
      symbolResults.push({
        selector: 'symbols',
        requestIndex,
        path: request.path,
        status: 'error',
        error: classifyOptionalReadError(error),
      })
      continue
    }
    if (rawContent === null) {
      symbolResults.push({
        selector: 'symbols',
        requestIndex,
        path: request.path,
        status: 'error',
        error: {
          code: 'not_found',
          message: `File does not exist: ${request.path}`,
          retryable: true,
          recovery: 'discover_path',
        },
      })
      continue
    }

    const slices = await extractSlices(rawContent, request.path, request.names)
    const foundSymbols = new Set(slices.map((slice) => slice.symbol))
    const missingSymbols = request.names.filter(
      (name) => !foundSymbols.has(name),
    )
    if (slices.length === 0) {
      symbolResults.push({
        selector: 'symbols',
        requestIndex,
        path: request.path,
        status: 'error',
        error: {
          code: 'no_match',
          message: `None of the requested symbols were found in ${request.path}: ${request.names.join(', ')}`,
          retryable: true,
          recovery: 'choose_symbol',
        },
      })
      continue
    }

    successfulReadPaths.add(request.path)
    clearEditRereadRequirement(fileProcessingState, request.path)
    delete fileProcessingState.promisesByPath[request.path]
    const slicesTooLarge =
      slices.reduce((total, slice) => total + slice.content.length, 0) > 100_000
    symbolResults.push({
      selector: 'symbols',
      requestIndex,
      path: request.path,
      status: missingSymbols.length > 0 || slicesTooLarge ? 'partial' : 'ok',
      requestedSymbols: request.names,
      missingSymbols,
      ...(slicesTooLarge
        ? { slicesOmittedForLength: true as const }
        : { slices }),
    })
  }

  return {
    output: jsonToolResult(
      buildReadFilesResultV1([...renderedFileResults, ...symbolResults]),
    ),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function classifyOptionalReadError(error: unknown): {
  code:
    | 'blocked'
    | 'binary'
    | 'unsupported_encoding'
    | 'too_large'
    | 'io_error'
    | 'cancelled'
  message: string
  retryable: boolean
  recovery?:
    | 'read_again'
    | 'read_smaller_range'
    | 'use_supported_encoding'
    | 'retry'
} {
  const message = error instanceof Error ? error.message : String(error)
  if (/\bblocked\b/i.test(message)) {
    return { code: 'blocked', message, retryable: false }
  }
  if (/\bbinary\b/i.test(message)) {
    return { code: 'binary', message, retryable: false }
  }
  if (/unsupported_encoding|not valid UTF-8/i.test(message)) {
    return {
      code: 'unsupported_encoding',
      message,
      retryable: false,
      recovery: 'use_supported_encoding',
    }
  }
  if (/too_large|complete editable snapshot/i.test(message)) {
    return {
      code: 'too_large',
      message,
      retryable: true,
      recovery: 'read_smaller_range',
    }
  }
  if (/abort|cancel/i.test(message)) {
    return { code: 'cancelled', message, retryable: true, recovery: 'retry' }
  }
  return { code: 'io_error', message, retryable: true, recovery: 'read_again' }
}
