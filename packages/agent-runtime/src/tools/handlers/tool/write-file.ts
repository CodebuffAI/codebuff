import { AbortError } from '@codebuff/common/util/error'
import { getContentHash } from '@codebuff/common/util/content-hash'

import { coordinateEditApplication } from './edit-application-coordinator'
import {
  markEditRequiresFreshRead,
  strictEditAuthorizationError,
} from './edit-read-state'
import { processFileBlock } from '../../../process-file-block'
import {
  preflightValidateSyntax,
  formatPreflightErrorMessage,
} from '../../../util/preflight-syntax-validation'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  AgentState,
  EditRereadRequirement,
} from '@codebuff/common/types/session-state'

type FileProcessingTools =
  | 'write_file'
  | 'str_replace'
  | 'create_plan'
  | 'edit_transaction'
export type FileProcessing<
  T extends FileProcessingTools = FileProcessingTools,
> = {
  tool: T
  path: string
  toolCallId: string
  // Set when the error is a preflight syntax validation failure (not a
  // stale-anchor or processing failure). Hoisted to the base type so handlers
  // can check it on any result variant (the .catch() error branch produces a
  // different error shape without it). Handlers use this to avoid penalizing
  // the circuit breaker and forcing a re-read: the agent's anchor was valid
  // and the file content on disk is unchanged, so the agent only needs to fix
  // the syntax, not re-read the file.
  preflightSyntaxError?: boolean
} & (
  | {
      content: string
      patch?: string
      messages: string[]
      failedReplacementCount?: number
      expectedHash?: string | null
    }
  | {
      error: string
    }
)

export type FileProcessingState = {
  promisesByPath: Record<string, Promise<FileProcessing>[]>
  allPromises: Promise<FileProcessing>[]
  fileChangeErrors: Extract<FileProcessing, { error: string }>[]
  fileChanges: Exclude<FileProcessing, { error: string }>[]
  firstFileProcessed: boolean
  failedEditRequiresReadByPath: Record<string, boolean>
  // Fix C: per-path failure-budget circuit breaker. Counts str_replace errors,
  // auto-corrected near matches, and partial successes during the turn. Clean
  // raw successes do not erase the budget; confirmed structural recovery does.
  // After the limit, raw str_replace calls are blocked and the agent must use
  // rewrite_symbol, replace_range, or write_file.
  consecutiveStrReplaceFailuresByPath: Record<string, number>
  // Milestone 1: per-turn read-before-edit enforcement.
  // Existing-file edits require either a per-path read authorization
  // (registered by read_files in the same turn) or an edit-specific freshness
  // capability such as basedOnRead/expectedHash. New-file creation may proceed
  // without a prior read when the target path does not exist. These remain
  // optional so existing tests/callers that construct partial state objects keep
  // default legacy behavior unless the runtime initializes strict mode.
  strictReadBeforeEdit?: boolean
  // Per-turn read authorization. Populated by read_files (and by write_file on
  // a successful write) during a single LLM turn. Hydrated at the top of
  // processStream / runProgrammaticStep from the durable agentState map and
  // written back in their `finally` blocks, so a path read in turn N is
  // authorized for editing in turn N+1 without a redundant read_files
  // round-trip. See session-state.ts for the durable per-run registry and its
  // growth characteristics; this in-memory map shares the same shape and
  // similar per-turn bounds.
  readAuthorizationsByPath?: Record<string, true>
  readAuthorizationHashesByPath?: Record<string, string>
  /**
   * Whole-file authorizations that were visible before the current model
   * generation started. When present, strict edit checks use this snapshot
   * instead of reads completed later in the same streamed response.
   */
  modelVisibleReadAuthorizationHashesByPath?: Record<string, string>
  editRereadRequirementsByPath?: Record<string, EditRereadRequirement>
}

function getUsableWholeFileAuthorizationHash(
  state: Pick<
    FileProcessingState,
    | 'readAuthorizationsByPath'
    | 'readAuthorizationHashesByPath'
    | 'modelVisibleReadAuthorizationHashesByPath'
  >,
  path: string,
): string | undefined {
  if (state.modelVisibleReadAuthorizationHashesByPath !== undefined) {
    return state.modelVisibleReadAuthorizationHashesByPath[path]
  }
  return state.readAuthorizationsByPath?.[path] === true
    ? state.readAuthorizationHashesByPath?.[path]
    : undefined
}

