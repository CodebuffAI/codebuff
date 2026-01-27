/**
 * Model provider abstraction for routing requests to the appropriate LLM provider.
 *
 * This module handles:
 * - Claude OAuth: Direct requests to Anthropic API using user's OAuth token
 * - Default: Requests through Codebuff backend (which routes to OpenRouter)
 */

import path from 'path'

import { createAnthropic } from '@ai-sdk/anthropic'
import { BYOK_OPENROUTER_HEADER } from '@codebuff/common/constants/byok'
import {
  CLAUDE_CODE_SYSTEM_PROMPT_PREFIX,
  CLAUDE_OAUTH_BETA_HEADERS,
  isClaudeModel,
  toAnthropicModelId,
} from '@codebuff/common/constants/claude-oauth'
import {
  CHATGPT_BACKEND_API_URL,
  isOpenAIModel,
  toCodexModelId,
} from '@codebuff/common/constants/codex-oauth'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@codebuff/internal/openai-compatible/index'

import { WEBSITE_URL } from '../constants'
import { getValidClaudeOAuthCredentials, getValidCodexOAuthCredentials } from '../credentials'
import { getByokOpenrouterApiKeyFromEnv } from '../env'

import type { LanguageModel } from 'ai'

// ============================================================================
// Claude OAuth Rate Limit Cache
// ============================================================================

/** Timestamp (ms) when Claude OAuth rate limit expires, or null if not rate-limited */
let claudeOAuthRateLimitedUntil: number | null = null

/**
 * Mark Claude OAuth as rate-limited. Subsequent requests will skip Claude OAuth
 * and use Codebuff backend until the reset time.
 * @param resetAt - When the rate limit resets. If not provided, guesses 5 minutes from now.
 */
export function markClaudeOAuthRateLimited(resetAt?: Date): void {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
  claudeOAuthRateLimitedUntil = resetAt ? resetAt.getTime() : fiveMinutesFromNow
}

/**
 * Check if Claude OAuth is currently rate-limited.
 * Returns true if rate-limited and reset time hasn't passed.
 */
export function isClaudeOAuthRateLimited(): boolean {
  if (claudeOAuthRateLimitedUntil === null) {
    return false
  }
  if (Date.now() >= claudeOAuthRateLimitedUntil) {
    // Rate limit expired, clear the cache
    claudeOAuthRateLimitedUntil = null
    return false
  }
  return true
}

/**
 * Reset the Claude OAuth rate limit cache.
 * Call this when user reconnects their Claude subscription.
 */
export function resetClaudeOAuthRateLimit(): void {
  claudeOAuthRateLimitedUntil = null
}

// ============================================================================
// Codex OAuth Rate Limit Cache
// ============================================================================

/** Timestamp (ms) when Codex OAuth rate limit expires, or null if not rate-limited */
let codexOAuthRateLimitedUntil: number | null = null

/**
 * Mark Codex OAuth as rate-limited. Subsequent requests will skip Codex OAuth
 * and use Codebuff backend until the reset time.
 * @param resetAt - When the rate limit resets. If not provided, guesses 5 minutes from now.
 */
export function markCodexOAuthRateLimited(resetAt?: Date): void {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
  codexOAuthRateLimitedUntil = resetAt ? resetAt.getTime() : fiveMinutesFromNow
}

/**
 * Check if Codex OAuth is currently rate-limited.
 * Returns true if rate-limited and reset time hasn't passed.
 */
export function isCodexOAuthRateLimited(): boolean {
  if (codexOAuthRateLimitedUntil === null) {
    return false
  }
  if (Date.now() >= codexOAuthRateLimitedUntil) {
    // Rate limit expired, clear the cache
    codexOAuthRateLimitedUntil = null
    return false
  }
  return true
}

/**
 * Reset the Codex OAuth rate limit cache.
 * Call this when user reconnects their Codex subscription.
 */
export function resetCodexOAuthRateLimit(): void {
  codexOAuthRateLimitedUntil = null
}

// ============================================================================
// Claude OAuth Quota Fetching
// ============================================================================

interface ClaudeQuotaWindow {
  utilization: number
  resets_at: string | null
}

interface ClaudeQuotaResponse {
  five_hour: ClaudeQuotaWindow | null
  seven_day: ClaudeQuotaWindow | null
  seven_day_oauth_apps: ClaudeQuotaWindow | null
  seven_day_opus: ClaudeQuotaWindow | null
}

