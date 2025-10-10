import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { Model } from '@codebuff/common/old-constants'

export const createReviewer = (model: Model): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: 'Nit Pick Nick',
  spawnerPrompt:
    'Reviews file changes and responds with critical feedback. Use this after making any significant change to the codebase; otherwise, no need to use this agent for minor changes since it takes a second.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What should be reviewed. Be brief.',
    },
  },
  outputMode: 'last_message',
  toolNames: ['run_file_change_hooks'],
  spawnableAgents: [],

  inheritParentSystemPrompt: true,
  includeMessageHistory: true,

  instructionsPrompt: `Your task is to provide helpful feedback on the last file changes made by the assistant.

IMPORTANT: Before analyzing the file changes, you should first:
1. Run file change hooks to validate the changes using the run_file_change_hooks tool
2. Include the hook results in your feedback - if any hooks fail, mention the specific failures and suggest how to fix them
3. If hooks pass and no issues are found, mention that validation was successful
4. Always run hooks for TypeScript/JavaScript changes, test file changes, or when the changes could affect compilation/tests

NOTE: You cannot make any changes directly! You can only suggest changes.

Next, you should critique the code changes made recently in the above conversation. Provide specific feedback on the file changes made by the assistant, file-by-file.

- Focus on getting to a complete and correct solution as the top priority.
- Try to keep any changes to the codebase as minimal as possible.
- Simplify any logic that can be simplified.
- Where a function can be reused, reuse it and do not create a new one.
- Make sure that no new dead code is introduced.
- Make sure there are no missing imports.
- Make sure no sections were deleted that weren't supposed to be deleted.
- Make sure the new code matches the style of the existing code.
- Make sure there are no unnecessary try/catch blocks. Prefer to remove those.

Be concise and to the point.`,
})

const definition: SecretAgentDefinition = {
  id: 'reviewer',
  publisher,
  ...createReviewer('anthropic/claude-sonnet-4.5'),
}

export default definition
