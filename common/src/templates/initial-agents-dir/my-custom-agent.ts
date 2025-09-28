/*
 *  EDIT ME to create your own agent!
 *
 *  Run your agent with:
 *  > codebuff
 *  Inside codebuff:
 *  > @my-custom-agent please review my recent changes
 *
 *  Finally, you can publish your agent with:
 *  > codebuff publish my-custom-agent
 *  Then users from around the world can run it!
 */

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'my-custom-agent',
  displayName: 'My Custom Agent',

  model: 'x-ai/grok-4-fast',
  spawnableAgents: ['codebuff/file-explorer@0.0.6'],

  // Check out .agents/types/tools.ts for more information on the tools you can include.
  toolNames: ['run_terminal_command', 'read_files', 'spawn_agents'],

  spawnerPrompt: 'Spawn when you need to review code changes in the git diff',

  instructionsPrompt: `Review the code changes and suggest improvements.
Execute the following steps:
1. Run git diff
2. Spawn a file explorer to find all relevant files
3. Read any relevant files
4. Review the changes and suggest improvements`,

  // See also:
  // - types/agent-definition.ts file for more fields you can add
  // - the examples directory for more ideas!
}

export default definition
