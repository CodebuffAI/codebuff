import type {
  LanguageModelV1,
  LanguageModelV1FinishReason,
  LanguageModelV1FunctionTool,
  LanguageModelV1LogProbs,
  LanguageModelV1ProviderDefinedTool,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider'
import type { ParseResult } from '@ai-sdk/provider-utils'
import type { ReasoningDetailUnion } from './schemas/reasoning-details'
import type { OpenRouterUsageAccounting } from './types/index'
import type {
  OpenRouterChatModelId,
  OpenRouterChatSettings,
} from './types/openrouter-chat-settings'

import {
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider'
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParsableJson,
  postJsonToApi,
} from '@ai-sdk/provider-utils'
import { z } from 'zod'
import {
  ReasoningDetailArraySchema,
  ReasoningDetailType,
} from './schemas/reasoning-details'

import { convertToOpenRouterChatMessages } from './convert-to-openrouter-chat-messages'
import { mapOpenRouterChatLogProbsOutput } from './map-openrouter-chat-logprobs'
import { mapOpenRouterFinishReason } from './map-openrouter-finish-reason'
import {
  OpenRouterErrorResponseSchema,
  openrouterFailedResponseHandler,
} from './openrouter-error'

function isFunctionTool(
  tool: LanguageModelV1FunctionTool | LanguageModelV1ProviderDefinedTool
): tool is LanguageModelV1FunctionTool {
  return 'parameters' in tool
}

type OpenRouterChatConfig = {
  provider: string
  compatibility: 'strict' | 'compatible'
  headers: () => Record<string, string | undefined>
  url: (options: { modelId: string; path: string }) => string
  fetch?: typeof fetch
  extraBody?: Record<string, unknown>
}

type DoGenerateOutput = Awaited<ReturnType<LanguageModelV1['doGenerate']>>

type LanguageModelV1ReasoningPartUnion = Extract<
  DoGenerateOutput['reasoning'],
  unknown[]
>[number]

type DoStreamOutput = Awaited<ReturnType<LanguageModelV1['doStream']>>

export class OpenRouterChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1'
  readonly defaultObjectGenerationMode = 'tool'

  readonly modelId: OpenRouterChatModelId
  readonly settings: OpenRouterChatSettings

  private readonly config: OpenRouterChatConfig

  constructor(
    modelId: OpenRouterChatModelId,
    settings: OpenRouterChatSettings,
    config: OpenRouterChatConfig
  ) {
    this.modelId = modelId
    this.settings = settings
    this.config = config
  }

  get provider(): string {
    return this.config.provider
  }

  private getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
    stopSequences,
    responseFormat,
    topK,
    providerMetadata,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type
    const extraCallingBody = providerMetadata?.openrouter ?? {}

    const baseArgs = {
      // model id:
      model: this.modelId,
      models: this.settings.models,

      // model specific settings:
      logit_bias: this.settings.logitBias,
      logprobs:
        this.settings.logprobs === true ||
        typeof this.settings.logprobs === 'number'
          ? true
          : undefined,
      top_logprobs:
        typeof this.settings.logprobs === 'number'
          ? this.settings.logprobs
          : typeof this.settings.logprobs === 'boolean'
            ? this.settings.logprobs
              ? 0
              : undefined
            : undefined,
      user: this.settings.user,
      parallel_tool_calls: this.settings.parallelToolCalls,

      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      seed,

      stop: stopSequences,
      response_format: responseFormat,
      top_k: topK,

      // messages:
      messages: convertToOpenRouterChatMessages(prompt),

      // OpenRouter specific settings:
      include_reasoning: this.settings.includeReasoning,
      reasoning: this.settings.reasoning,
      usage: this.settings.usage,

      // extra body:
      ...this.config.extraBody,
      ...this.settings.extraBody,
      ...extraCallingBody,
    }

    switch (type) {
      case 'regular': {
        return { ...baseArgs, ...prepareToolsAndToolChoice(mode) }
      }

      case 'object-json': {
        return {
          ...baseArgs,
          response_format: { type: 'json_object' },
        }
      }

      case 'object-tool': {
        return {
          ...baseArgs,
          tool_choice: { type: 'function', function: { name: mode.tool.name } },
          tools: [
            {
              type: 'function',
              function: {
                name: mode.tool.name,
                description: mode.tool.description,
                parameters: mode.tool.parameters,
              },
            },
          ],
        }
      }

      // Handle all non-text types with a single default case
      default: {
        const _exhaustiveCheck: never = type
        throw new UnsupportedFunctionalityError({
          functionality: `${_exhaustiveCheck} mode`,
        })
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0]
  ): Promise<DoGenerateOutput> {
    const args = this.getArgs(options)

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: openrouterFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        OpenRouterNonStreamChatCompletionResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const { messages: rawPrompt, ...rawSettings } = args
    const choice = response.choices[0]

    if (!choice) {
      throw new Error('No choice in response')
    }

    // Extract detailed usage information
    const usageInfo = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens ?? 0,
          completionTokens: response.usage.completion_tokens ?? 0,
        }
      : {
          promptTokens: 0,
          completionTokens: 0,
        }

    // Collect provider-specific metadata
    const providerMetadata: {
      openrouter?: Partial<{
        usage: OpenRouterUsageAccounting
      }>
    } = {}

    // Add OpenRouter usage accounting details if available AND usage accounting was requested
    if (response.usage && this.settings.usage?.include) {
      providerMetadata.openrouter = {
        usage: {
          promptTokens: response.usage.prompt_tokens,
          promptTokensDetails: response.usage.prompt_tokens_details
            ? {
                cachedTokens:
                  response.usage.prompt_tokens_details.cached_tokens ?? 0,
              }
            : undefined,
          completionTokens: response.usage.completion_tokens,
          completionTokensDetails: response.usage.completion_tokens_details
            ? {
                reasoningTokens:
                  response.usage.completion_tokens_details.reasoning_tokens ??
                  0,
              }
            : undefined,
          cost: response.usage.cost,
          totalTokens: response.usage.total_tokens ?? 0,
        },
      }
    }

    // Prepare the final result
    const hasProviderMetadata = Object.keys(providerMetadata).length > 0

    const reasoningDetails = (choice.message.reasoning_details ??
      []) as ReasoningDetailUnion[]

    const reasoning: LanguageModelV1ReasoningPartUnion[] =
      reasoningDetails.length > 0
        ? reasoningDetails
            .map((detail) => {
              switch (detail.type) {
                case ReasoningDetailType.Text: {
                  if (detail.text) {
                    return {
                      type: 'text' as const,
                      text: detail.text,
                      signature: detail.signature ?? undefined,
                    } satisfies LanguageModelV1ReasoningPartUnion
                  }
                  break
                }
                case ReasoningDetailType.Summary: {
                  if (detail.summary) {
                    return {
                      type: 'text' as const,
                      text: detail.summary,
                    } satisfies LanguageModelV1ReasoningPartUnion
                  }
                  break
                }
                case ReasoningDetailType.Encrypted: {
                  if (detail.data) {
                    return {
                      type: 'redacted' as const,
                      data: detail.data,
                    } satisfies LanguageModelV1ReasoningPartUnion
                  }
                  break
                }
                default: {
                  detail satisfies never
                }
              }
              return null
            })
            .filter((p) => p !== null)
        : choice.message.reasoning
          ? [
              {
                type: 'text' as const,
                text: choice.message.reasoning,
              } satisfies LanguageModelV1ReasoningPartUnion,
            ]
          : []

    return {
      response: {
        id: response.id,
        modelId: response.model,
      },
      text: choice.message.content ?? undefined,
      reasoning,
      toolCalls: choice.message.tool_calls?.map((toolCall) => ({
        toolCallType: 'function',
        toolCallId: toolCall.id ?? generateId(),
        toolName: toolCall.function.name,
        args: toolCall.function.arguments,
      })),
      finishReason: mapOpenRouterFinishReason(choice.finish_reason),
      usage: usageInfo,
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings: [],
      logprobs: mapOpenRouterChatLogProbsOutput(choice.logprobs),
      ...(hasProviderMetadata ? { providerMetadata } : {}),
    }
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0]
  ): Promise<DoStreamOutput> {
    const args = this.getArgs(options)

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        stream: true,

        // only include stream_options when in strict compatibility mode:
        stream_options:
          this.config.compatibility === 'strict'
            ? {
                include_usage: true,
                // If user has requested usage accounting, make sure we get it in the stream
                ...(this.settings.usage?.include
                  ? { include_usage: true }
                  : {}),
              }
            : undefined,
      },
      failedResponseHandler: openrouterFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        OpenRouterStreamChatCompletionChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const { messages: rawPrompt, ...rawSettings } = args

    const toolCalls: Array<{
      id: string
      type: 'function'
      function: {
        name: string
        arguments: string
      }

      sent: boolean
    }> = []

    let finishReason: LanguageModelV1FinishReason = 'other'
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    }
    let logprobs: LanguageModelV1LogProbs

    // Track provider-specific usage information
    const openrouterUsage: Partial<OpenRouterUsageAccounting> = {}

    // Store usage accounting setting for reference in the transformer
    const shouldIncludeUsageAccounting = !!this.settings.usage?.include

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<
            z.infer<typeof OpenRouterStreamChatCompletionChunkSchema>
          >,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = 'error'
              controller.enqueue({ type: 'error', error: chunk.error })
              return
            }

            const value = chunk.value

            // handle error chunks:
            if ('error' in value) {
              finishReason = 'error'
              controller.enqueue({ type: 'error', error: value.error })
              return
            }

            if (value.id) {
              controller.enqueue({
                type: 'response-metadata',
                id: value.id,
              })
            }

            if (value.model) {
              controller.enqueue({
                type: 'response-metadata',
                modelId: value.model,
              })
            }

            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens,
                completionTokens: value.usage.completion_tokens,
              }

              // Collect OpenRouter specific usage information
              openrouterUsage.promptTokens = value.usage.prompt_tokens
              if (value.usage.prompt_tokens_details) {
                openrouterUsage.promptTokensDetails = {
                  cachedTokens:
                    value.usage.prompt_tokens_details.cached_tokens ?? 0,
                }
              }

              openrouterUsage.completionTokens = value.usage.completion_tokens
              if (value.usage.completion_tokens_details) {
                openrouterUsage.completionTokensDetails = {
                  reasoningTokens:
                    value.usage.completion_tokens_details.reasoning_tokens ?? 0,
                }
              }

              openrouterUsage.cost = value.usage.cost
              openrouterUsage.totalTokens = value.usage.total_tokens
            }

            const choice = value.choices[0]

            if (choice?.finish_reason != null) {
              finishReason = mapOpenRouterFinishReason(choice.finish_reason)
            }

            if (choice?.delta == null) {
              return
            }

            const delta = choice.delta

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              })
            }

            if (delta.reasoning != null) {
              controller.enqueue({
                type: 'reasoning',
                textDelta: delta.reasoning,
              })
            }

            if (delta.reasoning_details && delta.reasoning_details.length > 0) {
              for (const detail of delta.reasoning_details) {
                switch (detail.type) {
                  case ReasoningDetailType.Text: {
                    if (detail.text) {
                      controller.enqueue({
                        type: 'reasoning',
                        textDelta: detail.text,
                      })
                    }
                    if (detail.signature) {
                      controller.enqueue({
                        type: 'reasoning-signature',
                        signature: detail.signature,
                      })
                    }
                    break
                  }
                  case ReasoningDetailType.Encrypted: {
                    if (detail.data) {
                      controller.enqueue({
                        type: 'redacted-reasoning',
                        data: detail.data,
                      })
                    }
                    break
                  }
                  case ReasoningDetailType.Summary: {
                    if (detail.summary) {
                      controller.enqueue({
                        type: 'reasoning',
                        textDelta: detail.summary,
                      })
                    }
                    break
                  }
                  default: {
                    detail satisfies never
                    break
                  }
                }
              }
            }
            const mappedLogprobs = mapOpenRouterChatLogProbsOutput(
              choice?.logprobs
            )
            if (mappedLogprobs?.length) {
              if (logprobs === undefined) {
                logprobs = []
              }
              logprobs.push(...mappedLogprobs)
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index

                // Tool call start. OpenRouter returns all information except the arguments in the first chunk.
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== 'function') {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`,
                    })
                  }

                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`,
                    })
                  }

                  if (toolCallDelta.function?.name == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`,
                    })
                  }

                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? '',
                    },
                    sent: false,
                  }

                  const toolCall = toolCalls[index]

                  if (toolCall == null) {
                    throw new Error('Tool call is missing')
                  }

                  // check if tool call is complete (some providers send the full tool call in one chunk)
                  if (
                    toolCall.function?.name != null &&
                    toolCall.function?.arguments != null &&
                    isParsableJson(toolCall.function.arguments)
                  ) {
                    // send delta
                    controller.enqueue({
                      type: 'tool-call-delta',
                      toolCallType: 'function',
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                      argsTextDelta: toolCall.function.arguments,
                    })

                    // send tool call
                    controller.enqueue({
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: toolCall.id ?? generateId(),
                      toolName: toolCall.function.name,
                      args: toolCall.function.arguments,
                    })

                    toolCall.sent = true
                  }

                  continue
                }

                // existing tool call, merge
                const toolCall = toolCalls[index]

                if (toolCall == null) {
                  throw new Error('Tool call is missing')
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function.arguments +=
                    toolCallDelta.function?.arguments ?? ''
                }

                // send delta
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: toolCallDelta.function.arguments ?? '',
                })

                // check if tool call is complete
                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments,
                  })

                  toolCall.sent = true
                }
              }
            }
          },

          flush(controller) {
            // Forward any unsent tool calls if finish reason is 'tool-calls'
            if (finishReason === 'tool-calls') {
              for (const toolCall of toolCalls) {
                if (!toolCall.sent) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    // Coerce invalid arguments to an empty JSON object
                    args: isParsableJson(toolCall.function.arguments)
                      ? toolCall.function.arguments
                      : '{}',
                  })
                  toolCall.sent = true
                }
              }
            }

            // Prepare provider metadata with OpenRouter usage accounting information
            const providerMetadata: {
              openrouter?: {
                usage: Partial<OpenRouterUsageAccounting>
              }
            } = {}

            // Only add OpenRouter metadata if we have usage information AND usage accounting was requested
            if (
              shouldIncludeUsageAccounting &&
              (openrouterUsage.totalTokens !== undefined ||
                openrouterUsage.cost !== undefined ||
                openrouterUsage.promptTokensDetails !== undefined ||
                openrouterUsage.completionTokensDetails !== undefined)
            ) {
              providerMetadata.openrouter = {
                usage: openrouterUsage,
              }
            }

            // Only add providerMetadata if we have OpenRouter metadata and it is explicitly requested
            // This is to maintain backward compatibility with existing tests and clients
            const hasProviderMetadata =
              Object.keys(providerMetadata).length > 0 &&
              shouldIncludeUsageAccounting

            controller.enqueue({
              type: 'finish',
              finishReason,
              logprobs,
              usage,
              ...(hasProviderMetadata ? { providerMetadata } : {}),
            })
          },
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings: [],
    }
  }
}

const OpenRouterChatCompletionBaseResponseSchema = z.object({
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

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const OpenRouterNonStreamChatCompletionResponseSchema =
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
              })
            )
            .optional(),
        }),
        index: z.number(),
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
                    })
                  ),
                })
              )
              .nullable(),
          })
          .nullable()
          .optional(),
        finish_reason: z.string().optional().nullable(),
      })
    ),
  })

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const OpenRouterStreamChatCompletionChunkSchema = z.union([
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
                  index: z.number(),
                  id: z.string().nullish(),
                  type: z.literal('function').optional(),
                  function: z.object({
                    name: z.string().nullish(),
                    arguments: z.string().nullish(),
                  }),
                })
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
                    })
                  ),
                })
              )
              .nullable(),
          })
          .nullish(),
        finish_reason: z.string().nullable().optional(),
        index: z.number(),
      })
    ),
  }),
  OpenRouterErrorResponseSchema,
])

function prepareToolsAndToolChoice(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular'
  }
) {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined }
  }

  const mappedTools = tools.map((tool) => {
    if (isFunctionTool(tool)) {
      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }
    }

    return {
      type: 'function' as const,
      function: {
        name: tool.name,
      },
    }
  })

  const toolChoice = mode.toolChoice

  if (toolChoice == null) {
    return { tools: mappedTools, tool_choice: undefined }
  }

  const type = toolChoice.type

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: mappedTools, tool_choice: type }
    case 'tool':
      return {
        tools: mappedTools,
        tool_choice: {
          type: 'function',
          function: {
            name: toolChoice.toolName,
          },
        },
      }
    default: {
      const _exhaustiveCheck: never = type
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`)
    }
  }
}
