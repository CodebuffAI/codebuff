import { Model } from '@codebuff/common/constants'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const thinker = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Does thinking before a response',
  promptSchema: {
    prompt: 'optional',
    params: null,
  },
  includeMessageHistory: true,
  toolNames: [
    'read_files',
    'find_files',
    'code_search',
    'update_report',
    'end_turn',
  ],
  stopSequences: ['</read_files>', '</find_files>', '</code_search>'],
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `You are an expert programmer.
${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `Think deeply about the user request and how to best approach it. Consider edge cases, potential issues, and alternative approaches.

Log all your thoughts in the report for the user to see using the update_report tool.

When the next action is clear, you can stop your thinking immediately. For example:
- If you realize you need to read files, say what files you should read next, and then end your thinking.
- If you realize you completed the user request, say it is time to end your response and end your thinking.
- If you already did thinking previously that outlines a plan you are continuing to implement, you can stop your thinking immediately and continue following the plan.

Guidelines:
- Respond with your thoughts and analysis using the update_report tool.
- Explain clearly and concisely what would be helpful for a junior engineer to know to handle the user request.
- Show key snippets of code to guide the implementation to be as clean as possible.
- Figure out the solution to any errors or bugs and give instructions on how to fix them.
- Use end_turn to end your response.`,

  agentStepPrompt: 'Use the update_report tool to write out your final thoughts when you are ready. Only what is included in the update_report tool call will be sent to the user. Don\'t forget to close the tag for update_report: <update_report><json_update>...</json_update></update_report>',
})
