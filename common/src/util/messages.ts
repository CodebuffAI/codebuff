import type { CodebuffMessage } from '../types/messages/codebuff-message'
import type { ModelMessage } from 'ai'

export function toContentString(msg: ModelMessage): string {
  const { content } = msg
  if (typeof content === 'string') return content
  return content.map((item) => (item as any)?.text ?? '').join('\n')
}

export function withCacheControl(msg: CodebuffMessage): CodebuffMessage {
  const message = { ...msg }
  if (!message.providerOptions) {
    message.providerOptions = {}
  }
  if (!message.providerOptions.anthropic) {
    message.providerOptions.anthropic = {}
  }
  message.providerOptions.anthropic.cacheControl = { type: 'ephemeral' }
  if (!message.providerOptions.openrouter) {
    message.providerOptions.openrouter = {}
  }
  message.providerOptions.openrouter.cacheControl = { type: 'ephemeral' }
  return message
}

export function convertCbToModelMessages({
  messages,
}: {
  messages: CodebuffMessage[]
}): ModelMessage[] {
  return messages
}
