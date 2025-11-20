import z from 'zod/v4'

import {
  filePartSchema,
  imagePartSchema,
  reasoningPartSchema,
  textPartSchema,
  toolCallPartSchema,
  toolResultOutputSchema,
} from './content-part'
import { providerMetadataSchema } from './provider-metadata'

const auxiliaryDataSchema = z.object({
  providerOptions: providerMetadataSchema.optional(),

  tags: z.string().array().optional(),

  // James: All the below is overly prescriptive for the framework.
  // Instead, let's tag what the message is, and let the user decide time to live, keep during truncation, etc.
  /** @deprecated Use tags instead. */
  timeToLive: z
    .union([z.literal('agentStep'), z.literal('userPrompt')])
    .optional(),
  /** @deprecated Use tags instead. */
  keepDuringTruncation: z.boolean().optional(),
  /** @deprecated Use tags instead. */
  keepLastTags: z.string().array().optional(),
})
export type AuxiliaryMessageData = z.infer<typeof auxiliaryDataSchema>

export const systemMessageSchema = z
  .object({
    role: z.literal('system'),
    content: textPartSchema.array(),
  })
  .and(auxiliaryDataSchema)
export type SystemMessage = z.infer<typeof systemMessageSchema>

export const userMessageSchema = z
  .object({
    role: z.literal('user'),
    content: z
      .discriminatedUnion('type', [
        textPartSchema,
        imagePartSchema,
        filePartSchema,
      ])
      .array(),
  })
  .and(auxiliaryDataSchema)
export type UserMessage = z.infer<typeof userMessageSchema>

export const assistantMessageSchema = z
  .object({
    role: z.literal('assistant'),
    content: z
      .discriminatedUnion('type', [
        textPartSchema,
        reasoningPartSchema,
        toolCallPartSchema,
      ])
      .array(),
  })
  .and(auxiliaryDataSchema)
export type AssistantMessage = z.infer<typeof assistantMessageSchema>

export const toolMessageSchema = z
  .object({
    role: z.literal('tool'),
    toolCallId: z.string(),
    toolName: z.string(),
    content: toolResultOutputSchema.array(),
  })
  .and(auxiliaryDataSchema)
export type ToolMessage = z.infer<typeof toolMessageSchema>

export const messageSchema = z.union([
  systemMessageSchema,
  userMessageSchema,
  assistantMessageSchema,
  toolMessageSchema,
])
export type Message = z.infer<typeof messageSchema>
