import z from 'zod/v4'

import {
  filePartSchema,
  imagePartSchema,
  reasoningPartSchema,
  textPartSchema,
  toolCallPartSchema,
  toolResultPartSchema,
} from './content-part'
import { providerMetadataSchema } from './provider-metadata'

const auxiliaryDataSchema = z.object({
  providerOptions: providerMetadataSchema.optional(),
  timeToLive: z
    .union([z.literal('agentStep'), z.literal('userPrompt')])
    .optional(),
  keepDuringTruncation: z.boolean().optional(),
})

export const systemMessageSchema = z
  .object({
    role: z.literal('system'),
    content: z.string(),
  })
  .and(auxiliaryDataSchema)
export type SystemMessage = z.infer<typeof systemMessageSchema>

export const userMessageSchema = z
  .object({
    role: z.literal('user'),
    content: z.union([
      z.string(),
      z
        .discriminatedUnion('type', [
          textPartSchema,
          imagePartSchema,
          filePartSchema,
        ])
        .array(),
    ]),
  })
  .and(auxiliaryDataSchema)
export type UserMessage = z.infer<typeof userMessageSchema>

export const assistantMessageSchema = z
  .object({
    role: z.literal('assistant'),
    content: z.union([
      z.string(),
      z
        .discriminatedUnion('type', [
          textPartSchema,
          reasoningPartSchema,
          toolCallPartSchema,
        ])
        .array(),
    ]),
  })
  .and(auxiliaryDataSchema)
export type AssistantMessage = z.infer<typeof assistantMessageSchema>

export const toolMessageSchema = z
  .object({
    role: z.literal('tool'),
    content: toolResultPartSchema,
  })
  .and(auxiliaryDataSchema)
export type ToolMessage = z.infer<typeof toolMessageSchema>

export const messageSchema = z
  .union([
    systemMessageSchema,
    userMessageSchema,
    assistantMessageSchema,
    toolMessageSchema,
  ])
  .and(
    z.object({
      providerOptions: providerMetadataSchema.optional(),
      timeToLive: z
        .union([z.literal('agentStep'), z.literal('userPrompt')])
        .optional(),
      keepDuringTruncation: z.boolean().optional(),
    }),
  )
export type Message = z.infer<typeof messageSchema>
