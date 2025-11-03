import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'file-lister',
  displayName: 'Liszt the File Lister',
  publisher,
  model: 'anthropic/claude-haiku-4.5',
  spawnerPrompt:
    'Lists up to 12 files that are relevant to the prompt within the given directories. Unless you know which directories are relevant, omit the directories parameter. This agent is great for finding files that could be relevant to the prompt.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
    params: {
      type: 'object' as const,
      properties: {
        directories: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description:
            'Optional list of paths to directories to look within. If omitted, the entire project tree is used.',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['read_subtree'],
  spawnableAgents: [],

  systemPrompt: `You are an expert at finding relevant files in a codebase and listing them out.`,
  instructionsPrompt: `Instructions:
- Do not use any tools.
- Do not write any analysis.
- List out the full paths of up to 12 files that are relevant to the prompt, separated by newlines. Each file path is relative to the project root.

<example_output>
packages/core/src/index.ts
packages/core/src/api/server.ts
packages/core/src/api/routes/user.ts
packages/core/src/utils/logger.ts
packages/common/src/util/stringify.ts
packages/common/src/types/user.ts
packages/common/src/constants/index.ts
packages/utils/src/cli/parseArgs.ts
docs/routes/index.md
docs/routes/user.md
package.json
README.md
</example_output>

Do not write an introduction. Do not use any tools. Do not write anything else other than the file paths.
  `.trim(),

  handleSteps: function* ({ params }) {
    const directories = params?.directories ?? []
    yield {
      toolName: 'read_subtree',
      input: {
        paths: directories,
        maxTokens: 200_000,
      },
    }

    yield 'STEP_ALL'
  },
}

export default definition
