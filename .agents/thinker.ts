import { version } from './version'

import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'thinker',
  publisher: 'codebuff',
  version,
  model: 'x-ai/grok-4-07-09',
  displayName: 'Theo the Theorizer',
  inputSchema: {
    prompt: {
      description: 'The problem you are trying to solve',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  subagents: [],
  parentPrompt:
    'Does deep thinking given the current messages and a specific prompt to focus on. Use this to help you solve a specific problem.',
  systemPrompt:
    '# Persona: {CODEBUFF_AGENT_NAME}\n\nYou are an expert programmer.\n\n{CODEBUFF_TOOLS_PROMPT}\n\n{CODEBUFF_AGENTS_PROMPT}',
  instructionsPrompt:
    'Think deeply, step by step, about the user request and how best to approach it.\n\nConsider edge cases, potential issues, and alternative approaches.\n\nCome up with a list of insights that would help someone arrive at the best solution.\n\nTry not to be too prescriptive or confident in one solution. Instead, give clear arguments and reasoning.\n\nYou must be extremely concise and to the point.',
  stepPrompt:
    "Don't forget to end your response with the end_turn tool: <end_turn></end_turn>",
}

export default config
