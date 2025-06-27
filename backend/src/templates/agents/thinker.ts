import { Model } from '@codebuff/common/constants'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const thinker = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description:
    'Does deep thinking given the current messages and a specific prompt to focus on. Use this to help you solve a specific problem.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  stopSequences: ['</end_turn>'],
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `You are an expert programmer.
${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `Think deeply about the user request and how to best approach it. Consider edge cases, potential issues, and alternative approaches.

Guidelines:
- Explain clearly and concisely what would be helpful for a junior engineer to know to handle the user request.
- Show key snippets of code to guide the implementation to be as clean as possible.
- Figure out the solution to any errors or bugs and give instructions on how to fix them.
- Use end_turn to end your response.

When the next action is clear, you can stop your thinking immediately. For example:
- If you realize you need to read files, say what files you should read next, and then end your thinking.
- If you realize you completed the user request, say it is time to end your response and end your thinking.
- If you already did thinking previously that outlines a plan you are continuing to implement, you can stop your thinking immediately and continue following the plan.`,

  agentStepPrompt: `Don't forget to end your response with the end_turn tool: <end_turn></end_turn>`,
})
