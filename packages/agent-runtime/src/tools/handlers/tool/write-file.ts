import { AbortError } from '@codebuff/common/util/error'
import { partition } from 'lodash'

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
import type { AgentState } from '@codebuff/common/types/session-state'

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
  // Fix C: per-path consecutive-failure circuit breaker. Counts consecutive
  // str_replace attempts on a path that returned an error or an auto-corrected
  // near-match. After STR_REPLACE_MAX_CONSECUTIVE_FAILURES such attempts on the
  // same path, further str_replace calls on that path are hard-blocked with a
  // directive to switch to rewrite_symbol (whole-symbol) or write_file
  // (whole-file) instead. A successful, non-auto-corrected str_replace clears
  // the counter. A fresh basedOnRead anchor (read_files) also clears it.
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
}

export function normalizeToolPath(filePath: string): string {
  let normalized = filePath.replace(/^(?:\.\/)+/, '')
  // Reject path traversal: an edit target must stay inside the project. Any
  // `..` segment (posix or windows, since backslashes are normalized to forward
  // slashes here) is rejected before normalization so it cannot be used to
  // point write_file/str_replace/edit_transaction at files outside the project.
  // Mirrors the `normalizeGateFilePath` defense in agents/base2/gate-paths.ts.
  normalized = normalized.replace(/\\/g, '/')
  if (normalized.split('/').includes('..')) {
    return ''
  }
  return normalized
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
  const { basedOnRead } = toolCall.input
  const hasBasedOnRead = Boolean(basedOnRead)

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

  const fileContentWithoutStartNewline = content.startsWith('\n')
    ? content.slice(1)
    : content

  logger.debug({ path, content }, `write_file ${path}`)

  // Finding #3: annotate the promise type explicitly so future drift in the
  // .then() return shape is caught at compile time (mirrors str_replace's
  // `Promise<FileProcessing<'str_replace'>>` annotation for consistency).
  const newPromise: Promise<FileProcessing<'write_file'>> = (async () => {
    let initialContent: string | null
    if (previousEdit) {
      const previousResult = await previousEdit
      if ('content' in previousResult) {
        initialContent = previousResult.content
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
      const existingDiskContent = await getExistingDiskContent()
      if (
        fileProcessingState.strictReadBeforeEdit &&
        existingDiskContent !== null &&
        !hasBasedOnRead &&
        !fileProcessingState.readAuthorizationsByPath?.[path]
      ) {
        return {
          tool: 'write_file' as const,
          path,
          error: [
            `write_file blocked: strict read-before-edit is enabled and ${path} already exists, but no read authorization exists for this path.`,
            `Next: call read_files for ${path} before retrying write_file, or supply a basedOnRead capability for the existing content you intend to overwrite.`,
            'New-file creation is still allowed without a prior read when the target path does not exist.',
          ].join('\n'),
        }
      }
      initialContent = existingDiskContent
    }

    const result = await processFileBlock({
      path,
      initialContentPromise: Promise.resolve(initialContent),
      newContent: fileContentWithoutStartNewline,
      logger,
    })
    // Check for abort and throw at the boundary
    if (result.aborted) {
      throw new AbortError(result.reason)
    }
    return result.value
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
  if ('error' in writeFileResult) {
    // A preflight syntax failure is NOT a stale-anchor failure: the agent's
    // read was valid and the file content on disk is unchanged. Don't force a
    // re-read — the agent only needs to fix the syntax, not re-read the file.
    if (!writeFileResult.preflightSyntaxError) {
      fileProcessingState.failedEditRequiresReadByPath[path] = true
    }
  } else {
    delete fileProcessingState.failedEditRequiresReadByPath[path]
    // Strict read-before-edit: a successful write_file (whether creating a new
    // file or overwriting an existing one) grants a sticky read authorization
    // for the written path. This eliminates redundant read round-trips for the
    // very common write-then-edit flow without weakening the strict gate: any
    // edit on the path only requires a fresh read or basedOnRead anchor when
    // either the prior edit failed or the file content has changed externally.
    if (fileProcessingState.strictReadBeforeEdit) {
      // Lazy-init to mirror the read_files handler, which is the canonical
      // initializer for readAuthorizationsByPath. This keeps the write_file
      // handler usable in isolation (e.g. unit tests) without requiring a
      // prior read_files call.
      fileProcessingState.readAuthorizationsByPath ??= {}
      fileProcessingState.readAuthorizationsByPath[path] = true
    }
  }

  const output = await postStreamProcessing<'write_file'>(
    writeFileResult,
    fileProcessingState,
    writeToClient,
    requestClientToolCall,
  )

  const firstOutput = output[0]
  if (
    firstOutput?.type === 'json' &&
    firstOutput.value &&
    typeof firstOutput.value === 'object' &&
    'errorMessage' in firstOutput.value &&
    // Finding #1: a preflight syntax error is reported through
    // postStreamProcessing as `{ file, errorMessage }`, but it is NOT a
    // stale-anchor failure — the in-memory guard above already skipped
    // setting failedEditRequiresReadByPath. Mirror that guard here so the
    // downstream error check does not undo the isolation and force a
    // redundant re-read the agent does not need.
    !writeFileResult.preflightSyntaxError
  ) {
    fileProcessingState.failedEditRequiresReadByPath[path] = true
  }
  // The agent fully supplied the new content, so a follow-up edit can still
  // anchor to the prior read (or to the just-granted write authorization)
  // without re-reading the file. This eliminates redundant re-reads for
  // multi-write and write-then-edit flows in the same session.

  return { output }
}) satisfies CodebuffToolHandlerFunction<'write_file'>

type PostStreamProcessingTools = Exclude<FileProcessingTools, 'edit_transaction'>

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
    ;[fileProcessingState.fileChangeErrors, fileProcessingState.fileChanges] =
      partition(allFileProcessingResults, (result) => 'error' in result)

    if (
      fileProcessingState.fileChanges.length === 0 &&
      allFileProcessingResults.length > 0
    ) {
      writeToClient('No changes to existing files.\n')
    }
    if (fileProcessingState.fileChanges.length > 0) {
      writeToClient(`\n`)
    }
    fileProcessingState.firstFileProcessed = true
  } else {
    // Update the arrays with only the NEW results since the last partition,
    // then merge with the existing arrays. Re-partitioning the entire
    // allFileProcessingResults on every subsequent tool call is O(n²) in the
    // number of tool calls.
    const processedCount =
      fileProcessingState.fileChangeErrors.length +
      fileProcessingState.fileChanges.length
    const newResults = allFileProcessingResults.slice(processedCount)
    const [newErrors, newChanges] = partition(
      newResults,
      (result) => 'error' in result,
    )
    fileProcessingState.fileChangeErrors = [
      ...fileProcessingState.fileChangeErrors,
      ...(newErrors as Extract<FileProcessing, { error: string }>[]),
    ]
    fileProcessingState.fileChanges = [
      ...fileProcessingState.fileChanges,
      ...(newChanges as Exclude<FileProcessing, { error: string }>[]),
    ]
  }

  // Note: toolCallResults was previously assigned but unused - errors are returned directly now

  const errors = fileProcessingState.fileChangeErrors.filter(
    (result) => result.toolCallId === toolCall.toolCallId,
  )
  if (errors.length > 0) {
    if (errors.length > 1) {
      throw new Error(
        `Internal error: Unexpected number of matching errors for ${JSON.stringify(toolCall)}, found ${errors.length}, expected 1`,
      )
    }

    const { path, error } = errors[0]
    return [
      {
        type: 'json',
        value: {
          file: path,
          errorMessage: error,
        },
      },
    ]
  }

  const changes = fileProcessingState.fileChanges.filter(
    (result) => result.toolCallId === toolCall.toolCallId,
  )
  if (changes.length !== 1) {
    throw new Error(
      `Internal error: Unexpected number of matching changes for ${JSON.stringify(toolCall)}, found ${changes.length}, expected 1`,
    )
  }

  const { patch, content, path, messages } = changes[0]
  const clientToolCall: ClientToolCall<T> = {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.tool,
    input: patch
      ? { type: 'patch' as const, path, content: patch }
      : { type: 'file' as const, path, content },
  } as ClientToolCall<T>
  const clientToolResult = await requestClientToolCall(clientToolCall)
  if (clientToolResult.length > 0) {
    return clientToolResult
  }

  const synthesizedMessage =
    toolCall.tool === 'str_replace'
      ? 'Applied str_replace patch; synthesized result because the client returned an empty response.'
      : `Applied ${toolCall.tool} edit; synthesized result because the client returned an empty response.`

  return [
    {
      type: 'json',
      value: {
        file: path,
        ...(patch ? { unifiedDiff: patch, patch } : {}),
        message: [
          ...messages,
          synthesizedMessage,
        ].join('\n\n'),
      },
    },
  ] as CodebuffToolOutput<T>
}
