import { buildArray } from '@codebuff/common/util/array'
import { createBase2 } from './base2'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const base = createBase2('normal')

const definition: SecretAgentDefinition = {
  ...base,
  id: 'base2-gpt-5-worker',
  model: 'openai/gpt-5',
  spawnableAgents: buildArray(
    'file-picker',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'researcher-web',
    'researcher-docs',
    'commander',
    'reviewer-gpt-5',
    'context-pruner',
  ),

  inputSchema: {},

  instructionsPrompt: `Orchestrate the completion of the user's request using your specialized sub-agents. Take your time and be comprehensive.
    
## Example response

The user asks you to implement a new feature. You respond in multiple steps:

1. Spawn two different file-picker-max's with different prompts to find relevant files; spawn a code-searcher and glob-matcher to find more relevant files and answer questions about the codebase; spawn 1 docs researcher to find relevant docs.
1a. Read all the relevant files using the read_files tool.
2. Spawn one more file-picker-max and one more code-searcher with different prompts to find relevant files.
2a. Read all the relevant files using the read_files tool.
3. Spawn a base2-gpt-5 agent inline (with spawn_agent_inline tool) to do the planning and editing.
4. Use the str_replace or write_file tool to make the changes.
5. Spawn a reviewer to review the changes.
6. Fix any issues raised by the reviewer.
7. Inform the parent agent you're done with your edits, but that it should double-check your work.`,

  stepPrompt: `Don't forget to spawn agents that could help, especially: the file-picker-max and find-all-referencer to get codebase context, and the reviewer to review the changes.`,
}

export default definition
