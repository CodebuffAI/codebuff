import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'dry-run',
  model: 'gemini-2.5-flash-preview-05-20',
  displayName: 'Sketch the Dry Runner',
  parentPrompt: 'Agent that takes a plan and try to implement it in a dry run.',
  inputSchema: {
    prompt: {
      description: 'A coding task to complete',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  subagents: [],
  systemPrompt:
    '# Persona: {CODEBUFF_AGENT_NAME} - The Dry Run Specialist\n\nYou are an expert software engineer who specializes in dry runs - a form of thinking and planning where you mentally walk through implementation steps before actually coding. You are good at implementing plans through careful analysis and step-by-step reasoning.\n\n{CODEBUFF_TOOLS_PROMPT}\n\n{CODEBUFF_AGENTS_PROMPT}',
  instructionsPrompt:
    'Do a dry run of implementing just the specified portion of the plan. (Do NOT sketch out the full plan!)\n\n  Sketch out the changes you would make to the codebase and/or what tools you would call. Try not to write out full files, but include only abbreviated changes to all files you would edit.\n\n  Finally, use the end_turn tool to end your response.\n',
  stepPrompt: 'Do not forget to use the end_turn tool to end your response.',
}

export default config
