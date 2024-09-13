import { WebSocket } from 'ws'

import { Message } from 'common/actions'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { getCoderPrompt } from './system-prompt'
import { assert } from 'common/util/object'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { FileChange } from 'common/actions'

/**
 * Handles code-related actions by interacting with the AI assistant to generate and apply code changes.
 *
 * The `codeAgent` function serves as the primary handler for processing user instructions related to code modifications.
 * It leverages the AI assistant to interpret user requests, generate appropriate responses, and apply necessary changes
 * to the codebase in a context-aware manner.
 *
 * Steps involved:
 * 1. Constructs a prompt using the system-generated coder prompt and the latest user message.
 * 2. Sends the prompt to the OpenAI API to generate a response.
 * 3. Processes the AI's response by removing unnecessary markdown syntax.
 * 4. Parses the response into file blocks and generates corresponding file changes.
 * 5. Applies the generated patches to the relevant files.
 *
 * @param userId - The unique identifier of the user initiating the code action.
 * @param fileContext - An object representing the current context of project files, including their contents.
 * @param messages - An array of user and assistant messages exchanged in the current session.
 * @param ws - The WebSocket connection instance for real-time communication with the client.
 * @param onResponseChunk - A callback function to handle chunks of the AI assistant's response as they are received.
 * @returns An object containing the AI assistant's full response and the list of file changes generated.
 *
 * @throws Will throw an error if the OpenAI API request fails or returns an unexpected response.
 */
export const codeAgent = async (
  userId: string,
  fileContext: ProjectFileContext,
  messages: Message[],
  ws: WebSocket,
  onResponseChunk: (chunk: string) => void
) => {
  const coderPrompt = getCoderPrompt(fileContext, {
    checkFiles: true,
  })
  const lastMessage = messages[messages.length - 1]
  assert(lastMessage.role === 'user', 'Last message must be from user')
  assert(
    typeof lastMessage.content === 'string',
    'Last user message must be text'
  )

  const infoPrompt = `Please use the above information to answer the user's question:`
  const content = [coderPrompt, infoPrompt, lastMessage.content].join('\n\n')

  const messagesWithContext = [
    ...messages.slice(0, -1),
    {
      ...lastMessage,
      content,
    },
  ] as OpenAIMessage[]

  onResponseChunk('Generating response with o1-preview...\n\n')

  const response = await promptOpenAI(userId, messagesWithContext, 'o1-preview', {
    temperature: 1,
  })

  onResponseChunk(response + '\n')
  console.log('response', response)
  const modifiedResponse = response
    .split('\n')
    .filter((line) => !line.includes('```'))
    .join('\n')

  console.log('modifiedResponse', modifiedResponse)
  const fileBlocks = parseFileBlocks(modifiedResponse)
  const changes: FileChange[] = await Promise.all(
    Object.entries(fileBlocks).map(([filePath, fileBlock]) => ({
      filePath,
      content: fileBlock,
      type: 'patch',
    }))
  )

  console.log('changes', changes)

  return { response, changes }
}
