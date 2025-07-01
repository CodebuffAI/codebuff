import { Model } from '@codebuff/common/constants'

import { generateCloseTags } from '../../util/parse-tool-call-xml'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const reviewer = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description:
    'Reviews file changes and responds with critical feedback. Use this after making any significant change to the codebase.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn', 'run_file_change_hooks'],
  stopSequences: generateCloseTags(['end_turn', 'run_file_change_hooks']),
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `You are an expert programmer who can articulate very clear feedback on code changes.
${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `Your task is to provide helpful feedback on the last file changes made by the assistant. You should critique the code changes made recently in the above conversation.

IMPORTANT: After analyzing the file changes, you should:
1. Only use the run_file_change_hooks tool if there are actual new file changes to evaluate (not just reviewing existing code)
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

  agentStepPrompt: `IMPORTANT: Don't forget to end your response with the end_turn tool: <end_turn></end_turn>`,
})
