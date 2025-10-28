import { z } from 'zod/v4';
import { OpenRouterErrorResponseSchema } from '../schemas/error-response';
import { ReasoningDetailArraySchema } from '../schemas/reasoning-details';

const OpenRouterChatCompletionBaseResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
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
});
// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const OpenRouterNonStreamChatCompletionResponseSchema =
  OpenRouterChatCompletionBaseResponseSchema.extend({
    choices: z.array(
      z.object({
        message: z.object({
          role: z.literal('assistant'),
          content: z.string().nullable().optional(),
          reasoning: z.string().nullable().optional(),
          reasoning_details: ReasoningDetailArraySchema.nullish(),

          tool_calls: z
            .array(
              z.object({
                id: z.string().optional().nullable(),
                type: z.literal('function'),
                function: z.object({
                  name: z.string(),
                  arguments: z.string(),
                }),
              }),
            )
            .optional(),

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
        }),
        index: z.number().nullish(),
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
          .nullable()
          .optional(),
        finish_reason: z.string().optional().nullable(),
      }),
    ),
  });
// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
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
]);
