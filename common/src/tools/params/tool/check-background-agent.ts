import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'check_background_agent'
const endsAgentStep = false
const inputSchema = z
  .object({
    jobId: z
      .string()
      .min(1)
      .describe(
        'The jobId returned by spawn_agents({ background: true }) for the background agent turn.',
      ),
    wait_for: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional substring to wait for in the new streamed chunks before returning (follow mode). Returns early as soon as it appears in any chunk payload. Useful for waiting until a background agent emits a specific milestone (e.g. a tool_result or a text marker).',
      ),
    timeout_seconds: z
      .number()
      .int()
      .min(0)
      .max(120)
      .default(0)
      .optional()
      .describe(
        'Max seconds to wait for new chunks / the wait_for pattern. 0 (default) returns immediately with whatever new chunks exist (poll mode); >0 blocks up to this long (follow mode).',
      ),
    cancel: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'When true, explicitly cancel the running background agent before returning its final status. Defaults to false.',
      ),
  })
  .describe(
    'Poll or follow a background agent turn started by spawn_agents({ background: true }): returns the streamed chunks produced since the last check plus the job status. Use it to observe a long-running background agent without blocking the turn.',
  )

const description = `
Poll or follow a background agent turn (started by spawn_agents with background: true).

- Poll mode (no wait_for/timeout): returns immediately with the streamed chunks (text, tool_call, tool_result, subagent_* events) produced since your last check_background_agent for this job, plus status (running|completed|error) and the resolved result/error when finished.
- Follow mode (wait_for and/or timeout_seconds): blocks — bounded by timeout_seconds — until wait_for appears in any new chunk payload or the job settles, then returns. \`matched\` indicates whether wait_for was seen. A follow-timeout is observational and leaves the agent running. Set \`cancel: true\` to explicitly abort it.

Chunks never repeat across calls: each check_background_agent call advances that job's read offset and returns only new chunks. Background agent turns are in-process coroutines — they cannot outlive this CLI session and are not recoverable across crashes (their partial state is preserved only via mid-turn checkpointing).

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    jobId: 'bg-agent-1234-1',
    wait_for: 'completed',
    timeout_seconds: 30,
  },
  endsAgentStep,
})}
`.trim()

export const checkBackgroundAgentParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        jobId: z.string(),
        status: z.enum(['running', 'completed', 'error', 'cancelled']),
        newChunks: z
          .array(
            z.object({
              type: z.string(),
              // Opaque structured event (text/tool_call/tool_result/subagent_*);
              // payload can be any JSON-serializable shape, so `any` is correct.
              payload: z.any(),
              timestamp: z.number(),
            }),
          )
          .describe(
            'Streamed chunks since the last poll. Each has {type, payload, timestamp}.',
          ),
        // Resolved agent turn result; opaque structured value.
        result: z.any().optional().describe('Resolved value when completed.'),
        error: z
          .string()
          .optional()
          .describe('Rejection message when errored.'),
        matched: z.boolean().optional(),
        killed: z.boolean().optional(),
        cancelled: z.boolean().optional(),
        droppedChunks: z.number().int().min(0).optional(),
      }),
      z.object({
        jobId: z.string(),
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
