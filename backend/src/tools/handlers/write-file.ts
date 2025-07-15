import { CodebuffMessage } from '@codebuff/common/types/message'
import { partition } from 'lodash'
import { WebSocket } from 'ws'
import { processFileBlock } from '../../process-file-block'
import { logger } from '../../util/logger'
import { requestOptionalFile } from '../../websockets/websocket-action'
import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'

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

export type FileProcessingMutableState = {
  promisesByPath: Record<string, Promise<FileProcessing>[]>
  allPromises: Promise<FileProcessing>[]
  fileChangeErrors: Extract<FileProcessing, { error: string }>[]
  fileChanges: Exclude<FileProcessing, { error: string }>[]
  firstFileProcessed: boolean
}

export const handleWriteFile = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'write_file'>

  clientSessionId: string
  userInputId: string

  requestClientToolCall: (
    toolCall: ClientToolCall<'write_file'>
  ) => Promise<string>
  writeToClient: (chunk: string) => void

  state: {
    ws?: WebSocket
    fingerprintId?: string
    userId?: string
    fullResponse?: string
    prompt?: string

    mutableState?: FileProcessingMutableState & {
      messages: CodebuffMessage[]
    }
  }
}): {
  result: Promise<string>
  state: {
    mutableState: FileProcessingMutableState
  }
} => {
  const {
    previousToolCallFinished,
    toolCall,

    clientSessionId,
    userInputId,

    requestClientToolCall,
    writeToClient,
    state,
  } = params
  const { path, instructions, content } = toolCall.args
  const { ws, fingerprintId, userId, fullResponse, prompt } = state
  if (!ws) {
    throw new Error('Internal error for write_file: Missing WebSocket in state')
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for write_file: Missing fingerprintId in state'
    )
  }

  const mutableState = {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    ...state.mutableState,
  }
  const fileProcessingPromisesByPath = mutableState.promisesByPath
  const fileProcessingPromises = mutableState.allPromises ?? []
  const agentMessagesUntruncated = mutableState.messages
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
          : requestOptionalFile(ws, path)
      )
    : requestOptionalFile(ws, path)

  const fileContentWithoutStartNewline = content.startsWith('\n')
    ? content.slice(1)
    : content

  logger.debug({ path, content }, `write_file ${path}`)

  const newPromise = processFileBlock(
    path,
    instructions,
    latestContentPromise,
    fileContentWithoutStartNewline,
    agentMessagesUntruncated,
    fullResponse ?? '',
    prompt,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId
  )
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
    result: previousToolCallFinished.then(async () => {
      return await postStreamProcessing<'write_file'>(
        await newPromise,
        mutableState,
        writeToClient,
        requestClientToolCall
      )
    }),
    state: { mutableState },
  }
}) satisfies CodebuffToolHandlerFunction<'write_file'>

export async function postStreamProcessing<T extends FileProcessingTools>(
  toolCall: FileProcessing<T>,
  mutableState: FileProcessingMutableState,
  writeToClient: (chunk: string) => void,
  requestClientToolCall: (toolCall: ClientToolCall<T>) => Promise<string>
) {
  const allFileProcessingResults = await Promise.all(mutableState.allPromises)
  if (!mutableState.firstFileProcessed) {
    ;[mutableState.fileChangeErrors, mutableState.fileChanges] = partition(
      allFileProcessingResults,
      (result) => 'error' in result
    )
    if (
      mutableState.fileChanges.length === 0 &&
      allFileProcessingResults.length > 0
    ) {
      writeToClient('No changes to existing files.\n')
    }
    if (mutableState.fileChanges.length > 0) {
      writeToClient(`\n`)
    }
    mutableState.firstFileProcessed = true
  }

  const toolCallResults: string[] = []

  const errors = mutableState.fileChangeErrors.filter(
    (result) => result.toolCallId === toolCall.toolCallId
  )
  toolCallResults.push(
    ...errors.map(({ path, error }) => `Error processing ${path}: ${error}`)
  )

  const changes = mutableState.fileChanges.filter(
    (result) => result.toolCallId === toolCall.toolCallId
  )
  for (const { path, content, patch } of changes) {
    const clientToolCall: ClientToolCall<T> = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.tool,
      args: patch
        ? { type: 'patch' as const, path, content: patch }
        : { type: 'file' as const, path, content },
    } as ClientToolCall<T>
    const clientResult = await requestClientToolCall(clientToolCall)

    toolCallResults.push(clientResult)
  }

  return toolCallResults.join('\n\n')
}
