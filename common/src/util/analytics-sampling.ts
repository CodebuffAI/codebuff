import { AnalyticsEvent } from '../constants/analytics-events'

const DEFAULT_SAMPLED_RATE = 0.01

const SAMPLED_EVENT_RATES: Partial<Record<AnalyticsEvent, number>> = {
  [AnalyticsEvent.AGENT_STEP]: DEFAULT_SAMPLED_RATE,
  [AnalyticsEvent.CHATGPT_OAUTH_REQUEST]: DEFAULT_SAMPLED_RATE,
  [AnalyticsEvent.CLI_LOG]: DEFAULT_SAMPLED_RATE,
  [AnalyticsEvent.FEEDBACK_BUTTON_HOVERED]: DEFAULT_SAMPLED_RATE,
  [AnalyticsEvent.FOLLOWUP_CLICKED]: DEFAULT_SAMPLED_RATE,
  [AnalyticsEvent.CLI_INLINE_AD_SLOT_ELIGIBLE]: DEFAULT_SAMPLED_RATE,
  [AnalyticsEvent.SLASH_COMMAND_USED]: DEFAULT_SAMPLED_RATE,
  [AnalyticsEvent.SLASH_MENU_ACTIVATED]: DEFAULT_SAMPLED_RATE,
  [AnalyticsEvent.TOOL_USE]: DEFAULT_SAMPLED_RATE,
}

const ALWAYS_TRACK_EVENTS = new Set<AnalyticsEvent>([
  // DAU is measured from MESSAGE_SENT, so it must never be sampled.
  AnalyticsEvent.MESSAGE_SENT,
  // Engaged-time is summed from event counts, so it must never be sampled.
  AnalyticsEvent.PRODUCT_ACTIVE_MINUTE,
  AnalyticsEvent.APP_LAUNCHED,
  AnalyticsEvent.CHANGE_DIRECTORY,
  AnalyticsEvent.CHATGPT_OAUTH_AUTH_ERROR,
  AnalyticsEvent.CHATGPT_OAUTH_RATE_LIMITED,
  AnalyticsEvent.FINGERPRINT_GENERATED,
  AnalyticsEvent.INVALID_COMMAND,
  AnalyticsEvent.KNOWLEDGE_FILE_UPDATED,
  AnalyticsEvent.LOGIN,
  AnalyticsEvent.LOGIN_STARTED,
  AnalyticsEvent.LOGIN_FAILED,
  AnalyticsEvent.LOGIN_TIMEOUT,
  AnalyticsEvent.LOGIN_ABORTED,
  // Desktop surface events are low-volume; keep them whole so the app's launch /
  // login / activity funnels aren't decimated by the 1% default sample.
  AnalyticsEvent.DESKTOP_APP_LAUNCHED,
  AnalyticsEvent.DESKTOP_LOGIN,
  AnalyticsEvent.DESKTOP_LOGOUT,
  AnalyticsEvent.DESKTOP_THREAD_CREATED,
  AnalyticsEvent.DESKTOP_PROJECT_OPENED,
  AnalyticsEvent.DESKTOP_TURN_COMPLETED,
  AnalyticsEvent.DESKTOP_HARNESS_CHANGED,
  AnalyticsEvent.DESKTOP_MODEL_CHANGED,
  AnalyticsEvent.DESKTOP_SKILL_RUN,
  AnalyticsEvent.TERMINAL_COMMAND_COMPLETED,
  AnalyticsEvent.UPDATE_CODEBUFF_FAILED,
  AnalyticsEvent.USER_INPUT,
  AnalyticsEvent.USER_INPUT_COMPLETE,
])

type AnalyticsProperties = Record<string, unknown> | undefined

function getStringProperty(
  properties: AnalyticsProperties,
  key: string,
): string | undefined {
  const value = properties?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getPropertyUserId(properties: AnalyticsProperties): string | undefined {
  const direct =
    getStringProperty(properties, 'userId') ??
    getStringProperty(properties, 'user_id') ??
    getStringProperty(properties, 'distinct_id')
  if (direct) {
    return direct
  }

  const user = properties?.user
  if (user && typeof user === 'object') {
    const id = (user as { id?: unknown }).id
    return typeof id === 'string' && id.trim() ? id : undefined
  }

  return undefined
}

function splitEnvList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

export function isFullTelemetryEnabled(params: {
  distinctId?: string
  properties?: AnalyticsProperties
}): boolean {
  if (isTruthyEnv(process.env.CODEBUFF_FULL_TELEMETRY)) {
    return true
  }

  const ids = splitEnvList(
    process.env.CODEBUFF_FULL_TELEMETRY_IDS ??
      process.env.CODEBUFF_FULL_TELEMETRY_USER_IDS,
  )
  if (ids.size === 0) {
    return false
  }

  const candidates = [
    params.distinctId,
    getPropertyUserId(params.properties),
    getStringProperty(params.properties, 'userEmail'),
    getStringProperty(params.properties, 'email'),
  ].filter(
    (value): value is string =>
      typeof value === 'string' && value.length > 0,
  )

  return candidates.some((candidate) => ids.has(candidate))
}

function getEventSampleRate(
  event: AnalyticsEvent,
  properties: AnalyticsProperties,
): number {
  const level = getStringProperty(properties, 'level')?.toLowerCase()
  if (
    event === AnalyticsEvent.CLI_LOG &&
    (level === 'error' || level === 'fatal')
  ) {
    return 1
  }

  if (ALWAYS_TRACK_EVENTS.has(event)) {
    return 1
  }

  return SAMPLED_EVENT_RATES[event] ?? 1
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getSamplingKey(params: {
  event: AnalyticsEvent
  distinctId?: string
  properties?: AnalyticsProperties
}): string {
  return (
    params.distinctId ??
    getPropertyUserId(params.properties) ??
    getStringProperty(params.properties, 'clientSessionId') ??
    getStringProperty(params.properties, 'userInputId') ??
    params.event
  )
}

export function shouldTrackAnalyticsEvent(params: {
  event: AnalyticsEvent
  distinctId?: string
  properties?: AnalyticsProperties
}): boolean {
  if (isFullTelemetryEnabled(params)) {
    return true
  }

  const rate = getEventSampleRate(params.event, params.properties)
  if (rate >= 1) {
    return true
  }
  if (rate <= 0) {
    return false
  }

  const bucket =
    hashString(`${params.event}:${getSamplingKey(params)}`) / 0xffffffff
  return bucket < rate
}

function valueKind(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array'
  }
  if (value === null) {
    return 'null'
  }
  return typeof value
}

export function summarizeAnalyticsValue(
  value: unknown,
): Record<string, unknown> {
  if (value === null || value === undefined) {
    return { kind: valueKind(value) }
  }

  if (typeof value === 'string') {
    return { kind: 'string', length: value.length }
  }

  if (Array.isArray(value)) {
    return { kind: 'array', length: value.length }
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    return {
      kind: 'object',
      keyCount: keys.length,
      keys: keys.slice(0, 25),
    }
  }

  return { kind: valueKind(value) }
}
