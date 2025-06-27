import { Model } from '@codebuff/common/constants'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const reviewer = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description:
    'Reviews all the file changes made by the assistant and responds with critical feedback. Use this after making any significant change to the codebase.',
  promptSchema: {
    prompt: false,
    params: null,
  },
  includeMessageHistory: true,
  toolNames: ['update_report', 'end_turn'],
  stopSequences: [],
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `You are an expert programmer who can articulate very clear feedback on code changes.
${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: '',

  agentStepPrompt: `Review the above conversation between a user and an assistant. Your task is to provide helpful feedback on the final file changes made by the assistant.
  
Think deeply about what requirements the user had and how the assistant fulfilled them. Consider edge cases, potential issues, and alternative approaches.

Then, provide hyper-specific feedback on the file changes made by the assistant, file-by-file. Or, suggest alternative approaches to better fulfill the user's request.

- Focus on getting to a complete and correct solution as the top priority.
- Try to keep any changes to the codebase as minimal as possible.
- Simplify any logic that can be simplified.
- Where a function can be reused, reuse it and do not create a new one.
- Make sure that no new dead code is introduced.
- Make sure there are no missing imports.
- Make sure no sections were deleted that weren't supposed to be deleted.

Write down some thoughts and analysis first, and finally use the update_report tool to compile all your feedback. Use the end_turn tool to end your response.

IMPORTANT: Use the update_report tool to write out your final report when you are ready. Only what is included in the update_report tool call will be sent to the user. Don't forget to close the tag for update_report: <update_report><json_update>...</json_update></update_report>`,
})
