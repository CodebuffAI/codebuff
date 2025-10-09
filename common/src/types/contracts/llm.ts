import type { ParamsExcluding } from '../function-params'
import type { Logger } from './logger'
import type { Message } from '../messages/codebuff-message'
import type { streamText } from 'ai'
import type { Model } from '../../old-constants'

export type StreamChunk =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'reasoning'
      text: string
    }
  | { type: 'error'; message: string }

export type PromptAiSdkStreamFn = (
  params: {
    messages: Message[]
    clientSessionId: string
    fingerprintId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
    thinkingBudget?: number
    userInputId: string
    agentId?: string
    maxRetries?: number
    onCostCalculated?: (credits: number) => Promise<void>
    includeCacheControl?: boolean
    logger: Logger
  } & ParamsExcluding<typeof streamText, 'model' | 'messages'>,
) => AsyncGenerator<StreamChunk, string | null>
