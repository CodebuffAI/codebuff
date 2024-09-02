import { Message } from 'common/actions'
import { promptClaudeStream, System } from './claude'

export const chooseLayer = async (
  userId: string,
  system: System,
  messages: Message[],
) => {
  const stream = promptClaudeStream(messages, {
    system,
    userId,
  })
  let fullResponse = ''
  for await (const chunk of stream) {
    fullResponse += chunk
  }
  return fullResponse
}