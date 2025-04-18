import { Message } from 'common/types/message'
import { getAgentStream } from './prompt-agent-stream'
import { CostMode } from 'common/constants'
import { logger } from './util/logger'
import { System } from './llm-apis/claude'

export async function getThinkingStream(
  messages: Message[],
  system: System,
  onChunk: (chunk: string) => void,
  options: {
    costMode: CostMode
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
) {
  const { getStream } = getAgentStream({
    costMode: options.costMode,
    selectedModel: 'gemini-2.5-pro',
    stopSequences: ['</think_deeply>'],
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    userId: options.userId,
  })

  const thinkingPrompt = `You are an expert programmer. Think deeply about the user request in the message history and how to best approach it. Consider edge cases, potential issues, and alternative approaches. Only think - do not take any actions or make any changes.

The user cannot see anything you write, this is thinking that will be used to generate the response in the next step.

Think step by step and respond with your analysis using a think_deeply tool call. Be concise and to the point. Do not write anything outside of the <think_deeply> tool call. Do not use any other tools or <end_turn> tags. Make sure to end your response with "</thought>\n</think_deeply>"`

  const thinkDeeplyPrefix = '<think_deeply>\n<thought>'

  const agentMessages = [
    ...messages,
    { role: 'user' as const, content: thinkingPrompt },
    { role: 'assistant' as const, content: thinkDeeplyPrefix },
  ]

  const stream = getStream(agentMessages, system)

  let response = thinkDeeplyPrefix
  onChunk(thinkDeeplyPrefix)
  for await (const chunk of stream) {
    onChunk(chunk)
    response += chunk
  }
  onChunk('</think_deeply>')
  response += '</think_deeply>'

  logger.debug({ response: response }, 'Thinking stream')
  return response
}
