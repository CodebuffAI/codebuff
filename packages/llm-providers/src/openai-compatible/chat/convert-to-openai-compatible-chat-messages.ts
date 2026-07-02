import { UnsupportedFunctionalityError } from '@ai-sdk/provider'
import { convertToBase64 } from '@ai-sdk/provider-utils'

import type { OpenAICompatibleChatPrompt } from './openai-compatible-api-types'
import type {
  LanguageModelV2Prompt,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider'

function getOpenAIMetadata(message: {
  providerOptions?: SharedV2ProviderMetadata
}) {
  return message?.providerOptions?.openaiCompatible ?? {}
}

export function convertToOpenAICompatibleChatMessages(
  prompt: LanguageModelV2Prompt,
): OpenAICompatibleChatPrompt {
  const messages: OpenAICompatibleChatPrompt = []
  for (const { role, content, ...message } of prompt) {
    const metadata = getOpenAIMetadata({ ...message })
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content, ...metadata })
        break
      }

      case 'user': {
        messages.push({
          role: 'user',
          content: content.map((part) => {
            const partMetadata = getOpenAIMetadata(part)
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text, ...partMetadata }
              }
              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType

                  return {
                    type: 'image_url',
                    image_url: {
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    },
                    ...partMetadata,
                  }
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  })
                }
              }
            }
          }),
          ...metadata,
        })

        break
      }

      case 'assistant': {
        let text = ''
        let reasoningContent = ''
        const toolCalls: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }> = []

        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part)
          switch (part.type) {
            case 'text': {
              text += part.text
              break
            }
            case 'reasoning': {
              reasoningContent += part.text
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
                ...partMetadata,
              })
              break
            }
          }
        }

        // Emit one wire message per run of assistant messages. Thinking models
        // that validate tool-call replay (e.g. DeepSeek V4) require the step's
        // reasoning_content to sit ON the message carrying tool_calls — a
        // separate adjacent assistant message fails the request — so merge
        // instead of pushing a second assistant message.
        const previous = messages[messages.length - 1]
        if (previous?.role === 'assistant') {
          if (text.length > 0) {
            previous.content =
              typeof previous.content === 'string'
                ? previous.content + text
                : text
          }
          if (reasoningContent.length > 0) {
            previous.reasoning_content =
              typeof previous.reasoning_content === 'string'
                ? previous.reasoning_content + reasoningContent
                : reasoningContent
          }
          if (toolCalls.length > 0) {
            previous.tool_calls = [...(previous.tool_calls ?? []), ...toolCalls]
          }
          // Metadata unions with later-wins precedence — the same key
          // precedence the push path gets from spreading metadata last.
          Object.assign(previous, metadata)
          break
        }

        messages.push({
          role: 'assistant',
          content: text,
          reasoning_content:
            reasoningContent.length > 0 ? reasoningContent : undefined,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          ...metadata,
        })

        break
      }

      case 'tool': {
        for (const toolResponse of content) {
          const output = toolResponse.output

          let contentValue: string
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value
              break
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value)
              break
          }

          const toolResponseMetadata = getOpenAIMetadata(toolResponse)
          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
            ...toolResponseMetadata,
          })
        }
        break
      }

      default: {
        const _exhaustiveCheck: never = role
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`)
      }
    }
  }

  return messages
}
