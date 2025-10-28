/* forked from https://github.com/OpenRouterTeam/ai-sdk-provider/tree/b23f2d580dc0688e5af1124e68c0e98b892e58fb/src/schemas */
import z from 'zod/v4'

export enum ReasoningDetailType {
  Summary = 'reasoning.summary',
  Encrypted = 'reasoning.encrypted',
  Text = 'reasoning.text',
}

export const ReasoningDetailSummarySchema = z.object({
  type: z.literal(ReasoningDetailType.Summary),
  summary: z.string(),
})
export type ReasoningDetailSummary = z.infer<
  typeof ReasoningDetailSummarySchema
>

export const ReasoningDetailEncryptedSchema = z.object({
  type: z.literal(ReasoningDetailType.Encrypted),
  data: z.string(),
})
export type ReasoningDetailEncrypted = z.infer<
  typeof ReasoningDetailEncryptedSchema
>

export const ReasoningDetailTextSchema = z.object({
  type: z.literal(ReasoningDetailType.Text),
  text: z.string().nullish(),
  signature: z.string().nullish(),
})

export type ReasoningDetailText = z.infer<typeof ReasoningDetailTextSchema>

export const ReasoningDetailUnionSchema = z.union([
  ReasoningDetailSummarySchema,
  ReasoningDetailEncryptedSchema,
  ReasoningDetailTextSchema,
])

const ReasoningDetailsWithUnknownSchema = z.union([
  ReasoningDetailUnionSchema,
  z.unknown().transform(() => null),
])

export type ReasoningDetailUnion = z.infer<typeof ReasoningDetailUnionSchema>

export const ReasoningDetailArraySchema = z
  .array(ReasoningDetailsWithUnknownSchema)
  .transform((d) => d.filter((d): d is ReasoningDetailUnion => !!d))
const OpenRouterChatCompletionBaseResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  provider: z.string(),
  created: z.number(),
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
      cost_details: z
        .object({
          upstream_inference_cost: z.number().nullish(),
        })
        .nullish(),
    })
    .nullish(),
})

export const OpenRouterErrorResponseSchema = z.object({
  error: z.object({
    code: z.union([z.string(), z.number()]).nullable().optional().default(null),
    message: z.string(),
    type: z.string().nullable().optional().default(null),
    param: z.any().nullable().optional().default(null),
  }),
})

export const OpenRouterStreamChatCompletionChunkSchema = z.union([
  OpenRouterChatCompletionBaseResponseSchema.extend({
    choices: z.array(
      z.object({
        delta: z
          .object({
            role: z.enum(['assistant']).optional(),
            content: z.string().nullish(),
            reasoning: z.string().nullish().optional(),
            reasoning_details: ReasoningDetailArraySchema.nullish(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number().nullish(),
                  id: z.string().nullish(),
                  type: z.literal('function').optional(),
                  function: z.object({
                    name: z.string().nullish(),
                    arguments: z.string().nullish(),
                  }),
                }),
              )
              .nullish(),

            annotations: z
              .array(
                z.object({
                  type: z.enum(['url_citation']),
                  url_citation: z.object({
                    end_index: z.number(),
                    start_index: z.number(),
                    title: z.string(),
                    url: z.string(),
                    content: z.string().optional(),
                  }),
                }),
              )
              .nullish(),
          })
          .nullish(),
        logprobs: z
          .object({
            content: z
              .array(
                z.object({
                  token: z.string(),
                  logprob: z.number(),
                  top_logprobs: z.array(
                    z.object({
                      token: z.string(),
                      logprob: z.number(),
                    }),
                  ),
                }),
              )
              .nullable(),
          })
          .nullish(),
        finish_reason: z.string().nullable().optional(),
        index: z.number().nullish(),
      }),
    ),
  }),
  OpenRouterErrorResponseSchema,
])

export type OpenRouterStreamChatCompletionChunk = z.infer<
  typeof OpenRouterStreamChatCompletionChunkSchema
>
