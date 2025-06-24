import { models } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { baseAgentSystemPrompt } from '../base-prompts'
import { AgentTemplate, baseAgentToolNames } from '../types'

const model = models.sonnet

export const gemini25pro_thinking: AgentTemplate = {
  type: AgentTemplateTypes.gemini25pro_thinking,
  description: 'Does thinking before a response',
  model,
  toolNames: baseAgentToolNames,
  stopSequences: [
    '</thought>',
    '</think_deeply>',
    '<read_files>',
    '<write_files>',
    '<end_turn>',
  ],
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: `<think_deeply>`,

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: `You are an expert programmer. Think deeply about the user request in the message history and how to best approach it. Consider edge cases, potential issues, and alternative approaches.

When the next action is clear, you can stop your thinking immediately. For example:
- If you realize you need to read files, say what files you should read next, and then end your thinking.
- If you realize you completed the user request, say it is time to end your response and end your thinking.
- If you already did thinking previously that outlines a plan you are continuing to implement, you can stop your thinking immediately and continue following the plan.

Guidelines:
- Respond with your analysis or plan inside a think_deeply tool call.
- Explain clearly and concisely what would be helpful for a junior engineer to know to handle the user request.
- Show key snippets of code to guide the implementation to be as clean as possible.
- Figure out the solution to any errors or bugs and give instructions on how to fix them.
- DO NOT use any tools! You are only thinking, not taking any actions. You should refer to tool calls without angle brackets when talking about them: "I should use the read_files tool" and NOT "I should use <read_files>"
- Make sure to end your response with "</thought>\n</think_deeply> and don't write anything after that."

Example:
<think_deeply>
<thought>
The next step is to read src/foo.ts and src/bar.ts
</thought>
</think_deeply>`,
  agentStepPrompt: '',
}
