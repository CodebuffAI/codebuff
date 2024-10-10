import { Message } from 'common/actions'
import { System } from './claude'
import { promptClaudeStream } from './claude'
import { claudeModels, STOP_MARKER } from 'common/constants'

export async function generatePlan(
  messages: Message[],
  system: System,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  onResponseChunk: (chunk: string) => void,
  userId?: string
): Promise<string> {
  const planGenerationPrompt = `
Based on the user's request, create a detailed plan with numbered steps to accomplish the task. Include appropriate verification steps where necessary, such as running type checkers, creating and running unit tests, or any other relevant checks.

Please follow these guidelines:
1. Break down the task into clear, actionable steps.
2. Include verification steps where appropriate.
3. Consider potential edge cases or complications.
4. If any step requires significant changes, break it down further.
5. Aim for a comprehensive plan that covers all aspects of the request.

User request: ${messages[messages.length - 1].content}

Please provide the plan in the following format:
1. [First step]
2. [Second step]
   a. [Sub-step if necessary]
   b. [Another sub-step if necessary]
3. [Verification step (if applicable)]
4. [Next step]
...

Ensure that the plan is thorough and covers all necessary aspects of the user's request.

Please start by telling the user you will create a plan to address their request.
`

  let fullPlan = ''
  const stream = promptClaudeStream(
    [...messages, { role: 'user', content: planGenerationPrompt }],
    {
      model: claudeModels.sonnet,
      system,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )

  for await (const chunk of stream) {
    fullPlan += chunk
    onResponseChunk(chunk)
  }

  return fullPlan.trim()
}