export function hasWholeFileReadAuthorization(
  state: Pick<
    FileProcessingState,
    | 'readAuthorizationsByPath'
    | 'readAuthorizationHashesByPath'
    | 'modelVisibleReadAuthorizationHashesByPath'
  >,
  path: string,
): boolean {
  return typeof getUsableWholeFileAuthorizationHash(state, path) === 'string'
}

export function isWholeFileReadAuthorizationFresh(
  state: Pick<
    FileProcessingState,
    | 'readAuthorizationsByPath'
    | 'readAuthorizationHashesByPath'
    | 'modelVisibleReadAuthorizationHashesByPath'
  >,
  path: string,
  content: string,
): boolean {
  return (
    getUsableWholeFileAuthorizationHash(state, path) === getContentHash(content)
  )
}

export function grantWholeFileReadAuthorization(
  state: Pick<
    FileProcessingState,
    | 'readAuthorizationsByPath'
    | 'readAuthorizationHashesByPath'
    | 'modelVisibleReadAuthorizationHashesByPath'
  >,
  path: string,
  content: string,
): void {
  state.readAuthorizationsByPath ??= {}
  state.readAuthorizationHashesByPath ??= {}
  state.readAuthorizationsByPath[path] = true
  state.readAuthorizationHashesByPath[path] = getContentHash(content)
}

export function revokeWholeFileReadAuthorization(
  state: Pick<
    FileProcessingState,
    | 'readAuthorizationsByPath'
    | 'readAuthorizationHashesByPath'
    | 'modelVisibleReadAuthorizationHashesByPath'
  >,
  path: string,
): void {
  delete state.readAuthorizationsByPath?.[path]
  delete state.readAuthorizationHashesByPath?.[path]
  delete state.modelVisibleReadAuthorizationHashesByPath?.[path]
}

export function normalizeToolPath(filePath: string): string {
  if (
    typeof filePath !== 'string' ||
    filePath.trim().length === 0 ||
    filePath.includes('\0')
  ) {
    return ''
  }

  const withForwardSlashes = filePath.replace(/\\/g, '/')

  // Runtime tool paths must be project-relative. Reject POSIX absolute paths,
  // UNC/device paths (which begin with `//` after slash normalization), and
  // both absolute and drive-relative Windows paths such as C:/repo or C:repo.
  if (
    withForwardSlashes.startsWith('/') ||
    /^[A-Za-z]:/.test(withForwardSlashes)
  ) {
    return ''
  }

  const normalizedSegments: string[] = []
  for (const segment of withForwardSlashes.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') return ''
    normalizedSegments.push(segment)
  }

  // This is intentionally lexical containment only. Realpath/symlink
  // containment requires a project-root-aware SDK/client contract.
  return normalizedSegments.join('/')
}

export function formatUnsafeToolPathError(
  toolName: string,
  filePath: string,
): string {
  return `${toolName} path traversal blocked: unsafe path ${JSON.stringify(filePath)} must be a non-empty project-relative path without traversal, absolute/drive/UNC syntax, or NUL bytes.`
}

export function getFileProcessingValues(
  state: Partial<FileProcessingState>,
): FileProcessingState {
  const fileProcessingValues: FileProcessingState = {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    failedEditRequiresReadByPath: {},
    consecutiveStrReplaceFailuresByPath: {},
    strictReadBeforeEdit: true,
    readAuthorizationsByPath: {},
    readAuthorizationHashesByPath: {},
    editRereadRequirementsByPath: {},
  }
  for (const [key, value] of Object.entries(state)) {
    const typedKey = key as keyof typeof fileProcessingValues
    if (typedKey in fileProcessingValues) {
      fileProcessingValues[typedKey] = value as any
    }
  }
  return fileProcessingValues
}

