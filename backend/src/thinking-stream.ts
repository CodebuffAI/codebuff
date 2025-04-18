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
    stopSequences: ['</think_deeply>', '<think_deeply>', '<read_files>'],
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    userId: options.userId,
  })

  const thinkingPrompt = `You are an expert programmer. Think deeply about the user request in the message history and how to best approach it. Consider edge cases, potential issues, and alternative approaches. Only think - do not take any actions or make any changes.

The user cannot see anything you write, this is thinking that will be used to generate the response in the next step.

When the next action is clear, you can stop your thinking immediately. For example:
- If you realize you need to read files, say what files you should read next, and then end your thinking.
- If you realize you completed the user request, say it is time to use the <end_turn> tool and end your thinking.
- If you already did thinking previously that outlines a plan you are continuing to implement, you can stop your thinking immediately and continue following the plan.

Guidelines:
- Think step by step and respond with your analysis using a think_deeply tool call.
- Be concise and to the point.
- It's fine to have a very short thinking session, like 1 sentence long, if the next action is clear.
- Do not write anything outside of the <think_deeply> tool call.
- DO NOT use any other tools! You are only thinking, not taking any actions.
- Do not include <end_turn> tags (or any other tool call tags).
- Make sure to end your response with "</thought>\n</think_deeply>"`

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
  if (!response.includes('</thought>')) {
    onChunk('</thought>\n')
    response += '</thought>\n'
  }
  onChunk('</think_deeply>')
  response += '</think_deeply>'

  logger.debug({ response: response }, 'Thinking stream')
  return response
}
