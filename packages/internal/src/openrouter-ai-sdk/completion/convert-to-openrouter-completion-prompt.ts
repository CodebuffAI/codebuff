import type {
  LanguageModelV2FilePart,
  LanguageModelV2Prompt,
  LanguageModelV2ReasoningPart,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
} from '@ai-sdk/provider'

import {
  InvalidPromptError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider'

export function convertToOpenRouterCompletionPrompt({
  prompt,
  inputFormat,
  user = 'user',
  assistant = 'assistant',
}: {
  prompt: LanguageModelV2Prompt
  inputFormat: 'prompt' | 'messages'
  user?: string
  assistant?: string
}): {
  prompt: string
} {
  // When the user supplied a prompt input, we don't transform it:
  if (
    inputFormat === 'prompt' &&
    prompt.length === 1 &&
    prompt[0] &&
    prompt[0].role === 'user' &&
    prompt[0].content.length === 1 &&
    prompt[0].content[0] &&
    prompt[0].content[0].type === 'text'
  ) {
    return { prompt: prompt[0].content[0].text }
  }

  // otherwise transform to a chat message format:
  let text = ''

  // if first message is a system message, add it to the text:
  if (prompt[0] && prompt[0].role === 'system') {
    text += `${prompt[0].content}\n\n`
    prompt = prompt.slice(1)
  }

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        throw new InvalidPromptError({
          message: `Unexpected system message in prompt: ${content}`,
          prompt,
        })
      }

      case 'user': {
        const userMessage = content
          .map((part: LanguageModelV2TextPart | LanguageModelV2FilePart) => {
            switch (part.type) {
              case 'text': {
                return part.text
              }

              case 'file': {
                throw new UnsupportedFunctionalityError({
                  functionality: 'file attachments',
                })
              }
              default: {
                return ''
              }
            }
          })
          .join('')

        text += `${user}:\n${userMessage}\n\n`
        break
      }

      case 'assistant': {
        const assistantMessage = content
          .map(
            (
              part:
                | LanguageModelV2TextPart
                | LanguageModelV2FilePart
                | LanguageModelV2ReasoningPart
                | LanguageModelV2ToolCallPart
                | LanguageModelV2ToolResultPart,
            ) => {
              switch (part.type) {
                case 'text': {
                  return part.text
                }
                case 'tool-call': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'tool-call messages',
                  })
                }
                case 'tool-result': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'tool-result messages',
                  })
                }
                case 'reasoning': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'reasoning messages',
                  })
                }

                case 'file': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'file attachments',
                  })
                }

                default: {
                  return ''
                }
              }
            },
          )
          .join('')

        text += `${assistant}:\n${assistantMessage}\n\n`
        break
      }

      case 'tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'tool messages',
        })
      }

      default: {
        break
      }
    }
  }

  // Assistant message prefix:
  text += `${assistant}:\n`

  return {
    prompt: text,
  }
}