export const handleWriteFile = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'write_file'>

    agentState: AgentState
    clientSessionId: string
    fileProcessingState: FileProcessingState
    fingerprintId: string
    logger: Logger
    prompt: string | undefined
    userId: string | undefined
    userInputId: string

    requestClientToolCall: (
      toolCall: ClientToolCall<'write_file'>,
    ) => Promise<CodebuffToolOutput<'write_file'>>
    requestOptionalFile: RequestOptionalFileFn
    writeToClient: (chunk: string) => void
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: CodebuffToolOutput<'write_file'> }> => {
  const {
    previousToolCallFinished,
    toolCall,

    fileProcessingState,
    logger,

    requestClientToolCall,
    requestOptionalFile,
    writeToClient,
  } = params
  const path = normalizeToolPath(toolCall.input.path)
  const { content } = toolCall.input

  if (!path) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: toolCall.input.path,
            errorMessage: formatUnsafeToolPathError(
              'write_file',
              toolCall.input.path,
            ),
          },
        },
      ],
    }
  }

  const fileProcessingPromisesByPath = fileProcessingState.promisesByPath
  const fileProcessingPromises = fileProcessingState.allPromises

  // Initialize state for this file path if needed
  if (!fileProcessingPromisesByPath[path]) {
    fileProcessingPromisesByPath[path] = []
  }
  const previousPromises = fileProcessingPromisesByPath[path]
  const previousEdit = previousPromises[previousPromises.length - 1]

  let existingDiskContentPromise: Promise<string | null> | undefined
  const getExistingDiskContent = () => {
    if (!existingDiskContentPromise) {
      existingDiskContentPromise = previousToolCallFinished.then(() =>
        requestOptionalFile({
          ...params,
          filePath: path,
        }),
      )
    }
    return existingDiskContentPromise
  }

  logger.debug({ path, content }, `write_file ${path}`)

  // Finding #3: annotate the promise type explicitly so future drift in the
  // .then() return shape is caught at compile time (mirrors str_replace's
  // `Promise<FileProcessing<'str_replace'>>` annotation for consistency).
  const newPromise: Promise<FileProcessing<'write_file'>> = (async () => {
    let initialContent: string | null
    let previousEditWasWholeFileWrite = false
    if (previousEdit) {
      const previousResult = await previousEdit
      if ('content' in previousResult) {
        initialContent = previousResult.content
        previousEditWasWholeFileWrite = previousResult.tool === 'write_file'
      } else {
        return {
          tool: 'write_file' as const,
          path,
          error: [
            `write_file blocked for ${path}: a prior same-turn edit to this path did not produce current file content.`,
            `Next: call read_files for ${path} before retrying write_file so the next edit starts from a known current file state.`,
          ].join('\n'),
        }
      }
    } else {
      initialContent = await getExistingDiskContent()
    }

    if (
      initialContent !== null &&
      fileProcessingState.failedEditRequiresReadByPath[path]
    ) {
      const authorizationError = strictEditAuthorizationError({
        fileProcessingState,
        path,
        toolName: 'write_file',
        hasFreshWholeFileAuthorization: false,
        wholeFileRequired: true,
      })
      return {
        tool: 'write_file' as const,
        path,
        error:
          authorizationError?.errorMessage ??
          `write_file blocked for ${path}: read_files must refresh the current whole-file content before retrying.`,
      }
    }
    if (
      fileProcessingState.strictReadBeforeEdit &&
      initialContent !== null &&
      !previousEditWasWholeFileWrite &&
      !isWholeFileReadAuthorizationFresh(
        fileProcessingState,
        path,
        initialContent,
      )
    ) {
      const authorizationWasStale = hasWholeFileReadAuthorization(
        fileProcessingState,
        path,
      )
      if (authorizationWasStale) {
        markEditRequiresFreshRead({
          fileProcessingState,
          path,
          reason: 'stale_snapshot',
          sourceTool: 'write_file',
        })
      } else {
        revokeWholeFileReadAuthorization(fileProcessingState, path)
      }
      const authorizationError = strictEditAuthorizationError({
        fileProcessingState,
        path,
        toolName: 'write_file',
        hasFreshWholeFileAuthorization: false,
        authorizationWasStale,
        wholeFileRequired: true,
      })
      return {
        tool: 'write_file' as const,
        path,
        error:
          authorizationError?.errorMessage ??
          `write_file blocked for ${path}: read_files must authorize the current whole-file content before overwriting it.`,
      }
    }

    const result = await processFileBlock({
      path,
      initialContentPromise: Promise.resolve(initialContent),
      newContent: content,
      logger,
    })
    // Check for abort and throw at the boundary
    if (result.aborted) {
      throw new AbortError(result.reason)
    }
    return {
      ...result.value,
      expectedHash:
        initialContent === null ? null : getContentHash(initialContent),
    }
  })()
    .catch((error) => {
      // AbortError propagates up - don't convert to tool error
      if (error instanceof AbortError) {
        throw error
      }
      logger.error(error, 'Error processing write_file block')
      return {
        tool: 'write_file' as const,
        path,
        error: `Error: Failed to process the write_file block. ${typeof error === 'string' ? error : error.message}`,
        preflightSyntaxError: false,
      }
    })
    .then(async (fileProcessingResult) => {
      const result = {
        ...fileProcessingResult,
        toolCallId: toolCall.toolCallId,
      }
      if (!('error' in fileProcessingResult)) {
        const syntaxValidation = preflightValidateSyntax(
          path,
          fileProcessingResult.content,
        )
        if (!syntaxValidation.valid) {
          return {
            tool: 'write_file' as const,
            path,
            toolCallId: toolCall.toolCallId,
            error: formatPreflightErrorMessage(
              'write_file',
              path,
              syntaxValidation.message,
            ),
            preflightSyntaxError: true,
          }
        }
      }
      return result
    })
  fileProcessingPromisesByPath[path].push(newPromise)
  fileProcessingPromises.push(newPromise)

  const writeFileResult: FileProcessing<'write_file'> = await newPromise
  const application = await coordinateEditApplication<'write_file'>({
    toolName: 'write_file',
    fileProcessingState,
    paths: [path],
    rejectionRequiresRead: !('error' in writeFileResult),
    wholeFileContentByPath:
      'content' in writeFileResult
        ? new Map([[path, writeFileResult.content]])
        : undefined,
    apply: () =>
      postStreamProcessing<'write_file'>(
        writeFileResult,
        fileProcessingState,
        writeToClient,
        requestClientToolCall,
      ),
  })

  if (application.status === 'threw') {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: `write_file failed while applying the prepared content: ${application.error instanceof Error ? application.error.message : String(application.error)}. Re-read the file before retrying.`,
          },
        },
      ],
    }
  }

  return { output: application.output }
}) satisfies CodebuffToolHandlerFunction<'write_file'>

