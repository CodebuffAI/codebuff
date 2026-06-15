import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'read_logs'
const endsAgentStep = true
const inputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .describe('Path to the log file, relative to the project root unless absolute.'),
    lines: z
      .number()
      .int()
      .min(1)
      .max(2_000)
      .default(200)
      .optional()
      .describe('Number of trailing lines to read. Defaults to 200.'),
    max_chars: z
      .number()
      .int()
      .min(100)
      .max(100_000)
      .default(20_000)
      .optional()
      .describe('Maximum characters to return. Defaults to 20,000.'),
  })
  .describe('Read the last N lines from a log/text file without starting a background tail process.')

const description = `
Read the last N lines from a log/text file. Prefer this over starting a background \`tail -f\` job when you only need a snapshot of recent logs.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'logs/dev.log',
    lines: 100,
  },
  endsAgentStep,
})}
`.trim()

export const readLogsParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        path: z.string(),
        resolvedPath: z.string(),
        lines: z.number(),
        content: z.string(),
        truncated: z.boolean().optional(),
      }),
      z.object({
        path: z.string(),
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
