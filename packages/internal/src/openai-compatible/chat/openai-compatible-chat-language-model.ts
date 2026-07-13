import {
  InvalidResponseDataError,
} from '@ai-sdk/provider'
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParsableJson,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils'
import { z } from 'zod/v4'

import { convertToOpenAICompatibleChatMessages } from './convert-to-openai-compatible-chat-messages'
import { getResponseMetadata } from './get-response-metadata'
import { mapOpenAICompatibleFinishReason } from './map-openai-compatible-finish-reason'
import { openaiCompatibleProviderOptions } from './openai-compatible-chat-options'
import { defaultOpenAICompatibleErrorStructure } from '../openai-compatible-error'
import { prepareTools } from './openai-compatible-prepare-tools'

import type { OpenAICompatibleChatModelId } from './openai-compatible-chat-options'
import type { ProviderErrorStructure } from '../openai-compatible-error'
import type { MetadataExtractor } from './openai-compatible-metadata-extractor'
import type {
  APICallError,
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  JSONValue,
  LanguageModelV2StreamPart,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider'
import type {
  FetchFunction,
  ParseResult,
  ResponseHandler,
} from '@ai-sdk/provider-utils'

export type OpenAICompatibleChatConfig = {
  provider: string
  headers: () => Record<string, string | undefined>
  url: (options: { modelId: string; path: string }) => string
  fetch?: FetchFunction
  includeUsage?: boolean
  errorStructure?: ProviderErrorStructure<any>
  metadataExtractor?: MetadataExtractor

  /**
   * Whether the model supports structured outputs.
   */
  supportsStructuredOutputs?: boolean

  /**
   * The supported URLs for the model.
   */
  supportedUrls?: () => LanguageModelV2['supportedUrls']

  /**
   * Whether text-only user messages should be sent as plain strings.
   * Some strict OpenAI-compatible APIs reject the content part array form.
   */
  stringifyTextContent?: boolean
}

const TOOL_CALL_METADATA_KEYS = new Set(['index', 'id', 'type', 'function'])

function getToolCallProviderMetadata(
  toolCall: Record<string, unknown>,
): SharedV2ProviderMetadata | undefined {
  const metadata: Record<string, JSONValue> = {}

  for (const [key, value] of Object.entries(toolCall)) {
    if (TOOL_CALL_METADATA_KEYS.has(key) || value === undefined) {
      continue
    }
    metadata[key] = value as JSONValue
  }

  if (Object.keys(metadata).length === 0) {
    return undefined
  }

  return { openaiCompatible: metadata }
}

function mergeProviderMetadata(
  left: SharedV2ProviderMetadata | undefined,
  right: SharedV2ProviderMetadata | undefined,
): SharedV2ProviderMetadata | undefined {
  if (left == null) return right
  if (right == null) return left

  const merged: SharedV2ProviderMetadata = { ...left }
  for (const [provider, metadata] of Object.entries(right)) {
    merged[provider] = {
      ...(merged[provider] ?? {}),
      ...metadata,
    }
  }
  return merged
}

type OpenAICompatibleStreamErrorData = {
  message: string
  type?: string | null
  param?: unknown
  code?: string | number | null
  status?: string | null
  details?: unknown[] | null
}

function stringifyErrorMetadata(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(metadata)
  } catch {
    return String(metadata)
  }
}

function createOpenAICompatibleStreamError(
  error: OpenAICompatibleStreamErrorData,
): Error {
  const metadata = Object.fromEntries(
    Object.entries({
      type: error.type,
      param: error.param,
      code: error.code,
      status: error.status,
      details: error.details,
    }).filter(([, value]) => value != null),
  )
  const metadataText =
    Object.keys(metadata).length > 0 ? stringifyErrorMetadata(metadata) : ''
  const trimmedMetadataText =
    metadataText.length > 2000
      ? `${metadataText.slice(0, 2000)}...`
      : metadataText
  const streamError = new Error(
    trimmedMetadataText
      ? `${error.message} ${trimmedMetadataText}`
      : error.message,
  )
  streamError.name = 'OpenAICompatibleStreamError'
  return streamError
}

