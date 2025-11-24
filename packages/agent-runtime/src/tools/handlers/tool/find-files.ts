import { jsonToolResult } from '@codebuff/common/util/messages'

import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from '../../../find-files/request-files-prompt'
import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { getSearchSystemPrompt } from '../../../system-prompt/search-system-prompt'
import { renderReadFilesResult } from '../../../util/render-read-files-result'
import { countTokens, countTokensJson } from '../../../util/token-counter'
import { validateToolHandler } from '../handler-function-type'

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
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

type ToolName = 'find_files'
export const handleFindFiles = validateToolHandler<ToolName>(
  async (
    params: {
      previousToolCallFinished: Promise<any>
      toolCall: CodebuffToolCall<ToolName>
      logger: Logger

      agentState: AgentState
      agentStepId: string
      clientSessionId: string
      fileContext: ProjectFileContext
      fingerprintId: string
      repoId: string | undefined
      userId: string | undefined
      userInputId: string
    } & ParamsExcluding<
      typeof requestRelevantFiles,
      'messages' | 'system' | 'assistantPrompt'
    > &
      ParamsExcluding<
        typeof uploadExpandedFileContextForTraining,
        'messages' | 'system' | 'assistantPrompt'
      > &
      ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
  ): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const {
      previousToolCallFinished,
      toolCall,

      agentState,
      agentStepId,
      clientSessionId,
      fileContext,
      fingerprintId,
      logger,
      userId,
      userInputId,
    } = params
    const { prompt } = toolCall.input

    const fileRequestMessagesTokens = countTokensJson(agentState.messageHistory)
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

    await previousToolCallFinished

    const requestedFiles = await requestRelevantFiles({
      ...params,
      messages: agentState.messageHistory,
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
          messages: agentState.messageHistory,
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
        return {
          output: jsonToolResult(
            renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {}),
          ),
        }
      }
      return {
        output: jsonToolResult({
          errorMessage: `No new relevant files found for prompt: ${prompt}`,
        }),
      }
    } else {
      return {
        output: jsonToolResult({
          errorMessage: `No relevant files found for prompt: ${prompt}`,
        }),
      }
    }
  },
)

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