/**
 * Fetch the rate limit reset time from Anthropic's quota API.
 * Returns the earliest reset time (whichever limit is more restrictive).
 * Returns null if fetch fails or no reset time is available.
 */
export async function fetchClaudeOAuthResetTime(accessToken: string): Promise<Date | null> {
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219',
      },
    })

    if (!response.ok) {
      return null
    }

    const responseBody = await response.json()
    const data = responseBody as ClaudeQuotaResponse

    // Parse reset times
    const fiveHour = data.five_hour
    const sevenDay = data.seven_day

    const fiveHourRemaining = fiveHour ? Math.max(0, 100 - fiveHour.utilization) : 100
    const sevenDayRemaining = sevenDay ? Math.max(0, 100 - sevenDay.utilization) : 100

    // Return the reset time for whichever limit is more restrictive (lower remaining)
    if (fiveHourRemaining <= sevenDayRemaining && fiveHour?.resets_at) {
      return new Date(fiveHour.resets_at)
    } else if (sevenDay?.resets_at) {
      return new Date(sevenDay.resets_at)
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Codebuff API key for backend authentication */
  apiKey: string
  /** Model ID (OpenRouter format, e.g., "anthropic/claude-sonnet-4") */
  model: string
  /** If true, skip Claude OAuth and use Codebuff backend (for fallback after rate limit) */
  skipClaudeOAuth?: boolean
  /** If true, skip Codex OAuth and use Codebuff backend (for fallback after rate limit) */
  skipCodexOAuth?: boolean
}

/**
 * Result from getModelForRequest.
 */
export interface ModelResult {
  /** The language model to use for requests */
  model: LanguageModel
  /** Whether this model uses Claude OAuth direct (affects cost tracking) */
  isClaudeOAuth: boolean
  /** Whether this model uses Codex OAuth direct (affects cost tracking) */
  isCodexOAuth: boolean
}

// Usage accounting type for OpenRouter/Codebuff backend responses
type OpenRouterUsageAccounting = {
  cost: number | null
  costDetails: {
    upstreamInferenceCost: number | null
  }
}

/**
 * Get the appropriate model for a request.
 *
 * If Claude OAuth credentials are available and the model is a Claude model,
 * returns an Anthropic direct model. If Codex OAuth credentials are available
 * and the model is an OpenAI model, returns an OpenAI direct model.
 * Otherwise, returns the Codebuff backend model.
 * 
 * This function is async because it may need to refresh the OAuth token.
 */
export async function getModelForRequest(params: ModelRequestParams): Promise<ModelResult> {
  const { apiKey, model, skipClaudeOAuth, skipCodexOAuth } = params

  // Check if we should use Claude OAuth direct
  // Skip if explicitly requested, if rate-limited, or if not a Claude model
  if (!skipClaudeOAuth && !isClaudeOAuthRateLimited() && isClaudeModel(model)) {
    // Get valid credentials (will refresh if needed)
    const claudeOAuthCredentials = await getValidClaudeOAuthCredentials()
    if (claudeOAuthCredentials) {
      return {
        model: createAnthropicOAuthModel(
          model,
          claudeOAuthCredentials.accessToken,
        ),
        isClaudeOAuth: true,
        isCodexOAuth: false,
      }
    }
  }

  // Check if we should use Codex OAuth direct
  // Skip if explicitly requested, if rate-limited, or if not an OpenAI model
  if (!skipCodexOAuth && !isCodexOAuthRateLimited() && isOpenAIModel(model)) {
    // Get valid credentials (will refresh if needed)
    const codexOAuthCredentials = await getValidCodexOAuthCredentials()
    if (codexOAuthCredentials) {
      // Try to create the Codex OAuth model - may fail if token is malformed
      const codexModel = createCodexOAuthModel(
        model,
        codexOAuthCredentials.accessToken,
      )
      if (codexModel) {
        return {
          model: codexModel,
          isClaudeOAuth: false,
          isCodexOAuth: true,
        }
      }
      // If model creation failed (e.g., couldn't extract account ID), fall through to backend
    }
  }

  // Default: use Codebuff backend
  return {
    model: createCodebuffBackendModel(apiKey, model),
    isClaudeOAuth: false,
    isCodexOAuth: false,
  }
}

/**
 * Create an Anthropic model that uses OAuth Bearer token authentication.
 */
