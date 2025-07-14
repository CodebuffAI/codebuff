import { CostMode, Model } from '@codebuff/common/constants'
import { CoreMessage } from 'ai'
import { promptAiSdkStream } from './providers/vercel-ai-sdk/ai-sdk'

export interface AgentStreamOptions {
  costMode: CostMode
  selectedModel: Model
  stopSequences?: string[]
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
}

export function getAgentStream(options: AgentStreamOptions) {
  return async function* (messages: CoreMessage[]) {
    yield* promptAiSdkStream({
      messages: messages, // CoreMessage[] is compatible with CodebuffMessage[] (which extends CoreMessage)
      model: options.selectedModel,
      clientSessionId: options.clientSessionId,
      fingerprintId: options.fingerprintId,
      userInputId: options.userInputId,
      userId: options.userId,
      stopSequences: options.stopSequences,
      chargeUser: true,
    })
  }
}
