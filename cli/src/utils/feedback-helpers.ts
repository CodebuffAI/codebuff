import {
  MAX_ERROR_ID_LENGTH,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_ERRORS,
  MAX_RECENT_MESSAGES,
} from '@codebuff/common/constants/feedback'

import type { ChatMessage } from '../types/chat'
import type { FeedbackCategory } from '@codebuff/common/constants/feedback'

import type { FeedbackRequest } from '@codebuff/common/schemas/feedback'

export type RecentMessageSummary = NonNullable<
  FeedbackRequest['recentMessages']
>[number]

function toRecentMessageSummary(m: ChatMessage): RecentMessageSummary {
  return {
    type: m.variant,
    id: m.id,
    ...(m.completionTime != null && { completionTime: m.completionTime }),
    ...(m.credits != null && { credits: m.credits }),
  }
}

export function buildMessageContext(
  messages: ChatMessage[],
  targetMessageId: string | null,
): {
  target: ChatMessage | null
  recentMessages: RecentMessageSummary[]
} {
  if (!targetMessageId) {
    const startIndex = Math.max(0, messages.length - MAX_RECENT_MESSAGES)
    return { target: null, recentMessages: messages.slice(startIndex).map(toRecentMessageSummary) }
  }

  const target = messages.find((m: ChatMessage) => m.id === targetMessageId) ?? null

  if (!target) {
    return { target: null, recentMessages: [] }
  }

  const targetIndex = messages.indexOf(target)
  const startIndex = Math.max(0, targetIndex - (MAX_RECENT_MESSAGES - 1))
  return { target, recentMessages: messages.slice(startIndex, targetIndex + 1).map(toRecentMessageSummary) }
}

export interface BuildFeedbackPayloadParams {
  text: string
  feedbackCategory: FeedbackCategory
  feedbackMessageId: string | null
  target: ChatMessage | null
  recentMessages: RecentMessageSummary[]
  agentMode: string | null
  sessionCreditsUsed: number | null
  errors: Array<{ id: string; message: string }> | null
  clientFeedbackId: string
}

export function buildFeedbackPayload(
  params: BuildFeedbackPayloadParams,
): FeedbackRequest {
  const {
    text,
    feedbackCategory,
    feedbackMessageId,
    target,
    recentMessages,
    agentMode,
    sessionCreditsUsed,
    errors,
    clientFeedbackId,
  } = params

  const hasMessageId = feedbackMessageId != null && feedbackMessageId !== ''
  const feedbackType: 'message' | 'general' = hasMessageId ? 'message' : 'general'

  const truncatedErrors = errors
    ? errors.slice(0, MAX_ERRORS).map((e) => ({
        id: e.id.slice(0, MAX_ERROR_ID_LENGTH),
        message: e.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
      }))
    : null

  return {
    text,
    category: feedbackCategory,
    type: feedbackType,
    clientFeedbackId,
    source: 'cli',
    ...(hasMessageId && { messageId: feedbackMessageId }),
    ...(target?.variant != null && { messageVariant: target.variant }),
    ...(target?.completionTime != null && target.completionTime !== '' && {
      completionTime: target.completionTime,
    }),
    ...(target?.credits != null && { credits: target.credits }),
    ...(agentMode != null && agentMode !== '' && { agentMode }),
    ...(sessionCreditsUsed != null && { sessionCreditsUsed }),
    ...(recentMessages.length > 0 && { recentMessages }),
    ...(truncatedErrors && truncatedErrors.length > 0 && { errors: truncatedErrors }),
  }
}
