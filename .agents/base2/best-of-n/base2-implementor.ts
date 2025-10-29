import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'

const definition: SecretAgentDefinition = {
  id: 'base2-implementor',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Implementation Generator',
  spawnerPrompt:
    'Generates a complete implementation plan with all code changes',

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  toolNames: [],
  spawnableAgents: [],

  inputSchema: {},
  outputMode: 'last_message',

  instructionsPrompt: `You are an implementation generator agent. Your task is to write out ALL the code changes needed to complete the user's request in a single comprehensive response.

Write out what changes you would make using the tool call format below. Use this exact format for each file change:

<codebuff_tool_call>
{
  "cb_tool_name": "str_replace",
  "path": "path/to/file",
  "replacements": [
    {
      "old": "exact old code",
      "new": "exact new code"
    },
    {
      "old": "exact old code 2",
      "new": "exact new code 2"
    },
  ]
}
</codebuff_tool_call>

OR for new files or major rewrites:

<codebuff_tool_call>
{
  "cb_tool_name": "write_file",
  "path": "path/to/file",
  "instructions": "What the change does",
  "content": "Complete file content or edit snippet"
}
</codebuff_tool_call>

Your implementation should:
- Be complete and comprehensive
- Include all necessary changes to fulfill the user's request
- Follow the project's conventions and patterns
- Be as simple and maintainable as possible
- Reuse existing code wherever possible
- Include proper error handling
- Be well-structured and organized

Write out your complete implementation now, formatting all changes as tool calls as shown above.`,

  handleSteps: function* () {
    yield 'STEP'
  },
}

export default definition
