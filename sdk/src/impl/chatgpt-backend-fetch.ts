/**
 * Custom fetch for routing ChatGPT OAuth requests through the ChatGPT backend API.
 *
 * The AI SDK's OpenAICompatibleChatLanguageModel speaks Chat Completions format,
 * but ChatGPT OAuth tokens only work with the ChatGPT backend (chatgpt.com/backend-api)
 * which uses the Responses API format.
 *
 * This module transforms:
 * - Request: Chat Completions body → Responses API body
 * - Response: Responses API SSE → Chat Completions SSE
 */

import type { FetchFunction } from '@ai-sdk/provider-utils'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

// ============================================================================
// JWT / Account ID
// ============================================================================

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad === 2) base64 += '=='
  else if (pad === 3) base64 += '='
  return Buffer.from(base64, 'base64').toString('utf-8')
}

export function extractChatGptAccountId(accessToken: string): string | null {
  try {
    const parts = accessToken.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(base64UrlDecode(parts[1]))
    const auth = payload?.['https://api.openai.com/auth']
    return typeof auth?.chatgpt_account_id === 'string'
      ? auth.chatgpt_account_id
      : null
  } catch {
    return null
  }
}

// ============================================================================
// Request Transform: Chat Completions → Responses API
// ============================================================================

interface ChatCompletionsToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

interface ChatCompletionsMessage {
  role: string
  content?: unknown
  tool_calls?: ChatCompletionsToolCall[]
  tool_call_id?: string
}

interface ChatCompletionsTool {
  type: string
  function?: {
    name: string
    description?: string
    parameters?: unknown
    strict?: boolean
  }
}

function convertUserContentParts(content: unknown): unknown {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')
  return content.map((part: Record<string, unknown>) => {
    if (part.type === 'text') {
      return { type: 'input_text', text: part.text }
    }
    if (part.type === 'image_url') {
      const imageUrl = part.image_url as Record<string, unknown> | undefined
      return {
        type: 'input_image',
        image_url: imageUrl?.url ?? imageUrl,
      }
    }
    return part
  })
}

function convertMessages(
  messages: ChatCompletionsMessage[],
): unknown[] {
  const input: unknown[] = []

  for (const msg of messages) {
    switch (msg.role) {
      case 'system': {
        // System messages are extracted to top-level `instructions` field;
        // if any slip through, convert to developer role
        if (msg.content) {
          input.push({ type: 'message', role: 'developer', content: msg.content })
        }
        break
      }

      case 'user': {
        const content = convertUserContentParts(msg.content)
        if (content) {
          input.push({ type: 'message', role: 'user', content })
        }
        break
      }

      case 'assistant': {
        if (msg.content) {
          input.push({ type: 'message', role: 'assistant', content: msg.content })
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            input.push({
              type: 'function_call',
              call_id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            })
          }
        }
        break
      }

      case 'tool': {
        input.push({
          type: 'function_call_output',
          call_id: msg.tool_call_id ?? 'unknown',
          output:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
        })
        break
      }
    }
  }

  return input
}

function convertTools(tools: ChatCompletionsTool[]): unknown[] {
  return tools.map((tool) => {
    if (tool.type === 'function' && tool.function) {
      return {
        type: 'function',
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        ...(tool.function.strict !== undefined && {
          strict: tool.function.strict,
        }),
      }
    }
    return tool
  })
}

function transformRequestBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const messages = (body.messages ?? []) as ChatCompletionsMessage[]
  const tools = body.tools as ChatCompletionsTool[] | undefined

  // Extract system messages into the top-level `instructions` field
  // (required by the ChatGPT backend API)
  const systemMessages = messages.filter((m) => m.role === 'system')
  const nonSystemMessages = messages.filter((m) => m.role !== 'system')
  const instructions = systemMessages
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n\n')

  const transformed: Record<string, unknown> = {
    model: body.model,
    instructions: instructions || 'You are a helpful assistant.',
    input: convertMessages(nonSystemMessages),
    stream: true,
    store: false,
    include: ['reasoning.encrypted_content'],
  }

  if (tools?.length) {
    transformed.tools = convertTools(tools)
  }
  if (body.tool_choice != null) {
    transformed.tool_choice = body.tool_choice
  }

  // The ChatGPT backend does not support: max_output_tokens, max_tokens,
  // temperature, top_p, stop, frequency_penalty, presence_penalty, logprobs,
  // n, stream_options — omit them all.

  const reasoningEffort = body.reasoning_effort as string | undefined
  transformed.reasoning = {
    effort: reasoningEffort || 'high',
    summary: 'auto',
  }

  transformed.text = { verbosity: 'medium' }

  return transformed
}

// ============================================================================
// Response Transform: Responses API SSE → Chat Completions SSE
// ============================================================================

