import z from 'zod/v4'

import { toolResultOutputSchema } from './messages/content-part'

export const printModeStartSchema = z.object({
  type: z.literal('start'),
  agentId: z.string().optional(),
  messageHistoryLength: z.number(),
})
export type PrintModeStart = z.infer<typeof printModeStartSchema>

export const printModeErrorSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
})
export type PrintModeError = z.infer<typeof printModeErrorSchema>

export const printModeDownloadStatusSchema = z.object({
  type: z.literal('download'),
  version: z.string(),
  status: z.enum(['complete', 'failed']),
})
export type PrintModeDownloadStatus = z.infer<
  typeof printModeDownloadStatusSchema
>

export const printModeToolCallSchema = z.object({
  type: z.literal('tool_call'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.any()),
  agentId: z.string().optional(),
  parentAgentId: z.string().optional(),
  includeToolCall: z.boolean().optional(),
  // True when this write tool call is waiting on a prior same-path write that is
  // still in flight (queued behind a per-path write barrier). Omitted for
  // read-only tools and for writes whose target path cannot be statically
  // determined (custom/MCP tools, multi-path edit_transaction). Lets the CLI
  // distinguish a "queued" write from one that is actively running but has no
  // result yet ("pending").
  queued: z.boolean().optional(),
})
export type PrintModeToolCall = z.infer<typeof printModeToolCallSchema>

export const printModeToolStartSchema = z.object({
  type: z.literal('tool_start'),
  toolCallId: z.string(),
})
export type PrintModeToolStart = z.infer<typeof printModeToolStartSchema>

export const printModeToolResultSchema = z.object({
  type: z.literal('tool_result'),
  toolCallId: z.string(),
  toolName: z.string(),
  output: toolResultOutputSchema.array(),
  agentId: z.string().optional(),
  parentAgentId: z.string().optional(),
})
export type PrintModeToolResult = z.infer<typeof printModeToolResultSchema>

export const printModeTextSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  agentId: z.string().optional(),
})
export type PrintModeText = z.infer<typeof printModeTextSchema>

export const printModeFinishSchema = z.object({
  type: z.literal('finish'),
  agentId: z.string().optional(),
  totalCost: z.number(),
})
export type PrintModeFinish = z.infer<typeof printModeFinishSchema>

export const printModeSubagentStartSchema = z.object({
  type: z.literal('subagent_start'),
  agentId: z.string(),
  agentType: z.string(),
  displayName: z.string(),
  onlyChild: z.boolean(),
  parentAgentId: z.string().optional(),
  params: z.record(z.string(), z.any()).optional(),
  prompt: z.string().optional(),
})
export type PrintModeSubagentStart = z.infer<
  typeof printModeSubagentStartSchema
>

export const printModeSubagentFinishSchema = z.object({
  type: z.literal('subagent_finish'),
  agentId: z.string(),
  agentType: z.string(),
  displayName: z.string(),
  onlyChild: z.boolean(),
  parentAgentId: z.string().optional(),
  params: z.record(z.string(), z.any()).optional(),
  prompt: z.string().optional(),
  // Present when the subagent finished due to an error (e.g. wall-clock
  // timeout) rather than completing normally. Lets the UI distinguish a
  // failed finish from a successful one.
  error: z.string().optional(),
})
export type PrintModeSubagentFinish = z.infer<
  typeof printModeSubagentFinishSchema
>

export const printModeReasoningDeltaSchema = z.object({
  type: z.literal('reasoning_delta'),
  text: z.string(),
  ancestorRunIds: z.string().array(),
  runId: z.string(),
})
export type PrintModeReasoningDelta = z.infer<
  typeof printModeReasoningDeltaSchema
>

export const printModePhaseSchema = z.object({
  type: z.literal('phase'),
  phase: z.enum([
    'gathering_context',
    'planning',
    'editing',
    'reviewing',
    'validating',
    'summarizing',
    'complete',
  ]),
  detail: z.string().optional(),
})
export type PrintModePhase = z.infer<typeof printModePhaseSchema>

export const printModeContextWindowSchema = z.object({
  type: z.literal('context_window'),
  used: z.number(),
  max: z.number(),
})
export type PrintModeContextWindow = z.infer<
  typeof printModeContextWindowSchema
>

export const printModeEventSchema = z.discriminatedUnion('type', [
  printModeDownloadStatusSchema,
  printModeErrorSchema,
  printModeFinishSchema,
  printModePhaseSchema,
  printModeStartSchema,
  printModeSubagentFinishSchema,
  printModeSubagentStartSchema,
  printModeTextSchema,
  printModeToolCallSchema,
  printModeToolResultSchema,
  printModeToolStartSchema,

  printModeContextWindowSchema,
  printModeReasoningDeltaSchema,
])

export type PrintModeEvent = z.infer<typeof printModeEventSchema>
