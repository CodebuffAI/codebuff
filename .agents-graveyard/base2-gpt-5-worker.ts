import { buildArray } from '@codebuff/common/util/array'

import { createBase2 } from '../.agents/base2/base2'

import type { SecretAgentDefinition } from '../.agents/types/secret-agent-definition'

const base2 = createBase2('max')

const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-gpt-5-worker',
  model: 'openai/gpt-5.1',
  spawnableAgents: buildArray(
    'file-picker',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'researcher-web',
    'researcher-docs',
    'commander',
    'editor-best-of-n-gpt-5',
    'context-pruner',
  ),

  inputSchema: {},

  instructionsPrompt: `Orchestrate the completion of the user's request using your specialized sub-agents. Take your time and be comprehensive.
    
## Example response

The user asks you to implement a new feature. You respond in multiple steps:

- Gather context on the user's request by spawning agents and reading files.
- Use the write_todos tool to write out your step-by-step implementation plan.
- Use the editor-best-of-n-gpt-5 tool to implement the changes. This is the best way to make high quality code changes -- strongly prefer using this agent over the str_replace or write_file tool.
- For smaller fixes, use the str_replace or write_file tool to make the changes.
- Test your changes by running appropriate validation commands for the project (e.g. typechecks, tests, lints, etc.). You may have to explore the project to find the appropriate commands.`,

  stepPrompt: undefined,
}

export default definition
