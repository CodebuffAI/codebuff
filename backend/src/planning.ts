import { Message } from 'common/actions'
import { models, claudeModels } from 'common/constants'
import { createMarkdownFileBlock, ProjectFileContext } from 'common/util/file'
import { promptClaude } from './claude'
import { OpenAIMessage, promptOpenAIStream } from './open-router'
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

  let fullResponse = ''
  for await (const chunk of promptOpenAIStream(messages, {
    ...options,
    model: models.o1,
    temperature: 1,
  })) {
    fullResponse += chunk
    onChunk(chunk)
  }

  return fullResponse
}

/**
 * Prompt claude, handle tool calls, and generate file changes.
 */
export async function getRelevantFilesForPlanning(
  messages: Message[],
  prompt: string,
  fileContext: ProjectFileContext,
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
        content: `Given this request:\n${prompt}\n\nPlease list up to 20 file paths from the project that would be most relevant for implementing this change. Only output the file paths, one per line, nothing else.`,
      },
    ],
    {
      model: claudeModels.sonnet,
      system: getSearchSystemPrompt(fileContext),
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )

  return response.split('\n').filter((line) => line.trim().length > 0)
}
