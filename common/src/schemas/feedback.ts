import { z } from 'zod/v4'

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SOURCES,
  MAX_ERRORS,
  MAX_ERROR_ID_LENGTH,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_RECENT_MESSAGES,
  MESSAGE_VARIANTS,
} from '../constants/feedback'

export const feedbackRequestSchema = z.object({
  text: z.string().trim().min(1),
  category: z.enum(FEEDBACK_CATEGORIES),
  type: z.enum(['message', 'general']),
  clientFeedbackId: z.string().uuid().optional(),
  source: z.enum(FEEDBACK_SOURCES).optional(),
  messageId: z.string().min(1).max(200).optional(),
  messageVariant: z.enum(MESSAGE_VARIANTS).optional(),
  completionTime: z.string().max(50).optional(),
  credits: z.number().nonnegative().finite().optional(),
  agentMode: z.string().max(100).optional(),
  sessionCreditsUsed: z.number().nonnegative().finite().optional(),
  recentMessages: z
    .array(
      z.object({
        type: z.enum(MESSAGE_VARIANTS),
        id: z.string().max(200),
        completionTime: z.string().max(50).optional(),
        credits: z.number().nonnegative().finite().optional(),
      }),
    )
    .max(MAX_RECENT_MESSAGES)
    .optional(),
  errors: z
    .array(
      z.object({
        id: z.string().max(MAX_ERROR_ID_LENGTH),
        message: z.string().max(MAX_ERROR_MESSAGE_LENGTH),
      }),
    )
    .max(MAX_ERRORS)
    .optional(),
}).refine(
  (data) => data.type !== 'message' || (data.messageId != null && data.messageId !== ''),
  { message: 'messageId is required when type is "message"', path: ['messageId'] },
)

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>
