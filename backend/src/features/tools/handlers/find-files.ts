import {
  GetExpandedFileContextForTrainingBlobTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { CodebuffMessage } from '@codebuff/common/types/message'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { CoreMessage } from 'ai'
import { WebSocket } from 'ws'
import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from '../../files/processing/request-files-prompt'
import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { TextBlock } from '../../llm/providers/claude'
import { getSearchSystemPrompt } from '../../../system-prompt/search-system-prompt'
import { logger } from '../../../util/logger'
import { renderReadFilesResult } from '../../../util/parse-tool-call-xml'
import { countTokens, countTokensJson } from '../../../util/token-counter'
import { requestFiles } from '../../websockets/websocket-action'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

// Collect full file context based on repository configuration
function shouldCollectFullFileContext(
  fileContext: ProjectFileContext
): boolean {
  return fileContext.codebuffConfig?.collectFullFileContext ?? false
}

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
    messages?: CodebuffMessage[]
  }
}): { result: Promise<string>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,
    fileContext,
    agentStepId,
    clientSessionId,
    userInputId,
    state,
  } = params
  const { description } = toolCall.args
  const { ws, fingerprintId, userId, repoId, messages } = state

  if (!ws) {
    throw new Error('Internal error for find_files: Missing WebSocket in state')
  }
  if (!messages) {
    throw new Error('Internal error for find_files: Missing messages in state')
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for find_files: Missing fingerprintId in state'
    )
  }
  if (!repoId) {
    throw new Error('Internal error for find_files: Missing repoId in state')
  }

  const fileRequestMessagesTokens = countTokensJson(messages)
  const system = getSearchSystemPrompt(fileContext, fileRequestMessagesTokens, {
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  })

  const triggerFindFiles = async () => {
    const requestedFiles = await requestRelevantFiles(
      { messages, system },
      fileContext,
      description,
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      repoId
    )

    if (requestedFiles && requestedFiles.length > 0) {
      const { addedFiles, updatedFilePaths, printedPaths } =
        await getFileReadingUpdates(ws, messages, fileContext, {
          requestedFiles,
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
          repoId,
        })

      if (shouldCollectFullFileContext(fileContext) && addedFiles.length > 0) {
        uploadExpandedFileContextForTraining(
          ws,
          { messages, system },
          fileContext,
          description,
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
          repoId
        ).catch((error) => {
          logger.error(
            { error },
            'Error uploading expanded file context for training'
          )
        })
      }

      logger.debug(
        {
          content: description,
          description: description,
          addedFilesPaths: addedFiles.map((f) => f.path),
          updatedFilePaths,
          printedPaths,
        },
        'find_files tool call'
      )

      if (addedFiles.length > 0) {
        return renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {})
      }
      return `No new relevant files found for description: ${description}`
    } else {
      return `No relevant files found for description: ${description}`
    }
  }

  return {
    result: previousToolCallFinished.then(triggerFindFiles),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'find_files'>

async function uploadExpandedFileContextForTraining(
  ws: WebSocket,
  {
    messages,
    system,
  }: {
    messages: CoreMessage[]
    system: string | Array<TextBlock>
  },
  fileContext: ProjectFileContext,
  assistantPrompt: string | null,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  repoId: string | undefined
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
    repoId
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
