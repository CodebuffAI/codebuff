import { insertTrace } from '@codebuff/bigquery'

import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from '../../../find-files/request-files-prompt'
import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { getSearchSystemPrompt } from '../../../system-prompt/search-system-prompt'
import { logger } from '../../../util/logger'
import { renderReadFilesResult } from '../../../util/parse-tool-call-xml'
import { countTokens, countTokensJson } from '../../../util/token-counter'
import { requestFiles } from '../../../websockets/websocket-action'

import type { TextBlock } from '../../../llm-apis/claude'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { GetExpandedFileContextForTrainingBlobTrace } from '@codebuff/bigquery'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

export const handleFindFiles = ((params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'find_files'>

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
}): { result: Promise<CodebuffToolOutput<'find_files'>>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,
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
  const system = getSearchSystemPrompt(fileContext, fileRequestMessagesTokens, {
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  })

  const triggerFindFiles: () => Promise<
    CodebuffToolOutput<'find_files'>
  > = async () => {
    const requestedFiles = await requestRelevantFiles(
      { messages, system },
      fileContext,
      prompt,
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      repoId,
    )

    if (requestedFiles && requestedFiles.length > 0) {
      const addedFiles = await getFileReadingUpdates(ws, requestedFiles)

      if (COLLECT_FULL_FILE_CONTEXT && addedFiles.length > 0) {
        uploadExpandedFileContextForTraining(
          ws,
          { messages, system },
          fileContext,
          prompt,
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
          repoId,
        ).catch((error) => {
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
  ws: WebSocket,
  {
    messages,
    system,
  }: {
    messages: Message[]
    system: string | Array<TextBlock>
  },
  fileContext: ProjectFileContext,
  assistantPrompt: string | null,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  repoId: string | undefined,
) {
  const files = await requestRelevantFilesForTraining(
    { messages, system },
    fileContext,
    assistantPrompt,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
  )

  const loadedFiles = await requestFiles(ws, files)

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
  await insertTrace(trace)
}
