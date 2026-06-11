import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

/**
 * Models available in freebuff.com/chat. Client-safe (no secrets). The
 * base-chat agent runs with `backendId` (see src/server/chat/agent.ts).
 *
 * Users with limited access (unsupported countries, VPN/proxy traffic) are
 * pinned server-side to the default model and never see the selector.
 */
export interface ChatModelOption {
  id: string
  /** Model id sent through the agent framework / completions endpoint. */
  backendId: string
  label: string
  tagline: string
}

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'deepseek-v4-flash',
    backendId: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    label: 'DeepSeek Flash',
    tagline: 'Fast · everyday questions',
  },
  {
    id: 'deepseek-v4-pro',
    backendId: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    label: 'DeepSeek Pro',
    tagline: 'Smartest · complex work',
  },
]

export const DEFAULT_CHAT_MODEL_ID = 'deepseek-v4-flash'

export function isChatModelId(id: string): boolean {
  return CHAT_MODELS.some((m) => m.id === id)
}

export const CHAT_MESSAGE_MAX_CHARS = 32_000

/**
 * The model a run actually uses: limited-access users (unsupported
 * countries, VPN/proxy traffic) are pinned to the default model regardless
 * of what the client sends.
 */
export function resolveChatModel(
  accessTier: 'full' | 'limited',
  requestedModel: string,
): string {
  return accessTier === 'full' && isChatModelId(requestedModel)
    ? requestedModel
    : DEFAULT_CHAT_MODEL_ID
}

/** Sidebar title from the first user message. Code-point-safe truncation so
 *  the 60-char cut can't split an emoji/surrogate pair. */
export function deriveThreadTitle(content: string): string {
  const firstLine = content.trim().split('\n')[0] ?? ''
  const codePoints = [...firstLine]
  return codePoints.length > 60
    ? `${codePoints.slice(0, 60).join('').trimEnd()}…`
    : firstLine || 'New chat'
}
