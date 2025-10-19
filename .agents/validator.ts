import { publisher } from './constants'
import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'validator',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Validator',
  spawnerPrompt:
    'Attempts to build/test/verify the project and automatically fix issues it finds. Useful after making edits or when CI/typecheck/tests are failing. Works across monorepos: discovers scripts (build/test/typecheck/lint), runs them, analyzes failures, and applies minimal fixes.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Optional context about what to verify/fix (e.g., a specific package, script, or error focus).',
    },
  },
  outputMode: 'last_message',

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  toolNames: ['read_files', 'str_replace', 'write_file', 'spawn_agents'],
  spawnableAgents: [
    'codebase-commands-explorer',
    'file-picker',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'commander',
  ],

  instructionsPrompt: `Insructions:
1. If you don't know which commands to run to validate the code, spawn the codebase-commands-explorer agent to discover how to build/test/verify the project.
2. Run the commands to validate the project
3. Fix any issues found
4. Repeat 2 and 3 until the project is validated successfully.
5. Give a final summary that includes the exact commands you ran and the issues you fixed and the final state (are all the types/tests passing?). Be extremely concise.`,
}

export default definition
