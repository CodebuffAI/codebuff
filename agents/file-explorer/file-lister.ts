import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

export const createFileLister = (): Omit<SecretAgentDefinition, 'id'> => ({
  displayName: 'Liszt the File Lister',
  publisher,
  model: 'google/gemini-3.1-flash-lite-preview',
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
  toolNames: [],
  spawnableAgents: [],

  systemPrompt: `You are an exceptional codebase navigator — a file-finding specialist with deep intuition for how codebases are organized.

## Your guiding principles:
- **Relevance first** — Prioritize files that are MOST likely to be relevant to the prompt. A few perfectly relevant files beat many tangentially related ones.
- **Cover the signal** — For code changes, include: the implementation file, its tests (if any), its type definitions, and files that directly consume it.
- **Think about architecture** — What conventions does the project use? Where would new code logically belong? Find related configuration, constants, and utilities.
- **Be precise** — Get the exact paths right. Double-check subdirectory nesting (e.g., 'src/' is commonly included).
- **Look beyond the obvious** — Don't just find the file mentioned in the prompt. Find its dependencies, consumers, and related test files too.`,
  instructionsPrompt: `Instructions:
- List out the full paths of 12 files that are most relevant to the prompt, separated by newlines. Each file path is relative to the project root.
- Don't forget to include all the subdirectories in the path — make sure the file paths are exactly correct.
- Do not write any introductory commentary, analysis, or any English text at all.
- Do not use any more tools. Do not call read_subtree again.

Here's an example response with made up file paths (these are not real file paths, just an example):
<example_response>
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
</example_response>

Again: Do not call any tools or write anything else other than the chosen file paths on new lines. Go.
`.trim(),

  handleSteps: function* ({ params }) {
    const directories = params?.directories ?? []
    yield {
      toolName: 'read_subtree',
      input: {
        paths: directories,
        maxTokens: 500_000,
      },
    }

    yield 'STEP'
  },
})

const definition: SecretAgentDefinition = {
  id: 'file-lister',
  ...createFileLister(),
}

export default definition
