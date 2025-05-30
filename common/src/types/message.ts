import { coreMessageSchema } from 'ai'
import { z } from 'zod'

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
export type Message = z.infer<typeof MessageSchema>
export type MessageContentObject = z.infer<typeof MessageContentObjectSchema>

export const CodebuffMessageSchema = z.intersection(
  coreMessageSchema,
  z.object({
    timeToLive: z
      .union([z.literal('agentStep'), z.literal('userPrompt')])
      .optional(),
  })
)

export type CodebuffMessage = z.infer<typeof CodebuffMessageSchema>
