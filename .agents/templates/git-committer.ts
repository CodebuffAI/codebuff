import { DynamicAgentConfig } from '@codebuff/common/types/dynamic-agent-template'

export default {
  id: 'CodebuffAI/git-committer',
  version: '0.0.1',
  model: 'google/gemini-2.5-pro',
  override: false,
  // implementation: 'llm',
  name: 'Git Committer',
  purpose:
    'A git committer agent specialized to commit current changes with an appropriate commit message.',
  promptSchema: {
    prompt: {
      type: 'string',
      description: 'What changes to commit',
    },
  },
  includeMessageHistory: false,
  outputMode: 'json',
  toolNames: [
    'read_files',
    'run_terminal_command',
    'set_output',
    'think_deeply',
    'end_turn',
  ],
  systemPrompt:
    'You are an expert software developer. Your job is to create a git commit with a really good commit message.',
  userInputPrompt: {
    path: './git-committer-user-prompt.md',
  },
  agentStepPrompt:
    'Make sure to end your response by using set_output to output a structured summary of what you committed and whether it was successful. Finally, use end_turn to end your turn.',
} satisfies DynamicAgentConfig
