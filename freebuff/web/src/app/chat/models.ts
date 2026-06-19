import {
  FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'

/**
 * Models available in freebuff.com/chat. Client-safe (no secrets). The
 * base-chat agent runs with `backendId` (see src/server/chat/agent.ts).
 *
 * There's no picker: the server picks the model from the user's access tier
 * (full → MiniMax M3, limited → DeepSeek Flash). The array/lookup shape is kept
 * so adding a picker back later is a local change.
 */
export interface ChatModelOption {
  /** Stable chat-product id (persisted on chat_thread/chat_message.model). */
  id: string
  /** Model id sent through the agent framework / completions endpoint. */
  backendId: string
}

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'minimax-m3',
    // Served by Fireworks; vision-capable. Used for full-access users.
    backendId: FREEBUFF_MINIMAX_M3_MODEL_ID,
  },
  {
    id: 'deepseek-v4-flash',
    // Served by Fireworks; text-only. Used for limited-access users.
    backendId: FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID,
  },
]

/** Full-access model (vision-capable, so image upload works). */
export const DEFAULT_CHAT_MODEL_ID = 'minimax-m3'

/** Limited-access users (unsupported countries, VPN/proxy) are pinned to this
 *  text-only model and can't upload images. */
export const LIMITED_CHAT_MODEL_ID = 'deepseek-v4-flash'

/** The model a run uses, chosen purely by access tier (no client input). */
export function chatModelForAccessTier(accessTier: FreebuffAccessTier): string {
  return accessTier === 'full' ? DEFAULT_CHAT_MODEL_ID : LIMITED_CHAT_MODEL_ID
}

/** Image-upload constraints, shared by the composer and the upload endpoint. */
export const CHAT_IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const
/** Membership-test form of CHAT_IMAGE_ALLOWED_TYPES for validation call sites. */
export const CHAT_IMAGE_ALLOWED_TYPES_SET: ReadonlySet<string> = new Set(
  CHAT_IMAGE_ALLOWED_TYPES,
)
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB per image
export const CHAT_IMAGE_MAX_COUNT = 4 // images per message

export const CHAT_MESSAGE_MAX_CHARS = 32_000

/** Sidebar title from the first user message. Code-point-safe truncation so
 *  the 60-char cut can't split an emoji/surrogate pair. */
export function deriveThreadTitle(content: string): string {
  const firstLine = content.trim().split('\n')[0] ?? ''
  const codePoints = [...firstLine]
  return codePoints.length > 60
    ? `${codePoints.slice(0, 60).join('').trimEnd()}…`
    : firstLine || 'Image'
}
