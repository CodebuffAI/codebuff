import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from '../../../find-files/request-files-prompt'
import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { getSearchSystemPrompt } from '../../../system-prompt/search-system-prompt'
import { renderReadFilesResult } from '../../../util/render-read-files-result'
import { countTokens, countTokensJson } from '../../../util/token-counter'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestFilesFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
} from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

export const handleFindFiles = ((
  params: {
    previousToolCallFinished: Promise<any>
    toolCall: CodebuffToolCall<'find_files'>
    logger: Logger

    agentStepId: string
    clientSessionId: string
    fileContext: ProjectFileContext
    fingerprintId: string
    repoId: string | undefined
    userId: string | undefined
    userInputId: string

    state: {
      messages: Message[]
    }
  } & ParamsExcluding<
    typeof requestRelevantFiles,
    'messages' | 'system' | 'assistantPrompt'
  > &
    ParamsExcluding<
      typeof uploadExpandedFileContextForTraining,
      'messages' | 'system' | 'assistantPrompt'
    > &
    ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
): { result: Promise<CodebuffToolOutput<'find_files'>>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,

    agentStepId,
    clientSessionId,
    fileContext,
    fingerprintId,
    logger,
    state,
    userId,
    userInputId,
  } = params
  const { prompt } = toolCall.input
  const { messages } = state

  if (!messages) {
    throw new Error('Internal error for find_files: Missing messages in state')
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
    })

    if (requestedFiles && requestedFiles.length > 0) {
      const addedFiles = await getFileReadingUpdates({
        ...params,
        requestedFiles,
      })

      if (COLLECT_FULL_FILE_CONTEXT && addedFiles.length > 0) {
        uploadExpandedFileContextForTraining({
          ...params,
          messages,
          system,
          assistantPrompt: prompt,
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
    requestFiles: RequestFilesFn
  } & ParamsOf<typeof requestRelevantFilesForTraining>,
) {
  const { requestFiles } = params
  const files = await requestRelevantFilesForTraining(params)

  const loadedFiles = await requestFiles({ filePaths: files })

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
}
