import { providerModelNames } from '@codebuff/common/constants'
import { CoreMessage } from 'ai'

import { promptAiSdkStream } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { AgentTemplate } from './templates/types'
import { globalStopSequences } from './tools/constants'

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

  const getStream = (messages: CoreMessage[]) => {
    const options: Parameters<typeof promptAiSdkStream>[0] = {
      messages,
      model,
      stopSequences: globalStopSequences,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      maxTokens: 32_000,
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
