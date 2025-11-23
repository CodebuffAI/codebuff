import { partition } from 'lodash'

import { processFileBlock } from '../../../process-file-block'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

type FileProcessingTools = 'write_file' | 'str_replace' | 'create_plan'
export type FileProcessing<
  T extends FileProcessingTools = FileProcessingTools,
> = {
  tool: T
  path: string
  toolCallId: string
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
}

export function getFileProcessingValues(
  state: FileProcessingState,
): FileProcessingState {
  const fileProcessingValues: FileProcessingState = {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
  }
  for (const [key, value] of Object.entries(state)) {
    const typedKey = key as keyof typeof fileProcessingValues
    if (fileProcessingValues[typedKey] !== undefined) {
      fileProcessingValues[typedKey] = value as any
    }
  }
  return fileProcessingValues
}

export function handleWriteFile(
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'write_file'>

    clientSessionId: string
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

    getLatestState: () => FileProcessingState
    state: {
      messages: Message[]
    } & FileProcessingState
  } & ParamsExcluding<
    typeof processFileBlock,
    | 'path'
    | 'instructions'
    | 'fingerprintId'
    | 'initialContentPromise'
    | 'newContent'
    | 'messages'
    | 'lastUserPrompt'
  > &
    ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): {
  result: Promise<CodebuffToolOutput<'write_file'>>
  state: FileProcessingState
} {
  const {
    previousToolCallFinished,
    toolCall,

    clientSessionId,
    fingerprintId,
    logger,
    prompt,
    userInputId,

    requestClientToolCall,
    requestOptionalFile,
    writeToClient,

    getLatestState,
    state,
  } = params
  const { path, instructions, content } = toolCall.input

  const fileProcessingState = getFileProcessingValues(state)
  const fileProcessingPromisesByPath = fileProcessingState.promisesByPath
  const fileProcessingPromises = fileProcessingState.allPromises ?? []
  const agentMessagesUntruncated = state.messages
  if (!agentMessagesUntruncated) {
    throw new Error('Internal error for write_file: Missing messages in state')
  }

  // Initialize state for this file path if needed
  if (!fileProcessingPromisesByPath[path]) {
    fileProcessingPromisesByPath[path] = []
  }
  const previousPromises = fileProcessingPromisesByPath[path]
  const previousEdit = previousPromises[previousPromises.length - 1]

  const latestContentPromise = previousEdit
    ? previousEdit.then((maybeResult) =>
        maybeResult && 'content' in maybeResult
          ? maybeResult.content
          : requestOptionalFile({ ...params, filePath: path }),
      )
    : requestOptionalFile({ ...params, filePath: path })

  const fileContentWithoutStartNewline = content.startsWith('\n')
    ? content.slice(1)
    : content

  logger.debug({ path, content }, `write_file ${path}`)

  const newPromise = processFileBlock({
    ...params,
    path,
    instructions,
    initialContentPromise: latestContentPromise,
    newContent: fileContentWithoutStartNewline,
    messages: agentMessagesUntruncated,
    lastUserPrompt: prompt,
    clientSessionId,
    fingerprintId,
    userInputId,
    logger,
  })
    .catch((error) => {
      logger.error(error, 'Error processing write_file block')
      return {
        tool: 'write_file' as const,
        path,
        error: `Error: Failed to process the write_file block. ${typeof error === 'string' ? error : error.msg}`,
      }
    })
    .then(async (fileProcessingResult) => ({
      ...fileProcessingResult,
      toolCallId: toolCall.toolCallId,
    }))
  fileProcessingPromisesByPath[path].push(newPromise)
  fileProcessingPromises.push(newPromise)

  return {
    result: (async () => {
      await previousToolCallFinished
      return await postStreamProcessing<'write_file'>(
        await newPromise,
        getLatestState(),
        writeToClient,
        requestClientToolCall,
      )
    })(),
    state: fileProcessingState,
  }
}
handleWriteFile satisfies CodebuffToolHandlerFunction<'write_file'>

export async function postStreamProcessing<T extends FileProcessingTools>(
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
    // Update the arrays with new results for subsequent tool calls
    const [newErrors, newChanges] = partition(
      allFileProcessingResults,
      (result) => 'error' in result,
    )
    fileProcessingState.fileChangeErrors = newErrors as Extract<
      FileProcessing,
      { error: string }
    >[]
    fileProcessingState.fileChanges = newChanges as Exclude<
      FileProcessing,
      { error: string }
    >[]
  }

  const toolCallResults: string[] = []

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

  const { patch, content, path } = changes[0]
  const clientToolCall: ClientToolCall<T> = {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.tool,
    input: patch
      ? { type: 'patch' as const, path, content: patch }
      : { type: 'file' as const, path, content },
  } as ClientToolCall<T>
  return await requestClientToolCall(clientToolCall)
}
