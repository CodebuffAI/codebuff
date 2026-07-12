import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'kill_job'
const endsAgentStep = true
const inputSchema = z
  .object({
    jobId: z
      .string()
      .min(1)
      .describe(
        'The jobId returned by run_terminal_command with process_type: BACKGROUND.',
      ),
    signal: z
      .enum(['SIGTERM', 'SIGKILL'])
      .default('SIGTERM')
      .optional()
      .describe(
        'Signal to send. Defaults to SIGTERM; use SIGKILL only if graceful termination fails.',
      ),
  })
  .describe('Cancel a background job started by run_terminal_command.')

const description = `
Cancel a background job started by run_terminal_command with process_type: BACKGROUND.

Use this when a dev server, watcher, tail, or other long-running job is no longer needed. Prefer SIGTERM first; use SIGKILL only after a job does not stop gracefully.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    jobId: 'job-1234-1',
  },
  endsAgentStep,
})}
`.trim()

export const killJobParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        jobId: z.string(),
        status: z.enum(['running', 'completed', 'error', 'lost']),
        killed: z.boolean(),
        signal: z.enum(['SIGTERM', 'SIGKILL']),
        exitCode: z.number().nullable().optional(),
      }),
      z.object({
        jobId: z.string(),
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
