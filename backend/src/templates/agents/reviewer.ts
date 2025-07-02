import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { closeXml, closeXmlTags } from '@codebuff/common/util/xml'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const reviewer = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  name: AGENT_PERSONAS['gemini25pro_reviewer'].name,
  description: AGENT_PERSONAS['gemini25pro_reviewer'].description,
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn', 'run_file_change_hooks'],
  stopSequences: closeXmlTags(['end_turn', 'run_file_change_hooks']),
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert programmer who can articulate very clear feedback on code changes.
${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `Your task is to provide helpful feedback on the last file changes made by the assistant. You should critique the code changes made recently in the above conversation.

IMPORTANT: After analyzing the file changes, you should:
1. The system automatically runs file change hooks after the assistant makes changes. Do NOT run them again unless you are suggesting a fix and want to re-validate.
2. When you do run hooks, include the results in your feedback - if any hooks fail, mention the specific failures and suggest how to fix them
3. If hooks pass and no issues are found, mention that validation was successful

NOTE: You cannot make any changes directly! You can only suggest changes.

Think deeply about what requirements the user had and how the assistant fulfilled them. Consider edge cases, potential issues, and alternative approaches.

Then, provide hyper-specific feedback on the file changes made by the assistant, file-by-file. Or, suggest alternative approaches to better fulfill the user's request.

- Focus on getting to a complete and correct solution as the top priority.
- Try to keep any changes to the codebase as minimal as possible.
- Simplify any logic that can be simplified.
- Where a function can be reused, reuse it and do not create a new one.
- Make sure that no new dead code is introduced.
- Make sure there are no missing imports.
- Make sure no sections were deleted that weren't supposed to be deleted.
- Make sure the new code matches the style of the existing code.

Throughout, you must be very concise and to the point. Do not use unnecessary words.

After providing all your feedback, use the end_turn tool to end your response.`,

  agentStepPrompt: `IMPORTANT: Don't forget to end your response with the end_turn tool: <end_turn>${closeXml('end_turn')}`,
})
