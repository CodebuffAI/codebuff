/**
 * Codex message and event transformation utilities.
 *
 * Converts between:
 * - AI SDK OpenAI chat format (messages array with role/content)
 * - Codex API format (input array with type/role/content and function_call items)
 */

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
 * State for tracking tool calls during streaming (per-request)
 */
export interface ToolCallState {
  currentToolCallId: string | null
  currentToolCallIndex: number
  modelId: string
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
