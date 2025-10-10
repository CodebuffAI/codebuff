import { insertTrace } from '@codebuff/bigquery'

import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from '../../../find-files/request-files-prompt'
import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { getSearchSystemPrompt } from '../../../system-prompt/search-system-prompt'
import { renderReadFilesResult } from '../../../util/parse-tool-call-xml'
import { countTokens, countTokensJson } from '../../../util/token-counter'
import { requestFiles } from '../../../websockets/websocket-action'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { GetExpandedFileContextForTrainingBlobTrace } from '@codebuff/bigquery'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
} from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

export const handleFindFiles = ((
  params: {
    previousToolCallFinished: Promise<any>
    toolCall: CodebuffToolCall<'find_files'>
    logger: Logger

    fileContext: ProjectFileContext
    agentStepId: string
    clientSessionId: string
    userInputId: string

    state: {
      ws?: WebSocket
      fingerprintId?: string
      userId?: string
      repoId?: string
      messages?: Message[]
    }
  } & ParamsExcluding<
    typeof requestRelevantFiles,
    | 'messages'
    | 'system'
    | 'assistantPrompt'
    | 'fingerprintId'
    | 'userId'
    | 'repoId'
  > &
    ParamsExcluding<
      typeof uploadExpandedFileContextForTraining,
      | 'ws'
      | 'messages'
      | 'system'
      | 'assistantPrompt'
      | 'fingerprintId'
      | 'userId'
      | 'repoId'
    >,
): { result: Promise<CodebuffToolOutput<'find_files'>>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,
    logger,
    fileContext,
    agentStepId,
    clientSessionId,
    userInputId,
    state,
  } = params
  const { prompt } = toolCall.input
  const { ws, fingerprintId, userId, repoId, messages } = state

  if (!ws) {
    throw new Error('Internal error for find_files: Missing WebSocket in state')
  }
  if (!messages) {
    throw new Error('Internal error for find_files: Missing messages in state')
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for find_files: Missing fingerprintId in state',
    )
  }

  const fileRequestMessagesTokens = countTokensJson(messages)
  const system = getSearchSystemPrompt({
    fileContext,
    messagesTokens: fileRequestMessagesTokens,
    logger,
    options: {
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    },
  })

  const triggerFindFiles: () => Promise<
    CodebuffToolOutput<'find_files'>
  > = async () => {
    const requestedFiles = await requestRelevantFiles({
      ...params,
      messages,
      system,
      assistantPrompt: prompt,
      fingerprintId,
      userId,
      repoId,
    })

    if (requestedFiles && requestedFiles.length > 0) {
      const addedFiles = await getFileReadingUpdates(ws, requestedFiles)

      if (COLLECT_FULL_FILE_CONTEXT && addedFiles.length > 0) {
        uploadExpandedFileContextForTraining({
          ...params,
          ws,
          messages,
          system,
          assistantPrompt: prompt,
          fingerprintId,
          userId,
          repoId,
        }).catch((error) => {
          logger.error(
            { error },
            'Error uploading expanded file context for training',
          )
        })
      }

      if (addedFiles.length > 0) {
        return [
          {
            type: 'json',
            value: renderReadFilesResult(
              addedFiles,
              fileContext.tokenCallers ?? {},
            ),
          },
        ]
      }
      return [
        {
          type: 'json',
          value: {
            message: `No new relevant files found for prompt: ${prompt}`,
          },
        },
      ]
    } else {
      return [
        {
          type: 'json',
          value: {
            message: `No relevant files found for prompt: ${prompt}`,
          },
        },
      ]
    }
  }

  return {
    result: (async () => {
      await previousToolCallFinished
      return await triggerFindFiles()
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'find_files'>

async function uploadExpandedFileContextForTraining(
  params: {
    ws: WebSocket
    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    logger: Logger
  } & ParamsOf<typeof requestRelevantFilesForTraining>,
) {
  const {
    ws,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    logger,
  } = params
  const files = await requestRelevantFilesForTraining(params)

  const loadedFiles = await requestFiles({ ws, filePaths: files })

  // Upload a map of:
  // {file_path: {content, token_count}}
  // up to 50k tokens
  const filesToUpload: Record<string, { content: string; tokens: number }> = {}
  for (const file of files) {
    const content = loadedFiles[file]
    if (content === null || content === undefined) {
      continue
    }
    const tokens = countTokens(content)
    if (tokens > 50000) {
      break
    }
    filesToUpload[file] = { content, tokens }
  }

  const trace: GetExpandedFileContextForTrainingBlobTrace = {
    type: 'get-expanded-file-context-for-training-blobs',
    created_at: new Date(),
    id: crypto.randomUUID(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    payload: {
      files: filesToUpload,
      user_input_id: userInputId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
    },
  }

  // Upload the files to bigquery
  await insertTrace({
    trace,
    logger,
  })
}
