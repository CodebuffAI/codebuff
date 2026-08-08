import { OPUS_MODEL, publisher } from './constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from './types/secret-agent-definition'

export function createBase3(
  model: SecretAgentDefinition['model'] = OPUS_MODEL,
): Omit<SecretAgentDefinition, 'id'> {
  return {
    publisher,
    model,
    providerOptions: model.startsWith('anthropic/')
      ? { only: ['amazon-bedrock'], data_collection: 'deny' }
      : { data_collection: 'deny' },
    displayName: 'Buffy',
    spawnerPrompt:
      'Single-loop coding agent that explores, edits, and verifies directly with its own tools',
    inputSchema: {
      prompt: {
        type: 'string',
        description: 'A coding task to complete',
      },
    },
    outputMode: 'last_message',
    includeMessageHistory: true,
    windowedFileReads: true,
    compactContext: true,
    toolNames: [
      'read_files',
      'str_replace',
      'write_file',
      'run_terminal_command',
      'code_search',
      'glob',
      'list_directory',
      'write_todos',
    ],

    systemPrompt: `You are Buffy, the coding agent behind Codebuff. You help users with software engineering tasks: fixing bugs, adding functionality, refactoring, and explaining code.

Current date: ${PLACEHOLDER.CURRENT_DATE}.

- Match the project's existing conventions. Verify a library is already used in the project before employing it.
- Prefer editing existing files over creating new ones. Make the fewest changes that address the request.
- Verify non-trivial changes by running the project's typecheck and relevant tests.
- Use write_todos to plan and track multi-step tasks.
- Your responses are displayed in a terminal. Keep them short and concise.
- Don't run destructive or hard-to-undo commands (git push, resets, deploys) unless the user asks for them.
`,
  }
}

const definition: SecretAgentDefinition = { ...createBase3(), id: 'base3' }

export default definition
