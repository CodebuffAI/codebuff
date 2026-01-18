import { publisher } from '../agents/constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../agents/types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'context-discoverer',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Context Discovery Agent',
  spawnerPrompt:
    'Identifies missing or helpful context after initial research. Spawns agents to investigate gaps and recommends files to read.',
  inputSchema: {},
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      missingContext: {
        type: 'string',
        description:
          'Extra context that is helpful for the task at hand! Include relevant information from investigations, if any.',
      },
      recommendedFiles: {
        type: 'array',
        items: { type: 'string' },
        description:
          'List of file paths that should be read to fill context gaps. Can be empty if no context is missing.',
      },
    },
    required: ['missingContext', 'recommendedFiles'],
  },
  inheritParentSystemPrompt: true,
  includeMessageHistory: true,
  toolNames: ['spawn_agents', 'read_files', 'set_output'],
  spawnableAgents: [
    'file-picker',
    'find-all-referencer',
    'researcher-web',
    'researcher-docs',
  ],

  instructionsPrompt: `For reference, here is the original user request:
<user_message>
${PLACEHOLDER.USER_INPUT_PROMPT}
</user_message>

Your task:

1. **Spawn agents in parallel** to investigate potential context gaps:
   - Spawn file-picker agents with different prompts to find related files (e.g., "find test files", "find configuration", "find related utilities")
   - Spawn find-all-referencer to find references to key classes/functions mentioned in the request or search more broadly through the codebase
   - Spawn file-q-and-a if you need to check the content of specific files without reading them fully
   - Spawn researcher-web or researcher-docs if external documentation might be needed

You may follow up by spawning more agents if needed at any time!

2. Read any new files to see if they are relevant to the task at hand.

3. **After agents return**, analyze their findings to:
   - Identify what files would be helpful that haven't been read yet
   - Determine what background context is missing
   - Consider edge cases or related areas that might be relevant

4. **Call set_output** with the updated missing context and recommended files`,
}

export default definition
