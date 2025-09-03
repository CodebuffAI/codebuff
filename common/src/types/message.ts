import { z } from 'zod/v4'

const MessageContentObjectSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
    cache_control: z
      .object({
        type: z.literal('ephemeral'),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.any()),
    cache_control: z
      .object({
        type: z.literal('ephemeral'),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.string(),
    cache_control: z
      .object({
        type: z.literal('ephemeral'),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('image'),
    source: z.object({
      type: z.literal('base64'),
      media_type: z.literal('image/jpeg'),
      data: z.string(),
    }),
    cache_control: z
      .object({
        type: z.literal('ephemeral'),
      })
      .optional(),
  }),
])

export const MessageSchema = z.object({
  role: z.union([z.literal('user'), z.literal('assistant')]),
  content: z.union([z.string(), z.array(MessageContentObjectSchema)]),
})
export type MessageContentObject = z.infer<typeof MessageContentObjectSchema>
