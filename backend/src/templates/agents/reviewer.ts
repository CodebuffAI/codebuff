import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { closeXml } from '@codebuff/common/util/xml'
import z from 'zod/v4'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const reviewer = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  name: AGENT_PERSONAS['reviewer'].name,
  implementation: 'llm',
  description: AGENT_PERSONAS['reviewer'].description,
  promptSchema: {
    prompt: z.string().describe('What should be reviewed. Be brief.'),
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn', 'run_file_change_hooks'],
  spawnableAgents: [],
  initialAssistantMessage: undefined,
  initialAssistantPrefix: undefined,
  stepAssistantMessage: undefined,
  stepAssistantPrefix: undefined,

  systemPrompt: `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert programmer who can articulate very clear feedback on code changes.
${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `Your task is to provide helpful feedback on the last file changes made by the assistant. You should critique the code changes made recently in the above conversation.

IMPORTANT: After analyzing the file changes, you should:
1. Run file change hooks to validate the changes using the run_file_change_hooks tool
2. Include the hook results in your feedback - if any hooks fail, mention the specific failures and suggest how to fix them
3. If hooks pass and no issues are found, mention that validation was successful
4. Always run hooks for TypeScript/JavaScript changes, test file changes, or when the changes could affect compilation/tests

NOTE: You cannot make any changes directly! You can only suggest changes.

Provide specific feedback on the file changes made by the assistant, file-by-file.

- Focus on getting to a complete and correct solution as the top priority.
- Try to keep any changes to the codebase as minimal as possible.
- Simplify any logic that can be simplified.
- Where a function can be reused, reuse it and do not create a new one.
- Make sure that no new dead code is introduced.
- Make sure there are no missing imports.
- Make sure no sections were deleted that weren't supposed to be deleted.
- Make sure the new code matches the style of the existing code.

Be concise and to the point. After providing all your feedback, use the end_turn tool to end your response.`,

  agentStepPrompt: `IMPORTANT: Don't forget to end your response with the end_turn tool: <end_turn>${closeXml('end_turn')}`,
})