type PostStreamProcessingTools = Exclude<
  FileProcessingTools,
  'edit_transaction'
>

export async function postStreamProcessing<T extends PostStreamProcessingTools>(
  toolCall: FileProcessing<T>,
  fileProcessingState: FileProcessingState,
  writeToClient: (chunk: string) => void,
  requestClientToolCall: (
    toolCall: ClientToolCall<T>,
  ) => Promise<CodebuffToolOutput<T>>,
): Promise<CodebuffToolOutput<T>> {
  const allFileProcessingResults = await Promise.all(
    fileProcessingState.allPromises,
  )
  if (!fileProcessingState.firstFileProcessed) {
    const hasPreparedChange = allFileProcessingResults.some(
      (result) => !('error' in result),
    )
    if (!hasPreparedChange && allFileProcessingResults.length > 0) {
      writeToClient('No changes to existing files.\n')
    }
    if (hasPreparedChange) {
      writeToClient(`\n`)
    }
    fileProcessingState.firstFileProcessed = true
  }

  if ('error' in toolCall) {
    return [
      {
        type: 'json',
        value: {
          file: toolCall.path,
          errorMessage: toolCall.error,
        },
      },
    ]
  }

  const { patch, content, path } = toolCall
  const clientToolCall: ClientToolCall<T> = {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.tool,
    input: patch
      ? {
          type: 'patch' as const,
          path,
          content: patch,
          expectedHash: toolCall.expectedHash,
        }
      : {
          type: 'file' as const,
          path,
          content,
          expectedHash: toolCall.expectedHash,
        },
  } as ClientToolCall<T>
  const clientToolResult = await requestClientToolCall(clientToolCall)
  if (clientToolResult.length > 0) {
    return clientToolResult
  }

  return [
    {
      type: 'json',
      value: {
        file: path,
        errorMessage: `The client returned no ${toolCall.tool} application result, so the harness could not confirm that the prepared edit was written. Re-read ${path} before retrying.`,
      },
    },
  ] as CodebuffToolOutput<T>
}
