import { InvalidResponseDataError } from '@ai-sdk/provider'
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParsableJson,
  postJsonToApi,
} from '@ai-sdk/provider-utils'

import { convertToOpenRouterChatMessages } from './convert-to-openrouter-chat-messages'
import { getChatCompletionToolChoice } from './get-tool-choice'
import {
  OpenRouterNonStreamChatCompletionResponseSchema,
  OpenRouterStreamChatCompletionChunkSchema,
} from './schemas'
import { openrouterFailedResponseHandler } from '../schemas/error-response'
import { ReasoningDetailType } from '../schemas/reasoning-details'
import { mapOpenRouterFinishReason } from '../utils/map-finish-reason'

import type { OpenRouterUsageAccounting } from '../types/index'
import type {
  OpenRouterChatModelId,
  OpenRouterChatSettings,
} from '../types/openrouter-chat-settings'
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2ResponseMetadata,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  SharedV2Headers,
} from '@ai-sdk/provider'
import type { ParseResult } from '@ai-sdk/provider-utils'
import type { FinishReason } from 'ai'
import type { z } from 'zod/v4'

type OpenRouterChatConfig = {
  provider: string
  compatibility: 'strict' | 'compatible'
  headers: () => Record<string, string | undefined>
  url: (options: { modelId: string; path: string }) => string
  fetch?: typeof fetch
  extraBody?: Record<string, unknown>
}

