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

- Gather context on the user's request
- Use the write_todos tool to write out your step-by-step implementation plan.
- Use the str_replace or write_file tool to make the changes.
- Test your changes by running appropriate validation commands for the project (e.g. typechecks, tests, lints, etc.). You may have to explore the project to find the appropriate commands.
- End your turn.`,

  stepPrompt: undefined,
}

export default definition
