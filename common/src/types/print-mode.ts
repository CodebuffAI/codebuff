import z from 'zod/v4'

import { toolResultOutputSchema } from './messages/content-part'

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
})
export type PrintModeToolCall = z.infer<typeof printModeToolCallSchema>

export const printModeToolResultSchema = z.object({
  type: z.literal('tool_result'),
  toolCallId: z.string(),
  output: toolResultOutputSchema.array(),
})
export type PrintModeToolResult = z.infer<typeof printModeToolResultSchema>

export const printModeTextSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})
export type PrintModeText = z.infer<typeof printModeTextSchema>

export const printModeFinishSchema = z.object({
  type: z.literal('finish'),
  agentId: z.string().optional(),
  totalCost: z.number(),
})
export type PrintModeFinish = z.infer<typeof printModeFinishSchema>

export const printModeEventSchema = z.discriminatedUnion('type', [
  printModeErrorSchema,
  printModeDownloadStatusSchema,
  printModeFinishSchema,
  printModeTextSchema,
  printModeToolCallSchema,
  printModeToolResultSchema,
])

export type PrintModeEvent = z.infer<typeof printModeEventSchema>
