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
      .optional()
      .describe(
        'Path to the log file, relative to the project root unless absolute. Required unless jobId is provided.',
      ),
    jobId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Background job id returned by run_terminal_command(process_type: BACKGROUND). When provided, reads the job log file directly.',
      ),
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
  .refine((input) => Boolean(input.path || input.jobId), {
    message: 'Either path or jobId is required',
  })
  .describe(
    'Read the last N lines from a log/text file or background job log without starting a background tail process.',
  )

const description = `
Read the last N lines from a log/text file, or pass \`jobId\` to read the temp log file for a background job directly. Prefer this over starting a background \`tail -f\` job when you only need a snapshot of recent logs.

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
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    jobId: 'job-1234-1',
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
        jobId: z.string().optional(),
        status: z.enum(['running', 'completed', 'error']).optional(),
        lines: z.number(),
        content: z.string(),
        truncated: z.boolean().optional(),
      }),
      z.object({
        path: z.string(),
        jobId: z.string().optional(),
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
