export const FEEDBACK_CATEGORIES = ['good_result', 'bad_result', 'app_bug', 'other'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export const FEEDBACK_SOURCES = ['cli', 'sdk', 'web'] as const
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number]

export const MESSAGE_VARIANTS = ['ai', 'user', 'agent', 'error'] as const
export type MessageVariant = (typeof MESSAGE_VARIANTS)[number]

export const MAX_RECENT_MESSAGES = 10
export const MAX_ERRORS = 50
export const MAX_ERROR_MESSAGE_LENGTH = 2000
export const MAX_ERROR_ID_LENGTH = 200
