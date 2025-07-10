import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import {
  GetExpandedFileContextForTrainingBlobTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { CoreMessage } from 'ai'
import { WebSocket } from 'ws'
import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from '../../find-files/request-files-prompt'
import { getFileReadingUpdates } from '../../get-file-reading-updates'
import { getSearchSystemPrompt } from '../../system-prompt/search-system-prompt'
import { logger } from '../../util/logger'
import { countTokens, countTokensJson } from '../../util/token-counter'
import { requestFiles } from '../../websockets/websocket-action'
import { CodebuffToolCall } from '../constants'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

export async function handleFindFiles(params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'find_files'>
  extra: {
    messages: CoreMessage[]
    ws: WebSocket
    fileContext: ProjectFileContext
    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string
    repoId: string
  }
}): Promise<
  | { type: 'error'; error: string }
  | { type: 'result'; result: Record<string, string> }
> {
  const { previousToolCallResult, toolCall, extra } = params
  const { description } = toolCall.args
  const {
    messages,
    ws,
    fileContext,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
  } = extra

  await previousToolCallResult

  const fileRequestMessagesTokens = countTokensJson(messages)
  const system = getSearchSystemPrompt(fileContext, fileRequestMessagesTokens, {
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  })

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

  if (!requestedFiles || requestedFiles.length === 0) {
    return {
      type: 'error',
      error: `No relevant files found for description: ${description}`,
    }
  }

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

  if (COLLECT_FULL_FILE_CONTEXT && addedFiles.length > 0) {
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
    return {
      type: 'result',
      result: Object.fromEntries(
        addedFiles.map(({ path, content }) => [path, content])
      ),
    }
  }
  return {
    type: 'error',
    error: `No new relevant files found for description: ${description}`,
  }
}

async function uploadExpandedFileContextForTraining(
  ws: WebSocket,
  {
    messages,
    system,
  }: {
    messages: CoreMessage[]
    system: string | Array<TextBlockParam>
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
