import { Message } from 'common/types/message'
import { System } from '../llm-apis/claude'
import { OpenAIMessage } from '../llm-apis/openai-api'

export const messagesWithSystem = (messages: Message[], system: System) =>
  [{ role: 'system', content: system }, ...messages] as OpenAIMessage[]

export function getMessageText(message: Message): string | undefined {
  if (typeof message.content === 'string') {
    return message.content
  }
  return message.content.map((c) => ('text' in c ? c.text : '')).join('\n')
}
