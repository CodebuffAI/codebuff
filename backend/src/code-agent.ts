import { WebSocket } from 'ws'

import { Message } from 'common/actions'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { getCoderPrompt } from './system-prompt'
import { assert } from 'common/util/object'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { processFileBlock } from './main-prompt'

export const codeAgent = async (
  userId: string,
  fileContext: ProjectFileContext,
  messages: Message[],
  ws: WebSocket,
  onResponseChunk: (chunk: string) => void
) => {
  const coderPrompt = getCoderPrompt(fileContext)
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
  console.log('messagesWithContext', messagesWithContext)

  onResponseChunk('Generating response with o1-preview...\n\n')

  const response = await promptOpenAI(
    userId,
    messagesWithContext,
    'o1-preview',
    { temperature: 1 }
  )

  onResponseChunk(response + '\n')
  console.log('response', response)

  const fileBlocks = parseFileBlocks(response)
  const changes = await Promise.all(
    Object.entries(fileBlocks).map(([filePath, fileBlock]) =>
      processFileBlock(userId, ws, messages, response, filePath, fileBlock)
    )
  )

  console.log('changes', changes)

  return { response, changes }
}
