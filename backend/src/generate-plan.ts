import { Message } from 'common/actions'
import { System } from './claude'
import { promptClaudeStream } from './claude'
import { claudeModels } from 'common/constants'

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
Based on the user's request, create a detailed plan for the assistant to follow with numbered steps to accomplish the task.

Please follow these guidelines:
1. Reduce the scope of the plan to the minimum necessary to accomplish the task. Try to avoid unnecessary steps and do not modify more files or run more terminal commands than absolutely necessary.
2. Break down the task into clear, actionable steps for the assistant to follow. The assistant can only edit files and run terminal commands as part of the plan. Do not include steps for the user to do.
3. Include appropriate verification steps along the way and at the end, such as running a command to do type checking and fixing errors, creating and running unit tests, or any other relevant checks.

User request: ${messages[messages.length - 1].content}

Please provide the plan in the following format:
1. [First step]
2. [Second step]
   a. [Sub-step if necessary]
   b. [Another sub-step if necessary]
3. [Verification step (if applicable)]
...

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
