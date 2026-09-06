import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'code_search'
const endsAgentStep = true
const inputSchema = z
  .object({
    pattern: z
      .string()
      .min(1, 'Pattern cannot be empty')
      .describe(`The pattern to search for.`),
    flags: z
      .string()
      .optional()
      .describe(
        `Optional ripgrep flags to customize the search (e.g., "-i" for case-insensitive, "-g *.ts -g *.js" for TypeScript and JavaScript files only, "-g !*.test.ts" to exclude Typescript test files,  "-A 3" for 3 lines after match, "-B 2" for 2 lines before match).`,
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
      .default(15)
      .describe(
        `Maximum number of results to return per file. Defaults to 15. There is also a global limit of 250 results across all files.`,
      ),
  })
  .describe(
    `Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool.`,
  )
const legacyInputSchema = inputSchema.describe(
  `Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool. Use this tool only when read_files is not sufficient to find the files you need.`,
)
const buildDescription = (guidance: string) => `
${guidance}

Examples:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { pattern: 'foo' },
  endsAgentStep,
})}
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { pattern: 'foo\\.bar = 1\\.0' },
  endsAgentStep,
})}
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { pattern: 'import.*foo', cwd: 'src' },
  endsAgentStep,
})}
`.trim()

const legacyDescription = buildDescription(
  'Prefer read_files over code_search unless you need to search for a specific pattern across files.',
)
const description = buildDescription(
  'Matches come with line numbers, so in a large file you can search first and then read a window around a match with read_files.',
)

export const codeSearchDisplayVariants = {
  legacy: { description: legacyDescription, inputSchema: legacyInputSchema },
  windowed: { description, inputSchema },
}

export const codeSearchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
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
  ),
} satisfies $ToolParams