export class OpenRouterChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const
  readonly provider = 'openrouter'
  readonly defaultObjectGenerationMode = 'tool' as const

  readonly modelId: OpenRouterChatModelId
  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [
      /^data:image\/[a-zA-Z]+;base64,/,
      /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i,
    ],
    // 'text/*': [/^data:text\//, /^https?:\/\/.+$/],
    'application/*': [/^data:application\//, /^https?:\/\/.+$/],
  }
  readonly settings: OpenRouterChatSettings

  private readonly config: OpenRouterChatConfig

  constructor(
    modelId: OpenRouterChatModelId,
    settings: OpenRouterChatSettings,
    config: OpenRouterChatConfig,
  ) {
    this.modelId = modelId
    this.settings = settings
    this.config = config
  }

  private getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
    stopSequences,
    responseFormat,
    topK,
    tools,
    toolChoice,
  }: LanguageModelV2CallOptions) {
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
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      seed,

      ...(this.modelId === 'x-ai/grok-code-fast-1'
        ? {}
        : { stop: stopSequences }),
      response_format: responseFormat,
      top_k: topK,

      // messages:
      messages: convertToOpenRouterChatMessages(prompt),

      // OpenRouter specific settings:
      include_reasoning: this.settings.includeReasoning,
      reasoning: this.settings.reasoning,
      usage: this.settings.usage,

      // Web search settings:
      plugins: this.settings.plugins,
      web_search_options: this.settings.web_search_options,
      // Provider routing settings:
      provider: this.settings.provider,

      // extra body:
      ...this.config.extraBody,
      ...this.settings.extraBody,
    }

    if (responseFormat?.type === 'json' && responseFormat.schema != null) {
      return {
        ...baseArgs,
        response_format: {
          type: 'json_schema',
          json_schema: {
            schema: responseFormat.schema,
            strict: true,
            name: responseFormat.name ?? 'response',
            ...(responseFormat.description && {
              description: responseFormat.description,
            }),
          },
        },
      }
    }

    if (tools && tools.length > 0) {
      // TODO: support built-in tools
      const mappedTools = tools
        .filter((tool) => tool.type === 'function')
        .map((tool) => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }))

      return {
        ...baseArgs,
        tools: mappedTools,
        tool_choice: toolChoice
          ? getChatCompletionToolChoice(toolChoice)
          : undefined,
      }
    }

    return baseArgs
  }

  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: Array<LanguageModelV2Content>
    finishReason: LanguageModelV2FinishReason
    usage: LanguageModelV2Usage
    warnings: Array<LanguageModelV2CallWarning>
    providerMetadata?: {
      openrouter: {
        provider: string
        usage: OpenRouterUsageAccounting
      }
    }
    request?: { body?: unknown }
    response?: LanguageModelV2ResponseMetadata & {
      headers?: SharedV2Headers
      body?: unknown
    }
  }> {
    const providerOptions = options.providerOptions || {}
    const openrouterOptions = providerOptions.openrouter || {}

    const args = {
      ...this.getArgs(options),
      ...openrouterOptions,
    }

    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: openrouterFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        OpenRouterNonStreamChatCompletionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const choice = response.choices[0]

    if (!choice) {
      throw new Error('No choice in response')
    }

    // Extract detailed usage information
    const usageInfo: LanguageModelV2Usage = response.usage
      ? {
          inputTokens: response.usage.prompt_tokens ?? 0,
          outputTokens: response.usage.completion_tokens ?? 0,
          totalTokens:
            (response.usage.prompt_tokens ?? 0) +
            (response.usage.completion_tokens ?? 0),
          reasoningTokens:
            response.usage.completion_tokens_details?.reasoning_tokens ?? 0,
          cachedInputTokens:
            response.usage.prompt_tokens_details?.cached_tokens ?? 0,
        }
      : {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        }

    const reasoningDetails = choice.message.reasoning_details ?? []

    const reasoning: Array<LanguageModelV2Content> =
      reasoningDetails.length > 0
        ? reasoningDetails
            .map((detail) => {
              switch (detail.type) {
                case ReasoningDetailType.Text: {
                  if (detail.text) {
                    return {
                      type: 'reasoning' as const,
                      text: detail.text,
                    }
                  }
                  break
                }
                case ReasoningDetailType.Summary: {
                  if (detail.summary) {
                    return {
                      type: 'reasoning' as const,
                      text: detail.summary,
                    }
                  }
                  break
                }
                case ReasoningDetailType.Encrypted: {
                  // For encrypted reasoning, we include a redacted placeholder
                  if (detail.data) {
                    return {
                      type: 'reasoning' as const,
                      text: '[REDACTED]',
                    }
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
                type: 'reasoning' as const,
                text: choice.message.reasoning,
              },
            ]
          : []

    const content: Array<LanguageModelV2Content> = []

    // Add reasoning content first
    content.push(...reasoning)

    if (choice.message.content) {
      content.push({
        type: 'text' as const,
        text: choice.message.content,
      })
    }

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call' as const,
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments,
        })
      }
    }

    if (choice.message.annotations) {
      for (const annotation of choice.message.annotations) {
        if (annotation.type === 'url_citation') {
          content.push({
            type: 'source' as const,
            sourceType: 'url' as const,
            id: annotation.url_citation.url,
            url: annotation.url_citation.url,
            title: annotation.url_citation.title,
            providerMetadata: {
              openrouter: {
                content: annotation.url_citation.content || '',
              },
            },
          })
        }
      }
    }

    return {
      content,
      finishReason: mapOpenRouterFinishReason(choice.finish_reason),
      usage: usageInfo,
      warnings: [],
      providerMetadata: {
        openrouter: {
          provider: response.provider ?? '',
          usage: {
            promptTokens: usageInfo.inputTokens ?? 0,
            completionTokens: usageInfo.outputTokens ?? 0,
            totalTokens: usageInfo.totalTokens ?? 0,
            cost: response.usage?.cost,
            promptTokensDetails: {
              cachedTokens:
                response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
            },
            completionTokensDetails: {
              reasoningTokens:
                response.usage?.completion_tokens_details?.reasoning_tokens ??
                0,
            },
            costDetails: {
              upstreamInferenceCost:
                response.usage?.cost_details?.upstream_inference_cost ?? 0,
            },
          },
        },
      },
      request: { body: args },
      response: {
        id: response.id,
        modelId: response.model,
        headers: responseHeaders,
      },
    }
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>
    warnings: Array<LanguageModelV2CallWarning>
    request?: { body?: unknown }
    response?: LanguageModelV2ResponseMetadata & {
      headers?: SharedV2Headers
      body?: unknown
    }
  }> {
    const providerOptions = options.providerOptions || {}
    const openrouterOptions = providerOptions.openrouter || {}

    const args = {
      ...this.getArgs(options),
      ...openrouterOptions,
    }

    const { value: response, responseHeaders } = await postJsonToApi({
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
        OpenRouterStreamChatCompletionChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const toolCalls: Array<{
      id: string
      type: 'function'
      function: {
        name: string
        arguments: string
      }
      inputStarted: boolean
      sent: boolean
    }> = []

    let finishReason: FinishReason = 'other'
    const usage: LanguageModelV2Usage = {
      inputTokens: Number.NaN,
      outputTokens: Number.NaN,
      totalTokens: Number.NaN,
      reasoningTokens: Number.NaN,
      cachedInputTokens: Number.NaN,
    }

    // Track provider-specific usage information
    const openrouterUsage: Partial<OpenRouterUsageAccounting> = {}

    let textStarted = false
    let reasoningStarted = false
    let textId: string | undefined
    let reasoningId: string | undefined
    let openrouterResponseId: string | undefined
    let provider: string | undefined

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<
            z.infer<typeof OpenRouterStreamChatCompletionChunkSchema>
          >,
          LanguageModelV2StreamPart
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

            if (value.provider) {
              provider = value.provider
            }

            if (value.id) {
              openrouterResponseId = value.id
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
              usage.inputTokens = value.usage.prompt_tokens
              usage.outputTokens = value.usage.completion_tokens
              usage.totalTokens =
                value.usage.prompt_tokens + value.usage.completion_tokens

              // Collect OpenRouter specific usage information
              openrouterUsage.promptTokens = value.usage.prompt_tokens

              if (value.usage.prompt_tokens_details) {
                const cachedInputTokens =
                  value.usage.prompt_tokens_details.cached_tokens ?? 0

                usage.cachedInputTokens = cachedInputTokens
                openrouterUsage.promptTokensDetails = {
                  cachedTokens: cachedInputTokens,
                }
              }

              openrouterUsage.completionTokens = value.usage.completion_tokens
              if (value.usage.completion_tokens_details) {
                const reasoningTokens =
                  value.usage.completion_tokens_details.reasoning_tokens ?? 0

                usage.reasoningTokens = reasoningTokens
                openrouterUsage.completionTokensDetails = {
                  reasoningTokens,
                }
              }

              const upstreamInferenceCost =
                value.usage.cost_details?.upstream_inference_cost
              if (
                upstreamInferenceCost != null &&
                upstreamInferenceCost !== undefined
              ) {
                openrouterUsage.costDetails = {
                  upstreamInferenceCost,
                }
              }

              if (value.usage.cost !== undefined) {
                openrouterUsage.cost = value.usage.cost
              }
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

            const emitReasoningChunk = (chunkText: string) => {
              if (!reasoningStarted) {
                reasoningId = openrouterResponseId || generateId()
                controller.enqueue({
                  type: 'reasoning-start',
                  id: reasoningId,
                })
                reasoningStarted = true
              }
              controller.enqueue({
                type: 'reasoning-delta',
                delta: chunkText,
                id: reasoningId || generateId(),
              })
            }

            if (delta.reasoning_details && delta.reasoning_details.length > 0) {
              for (const detail of delta.reasoning_details) {
                switch (detail.type) {
                  case ReasoningDetailType.Text: {
                    if (detail.text) {
                      emitReasoningChunk(detail.text)
                    }
                    break
                  }
                  case ReasoningDetailType.Encrypted: {
                    if (detail.data) {
                      emitReasoningChunk('[REDACTED]')
                    }
                    break
                  }
                  case ReasoningDetailType.Summary: {
                    if (detail.summary) {
                      emitReasoningChunk(detail.summary)
                    }
                    break
                  }
                  default: {
                    detail satisfies never
                    break
                  }
                }
              }
            } else if (delta.reasoning) {
              emitReasoningChunk(delta.reasoning)
            }

            if (delta.content) {
              // If reasoning was previously active and now we're starting text content,
              // we should end the reasoning first to maintain proper order
              if (reasoningStarted && !textStarted) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: reasoningId || generateId(),
                })
                reasoningStarted = false // Mark as ended so we don't end it again in flush
              }

              if (!textStarted) {
                textId = openrouterResponseId || generateId()
                controller.enqueue({
                  type: 'text-start',
                  id: textId,
                })
                textStarted = true
              }
              controller.enqueue({
                type: 'text-delta',
                delta: delta.content,
                id: textId || generateId(),
              })
            }

            if (delta.annotations) {
              for (const annotation of delta.annotations) {
                if (annotation.type === 'url_citation') {
                  controller.enqueue({
                    type: 'source',
                    sourceType: 'url' as const,
                    id: annotation.url_citation.url,
                    url: annotation.url_citation.url,
                    title: annotation.url_citation.title,
                    providerMetadata: {
                      openrouter: {
                        content: annotation.url_citation.content || '',
                      },
                    },
                  })
                }
              }
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index ?? toolCalls.length - 1

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
                    inputStarted: false,
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
                    toolCall.inputStarted = true

                    controller.enqueue({
                      type: 'tool-input-start',
                      id: toolCall.id,
                      toolName: toolCall.function.name,
                    })

                    // send delta
                    controller.enqueue({
                      type: 'tool-input-delta',
                      id: toolCall.id,
                      delta: toolCall.function.arguments,
                    })

                    controller.enqueue({
                      type: 'tool-input-end',
                      id: toolCall.id,
                    })

                    // send tool call
                    controller.enqueue({
                      type: 'tool-call',
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                      input: toolCall.function.arguments,
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

                if (!toolCall.inputStarted) {
                  toolCall.inputStarted = true
                  controller.enqueue({
                    type: 'tool-input-start',
                    id: toolCall.id,
                    toolName: toolCall.function.name,
                  })
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function.arguments +=
                    toolCallDelta.function?.arguments ?? ''
                }

                // send delta
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.id,
                  delta: toolCallDelta.function.arguments ?? '',
                })

                // check if tool call is complete
                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    input: toolCall.function.arguments,
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
                if (toolCall && !toolCall.sent) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    // Coerce invalid arguments to an empty JSON object
                    input: isParsableJson(toolCall.function.arguments)
                      ? toolCall.function.arguments
                      : '{}',
                  })
                  toolCall.sent = true
                }
              }
            }

            // End reasoning first if it was started, to maintain proper order
            if (reasoningStarted) {
              controller.enqueue({
                type: 'reasoning-end',
                id: reasoningId || generateId(),
              })
            }
            if (textStarted) {
              controller.enqueue({
                type: 'text-end',
                id: textId || generateId(),
              })
            }

            const openrouterMetadata: {
              usage: Partial<OpenRouterUsageAccounting>
              provider?: string
            } = {
              usage: openrouterUsage,
            }

            // Only include provider if it's actually set
            if (provider !== undefined) {
              openrouterMetadata.provider = provider
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
              providerMetadata: {
                openrouter: openrouterMetadata,
              },
            })
          },
        }),
      ),
      warnings: [],
      request: { body: args },
      response: { headers: responseHeaders },
    }
  }
}
