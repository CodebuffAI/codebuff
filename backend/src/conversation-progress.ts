import { Message } from 'common/actions'
import { ProjectFileContext } from 'common/util/file'
import { openaiModels, claudeModels } from 'common/constants'
import { promptOpenAI } from './openai-api'
import { promptClaude } from './claude'
import { getAgentSystemPrompt } from './system-prompt'
import { logger } from './util/logger'

export async function checkConversationProgress(
  messages: Message[],
  fileContext: ProjectFileContext,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
) {
  const prompt = `Review the conversation since the last user input and determine if we should stop. We should stop if either:
1. A minimal version of the user's request appears to be satisfied based on the changes and responses made
2. The conversation seems stuck in a loop or not making meaningful progress

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

Answer with only "STOP" or "CONTINUE". Do not include any other text.`

  const system = getAgentSystemPrompt(fileContext)

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

  return shouldStop
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

  const checkInfinitePrompt = `Does this user message indicate they want the assistant to continue until all cases are done or a condition is met? Answer only "yes" or "no", and do not include any other text.
Message: "${message.content}"

Examples of language indicating "yes":
- "do all of the cases"
- "run until condition X is satisfied" 
- "do the rest of the cases"
- "keep going until finished"
- "continue until complete"
- "build the whole thing"
- "complete the entire task"

Examples of language indicating "no":
- "Please continue"
- "Build feature X for me"
`
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
