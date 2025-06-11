import { CostMode, models } from 'common/constants'

import { CoreMessage } from 'ai'
import { getAgentStream } from './prompt-agent-stream'
import { logger } from './util/logger'
import { TOOL_LIST } from './tools'

export async function getThinkingStream(
  messages: CoreMessage[],
  onChunk: (chunk: string) => void,
  options: {
    costMode: CostMode
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
) {
  const { getStream, model } = getAgentStream({
    costMode: options.costMode,
    selectedModel: 'gemini-2.5-pro',
    stopSequences: [
      '</think_deeply>',
      '<think_deeply>',
      '<read_files>',
      '<end_turn>',
    ],
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    userId: options.userId,
  })

  const isO3 = model === models.o3pro || model === models.o3
  const thinkingPrompt = isO3
    ? `You are an expert programmer. Think deeply about the user request in the message history and how to best approach it. Consider edge cases, potential issues, and alternative approaches.

When the next action is clear, you can stop your thinking immediately. For example:
- If you realize you need to read files, say what files you should read next, and then end your thinking.
- If you realize you completed the user request, say it is time to end your response and end your thinking.
- If you already did thinking previously that outlines a plan you are continuing to implement, you can stop your thinking immediately and continue following the plan.

Guidelines:
- Respond with your analysis or plan inside a think_deeply tool call.
- Explain clearly and concisely what would be helpful for a junior engineer to know to handle the user request.
- Show key snippets of code to guide the implementation to be as clean as possible.
- Figure out the solution to any errors or bugs and give instructions on how to fix them.
- DO NOT use any tools! You are only thinking, not taking any actions. You should refer to tool calls without angle brackets when talking about them: "I should use the read_files tool" and NOT "I should use <read_files>"
- Make sure to end your response with "</thought>\n</think_deeply> and don't write anything after that."

Example:
<think_deeply>
<thought>
The next step is to read src/foo.ts and src/bar.ts
</thought>
</think_deeply>
`.trim()
    : `You are an expert programmer. Think deeply about the user request in the message history and how to best approach it. Consider edge cases, potential issues, and alternative approaches. Only think - do not take any actions or make any changes.

The user cannot see anything you write, this is thinking that will be used to generate the response in the next step.

When the next action is clear, you can stop your thinking immediately. For example:
- If you realize you need to read files, say what files you should read next, and then end your thinking.
- If you realize you completed the user request, say it is time to end your response and end your thinking.
- If you already did thinking previously that outlines a plan you are continuing to implement, you can stop your thinking immediately and continue following the plan.

Guidelines:
- Think step by step and respond with your analysis using a think_deeply tool call.
- Be concise and to the point. The shorter the response the better.
- It's highly recommended to have a very short thinking session, like 1 sentence long, if the next action is clear.
- Do not write anything outside of the <think_deeply> tool call.
- DO NOT use any other tools! You are only thinking, not taking any actions. You should refer to tool calls without angle brackets when talking about them: "I should use the read_files tool" and NOT "I should use <read_files>"
- Make sure to end your response with "</thought>\n</think_deeply>"

Misc Guidelines:
- When mentioning a file path, make sure to include all the directories in the path to the file. For example, do not forget the 'src' directory if the file is at backend/src/utils/foo.ts.

Important: Keep your thinking as short as possible! Just a few words suffices. Especially in simple cases or when the next action is clear.`

  const thinkDeeplyPrefix = '<think_deeply>\n<thought>'

  const agentMessages: CoreMessage[] = [
    ...messages,
    { role: 'user' as const, content: thinkingPrompt },
    { role: 'assistant' as const, content: thinkDeeplyPrefix },
  ]

  const stream = getStream(agentMessages)

  let response = ''
  onChunk(thinkDeeplyPrefix)

  let wasTruncated = false
  let prefix = ''
  for await (let chunk of stream) {
    // Remove a prefix of the the think deeply tool call if it exists.
    prefix += chunk
    response += chunk
    if (thinkDeeplyPrefix.startsWith(prefix)) {
      continue
    }
    if (response.startsWith(thinkDeeplyPrefix)) {
      response = response.slice(thinkDeeplyPrefix.length)
      chunk = chunk.slice(chunk.length - response.length)
    }
    onChunk(chunk)

    // Check for any complete tool tag
    for (const tool of TOOL_LIST) {
      const toolTag = `<${tool}>`
      const tagIndex = response.indexOf(toolTag)
      if (tagIndex !== -1) {
        // Found a tool tag - truncate the response to remove it and everything after
        response = response.slice(0, tagIndex)
        wasTruncated = true
        break
      }
    }
    if (wasTruncated) {
      break
    }
  }

  response = thinkDeeplyPrefix + response

  if (!response.includes('</thought>')) {
    onChunk('</thought>\n')
    response += '</thought>\n'
  }
  if (!response.includes('</think_deeply>')) {
    onChunk('</think_deeply>')
    response += '</think_deeply>'
  }

  logger.debug({ response: response }, 'Thinking stream')
  return response
}
