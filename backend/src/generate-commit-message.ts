import { promptClaude } from './claude'
import { claudeModels } from 'common/constants'

export async function generateCommitMessage(
  stagedChanges: string,
  clientSessionId: string,
  fingerprintId: string,
  userId?: string
): Promise<string> {
  const prompt = `
Given the following staged changes, please generate an appropriate commit message:

${stagedChanges}

The commit message should follow these guidelines:
1. Use the imperative mood in the subject line (e.g., "Add feature" instead of "Added feature")
2. Limit the subject line to 50 characters
3. Capitalize the subject line
4. Do not end the subject line with a period
5. Separate subject from body with a blank line
6. Wrap the body at 72 characters
7. Use the body to explain what and why vs. how

Please provide only the commit message, without any additional explanation.
`

  const response = await promptClaude(
    [{ role: 'user', content: prompt }],
    {
      model: claudeModels.sonnet,
      clientSessionId,
      fingerprintId,
      userInputId: 'generate-commit-message',
      userId,
    }
  )

  return response.trim()
}
