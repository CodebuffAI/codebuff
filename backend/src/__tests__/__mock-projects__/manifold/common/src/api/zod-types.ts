import { z } from 'zod'
import { type JSONContent } from '@tiptap/core'

export const contentSchema: z.ZodType<JSONContent> = z.lazy(() =>
  z.intersection(
    z.record(z.any()),
    z.object({
      type: z.string().optional(),
      attrs: z.record(z.any()).optional(),
      content: z.array(contentSchema).optional(),
      marks: z
        .array(
          z.intersection(
            z.record(z.any()),
            z.object({
              type: z.string(),
              attrs: z.record(z.any()).optional(),
            })
          )
        )
        .optional(),
      text: z.string().optional(),
    })
  )
)

export const DashboardQuestionItemSchema = z
  .object({
    type: z.literal('question'),
    slug: z.string(),
  })
  .strict()

export const DashboardLinkItemSchema = z
  .object({
    type: z.literal('link'),
    url: z.string(),
  })
  .strict()

export const DashboardTextItemSchema = z
  .object({
    type: z.literal('text'),
    id: z.string(),
    content: contentSchema,
  })
  .strict()

export const DashboardItemSchema = z.union([
  DashboardQuestionItemSchema,
  DashboardLinkItemSchema,
  DashboardTextItemSchema,
])
