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

export const systemCodebuffMessageSchema = z.object({
  role: z.literal('system'),
  content: z.string(),
  providerOptions: providerMetadataSchema.optional(),
})
export type SystemCodebuffMessage = z.infer<typeof systemCodebuffMessageSchema>

export const userCodebuffMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([textPartSchema, imagePartSchema, filePartSchema]).array(),
  providerOptions: providerMetadataSchema.optional(),
})
export type UserCodebuffMessage = z.infer<typeof userCodebuffMessageSchema>

export const assistantCodebuffMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z
    .union([
      textPartSchema,
      filePartSchema,
      reasoningPartSchema,
      toolCallPartSchema,
      toolResultPartSchema,
    ])
    .array(),
  providerOptions: providerMetadataSchema.optional(),
})
export type AssistantCodebuffMessage = z.infer<
  typeof assistantCodebuffMessageSchema
>

export const toolCodebuffMessageSchema = z.object({
  role: z.literal('tool'),
  content: toolResultPartSchema.array(),
  providerOptions: providerMetadataSchema.optional(),
})
export type ToolCodebuffMessage = z.infer<typeof toolCodebuffMessageSchema>

export const codebuffMessageSchema = z.union([
  systemCodebuffMessageSchema,
  userCodebuffMessageSchema,
  assistantCodebuffMessageSchema,
  toolCodebuffMessageSchema,
])
export type CodebuffMessage = z.infer<typeof codebuffMessageSchema>
