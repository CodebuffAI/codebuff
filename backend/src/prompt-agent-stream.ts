import {
  AnthropicModel,
  CostMode,
  getModelForMode,
  models,
  OpenAIModel,
  openrouterModels,
  providerModelNames,
  shortModelNames,
} from 'common/constants'
import { Message } from 'common/types/message'

import { promptClaudeStream, System } from './llm-apis/claude'
import { streamGemini25ProWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { promptOpenAIStream } from './llm-apis/openai-api'
import { messagesWithSystem } from './util/messages'
import { promptOpenRouterStream } from './llm-apis/open-router'

export const getAgentStream = (params: {
  costMode: CostMode
  selectedModel: string | undefined
  stopSequences?: string[]
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
}) => {
  const {
    costMode,
    selectedModel,
    stopSequences,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  } = params

  if (selectedModel && !(selectedModel in shortModelNames)) {
    throw new Error(
      `Unknown model: ${selectedModel}. Please use a valid model. Valid models are: ${Object.keys(
        shortModelNames
      ).join(', ')}`
    )
  }

  const fullSelectedModel = selectedModel
    ? shortModelNames[selectedModel as keyof typeof shortModelNames]
    : undefined

  const model: string = fullSelectedModel ?? getModelForMode(costMode, 'agent')

  const provider = providerModelNames[model as keyof typeof providerModelNames]

  const getStream = (messages: Message[], system: System) =>
    provider === 'anthropic'
      ? promptClaudeStream(messages, {
          system,
          model: model as AnthropicModel,
          stopSequences,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
        })
      : provider === 'openai'
        ? promptOpenAIStream(messagesWithSystem(messages, system), {
            model: model as OpenAIModel,
            stopSequences,
            clientSessionId,
            fingerprintId,
            userInputId,
            userId,
          })
        : provider === 'gemini'
          ? model === models.gemini2_5_flash_thinking ||
            model === models.gemini2_5_flash
            ? promptOpenRouterStream(messagesWithSystem(messages, system), {
                clientSessionId,
                fingerprintId,
                userInputId,
                userId,
                model:
                  model === models.gemini2_5_flash
                    ? openrouterModels.openrouter_gemini2_5_flash
                    : openrouterModels.openrouter_gemini2_5_flash_thinking,
              })
            : streamGemini25ProWithFallbacks(messages, system, {
                clientSessionId,
                fingerprintId,
                userInputId,
                userId,
                temperature: 0,
                stopSequences,
              })
          : (() => {
              throw new Error(
                `Unknown model/provider: ${selectedModel}/${model}/${provider}`
              )
            })()

  return {
    model: model,
    getStream,
  }
}
