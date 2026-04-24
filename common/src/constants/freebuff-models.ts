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
  /** Availability policy for the selector and server-side admission. */
  availability: 'always' | 'deployment_hours'
}

export const FREEBUFF_DEPLOYMENT_HOURS_LABEL = '9am ET-5pm PT'
export const FREEBUFF_GLM_MODEL_ID = 'z-ai/glm-5.1'
export const FREEBUFF_MINIMAX_MODEL_ID = 'minimax/minimax-m2.7'

export const FREEBUFF_MODELS = [
  {
    id: FREEBUFF_MINIMAX_MODEL_ID,
    displayName: 'MiniMax M2.7',
    tagline: 'Fastest',
    availability: 'always',
  },
  {
    id: FREEBUFF_GLM_MODEL_ID,
    displayName: 'GLM 5.1',
    tagline: 'Smartest',
    availability: 'deployment_hours',
  },
] as const satisfies readonly FreebuffModelOption[]

export type FreebuffModelId = (typeof FREEBUFF_MODELS)[number]['id']

/** What new freebuff users see selected in the picker. May not be currently
 *  available (GLM is closed outside deployment hours); callers that need an
 *  always-available id for resolution / auto-fallbacks should use
 *  FALLBACK_FREEBUFF_MODEL_ID instead. */
export const DEFAULT_FREEBUFF_MODEL_ID: FreebuffModelId = FREEBUFF_GLM_MODEL_ID

/** Always-available fallback used when the requested model can't be served
 *  right now (unknown id, deployment hours closed, etc.). Kept distinct from
 *  DEFAULT_FREEBUFF_MODEL_ID so a new user's "preferred default" can be the
 *  smartest model without auto-flipping anyone to a closed deployment. */
export const FALLBACK_FREEBUFF_MODEL_ID: FreebuffModelId =
  FREEBUFF_MINIMAX_MODEL_ID

export function isFreebuffModelId(
  id: string | null | undefined,
): id is FreebuffModelId {
  if (!id) return false
  return FREEBUFF_MODELS.some((m) => m.id === id)
}

export function resolveFreebuffModel(
  id: string | null | undefined,
): FreebuffModelId {
  return isFreebuffModelId(id) ? id : FALLBACK_FREEBUFF_MODEL_ID
}

export function getFreebuffModel(id: string): FreebuffModelOption {
  return (
    FREEBUFF_MODELS.find((m) => m.id === id) ??
    FREEBUFF_MODELS.find((m) => m.id === FALLBACK_FREEBUFF_MODEL_ID)!
  )
}

function getZonedParts(
  date: Date,
  timeZone: string,
): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value
  const hour = Number(value('hour') ?? 0)
  const minute = Number(value('minute') ?? 0)
  return {
    weekday: value('weekday') ?? '',
    minutes: hour * 60 + minute,
  }
}

export function isFreebuffDeploymentHours(now: Date = new Date()): boolean {
  const eastern = getZonedParts(now, 'America/New_York')
  const pacific = getZonedParts(now, 'America/Los_Angeles')
  if (eastern.weekday === 'Sat' || eastern.weekday === 'Sun') return false
  return eastern.minutes >= 9 * 60 && pacific.minutes < 17 * 60
}

export function isFreebuffModelAvailable(
  id: string,
  now: Date = new Date(),
): boolean {
  const model = FREEBUFF_MODELS.find((m) => m.id === id)
  if (!model) return false
  return model.availability === 'always' || isFreebuffDeploymentHours(now)
}

export function resolveAvailableFreebuffModel(
  id: string | null | undefined,
  now: Date = new Date(),
): FreebuffModelId {
  const resolved = resolveFreebuffModel(id)
  return isFreebuffModelAvailable(resolved, now)
    ? resolved
    : FALLBACK_FREEBUFF_MODEL_ID
}
