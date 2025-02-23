import { Message } from 'common/types/message'
import { ProjectFileContext } from 'common/util/file'
import {
  openaiModels,
  claudeModels,
  STOP_MARKER,
  CostMode,
} from 'common/constants'
import { promptOpenAI } from './openai-api'
import { promptClaude } from './claude'
import { getAgentSystemPrompt } from './system-prompt'
import { logger } from './util/logger'
import { countTokensJson } from './util/token-counter'

export async function checkConversationProgress(
  messages: Message[],
  fileContext: ProjectFileContext,
  options: {
    costMode: CostMode
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
) {
  const prompt =
    `Review the conversation since the last user input and determine if we should stop. We should stop if either:
1. The user's request appears to be completely satisfied based on the changes and responses made
2. The conversation seems stuck in a loop or not making meaningful progress toward the user's request.

Consider the conversation history:
${messages
  .map(
    (m) =>
      `${m.role.toUpperCase()}: ${
        typeof m.content === 'string'
          ? m.content
          : m.content.map((c) => ('text' in c ? c.text : '')).join('\n')
      }`
  )
  .join('\n\n')}

Answer with "STOP" or "CONTINUE". If "STOP", do not include any other text.

Otherwise, say very briefly what still needs to be completed to satify the user request.
`.trim()

  const messagesTokens = countTokensJson([{ role: 'user', content: prompt }])
  const system = getAgentSystemPrompt(
    fileContext,
    options.costMode,
    messagesTokens
  )

  const response = await promptClaude([{ role: 'user', content: prompt }], {
    model: claudeModels.sonnet,
    system,
    ...options,
  })

  const shouldStop = response.toUpperCase().trim() === 'STOP'
  logger.debug(
    { response, shouldStop },
    `checkConversationProgress ${response}`
  )

  return { shouldStop, response: response.replace(STOP_MARKER, '') }
}

export async function checkToAllowUnboundedIteration(
  message: Message,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
): Promise<boolean> {
  if (message.role !== 'user' || typeof message.content !== 'string') {
    return false
  }

  const checkInfinitePrompt =
    `Does this user message indicate they want the assistant to continue until all cases are done or a condition is met? Answer only "yes" or "no", and do not include any other text.
Message: "${message.content}"

Examples of language indicating "yes":
- "do all of the cases"
- "build the whole thing"
- "complete the entire task"
- "do the rest of the cases"
- "run until condition X is satisfied" 
- "keep going until finished"
- "continue until complete"
- "[...A bunch of unrelated stuff...] please test all changes and correct errors"

In these cases the user either asks to do all of something or says to keep going until a condition is met. Only say "yes" if the response is like this. This is rare.

Examples of language indicating "no":
- "Please continue"
- "Build feature X for me"
- "That didn't do it yet"
- "Try again"

These cases include everything else the user might say. It is common to answer "no".
`.trim()
  const response = await promptOpenAI(
    [{ role: 'user', content: checkInfinitePrompt }],
    {
      model: openaiModels.gpt4omini,
      ...options,
    }
  )

  logger.debug(
    { response, userMessage: message.content },
    'checkToAllowUnboundedIteration'
  )

  return response.toLowerCase().includes('yes')
}
