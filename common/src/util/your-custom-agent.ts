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
 *  Finally, you can publish your agent with 'codebuff publish your-custom-agent'.
 */

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'git-committer',
  displayName: 'Git Committer',

  model: 'anthropic/claude-4-sonnet-20250522',
  toolNames: ['read_files', 'run_terminal_command', 'spawn_agents'],
  spawnableAgents: ['codebuff/file-explorer@0.0.1'],

  spawnPurposePrompt:
    'Spawn when you need to commit changes to the git repository',

  instructionsPrompt: `Execute the following steps:
1. Run git diff
2. Spawn a file explorer to find all relevant files to the change so you have the maximum context
3. Read any relevant files
4. Commit the changes to the git repository with a message that describes the changes`,

  // Add more fields here to customize your agent further: system prompt, input/output schema, handleSteps, etc.
}

export default definition