function createAnthropicOAuthModel(
  model: string,
  oauthToken: string,
): LanguageModel {
  // Convert OpenRouter model ID to Anthropic model ID
  const anthropicModelId = toAnthropicModelId(model)

  // Create Anthropic provider with custom fetch to use Bearer token auth
  // Custom fetch to handle OAuth Bearer token authentication and system prompt transformation
  const customFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers)

    // Remove the x-api-key header that the SDK adds
    headers.delete('x-api-key')

    // Add Bearer token authentication (for OAuth)
    headers.set('Authorization', `Bearer ${oauthToken}`)

    // Add required beta headers for OAuth (same as opencode)
    // These beta headers are required to access Claude 4+ models with OAuth
    const existingBeta = headers.get('anthropic-beta') ?? ''
    const betaList = existingBeta
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean)
    const mergedBetas = [
      ...new Set([...CLAUDE_OAUTH_BETA_HEADERS, ...betaList]),
    ].join(',')
    headers.set('anthropic-beta', mergedBetas)

    // Transform the request body to use the correct system prompt format for Claude OAuth
    // Anthropic requires the system prompt to be split into two separate blocks:
    // 1. First block: Claude Code identifier (required for OAuth access)
    // 2. Second block: The actual system prompt (if any)
    let modifiedInit = init
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body)
        // Always inject the Claude Code identifier for OAuth requests
        // Extract existing system prompt if present
        const existingSystem = body.system
          ? Array.isArray(body.system)
            ? body.system
                .map(
                  (s: { text?: string; content?: string }) =>
                    s.text ?? s.content ?? '',
                )
                .join('\n\n')
            : typeof body.system === 'string'
              ? body.system
              : ''
          : ''

        // Build the system array with Claude Code identifier first
        body.system = [
          {
            type: 'text',
            text: CLAUDE_CODE_SYSTEM_PROMPT_PREFIX,
          },
          // Only add second block if there's actual content
          ...(existingSystem
            ? [
                {
                  type: 'text',
                  text: existingSystem,
                },
              ]
            : []),
        ]
        modifiedInit = { ...init, body: JSON.stringify(body) }
      } catch {
        // If parsing fails, continue with original body
      }
    }

    return globalThis.fetch(input, {
      ...modifiedInit,
      headers,
    })
  }

  // Pass empty apiKey like opencode does - this prevents the SDK from adding x-api-key header
  // The custom fetch will add the Bearer token instead
  const anthropic = createAnthropic({
    apiKey: '',
    fetch: customFetch as unknown as typeof globalThis.fetch,
  })

  // Cast to LanguageModel since the AI SDK types may be slightly different versions
  // Using unknown as intermediate to handle V2 vs V3 differences
  return anthropic(anthropicModelId) as unknown as LanguageModel
}

/**
 * Extract the ChatGPT account ID from the JWT access token.
 * The account ID is required for the chatgpt-account-id header.
 */
export function extractAccountIdFromToken(accessToken: string): string | null {
  try {
    // JWT format: header.payload.signature
    const parts = accessToken.split('.')
    if (parts.length !== 3) {
      return null
    }

    // Decode the payload (base64url)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))

    // The account ID is in the custom claim at "https://api.openai.com/auth"
    const authClaim = payload['https://api.openai.com/auth']
    if (authClaim?.chatgpt_account_id) {
      return authClaim.chatgpt_account_id
    }

    return null
  } catch {
    return null
  }
}

/**
 * Content part types from AI SDK
 */
export interface TextContentPart {
  type: 'text'
  text: string
}

export interface ImageUrlContentPart {
  type: 'image_url'
  image_url: { url: string }
}

export type ContentPart = TextContentPart | ImageUrlContentPart | { type: string; text?: string }

/**
 * OpenAI chat message type from AI SDK
 */
