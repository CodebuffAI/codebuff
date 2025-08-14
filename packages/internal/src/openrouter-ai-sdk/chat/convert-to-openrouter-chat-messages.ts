import { getFileUrl } from './file-url-utils'
import { isUrl } from './is-url'
import { ReasoningDetailType } from '../schemas/reasoning-details'

import type { ReasoningDetailUnion } from '../schemas/reasoning-details'
import type {
  ChatCompletionContentPart,
  OpenRouterChatCompletionsInput,
} from '../types/openrouter-chat-completions-input'
import type {
  LanguageModelV2FilePart,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  LanguageModelV2ToolResultPart,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider'

// Type for OpenRouter Cache Control following Anthropic's pattern
export type OpenRouterCacheControl = { type: 'ephemeral' }

function getCacheControl(
  providerMetadata: SharedV2ProviderMetadata | undefined,
): OpenRouterCacheControl | undefined {
  const anthropic = providerMetadata?.anthropic
  const openrouter = providerMetadata?.openrouter

  // Allow both cacheControl and cache_control:
  return (openrouter?.cacheControl ??
    openrouter?.cache_control ??
    anthropic?.cacheControl ??
    anthropic?.cache_control) as OpenRouterCacheControl | undefined
}

export function convertToOpenRouterChatMessages(
  prompt: LanguageModelV2Prompt,
): OpenRouterChatCompletionsInput {
  const messages: OpenRouterChatCompletionsInput = []
  for (const { role, content, providerOptions } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({
          role: 'system',
          content,
          cache_control: getCacheControl(providerOptions),
        })
        break
      }

      case 'user': {
        if (content.length === 1 && content[0]?.type === 'text') {
          const cacheControl =
            getCacheControl(providerOptions) ??
            getCacheControl(content[0].providerOptions)
          const contentWithCacheControl: string | ChatCompletionContentPart[] =
            cacheControl
              ? [
                  {
                    type: 'text',
                    text: content[0].text,
                    cache_control: cacheControl,
                  },
                ]
              : content[0].text
          messages.push({
            role: 'user',
            content: contentWithCacheControl,
          })
          break
        }

        // Get message level cache control
        const messageCacheControl = getCacheControl(providerOptions)
        const contentParts: ChatCompletionContentPart[] = content.map(
          (part: LanguageModelV2TextPart | LanguageModelV2FilePart) => {
            const cacheControl =
              getCacheControl(part.providerOptions) ?? messageCacheControl

            switch (part.type) {
              case 'text':
                return {
                  type: 'text' as const,
                  text: part.text,
                  // For text parts, only use part-specific cache control
                  cache_control: cacheControl,
                }
              case 'file': {
                if (part.mediaType?.startsWith('image/')) {
                  const url = getFileUrl({
                    part,
                    defaultMediaType: 'image/jpeg',
                  })
                  return {
                    type: 'image_url' as const,
                    image_url: {
                      url,
                    },
                    // For image parts, use part-specific or message-level cache control
                    cache_control: cacheControl,
                  }
                }

                const fileName = String(
                  part.providerOptions?.openrouter?.filename ??
                    part.filename ??
                    '',
                )

                const fileData = getFileUrl({
                  part,
                  defaultMediaType: 'application/pdf',
                })

                if (
                  isUrl({
                    url: fileData,
                    protocols: new Set(['http:', 'https:']),
                  })
                ) {
                  return {
                    type: 'file' as const,
                    file: {
                      filename: fileName,
                      file_data: fileData,
                    },
                  } satisfies ChatCompletionContentPart
                }

                return {
                  type: 'file' as const,
                  file: {
                    filename: fileName,
                    file_data: fileData,
                  },
                  cache_control: cacheControl,
                } satisfies ChatCompletionContentPart
              }
              default: {
                return {
                  type: 'text' as const,
                  text: '',
                  cache_control: cacheControl,
                }
              }
            }
          },
        )

        // For multi-part messages, don't add cache_control at the root level
        messages.push({
          role: 'user',
          content: contentParts,
        })

        break
      }

      case 'assistant': {
        let text = ''
        let reasoning = ''
        const reasoningDetails: ReasoningDetailUnion[] = []
        const toolCalls: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }> = []

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text
              break
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
              })
              break
            }
            case 'reasoning': {
              reasoning += part.text
              reasoningDetails.push({
                type: ReasoningDetailType.Text,
                text: part.text,
              })

              break
            }

            case 'file':
              break
            default: {
              break
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          reasoning: reasoning || undefined,
          reasoning_details:
            reasoningDetails.length > 0 ? reasoningDetails : undefined,
          cache_control: getCacheControl(providerOptions),
        })

        break
      }

      case 'tool': {
        for (const toolResponse of content) {
          const content = getToolResultContent(toolResponse)

          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content,
            cache_control:
              getCacheControl(providerOptions) ??
              getCacheControl(toolResponse.providerOptions),
          })
        }
        break
      }

      default: {
        break
      }
    }
  }

  return messages
}

function getToolResultContent(input: LanguageModelV2ToolResultPart): string {
  return input.output.type === 'text'
    ? input.output.value
    : JSON.stringify(input.output.value)
}
