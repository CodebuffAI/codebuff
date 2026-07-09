import { z } from 'zod/v4'

import { OpenRouterErrorResponseSchema } from '../schemas/error-response'
import { ReasoningDetailArraySchema } from '../schemas/reasoning-details'

const OpenRouterBillingSummaryChunkSchema = z
  .object({
    object: z.literal('billing.summary'),
  })
  .passthrough()

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const OpenRouterCompletionBaseResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number(),
      prompt_tokens_details: z
        .object({
          cached_tokens: z.number(),
        })
        .nullish(),
      completion_tokens: z.number(),
      completion_tokens_details: z
        .object({
          reasoning_tokens: z.number(),
        })
        .nullish(),
      total_tokens: z.number(),
      cost: z.number().optional(),
    })
    .nullish(),
})

const OpenRouterCompletionResponseSchema =
  OpenRouterCompletionBaseResponseSchema.extend({
    choices: z.array(
      z.object({
        text: z.string(),
        reasoning: z.string().nullish().optional(),
        reasoning_details: ReasoningDetailArraySchema.nullish(),

        finish_reason: z.string().nullish(),
        index: z.number().nullish(),
        logprobs: z
          .object({
            tokens: z.array(z.string()),
            token_logprobs: z.array(z.number()),
            top_logprobs: z.array(z.record(z.string(), z.number())).nullable(),
          })
          .nullable()
          .optional(),
      }),
    ),
  })

export const OpenRouterNonStreamCompletionResponseSchema = z.union([
  OpenRouterCompletionResponseSchema,
  OpenRouterErrorResponseSchema,
])

export const OpenRouterStreamCompletionChunkSchema = z.union([
  OpenRouterBillingSummaryChunkSchema,
  OpenRouterCompletionResponseSchema,
  OpenRouterErrorResponseSchema,
])

export const OpenRouterCompletionChunkSchema =
  OpenRouterStreamCompletionChunkSchema

export type OpenRouterBillingSummaryChunk = z.infer<
  typeof OpenRouterBillingSummaryChunkSchema
>

export function isOpenRouterBillingSummaryChunk(
  value: unknown,
): value is OpenRouterBillingSummaryChunk {
  return (
    value != null &&
    typeof value === 'object' &&
    'object' in value &&
    value.object === 'billing.summary'
  )
}