export interface ChatMessage {
  role: string
  content?: string | Array<ContentPart>
  tool_calls?: Array<{
    id: string
    type: string
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
  name?: string
}

/**
 * Transform OpenAI chat format messages to Codex input format.
 * The Codex API expects a different structure than the standard OpenAI chat API.
 * 
 * Key differences:
 * - User messages use content type 'input_text'
 * - Assistant messages use content type 'output_text' (NOT input_text!)
 * - System messages become 'developer' role (but usually go in 'instructions' field instead)
 * - Tool calls are NOT messages - they are 'function_call' items
 * - Tool results are NOT messages with role 'tool' - they are 'function_call_output' items
 */
export function transformMessagesToCodexInput(
  messages: Array<ChatMessage>,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = []

  for (const msg of messages) {
    // Handle tool result messages (role: 'tool')
    // These become function_call_output items in Codex format
    if (msg.role === 'tool') {
      result.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id || 'unknown',
        output: typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content),
      })
      continue
    }

    // Handle assistant messages with tool calls
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // First, add the assistant message if it has text content
      if (msg.content) {
        const textContent = typeof msg.content === 'string' 
          ? msg.content 
          : msg.content.map(p => (p as TextContentPart).text).filter(Boolean).join('')
        
        if (textContent) {
          result.push({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: textContent }],
          })
        }
      }

      // Then add each tool call as a separate function_call item
      for (const toolCall of msg.tool_calls) {
        if (toolCall.type === 'function') {
          result.push({
            type: 'function_call',
            call_id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          })
        }
      }
      continue
    }

    // Handle regular messages (user, assistant without tool calls, system)
    // Determine the content type based on role:
    // - user messages use 'input_text'
    // - assistant messages use 'output_text'
    // - developer/system messages use 'input_text'
    const isAssistant = msg.role === 'assistant'
    const textContentType = isAssistant ? 'output_text' : 'input_text'

    // Convert content to Codex format
    const content: Array<Record<string, unknown>> = []
    if (typeof msg.content === 'string') {
      content.push({ type: textContentType, text: msg.content })
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          content.push({ type: textContentType, text: (part as TextContentPart).text })
        } else if (part.type === 'image_url') {
          // Transform AI SDK image format to Codex format
          // AI SDK: { type: 'image_url', image_url: { url: '...' } }
          // Codex:  { type: 'input_image', image_url: '...' }
          const imagePart = part as ImageUrlContentPart
          content.push({
            type: 'input_image',
            image_url: imagePart.image_url.url,
          })
        } else {
          // Pass through other content types as-is
          content.push(part as Record<string, unknown>)
        }
      }
    }

    // Skip empty messages (but allow messages with images)
    const hasContent = content.length > 0 && content.some(
      (c) => c.type === 'input_image' || (c.type === 'output_text' && c.text) || (c.type === 'input_text' && c.text)
    )
    if (!hasContent) {
      continue
    }

    // Map roles: assistant -> assistant, user -> user, system -> developer
    let role = msg.role
    if (role === 'system') {
      role = 'developer'
    }

    result.push({
      type: 'message',
      role,
      content,
    })
  }

  return result
}

/**
 * State for tracking tool calls during streaming (per-request)
 */
export interface ToolCallState {
  currentToolCallId: string | null
  currentToolCallIndex: number
  modelId: string
}

/**
 * Transform a Codex event to OpenAI chat format.
 * The ChatGPT backend returns events like "response.output_text.delta"
 * but the AI SDK expects OpenAI chat format like "choices[0].delta.content".
 * Returns null if the event should be skipped (not passed to SDK).
 * 
 * @param event - The Codex event to transform
 * @param toolCallState - Mutable state for tracking tool calls (scoped per-request)
 */
export function transformCodexEventToOpenAI(
  event: Record<string, unknown>,
  toolCallState: ToolCallState,
): string | null {
  const { modelId } = toolCallState

  // Handle text delta events - these contain the actual content
  if (event.type === 'response.output_text.delta' && event.delta) {
    const transformed = {
      id: event.response_id || 'chatcmpl-codex',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [
        {
          index: 0,
          delta: {
            content: event.delta,
          },
          finish_reason: null,
        },
      ],
    }
    return `data: ${JSON.stringify(transformed)}\n\n`
  }

  // Handle function call added event - start of a new tool call
  if (event.type === 'response.output_item.added') {
    const item = event.item as Record<string, unknown> | undefined
    if (item?.type === 'function_call') {
      toolCallState.currentToolCallId = (item.call_id as string) || `call_${Date.now()}`
      const transformed = {
        id: 'chatcmpl-codex',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: toolCallState.currentToolCallIndex,
                  id: toolCallState.currentToolCallId,
                  type: 'function',
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
      }
      return `data: ${JSON.stringify(transformed)}\n\n`
    }
  }

  // Handle function call arguments delta - streaming tool call arguments
  if (event.type === 'response.function_call_arguments.delta' && event.delta) {
    const transformed = {
      id: 'chatcmpl-codex',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: toolCallState.currentToolCallIndex,
                function: {
                  arguments: event.delta as string,
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    }
    return `data: ${JSON.stringify(transformed)}\n\n`
  }

  // Handle function call done event
  if (event.type === 'response.function_call_arguments.done') {
    toolCallState.currentToolCallIndex++
    // Don't emit anything here - the arguments were already streamed
    return null
  }

  // Handle completion events
  if (event.type === 'response.completed' || event.type === 'response.done') {
    const response = event.response as Record<string, unknown> | undefined
    
    // Determine finish reason based on output
    let finishReason = 'stop'
    const output = response?.output as Array<Record<string, unknown>> | undefined
    if (output?.some(item => item.type === 'function_call')) {
      finishReason = 'tool_calls'
    }
    
    const transformed = {
      id: response?.id || 'chatcmpl-codex',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: (response?.model as string) || modelId,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: finishReason,
        },
      ],
    }
    return `data: ${JSON.stringify(transformed)}\n\n`
  }

  // Skip other events (response.created, response.in_progress, etc.)
  // These are metadata events that don't contain content
  return null
}

