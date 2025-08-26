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

export const systemCodebuffMessageSchema = z
  .object({
    role: z.literal('system'),
    content: z.string(),
  })
  .and(auxiliaryDataSchema)
export type SystemCodebuffMessage = z.infer<typeof systemCodebuffMessageSchema>

export const userCodebuffMessageSchema = z
  .object({
    role: z.literal('user'),
    content: z.union([
      z.string(),
      z.union([textPartSchema, imagePartSchema, filePartSchema]).array(),
    ]),
  })
  .and(auxiliaryDataSchema)
export type UserCodebuffMessage = z.infer<typeof userCodebuffMessageSchema>

export const assistantCodebuffMessageSchema = z
  .object({
    role: z.literal('assistant'),
    content: z.union([
      z.string(),
      z
        .union([
          textPartSchema,
          filePartSchema,
          reasoningPartSchema,
          toolCallPartSchema,
          toolResultPartSchema,
        ])
        .array(),
    ]),
  })
  .and(auxiliaryDataSchema)
export type AssistantCodebuffMessage = z.infer<
  typeof assistantCodebuffMessageSchema
>

export const toolCodebuffMessageSchema = z
  .object({
    role: z.literal('tool'),
    content: toolResultPartSchema.array(),
  })
  .and(auxiliaryDataSchema)
export type ToolCodebuffMessage = z.infer<typeof toolCodebuffMessageSchema>

export const codebuffMessageSchema = z
  .union([
    systemCodebuffMessageSchema,
    userCodebuffMessageSchema,
    assistantCodebuffMessageSchema,
    toolCodebuffMessageSchema,
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
export type CodebuffMessage = z.infer<typeof codebuffMessageSchema>
