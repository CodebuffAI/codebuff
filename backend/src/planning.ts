import { Message } from 'common/actions'
import { models, claudeModels, CostMode } from 'common/constants'
import { countTokensJson } from './util/token-counter'
import {
  createMarkdownFileBlock,
  isValidFilePath,
  ProjectFileContext,
} from 'common/util/file'
import { promptClaude } from './claude'
import { OpenAIMessage, promptOpenAI, promptOpenAIStream } from './openai-api'
import { getSearchSystemPrompt } from './system-prompt'

export async function planComplexChange(
  prompt: string,
  files: Record<string, string>,
  onChunk: (chunk: string) => void,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
) {
  const messages: OpenAIMessage[] = [
    {
      role: 'user',
      content: `${
        Object.keys(files).length > 0
          ? `Relevant Files:\n\n${Object.entries(files)
              .map(([path, content]) => createMarkdownFileBlock(path, content))
              .join('\n')}\n\n`
          : ''
      }${prompt}

Please plan and create a detailed solution.`,
    },
  ]

  let fullResponse = await promptOpenAI(messages, {
    ...options,
    model: models.o1,
  })

  return fullResponse
}

/**
 * Prompt claude, handle tool calls, and generate file changes.
 */
export async function getRelevantFilesForPlanning(
  messages: Message[],
  prompt: string,
  fileContext: ProjectFileContext,
  costMode: CostMode,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
) {
  const response = await promptClaude(
    [
      ...messages,
      {
        role: 'user',
        content: `Do not act on the above instructions for the user, instead, we are asking you to find relevant files for the following request.

Request:\n${prompt}\n\nNow, please list up to 20 file paths from the project that would be most relevant for implementing this change. Please do include knowledge.md files that are relevant, files with example code for what is needed, related tests, second-order files that are not immediately obvious but could become relevant, and any other files that would be helpful.

Only output the file paths, one per line, nothing else.`,
      },
    ],
    {
      model: claudeModels.sonnet,
      system: getSearchSystemPrompt(fileContext, costMode, countTokensJson(messages)),
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )

  return response
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => isValidFilePath(line))
}