/**
 * Create a custom fetch function that transforms OpenAI chat format to Codex format.
 * The ChatGPT Codex backend expects a different request body format than the standard OpenAI API.
 */
function createCodexFetch(
  oauthToken: string,
  accountId: string,
  modelId: string,
): typeof globalThis.fetch {
  const customFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Parse and transform the request body from OpenAI chat format to Codex format
    let transformedBody = init?.body
    if (init?.body && typeof init.body === 'string') {
      try {
        const originalBody = JSON.parse(init.body)

        // Transform from OpenAI chat format to Codex format
        const codexBody: Record<string, unknown> = {
          model: modelId,
          // Transform messages to Codex input format
          input: transformMessagesToCodexInput(originalBody.messages || []),
          // Codex-specific required fields
          store: false, // ChatGPT backend REQUIRES store=false
          stream: true, // Always stream
          // Reasoning configuration
          reasoning: {
            effort: 'medium',
            summary: 'auto',
          },
          // Text verbosity
          text: {
            verbosity: 'medium',
          },
          // Include reasoning in response
          include: ['reasoning.encrypted_content'],
        }

        // Pass through tool definitions if present, transforming from AI SDK format to Codex format
        // AI SDK sends: { type: 'function', function: { name, description, parameters } }
        // Codex expects: { type: 'function', name, description, parameters }
        if (originalBody.tools && Array.isArray(originalBody.tools)) {
          codexBody.tools = originalBody.tools.map((tool: Record<string, unknown>) => {
            // If tool has nested 'function' object (AI SDK format), flatten it
            if (tool.type === 'function' && tool.function && typeof tool.function === 'object') {
              const fn = tool.function as Record<string, unknown>
              return {
                type: 'function',
                name: fn.name,
                description: fn.description,
                parameters: fn.parameters,
                // Preserve any additional properties
                ...(fn.strict !== undefined && { strict: fn.strict }),
              }
            }
            // Already in Codex format or unknown format, pass through
            return tool
          })
        }

        // Extract system message for instructions (required by Codex API)
        const systemMessage = (originalBody.messages || []).find(
          (m: { role: string }) => m.role === 'system',
        )
        if (systemMessage) {
          codexBody.instructions =
            typeof systemMessage.content === 'string'
              ? systemMessage.content
              : systemMessage.content
                  ?.map((p: { text?: string }) => p.text)
                  .filter(Boolean)
                  .join('\n') || 'You are a helpful assistant.'
          // Remove system message from input (it's now in instructions)
          codexBody.input = transformMessagesToCodexInput(
            (originalBody.messages || []).filter(
              (m: { role: string }) => m.role !== 'system',
            ),
          )
        } else {
          // Codex API REQUIRES instructions field - provide default if no system message
          codexBody.instructions = 'You are a helpful assistant.'
        }

        transformedBody = JSON.stringify(codexBody)
      } catch {
        // If parsing fails, use original body
      }
    }

    // Make the request to the Codex backend
    const response = await globalThis.fetch(
      `${CHATGPT_BACKEND_API_URL}/codex/responses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${oauthToken}`,
          'chatgpt-account-id': accountId,
          'OpenAI-Beta': 'responses=experimental',
          originator: 'codex_cli_rs',
          accept: 'text/event-stream',
        },
        body: transformedBody,
      },
    )

    // If not streaming or error, return as-is
    if (!response.ok || !response.body) {
      return response
    }

    // Transform the streaming response from Codex format to OpenAI format
    // Use a TransformStream for proper backpressure handling
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buffer = ''
    // Tool call state is scoped to this request to avoid race conditions
    const toolCallState: ToolCallState = {
      currentToolCallId: null,
      currentToolCallIndex: 0,
      modelId,
    }

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          // Parse the SSE data line
          const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
          if (data === '[DONE]') continue

          try {
            const event = JSON.parse(data)
            const transformed = transformCodexEventToOpenAI(event, toolCallState)
            if (transformed) {
              controller.enqueue(encoder.encode(transformed))
            }
          } catch {
            // Skip unparseable lines
          }
        }
      },
      flush(controller) {
        // Process any remaining buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
            if (data === '[DONE]') continue

            try {
              const event = JSON.parse(data)
              const transformed = transformCodexEventToOpenAI(event, toolCallState)
              if (transformed) {
                controller.enqueue(encoder.encode(transformed))
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
        // Always send [DONE] to signal end of stream to AI SDK
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      },
    })

    const transformedStream = response.body.pipeThrough(transformStream)

    // Return a new response with the transformed stream
    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  return customFetch as typeof globalThis.fetch
}

