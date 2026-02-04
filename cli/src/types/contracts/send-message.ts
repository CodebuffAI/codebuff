import type { PendingAttachment } from '../store'
import type { AgentMode } from '../../utils/constants'
import type { ChatMessage } from '../chat'

export type PostUserMessageFn = (prev: ChatMessage[]) => ChatMessage[]

export type SendMessageFn = (params: {
  content: string
  agentMode: AgentMode
  postUserMessage?: PostUserMessageFn
  attachments?: PendingAttachment[]
}) => Promise<void>