export class OpenAICompatibleChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'

  readonly supportsStructuredOutputs: boolean

  readonly modelId: OpenAICompatibleChatModelId
  private readonly config: OpenAICompatibleChatConfig
  private readonly failedResponseHandler: ResponseHandler<APICallError>
  private readonly chunkSchema // type inferred via constructor

  constructor(
    modelId: OpenAICompatibleChatModelId,
    config: OpenAICompatibleChatConfig,
  ) {
    this.modelId = modelId
    this.config = config

    // initialize error handling:
    const errorStructure =
      config.errorStructure ?? defaultOpenAICompatibleErrorStructure
    this.chunkSchema = createOpenAICompatibleChatChunkSchema(
      errorStructure.errorSchema,
    )
    this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure)

    this.supportsStructuredOutputs = config.supportsStructuredOutputs ?? false
  }

  get provider(): string {
    return this.config.provider
  }

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim()
  }

  get supportedUrls() {
    return this.config.supportedUrls?.() ?? {}
  }

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    providerOptions,
    stopSequences,
    responseFormat,
    seed,
    toolChoice,
    tools,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = []

    // Parse provider options
    const baseOptionsResult = await parseProviderOptions({
      provider: 'openai-compatible',
      providerOptions,
      schema: openaiCompatibleProviderOptions,
    })
    const providerOptionsResult = await parseProviderOptions({
      provider: this.providerOptionsName,
      providerOptions,
      schema: openaiCompatibleProviderOptions,
    })
    const compatibleOptions = Object.assign(
      baseOptionsResult ?? {},
      providerOptionsResult ?? {},
    )

    if (topK != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'topK' })
    }

    if (
      responseFormat?.type === 'json' &&
      responseFormat.schema != null &&
      !this.supportsStructuredOutputs
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details:
          'JSON response format schema is only supported with structuredOutputs',
      })
    }

    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
    })

    return {
      args: {
        // model id:
        model: this.modelId,

        // model specific settings:
        user: compatibleOptions.user,

        // standardized settings:
        max_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        response_format:
          responseFormat?.type === 'json'
            ? this.supportsStructuredOutputs === true &&
              responseFormat.schema != null
              ? {
                  type: 'json_schema',
                  json_schema: {
                    schema: responseFormat.schema,
                    name: responseFormat.name ?? 'response',
                    description: responseFormat.description,
                  },
                }
              : { type: 'json_object' }
            : undefined,

        stop: stopSequences,
        seed,
        ...Object.fromEntries(
          Object.entries(
            providerOptions?.[this.providerOptionsName] ?? {},
          ).filter(
            ([key]) =>
              !Object.keys(openaiCompatibleProviderOptions.shape).includes(key),
          ),
        ),

        reasoning_effort: compatibleOptions.reasoningEffort,
        verbosity: compatibleOptions.textVerbosity,

        // messages:
        messages: convertToOpenAICompatibleChatMessages(prompt, {
          stringifyTextContent: this.config.stringifyTextContent,
        }),

        // tools:
        tools: openaiTools,
        tool_choice: openaiToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args, warnings } = await this.getArgs({ ...options })

    const body = JSON.stringify(args)

    const {
      responseHeaders,
      value: responseBody,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        OpenAICompatibleChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const choice = responseBody.choices[0]
    if (!choice) {
      throw new InvalidResponseDataError({
        data: rawResponse,
        message: 'OpenAI-compatible chat response contained no choices.',
      })
    }
    const content: Array<LanguageModelV2Content> = []

    // text content:
    const text = choice.message.content
    if (text != null && text.length > 0) {
      content.push({ type: 'text', text })
    }

    // reasoning content:
    const reasoning =
      choice.message.reasoning_content ?? choice.message.reasoning
    if (reasoning != null && reasoning.length > 0) {
      content.push({
        type: 'reasoning',
        text: reasoning,
      })
    }

    // tool calls:
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments!,
          providerMetadata: getToolCallProviderMetadata(
            toolCall as Record<string, unknown>,
          ),
        })
      }
    }

    // provider metadata:
    const extractedMetadata =
      await this.config.metadataExtractor?.extractMetadata?.({
        parsedBody: rawResponse,
      })
    const providerMetadata: SharedV2ProviderMetadata = {
      [this.providerOptionsName]: {},
      ...extractedMetadata,
    }
    const completionTokenDetails = responseBody.usage?.completion_tokens_details
    if (completionTokenDetails?.accepted_prediction_tokens != null) {
      providerMetadata[this.providerOptionsName].acceptedPredictionTokens =
        completionTokenDetails?.accepted_prediction_tokens
    }
    if (completionTokenDetails?.rejected_prediction_tokens != null) {
      providerMetadata[this.providerOptionsName].rejectedPredictionTokens =
        completionTokenDetails?.rejected_prediction_tokens
    }

    return {
      content,
      finishReason: mapOpenAICompatibleFinishReason(choice.finish_reason),
      usage: {
        inputTokens: responseBody.usage?.prompt_tokens ?? undefined,
        outputTokens: responseBody.usage?.completion_tokens ?? undefined,
        totalTokens: responseBody.usage?.total_tokens ?? undefined,
        reasoningTokens:
          responseBody.usage?.completion_tokens_details?.reasoning_tokens ??
          undefined,
        cachedInputTokens:
          responseBody.usage?.prompt_tokens_details?.cached_tokens ?? undefined,
      },
      providerMetadata,
      request: { body },
      response: {
        ...getResponseMetadata(responseBody),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    }
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = await this.getArgs({ ...options })

    const body = {
      ...args,
      stream: true,

      // only include stream_options when in strict compatibility mode:
      stream_options: this.config.includeUsage
        ? { include_usage: true }
        : undefined,
    }

    const metadataExtractor =
      this.config.metadataExtractor?.createStreamExtractor()

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        this.chunkSchema,
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
      hasFinished: boolean
      providerMetadata?: SharedV2ProviderMetadata
    }> = []

    let finishReason: LanguageModelV2FinishReason = 'unknown'
    const usage: {
      completionTokens: number | undefined
      completionTokensDetails: {
        reasoningTokens: number | undefined
        acceptedPredictionTokens: number | undefined
        rejectedPredictionTokens: number | undefined
      }
      promptTokens: number | undefined
      promptTokensDetails: {
        cachedTokens: number | undefined
      }
      totalTokens: number | undefined
    } = {
      completionTokens: undefined,
      completionTokensDetails: {
        reasoningTokens: undefined,
        acceptedPredictionTokens: undefined,
        rejectedPredictionTokens: undefined,
      },
      promptTokens: undefined,
      promptTokensDetails: {
        cachedTokens: undefined,
      },
      totalTokens: undefined,
    }
    let isFirstChunk = true
    const providerOptionsName = this.providerOptionsName
    let isActiveReasoning = false
    let isActiveText = false
    let finishEmitted = false

    function emitFinish(
      controller: TransformStreamDefaultController<LanguageModelV2StreamPart>,
    ) {
      if (finishEmitted) {
        return
      }

      if (isActiveReasoning) {
        controller.enqueue({ type: 'reasoning-end', id: 'reasoning-0' })
        isActiveReasoning = false
      }

      if (isActiveText) {
        controller.enqueue({ type: 'text-end', id: 'txt-0' })
        isActiveText = false
      }

      // go through all tool calls and send the ones that are not finished.
      // Skip any phantom tool call that ended up with an empty name (a
      // continuation fragment that was never merged into a real call); flushing
      // it would produce a "Tool '' not found" error downstream.
      for (const toolCall of toolCalls.filter(
        (toolCall) => !toolCall.hasFinished && toolCall.function?.name,
      )) {
        controller.enqueue({
          type: 'tool-input-end',
          id: toolCall.id,
        })

        controller.enqueue({
          type: 'tool-call',
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments,
          providerMetadata: toolCall.providerMetadata,
        })
        toolCall.hasFinished = true
      }

      const providerMetadata: SharedV2ProviderMetadata = {
        [providerOptionsName]: {},
        ...metadataExtractor?.buildMetadata(),
      }
      if (usage.completionTokensDetails.acceptedPredictionTokens != null) {
        providerMetadata[providerOptionsName].acceptedPredictionTokens =
          usage.completionTokensDetails.acceptedPredictionTokens
      }
      if (usage.completionTokensDetails.rejectedPredictionTokens != null) {
        providerMetadata[providerOptionsName].rejectedPredictionTokens =
          usage.completionTokensDetails.rejectedPredictionTokens
      }

      controller.enqueue({
        type: 'finish',
        finishReason,
        usage: {
          inputTokens: usage.promptTokens ?? undefined,
          outputTokens: usage.completionTokens ?? undefined,
          totalTokens: usage.totalTokens ?? undefined,
          reasoningTokens:
            usage.completionTokensDetails.reasoningTokens ?? undefined,
          cachedInputTokens:
            usage.promptTokensDetails.cachedTokens ?? undefined,
        },
        providerMetadata,
      })
      finishEmitted = true
    }

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof this.chunkSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings })
          },

          // TODO we lost type safety on Chunk, most likely due to the error schema. MUST FIX
          transform(chunk, controller) {
            // Emit raw chunk if requested (before anything else)
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue })
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              // A few OpenAI-compatible proxies emit `data: null` as a
              // heartbeat or non-standard end marker. It carries no model
              // content, so ignore it just like [DONE] instead of surfacing a
              // TypeValidationError for the root null value.
              if (chunk.rawValue === null) {
                return
              }
              if (isOpenAICompatibleBillingSummaryChunk(chunk.rawValue)) {
                return
              }

              finishReason = 'error'
              controller.enqueue({ type: 'error', error: chunk.error })
              return
            }
            const value = chunk.value

            // handle error chunks:
            if ('error' in value) {
              finishReason = 'error'
              controller.enqueue({
                type: 'error',
                error: createOpenAICompatibleStreamError(value.error),
              })
              return
            }

            // Some OpenAI-compatible providers send successful billing telemetry
            // chunks outside the normal chat choices stream. Ignore them without
            // emitting response metadata or changing finish state.
            if (isOpenAICompatibleBillingSummaryChunk(value)) {
              return
            }

            metadataExtractor?.processChunk(chunk.rawValue)

            if (isFirstChunk) {
              isFirstChunk = false

              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              })
            }

            if (value.usage != null) {
              const {
                prompt_tokens,
                completion_tokens,
                total_tokens,
                prompt_tokens_details,
                completion_tokens_details,
              } = value.usage

              usage.promptTokens = prompt_tokens ?? undefined
              usage.completionTokens = completion_tokens ?? undefined
              usage.totalTokens = total_tokens ?? undefined
              if (completion_tokens_details?.reasoning_tokens != null) {
                usage.completionTokensDetails.reasoningTokens =
                  completion_tokens_details?.reasoning_tokens
              }
              if (
                completion_tokens_details?.accepted_prediction_tokens != null
              ) {
                usage.completionTokensDetails.acceptedPredictionTokens =
                  completion_tokens_details?.accepted_prediction_tokens
              }
              if (
                completion_tokens_details?.rejected_prediction_tokens != null
              ) {
                usage.completionTokensDetails.rejectedPredictionTokens =
                  completion_tokens_details?.rejected_prediction_tokens
              }
              if (prompt_tokens_details?.cached_tokens != null) {
                usage.promptTokensDetails.cachedTokens =
                  prompt_tokens_details?.cached_tokens
              }
            }

            const choice = value.choices[0]

            if (choice?.finish_reason != null) {
              finishReason = mapOpenAICompatibleFinishReason(
                choice.finish_reason,
              )
            }

            if (choice?.delta == null) {
              return
            }

            const delta = choice.delta

            // enqueue reasoning before text deltas:
            const reasoningContent = delta.reasoning_content ?? delta.reasoning
            if (reasoningContent) {
              if (!isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-start',
                  id: 'reasoning-0',
                })
                isActiveReasoning = true
              }

              controller.enqueue({
                type: 'reasoning-delta',
                id: 'reasoning-0',
                delta: reasoningContent,
              })
            }

            if (delta.content) {
              if (!isActiveText) {
                controller.enqueue({ type: 'text-start', id: 'txt-0' })
                isActiveText = true
              }

              controller.enqueue({
                type: 'text-delta',
                id: 'txt-0',
                delta: delta.content,
              })
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index
                const providerMetadata = getToolCallProviderMetadata(
                  toolCallDelta as Record<string, unknown>,
                )

                if (toolCalls[index] == null) {
                  // Some OpenAI-compatible providers (e.g. certain Bedrock
                  // proxies) violate the streaming protocol by emitting a
                  // continuation of an in-progress tool call as a *new*
                  // tool_calls entry with a shifted/duplicate `index` and an
                  // empty ("") or missing `function.name`. The standard guard
                  // only rejects `name == null`, so an empty-string name slips
                  // through and creates a phantom, empty-named tool call. That
                  // splits one logical call into two broken halves: the real
                  // call is left with truncated (unparsable) arguments and the
                  // phantom call holds the orphaned argument suffix.
                  //
                  // To be robust, treat a delta with a falsy name for an
                  // unknown index as a continuation of the most-recently
                  // created unfinished tool call: append its arguments there
                  // (which typically completes the truncated JSON) instead of
                  // creating a phantom bucket. If there is no unfinished call
                  // to attach to, drop the stray fragment rather than throwing.
                  if (
                    toolCallDelta.function?.name == null ||
                    toolCallDelta.function.name === ''
                  ) {
                    let lastUnfinished: (typeof toolCalls)[number] | undefined
                    for (let j = toolCalls.length - 1; j >= 0; j--) {
                      const candidate = toolCalls[j]
                      if (candidate != null && !candidate.hasFinished) {
                        lastUnfinished = candidate
                        break
                      }
                    }

                    if (lastUnfinished != null) {
                      const argDelta = toolCallDelta.function?.arguments ?? ''
                      if (argDelta.length > 0) {
                        lastUnfinished.function!.arguments += argDelta
                        controller.enqueue({
                          type: 'tool-input-delta',
                          id: lastUnfinished.id,
                          delta: argDelta,
                        })
                      }

                      if (
                        lastUnfinished.function?.name != null &&
                        isParsableJson(lastUnfinished.function.arguments)
                      ) {
                        controller.enqueue({
                          type: 'tool-input-end',
                          id: lastUnfinished.id,
                        })
                        controller.enqueue({
                          type: 'tool-call',
                          toolCallId: lastUnfinished.id ?? generateId(),
                          toolName: lastUnfinished.function.name,
                          input: lastUnfinished.function.arguments,
                          providerMetadata: lastUnfinished.providerMetadata,
                        })
                        lastUnfinished.hasFinished = true
                      }
                    }

                    continue
                  }

                  // UPDATED (James): Generate an ID if the provider doesn't include one (e.g., GLM models)
                  const toolCallId = toolCallDelta.id ?? generateId()

                  controller.enqueue({
                    type: 'tool-input-start',
                    id: toolCallId,
                    toolName: toolCallDelta.function.name,
                  })

                  toolCalls[index] = {
                    id: toolCallId,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? '',
                    },
                    hasFinished: false,
                    providerMetadata,
                  }

                  const toolCall = toolCalls[index]

                  if (
                    toolCall.function?.name != null &&
                    toolCall.function?.arguments != null
                  ) {
                    // send delta if the argument text has already started:
                    if (toolCall.function.arguments.length > 0) {
                      controller.enqueue({
                        type: 'tool-input-delta',
                        id: toolCall.id,
                        delta: toolCall.function.arguments,
                      })
                    }

                    // check if tool call is complete
                    // (some providers send the full tool call in one chunk):
                    if (isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: 'tool-input-end',
                        id: toolCall.id,
                      })

                      controller.enqueue({
                        type: 'tool-call',
                        toolCallId: toolCall.id ?? generateId(),
                        toolName: toolCall.function.name,
                        input: toolCall.function.arguments,
                        providerMetadata: toolCall.providerMetadata,
                      })
                      toolCall.hasFinished = true
                    }
                  }

                  continue
                }

                // existing tool call, merge if not finished
                const toolCall = toolCalls[index]

                if (toolCall.hasFinished) {
                  continue
                }

                toolCall.providerMetadata = mergeProviderMetadata(
                  toolCall.providerMetadata,
                  providerMetadata,
                )

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
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
                    type: 'tool-input-end',
                    id: toolCall.id,
                  })

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    input: toolCall.function.arguments,
                    providerMetadata: toolCall.providerMetadata,
                  })
                  toolCall.hasFinished = true
                }
              }
            }

            // Some OpenAI-compatible providers send the final finish_reason
            // chunk for a tool-call turn but keep the SSE connection open
            // instead of closing with [DONE]. Once the provider has explicitly
            // said the assistant turn ended because of tool calls, all useful
            // tool-call data has arrived; finish locally so agent tool
            // execution can continue across providers.
            if (finishReason === 'tool-calls') {
              emitFinish(controller)
              controller.terminate()
            }
          },

          flush(controller) {
            emitFinish(controller)
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    }
  }
}

const openaiCompatibleTokenUsageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    total_tokens: z.number().nullish(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number().nullish(),
      })
      .nullish(),
    completion_tokens_details: z
      .object({
        reasoning_tokens: z.number().nullish(),
        accepted_prediction_tokens: z.number().nullish(),
        rejected_prediction_tokens: z.number().nullish(),
      })
      .nullish(),
  })
  .nullish()

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const OpenAICompatibleChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        reasoning: z.string().nullish(),
        tool_calls: z
          .array(
            z
              .object({
                id: z.string().nullish(),
                function: z.object({
                  name: z.string(),
                  arguments: z.string(),
                }),
              })
              .passthrough(),
          )
          .nullish(),
      }),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: openaiCompatibleTokenUsageSchema,
})

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const createOpenAICompatibleChatChunkSchema = <
  ERROR_SCHEMA extends z.core.$ZodType,
>(
  errorSchema: ERROR_SCHEMA,
) =>
  z.union([
    z
      .object({
        object: z.literal('billing.summary'),
      })
      .passthrough(),
    z.object({
      id: z.string().nullish(),
      created: z.number().nullish(),
      model: z.string().nullish(),
      choices: z.array(
        z.object({
          delta: z
            .object({
              role: z.enum(['assistant']).nullish(),
              content: z.string().nullish(),
              // Most openai-compatible models set `reasoning_content`, but some
              // providers serving `gpt-oss` set `reasoning`. See #7866
              reasoning_content: z.string().nullish(),
              reasoning: z.string().nullish(),
              tool_calls: z
                .array(
                  z
                    .object({
                      index: z.number(),
                      id: z.string().nullish(),
                      function: z.object({
                        name: z.string().nullish(),
                        arguments: z.string().nullish(),
                      }),
                    })
                    .passthrough(),
                )
                .nullish(),
            })
            .nullish(),
          finish_reason: z.string().nullish(),
        }),
      ),
      usage: openaiCompatibleTokenUsageSchema,
    }),
    errorSchema,
  ])

type OpenAICompatibleChatChunk = z.infer<
  ReturnType<typeof createOpenAICompatibleChatChunkSchema>
>

type OpenAICompatibleBillingSummaryChunk = Extract<
  OpenAICompatibleChatChunk,
  { object: 'billing.summary' }
>

function isOpenAICompatibleBillingSummaryChunk(
  value: unknown,
): value is OpenAICompatibleBillingSummaryChunk {
  return (
    value != null &&
    typeof value === 'object' &&
    'object' in value &&
    value.object === 'billing.summary'
  )
}
