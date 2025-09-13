import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

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
          `Optional ripgrep flags to customize the search (e.g., "-i" for case-insensitive, "-t ts" for TypeScript files only, "-A 3" for 3 lines after match, "-B 2" for 2 lines before match, "--type-not test" to exclude test files).`,
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          `Optional working directory to search within, relative to the project root. Defaults to searching the entire project.`,
        ),
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30)
        .describe(`Maximum number of results to return. Defaults to 30.`),
    })
    .describe(
      `Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool. Use this tool only when read_files is not sufficient to find the files you need.`,
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.union([
        z.object({
          stdout: z.string(),
          stderr: z.string().optional(),
          exitCode: z.number().optional(),
          message: z.string(),
        }),
        z.object({
          errorMessage: z.string(),
        }),
      ]),
    }),
  ]),
} satisfies $ToolParams
