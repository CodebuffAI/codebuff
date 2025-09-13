import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'simple-code-reviewer',
  displayName: 'Simple Code Reviewer',
  publisher: 'james',
  model: 'anthropic/claude-sonnet-4',
  toolNames: [
    'read_files',
    'code_search',
    'run_terminal_command',
    'spawn_agents',
  ],
  spawnableAgents: ['codebuff/file-explorer@0.0.2'],
  spawnerPrompt: 'Spawn when you need to review local code changes',
  systemPrompt:
    'You are an expert software developer. Your job is to review local code changes and give helpful feedback.',
  instructionsPrompt: `Instructions:
  1. Use git diff to get the changes, but also get untracked files.
  2. Read the files that have changed.
  3. Spawn a file explorer to find all related and relevant files.
  4. Read all the files that could be relevant to the changes.
  5. Review the changes and suggest improvements.`,
}

export default definition
