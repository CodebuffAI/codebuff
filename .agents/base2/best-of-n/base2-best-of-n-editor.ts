import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'

const definition: SecretAgentDefinition = {
  id: 'base2-best-of-n-editor',
  publisher,
  model: 'x-ai/grok-4-fast',
  displayName: 'Best-of-N Editor',
  spawnerPrompt:
    'Parses the selected implementation and applies all code changes',

  toolNames: ['str_replace', 'write_file'],
  spawnableAgents: [],

  inputSchema: {
    prompt: {
      type: 'string',
      description: '',
    },
  },
  outputMode: 'last_message',

  instructionsPrompt: `You are the best-of-n editor agent. You have been provided with a selected implementation.

The implementation contains tool calls in the following format:

<codebuff_tool_call>
{
  "cb_tool_name": "str_replace",
  "path": "path/to/file",
  "replacements": [...]
}
</codebuff_tool_call>

OR

<codebuff_tool_call>
{
  "cb_tool_name": "write_file",
  "path": "path/to/file",
  "instructions": "...",
  "content": "..."
}
</codebuff_tool_call>

Your task is to:
1. Parse all the tool calls from the implementation text
2. Execute each tool call in order using your str_replace and write_file tools
3. Apply all the changes exactly as specified in the implementation

IMPORTANT: You must execute ALL tool calls from the implementation. Do not skip any changes.

After completing the tool calls with tool results that confirm the changes were applied, please end your turn and do not write anything else.`,
}

export default definition
