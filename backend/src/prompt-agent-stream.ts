import { providerModelNames } from '@codebuff/common/constants'

import { promptAiSdkStream } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { globalStopSequence } from './tools/constants'

import type { AgentTemplate } from './templates/types'
import type { CodebuffMessage } from '@codebuff/common/types/message'

export const getAgentStreamFromTemplate = (params: {
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined

  template: AgentTemplate
}) => {
  const { clientSessionId, fingerprintId, userInputId, userId, template } =
    params

  if (!template) {
    throw new Error('Agent template is null/undefined')
  }

  const { model } = template

  const getStream = (messages: CodebuffMessage[]) => {
    const options: Parameters<typeof promptAiSdkStream>[0] = {
      messages,
      model,
      stopSequences: [globalStopSequence],
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      maxOutputTokens: 32_000,
    }

    // Add Gemini-specific options if needed
    const primaryModel = Array.isArray(model) ? model[0] : model
    const provider =
      providerModelNames[primaryModel as keyof typeof providerModelNames]

    if (provider === 'gemini') {
      if (!options.providerOptions) {
        options.providerOptions = {}
      }
      if (!options.providerOptions.gemini) {
        options.providerOptions.gemini = {}
      }
      if (!options.providerOptions.gemini.thinkingConfig) {
        options.providerOptions.gemini.thinkingConfig = { thinkingBudget: 128 }
      }
    }

    return promptAiSdkStream(options)
  }

  return getStream
}
