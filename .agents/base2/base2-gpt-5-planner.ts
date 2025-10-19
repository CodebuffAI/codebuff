import { buildArray } from '@codebuff/common/util/array'
import { createBase2 } from './base2'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const base = createBase2('normal')

const definition: SecretAgentDefinition = {
  ...base,
  id: 'base2-gpt-5-planner',
  model: 'openai/gpt-5',

  toolNames: ['spawn_agents', 'read_files'],

  spawnableAgents: buildArray(
    'file-picker-max',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'researcher-web',
    'researcher-docs',
    'commander',
    'context-pruner',
  ),

  inputSchema: {},

  instructionsPrompt: `For reference, here is the original user request:
<user_message>
${PLACEHOLDER.USER_INPUT_PROMPT}
</user_message>
  
Orchestrate the completion of the user's request using your specialized sub-agents. Take your time and be comprehensive.
    
## Example response

The user asks you to implement a new feature. You respond in multiple steps:

1. Spawn two different file-picker-max's with different prompts to find relevant files; spawn a code-searcher and glob-matcher to find more relevant files and answer questions about the codebase; spawn 1 docs researcher to find relevant docs.
1a. Read all the relevant files using the read_files tool.
2. Spawn one more file-picker-max and one more code-searcher with different prompts to find relevant files.
2a. Read all the relevant files using the read_files tool.
3. Gather any additional context you need with sub-agents and the read_files tool.
4. Write out a plan for the changes, but do not implement it yet!

For your plan:
- You do not have access to tools to modify files (e.g. the write_file or str_replace tools). You are describing changes that should be made or actions that should be taken.
- IMPORTANT: You must pay attention to the user's request! Make sure to address all the requirements in the user's request.
- Think the most about the cruxes of the task. It's most important to get the key decisions right.
- Focus on implementing the simplest solution that will accomplish the task in a high quality manner.
- Use markdown code blocks to describe key changes.
- Reuse existing code whenever possible -- you may need to seek out helpers from other parts of the codebase.
- Use existing patterns and conventions from the codebase. Keep naming consistent. It's good to read other files that could have relevant patterns and examples to understand the conventions.
- Try to modify as few files as possible to accomplish the task.

Things to avoid:
- try/catch blocks for error handling unless absolutely necessary.
- writing duplicate code that could be replaced with a helper function or especially an existing function.
- touching a lot of files unnecessarily.

After writing out your plan, you should end your turn.
`,
}

export default definition
