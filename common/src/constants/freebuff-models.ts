/**
 * Models a freebuff user can pick between in the waiting-room model selector.
 *
 * Each model has its own queue (server keys queue position by `model`), so the
 * list here is effectively the set of separate waiting lines. Order is the
 * order shown in the UI.
 */
export interface FreebuffModelOption {
  /** Stable ID used in the wire protocol and DB. Matches the model id passed
   *  to the chat-completions endpoint. */
  id: string
  /** Short label for the selector UI. */
  displayName: string
  /** One-line description shown next to the label. */
  tagline: string
}

export const FREEBUFF_MODELS = [
  {
    id: 'z-ai/glm-5.1',
    displayName: 'GLM 5.1',
    tagline: 'Smartest',
  },
  {
    id: 'minimax/minimax-m2.7',
    displayName: 'MiniMax M2.7',
    tagline: 'Fastest',
  },
] as const satisfies readonly FreebuffModelOption[]

export type FreebuffModelId = (typeof FREEBUFF_MODELS)[number]['id']

export const DEFAULT_FREEBUFF_MODEL_ID: FreebuffModelId = FREEBUFF_MODELS[0].id

export function isFreebuffModelId(
  id: string | null | undefined,
): id is FreebuffModelId {
  if (!id) return false
  return FREEBUFF_MODELS.some((m) => m.id === id)
}

export function resolveFreebuffModel(
  id: string | null | undefined,
): FreebuffModelId {
  return isFreebuffModelId(id) ? id : DEFAULT_FREEBUFF_MODEL_ID
}

export function getFreebuffModel(id: string): FreebuffModelOption {
  return (
    FREEBUFF_MODELS.find((m) => m.id === id) ??
    FREEBUFF_MODELS.find((m) => m.id === DEFAULT_FREEBUFF_MODEL_ID)!
  )
}
