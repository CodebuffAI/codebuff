import { Message } from 'common/actions'
import { System } from './claude'
import { promptClaude } from './claude'
import { claudeModels } from 'common/constants'
import { logger } from './util/logger'

export async function checkIfPlanRequired(
  messages: Message[],
  system: System,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId?: string
): Promise<boolean> {
  const planCheckPrompt = `
Given the user's request, determine if it requires a plan. A plan is needed if the request:
1. Requires at least 3 steps to complete
2. Is complex in nature
3. Requires verification of multiple parts

Analyze the request and respond with just the string:
"[REQUIRES_PLAN]" if a plan is needed, or
"[PLAN_UNNECESSARY]" if a plan is not needed.

Do not include any other text.

User request: ${messages[messages.length - 1].content}
`.trim()

  const response = await promptClaude(
    [...messages, { role: 'user', content: planCheckPrompt }],
    {
      model: claudeModels.sonnet,
      system,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )

  const requiresPlan = response.trim().includes('[REQUIRES_PLAN]')
  logger.info({ response, requiresPlan }, 'Plan check response')

  return requiresPlan
}