function createSseTransformStream(): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let buffer = ''
  let responseId: string | null = null
  let responseModel: string | null = null
  let nextToolCallIndex = 0
  const outputIndexToToolIndex = new Map<number, number>()
  let emittedRole = false

  function emit(
    controller: TransformStreamDefaultController<Uint8Array>,
    chunk: Record<string, unknown>,
  ) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
  }

  function processEvent(
    controller: TransformStreamDefaultController<Uint8Array>,
    data: Record<string, unknown>,
  ) {
    const type = data.type as string | undefined
    if (!type) return

    switch (type) {
      case 'response.created': {
        const resp = data.response as Record<string, unknown> | undefined
        responseId = (resp?.id as string) ?? null
        responseModel = (resp?.model as string) ?? null
        if (!emittedRole) {
          emit(controller, {
            id: responseId,
            model: responseModel,
            choices: [
              { index: 0, delta: { role: 'assistant' }, finish_reason: null },
            ],
          })
          emittedRole = true
        }
        break
      }

      case 'response.output_text.delta': {
        emit(controller, {
          id: responseId,
          choices: [
            {
              index: 0,
              delta: { content: data.delta as string },
              finish_reason: null,
            },
          ],
        })
        break
      }

      case 'response.reasoning_summary_text.delta': {
        emit(controller, {
          id: responseId,
          choices: [
            {
              index: 0,
              delta: { reasoning_content: data.delta as string },
              finish_reason: null,
            },
          ],
        })
        break
      }

      case 'response.output_item.added': {
        const item = data.item as Record<string, unknown> | undefined
        if (item?.type === 'function_call') {
          const tcIndex = nextToolCallIndex++
          const outputIdx = (data.output_index as number) ?? 0
          outputIndexToToolIndex.set(outputIdx, tcIndex)
          emit(controller, {
            id: responseId,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: tcIndex,
                      id: (item.call_id as string) ?? (item.id as string),
                      function: {
                        name: item.name as string,
                        arguments: '',
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          })
        }
        break
      }

      case 'response.function_call_arguments.delta': {
        const outputIdx = (data.output_index as number) ?? 0
        const tcIdx = outputIndexToToolIndex.get(outputIdx) ?? 0
        emit(controller, {
          id: responseId,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: tcIdx,
                    function: { arguments: data.delta as string },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        })
        break
      }

      case 'response.completed':
      case 'response.done': {
        const resp = data.response as Record<string, unknown> | undefined
        const usage = resp?.usage as Record<string, unknown> | undefined
        const status = resp?.status as string | undefined

        let finishReason = 'stop'
        if (status === 'incomplete') {
          finishReason = 'length'
        } else if (nextToolCallIndex > 0) {
          finishReason = 'tool_calls'
        }

        const chunk: Record<string, unknown> = {
          id: responseId,
          choices: [
            { index: 0, delta: {}, finish_reason: finishReason },
          ],
        }

        if (usage) {
          const outputDetails = usage.output_tokens_details as
            | Record<string, unknown>
            | undefined
          chunk.usage = {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
            ...(outputDetails?.reasoning_tokens != null && {
              completion_tokens_details: {
                reasoning_tokens: outputDetails.reasoning_tokens,
              },
            }),
          }
        }

        emit(controller, chunk)
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        break
      }

      case 'response.failed': {
        const resp = data.response as Record<string, unknown> | undefined
        const errorObj = (resp?.error ?? data.error) as
          | Record<string, unknown>
          | undefined
        emit(controller, {
          error: {
            message:
              (errorObj?.message as string) ??
              'ChatGPT backend request failed',
            type: (errorObj?.type as string) ?? 'server_error',
          },
        })
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        break
      }

      case 'error': {
        const errorObj = (data.error ?? data) as Record<string, unknown>
        emit(controller, {
          error: {
            message:
              (errorObj.message as string) ??
              'Unknown error from ChatGPT backend',
            type: (errorObj.type as string) ?? 'server_error',
          },
        })
        break
      }

      // Skip all other events silently (content_part.added, output_text.done, etc.)
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue

        const jsonStr = line.slice(6).trim()
        if (!jsonStr || jsonStr === '[DONE]') {
          continue
        }

        try {
          const parsed = JSON.parse(jsonStr) as Record<string, unknown>
          processEvent(controller, parsed)
        } catch {
          // Skip unparseable lines
        }
      }
    },

    flush(controller) {
      if (buffer.trim().startsWith('data: ')) {
        const jsonStr = buffer.trim().slice(6).trim()
        if (jsonStr && jsonStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(jsonStr) as Record<string, unknown>
            processEvent(controller, parsed)
          } catch {
            // skip
          }
        }
      }
    },
  })
}

function transformResponseStream(
  inputStream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const transform = createSseTransformStream()
  inputStream.pipeTo(transform.writable).catch(() => {})
  return transform.readable
}

// ============================================================================
// Custom Fetch
// ============================================================================

export function createChatGptBackendFetch(): FetchFunction {
  const fetchFn: FetchLike = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let transformedInit = init

    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>
        const transformedBody = transformRequestBody(body)
        transformedInit = { ...init, body: JSON.stringify(transformedBody) }
      } catch {
        // If body can't be parsed, pass through unchanged
      }
    }

    const response = await globalThis.fetch(input, transformedInit)

    if (!response.ok) {
      // Map 404 usage-limit errors to 429 (same as opencode plugin)
      if (response.status === 404) {
        try {
          const text = await response.clone().text()
          if (/usage_limit|rate_limit/i.test(text)) {
            return new Response(text, {
              status: 429,
              statusText: 'Too Many Requests',
              headers: response.headers,
            })
          }
        } catch {
          // Fall through to return original response
        }
      }
      return response
    }

    if (!response.body) return response

    const transformedStream = transformResponseStream(response.body)

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers({
        'content-type': 'text/event-stream; charset=utf-8',
      }),
    })
  }

  return fetchFn as FetchFunction
}
