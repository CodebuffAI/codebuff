import { WebSocket } from 'ws'
import { Message } from 'common/actions'
import { ProjectFileContext } from 'common/util/file'
import { getSystemPrompt } from './system-prompt'
import { promptClaudeStream, System } from './claude'
import { assert } from 'common/util/object'
import { requestRelevantFiles } from './request-files-prompt'

export const layer2 = async (
  ws: WebSocket,
  userId: string,
  messages: Message[],
  fileContext: ProjectFileContext,
  onResponseChunk: (chunk: string) => void
) => {
  const lastMessage = messages[messages.length - 1]
  assert(
    lastMessage.role === 'user' && typeof lastMessage.content === 'string',
    'Last message must be from user and must be a string ' +
      `(got ${lastMessage.role} with content type ${typeof lastMessage.content})`
  )
  const userMessage = lastMessage.content
  const previousMessages = messages.slice(0, -1)

  const system = getSystemPrompt(fileContext, {
    checkFiles: true,
  })

  const [codeReviewResponse, brainstormResponse, files] = await Promise.all([
    codeReviewPrompt(userId, system, previousMessages, userMessage),
    brainstormPrompt(
      userId,
      system,
      previousMessages,
      userMessage,
      onResponseChunk
    ),
    requestRelevantFiles(ws, { messages, system }, fileContext, null, userId),
  ])

  return {
    codeReviewResponse,
    brainstormResponse,
    files,
  }
}

const codeReviewPrompt = async (
  userId: string,
  system: System,
  previousMessages: Message[],
  userMessage: string
) => {
  const prompt = `
<user_message>${userMessage}</user_message>

Please review the files and provide a detailed analysis of the code, especially as it relates to the user's request.
`.trim()

  const stream = promptClaudeStream(
    [...previousMessages, { role: 'user', content: prompt }],
    {
      system,
      userId,
    }
  )
  let fullResponse = ''
  for await (const chunk of stream) {
    fullResponse += chunk
  }
  return fullResponse
}

const brainstormPrompt = async (
  userId: string,
  system: System,
  previousMessages: Message[],
  userMessage: string,
  onResponseChunk: (chunk: string) => void
) => {
  const prompt = `
<user_message>${userMessage}</user_message>

Please brainstorm ideas to solve the user's request.
`.trim()

  const stream = promptClaudeStream(
    [...previousMessages, { role: 'user', content: prompt }],
    {
      system,
      userId,
    }
  )
  let fullResponse = ''
  for await (const chunk of stream) {
    fullResponse += chunk
    onResponseChunk(chunk as string)
  }
  return fullResponse
}
