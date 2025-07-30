import type { ToolParams } from '../../constants'

import z from 'zod/v4'

const toolName = 'code_search'
const endsAgentStep = true
export const codeSearchParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      pattern: z
        .string()
        .min(1, 'Pattern cannot be empty')
        .describe(`The pattern to search for.`),
      flags: z
        .string()
        .optional()
        .describe(
          `Optional ripgrep flags to customize the search (e.g., "-i" for case-insensitive, "-t ts" for TypeScript files only, "-A 3" for 3 lines after match, "-B 2" for 2 lines before match, "--type-not test" to exclude test files).`
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          `Optional working directory to search within, relative to the project root. Defaults to searching the entire project.`
        ),
    })
    .describe(
      `Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool. Use this tool only when read_files is not sufficient to find the files you need.`
    ),
} satisfies ToolParams
