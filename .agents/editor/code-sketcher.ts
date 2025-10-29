import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'code-sketcher',
  displayName: 'Code Sketcher',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  spawnerPrompt:
    'Spawn to sketch the code that will be needed to accomplish the task, focusing on the the key sections of logic or interfaces. Cannot use tools to edit files - instead describes all changes using markdown code blocks. Does not spawn other agents.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The coding task to sketch out, including the key sections of logic or interfaces it should focus on.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,
  toolNames: [],
  spawnableAgents: [],

  instructionsPrompt: `You are an expert programmer who sketches out the code that will be needed to accomplish the task.

You do not have access to tools to modify files. Instead, you describe all code changes using markdown code blocks.

Instructions:
- Think about the best way to accomplish the task
- Write out the sketch for each file that needs to be changed using markdown code blocks
- For each file, show the only the code changes needed, don't include the entire file
- Be extremely concise and only sketch the code that is asked for and nothing more

Important: Focus on the key sections of logic or interfaces that are needed to accomplish the task! You don't need to sketch out the more obvious parts of the code.
You can skip over parts of the code using psuedo code or placeholder comments.

Guidelines:
- Pay close attention to the user's request and address all requirements
- Focus on the simplest solution that accomplishes the task
- Reuse existing code patterns and conventions from the codebase
- Keep naming consistent with the existing codebase
- Try not to modify more files than necessary
- Avoid comments unless absolutely necessary to understand the code
- Do not add try/catch blocks unless needed
- Do not duplicate code that could instead use existing helpers in the codebase

Format your response with file blocks, like this:
path/to/file.ts
\`\`\`typescript
// ... existing code ...
[this is is the key section of code]
// ... existing code ...
\`\`\`
`,
}

export default definition
