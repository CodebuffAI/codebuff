import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

import type { StepText } from '../types/agent-definition'
import type { ToolResultOutput } from '../types/util-types'

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
    // Keep helpers inside handleSteps: bundled programmatic agents serialize
    // this generator without its module-level closures.
    const extractFilePathsFromSubtree = (
      toolResult: ToolResultOutput[] | undefined,
    ): string[] => {
      const directoryResults = (toolResult ?? []).flatMap((part) => {
        if (part.type !== 'json' || !Array.isArray(part.value)) return []
        return part.value.filter(
          (value): value is {
            path: string
            type: 'directory'
            printedTree: string
          } =>
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            value.type === 'directory' &&
            typeof value.path === 'string' &&
            typeof value.printedTree === 'string',
        )
      })
      const paths: string[] = []

      for (const result of directoryResults) {
        const directoryStack: string[] = []
        let previousFileDepth: number | undefined

        for (const rawLine of result.printedTree.split('\n')) {
          if (rawLine.trim().length === 0) continue
          const depth = rawLine.length - rawLine.trimStart().length
          const name = rawLine.trim()

          // Parsed symbols are printed one indentation level below their file.
          if (previousFileDepth !== undefined && depth > previousFileDepth) {
            continue
          }
          previousFileDepth = undefined

          if (name.endsWith('/')) {
            directoryStack.length = depth
            directoryStack[depth] = name.slice(0, -1)
            continue
          }

          const path = [...directoryStack.slice(0, depth), name]
            .filter(Boolean)
            .join('/')
          if (path.length > 0) paths.push(path)
          previousFileDepth = depth
        }
      }

      return Array.from(new Set(paths))
    }
    const isWithinDirectory = (path: string): boolean =>
      directories.some(
        (directory) =>
          path === directory || path.startsWith(`${directory}/`),
      )
    const rankFilePaths = (paths: string[]): string[] => {
      const keywords = Array.from(
        new Set((prompt ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []),
      )
      return paths
        .map((path, index) => ({
          path,
          index,
          score: keywords.reduce(
            (score, keyword) =>
              score + (path.toLowerCase().includes(keyword) ? 1 : 0),
            0,
          ),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 8)
        .map(({ path }) => path)
    }
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
    const { toolResult: subtreeResult } = yield {
      toolName: 'read_subtree',
      input: {
        paths: directories,
        maxTokens: 8_000,
      },
    }

    if (directories.length > 0) {
      const scopedPaths = extractFilePathsFromSubtree(subtreeResult).filter(
        isWithinDirectory,
      )
      const rankedPaths = rankFilePaths(scopedPaths)
      if (rankedPaths.length > 0) {
        yield {
          type: 'STEP_TEXT',
          text: rankedPaths.join('\n'),
        } satisfies StepText
        return
      }
    }

    yield 'STEP'
  },
})

const definition: SecretAgentDefinition = {
  id: 'file-lister',
  ...createFileLister(),
}

export default definition
