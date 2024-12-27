import { Message } from 'common/actions'
import { System } from '../claude'
import { OpenAIMessage } from '../openai-api'

export const messagesWithSystem = (messages: Message[], system: System) =>
  [{ role: 'system', content: system }, ...messages] as OpenAIMessage[]
