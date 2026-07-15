import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

import type { StepText } from '../types/agent-definition'

const MAX_LISTED_FILES = 8

export const createFileLister = (): Omit<SecretAgentDefinition, 'id'> => ({
  displayName: 'Liszt the File Lister',
  publisher,
  spawnerPrompt: `Lists up to ${MAX_LISTED_FILES} files that are relevant to the prompt within the given project-relative directories. Unless you know which directories are relevant, omit the directories parameter.`,
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
            'Optional project-relative directories to search. Absolute paths, traversal, glob syntax, and more than 8 entries are rejected.',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['query_index', 'read_subtree'],
  spawnableAgents: [],

  systemPrompt: `You are an expert at finding relevant files in a codebase and listing them out.`,
  instructionsPrompt: `Instructions:
- List at most ${MAX_LISTED_FILES} exact project-relative file paths that are relevant to the prompt, separated by newlines.
- Prefer paths surfaced by the local codebase graph index when they are relevant. Treat relatedFiles as useful adjacent context, but also use the repository tree context to avoid missing obvious nearby files.
- Do not write any introductory commentary.
- Do not write any analysis or any English text at all.
- Do not use any more tools. Do not call query_index or read_subtree again.

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

  handleSteps: function* ({ prompt, params }) {
    const rawDirectories = Array.isArray(params?.directories)
      ? params.directories
      : []
    const directories = Array.from(
      new Set(
        rawDirectories
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.replace(/\\/g, '/').replace(/^\.\//, ''))
          .map((value) => value.replace(/\/+$/, ''))
          .filter(
            (value) =>
              value.length > 0 &&
              value !== '.' &&
              !value.startsWith('/') &&
              !/^[A-Za-z]:\//.test(value) &&
              !value.split('/').includes('..') &&
              !/[?*{}[\]]/.test(value),
          ),
      ),
    ).slice(0, 8)
    if (rawDirectories.length > 0 && directories.length === 0) {
      yield {
        type: 'STEP_TEXT',
        text: 'No valid project-relative directory scope was provided.',
      } satisfies StepText
      return
    }
    const scopedPrompt =
      directories.length > 0
        ? `${prompt ?? ''}\nOnly return files within: ${directories.join(', ')}`
        : prompt
    if (typeof prompt === 'string' && prompt.trim().length > 0) {
      yield {
        toolName: 'query_index',
        input: {
          query: scopedPrompt,
          limit: 24,
          ...(directories.length > 0 ? { pathPrefixes: directories } : {}),
        },
      }
    }
    yield {
      toolName: 'read_subtree',
      input: {
        paths: directories,
        maxTokens: 8_000,
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
