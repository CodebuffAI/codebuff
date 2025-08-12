/*
 *  EDIT ME to create your own agent!
 *
 *  Change any field below, and consult the AgentDefinition type for information on all fields and their purpose.
 *
 *  Run your agent with:
 *  > codebuff --agent git-committer
 *
 *  Or, run codebuff normally, and use the '@' menu to mention your agent, and codebuff will spawn it for you.
 *
 *  Finally, you can publish your agent with 'codebuff publish your-custom-agent' so users from around the world can run it.
 */

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'my-custom-agent',
  displayName: 'My Custom Agent',

  model: 'anthropic/claude-4-sonnet-20250522',
  spawnableAgents: ['file-explorer'],

  // Check out .agents/types/tools.ts for more information on the tools you can include.
  toolNames: ['run_terminal_command', 'read_files', 'spawn_agents'],

  spawnerPrompt: 'Spawn when you need to review code changes in the git diff',

  instructionsPrompt: `Review the code changes and suggest improvements.
Execute the following steps:
1. Run git diff
2. Spawn a file explorer to find all relevant files
3. Read any relevant files
4. Review the changes and suggest improvements`,

  // Add more fields here to customize your agent further:
  // - system prompt
  // - input/output schema
  // - handleSteps

  // Check out the examples in .agents/examples for more ideas!
}

export default definition
