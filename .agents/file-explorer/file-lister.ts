import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'file-lister',
  displayName: 'Liszt the File Lister',
  publisher,
  model: 'anthropic/claude-haiku-4.5',
  spawnerPrompt: 'Lists files that are relevant to the prompt',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [],
  spawnableAgents: [],

  systemPrompt: `You are an expert at finding relevant files in a codebase and listing them out. ${PLACEHOLDER.FILE_TREE_PROMPT_LARGE}`,
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
}

export default definition
