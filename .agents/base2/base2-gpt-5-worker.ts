import { buildArray } from '@codebuff/common/util/array'
import { createBase2 } from './base2'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const base2 = createBase2('max')

const definition: SecretAgentDefinition = {
  ...base2,
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
3. Use the str_replace or write_file tool to make the changes.
4. Test your changes by running appropriate validation commands for the project (e.g. typechecks, tests, lints, etc.). You may have to explore the project to find the appropriate commands.
5. Inform the parent agent you're done with your edits, but that it should double-check your work.`,

  stepPrompt: `Don't forget to spawn agents that could help, especially: the file-picker-max and code-searcher to get codebase context.`,
}

export default definition