/**
 * Create an OpenAI/Codex model that uses OAuth Bearer token authentication.
 * Uses a custom fetch that transforms OpenAI chat format to Codex format and back.
 */
function createCodexOAuthModel(
  model: string,
  oauthToken: string,
): LanguageModel | null {
  // Convert to normalized Codex model ID
  const codexModelId = toCodexModelId(model)
  if (!codexModelId) {
    // Unknown model - fall back to Codebuff backend
    return null
  }

  // Extract the ChatGPT account ID from the JWT token
  // This is REQUIRED for the chatgpt-account-id header
  const accountId = extractAccountIdFromToken(oauthToken)
  if (!accountId) {
    // If we can't extract account ID, return null to fall back to Codebuff backend
    // This shouldn't happen with valid tokens, but provides a safety net
    return null
  }

  // Use OpenAICompatibleChatLanguageModel with custom fetch that transforms
  // OpenAI chat format to/from Codex format
  return new OpenAICompatibleChatLanguageModel(codexModelId, {
    provider: 'codex-oauth',
    // URL doesn't matter - our custom fetch ignores it and calls the Codex endpoint directly
    url: () => `${CHATGPT_BACKEND_API_URL}/codex/responses`,
    headers: () => ({}), // Headers are set in custom fetch
    fetch: createCodexFetch(oauthToken, accountId, codexModelId),
    supportsStructuredOutputs: false,
  })
}

/**
 * Create a model that routes through the Codebuff backend.
 * This is the existing behavior - requests go to Codebuff backend which forwards to OpenRouter.
 */
function createCodebuffBackendModel(
  apiKey: string,
  model: string,
): LanguageModel {
  const openrouterUsage: OpenRouterUsageAccounting = {
    cost: null,
    costDetails: {
      upstreamInferenceCost: null,
    },
  }

  const openrouterApiKey = getByokOpenrouterApiKeyFromEnv()

  return new OpenAICompatibleChatLanguageModel(model, {
    provider: 'codebuff',
    url: ({ path: endpoint }) =>
      new URL(path.join('/api/v1', endpoint), WEBSITE_URL).toString(),
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codebuff`,
      ...(openrouterApiKey && { [BYOK_OPENROUTER_HEADER]: openrouterApiKey }),
    }),
    metadataExtractor: {
      extractMetadata: async ({ parsedBody }: { parsedBody: any }) => {
        if (openrouterApiKey !== undefined) {
          return { codebuff: { usage: openrouterUsage } }
        }

        if (typeof parsedBody?.usage?.cost === 'number') {
          openrouterUsage.cost = parsedBody.usage.cost
        }
        if (
          typeof parsedBody?.usage?.cost_details?.upstream_inference_cost ===
          'number'
        ) {
          openrouterUsage.costDetails.upstreamInferenceCost =
            parsedBody.usage.cost_details.upstream_inference_cost
        }
        return { codebuff: { usage: openrouterUsage } }
      },
      createStreamExtractor: () => ({
        processChunk: (parsedChunk: any) => {
          if (openrouterApiKey !== undefined) {
            return
          }

          if (typeof parsedChunk?.usage?.cost === 'number') {
            openrouterUsage.cost = parsedChunk.usage.cost
          }
          if (
            typeof parsedChunk?.usage?.cost_details?.upstream_inference_cost ===
            'number'
          ) {
            openrouterUsage.costDetails.upstreamInferenceCost =
              parsedChunk.usage.cost_details.upstream_inference_cost
          }
        },
        buildMetadata: () => {
          return { codebuff: { usage: openrouterUsage } }
        },
      }),
    },
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
}
