import { createHash } from 'node:crypto'

import { buildArray } from '@codebuff/common/util/array'

import type {
  AdMessage,
  AdProvider,
  FetchAdInput,
  FetchAdResult,
  NormalizedAd,
} from './types'

const GRAVITY_URL = 'https://server.trygravity.ai/api/v1/ad'
const CHOICE_PLACEMENT_IDS = [
  'choice-ad-1',
  'choice-ad-2',
  'choice-ad-3',
  'choice-ad-4',
]
const SINGLE_AD_PLACEMENT_IDS = ['Single-Ad-Unit-1']
const WAITING_ROOM_PLACEMENT_IDS = [
  'waiting-room-1',
  'waiting-room-2',
  'waiting-room-3',
  'waiting-room-4',
]
const FREEBUFF_WEB_CHAT_PLACEMENT_IDS = [
  'Web-Chat-After-User-Message',
  'Web-Chat-After-Assistant-Message',
]
const FREEBUFF_CLI_AD_UNIT_EXPERIMENT = 'freebuff-cli-ad-unit-v1'

type GravityRawAd = {
  adText: string
  title: string
  cta: string
  url: string
  favicon: string
  clickUrl: string
  impUrl: string
  placement_id?: string
  payout?: number
}

function normalize(raw: GravityRawAd): NormalizedAd {
  return {
    adText: raw.adText,
    title: raw.title,
    cta: raw.cta,
    url: raw.url,
    favicon: raw.favicon,
    clickUrl: raw.clickUrl,
    impUrl: raw.impUrl,
    placementId: raw.placement_id,
    payout: raw.payout,
  }
}

/**
 * Extract the content from the last <user_message> tag in a string.
 * The CLI wraps raw user text in that tag; if no tag is found, returns the
 * original content.
 */
function extractLastUserMessageContent(content: string): string {
  const regex = /<user_message>([\s\S]*?)<\/user_message>/gi
  const matches = [...content.matchAll(regex)]
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    return lastMatch[1].trim()
  }
  return content
}

/**
 * Gravity only wants the last user turn plus the last preceding assistant
 * turn for relevancy signals. We also strip empties and normalize user
 * messages through the <user_message> tag.
 */
function prepareGravityMessages(messages: AdMessage[]): AdMessage[] {
  const cleaned = messages
    .filter((m) => m.content)
    .map((m) =>
      m.role === 'user'
        ? { ...m, content: extractLastUserMessageContent(m.content) }
        : m,
    )
  const lastUserIndex = cleaned.findLastIndex((m) => m.role === 'user')
  const lastUser = lastUserIndex >= 0 ? cleaned[lastUserIndex] : undefined
  const lastAssistant = cleaned
    .slice(0, lastUserIndex >= 0 ? lastUserIndex : cleaned.length)
    .findLast((m) => m.role === 'assistant')
  return buildArray(lastAssistant, lastUser)
}

function useSingleAdUnit(userId: string): boolean {
  const hash = createHash('sha256')
    .update(`${FREEBUFF_CLI_AD_UNIT_EXPERIMENT}:${userId}`)
    .digest()

  return hash[0] >= 128
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStringField(
  record: Record<string, unknown> | undefined,
  names: string[],
): string | undefined {
  if (!record) return undefined

  for (const name of names) {
    const value = record[name]
    if (typeof value === 'string' && value.trim()) return value
  }

  return undefined
}

function omitUndefined(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  )
}

function hashEmail(email: string | null): string | undefined {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return undefined

  return createHash('sha256').update(normalized).digest('hex')
}

function getPlacementIds(input: FetchAdInput): string[] {
  if (input.surface === 'waiting_room') return WAITING_ROOM_PLACEMENT_IDS
  if (input.surface === 'freebuff_web_chat') {
    return FREEBUFF_WEB_CHAT_PLACEMENT_IDS
  }

  if (useSingleAdUnit(input.userId)) {
    return SINGLE_AD_PLACEMENT_IDS
  }

  return CHOICE_PLACEMENT_IDS
}

export function createGravityProvider(config: { apiKey: string }): AdProvider {
  return {
    id: 'gravity',
    fetchAd: async (input: FetchAdInput): Promise<FetchAdResult> => {
      const {
        userId,
        userEmail,
        sessionId,
        clientIp,
        userAgent,
        gravityContext,
        device,
        messages = [],
        testMode,
        logger,
        fetch,
      } = input

      const filteredMessages = prepareGravityMessages(messages)

      const placementIds = getPlacementIds(input)

      const placements = placementIds.map((id) => ({
        placement:
          input.surface === 'freebuff_web_chat'
            ? 'inline_response'
            : 'below_response',
        placement_id: id,
      }))

      const gravityDevice = isRecord(gravityContext?.device)
        ? gravityContext.device
        : {}
      const gravityUser = isRecord(gravityContext?.user)
        ? gravityContext.user
        : {}
      const emailHash =
        getStringField(gravityUser, [
          'emailHash',
          'email_hash',
          'hashedEmail',
          'hashed_email',
        ]) ?? hashEmail(userEmail)

      const deviceBody = omitUndefined({
        ...gravityDevice,
        ip: clientIp,
        ua: userAgent,
        userAgent,
        os: device?.os ?? gravityDevice.os,
        timezone: device?.timezone ?? gravityDevice.timezone,
        locale: device?.locale ?? gravityDevice.locale,
      })

      const requestBody = {
        messages: filteredMessages,
        sessionId:
          getStringField(gravityContext, ['sessionId', 'session_id']) ??
          sessionId ??
          userId,
        placements,
        testAd: testMode,
        relevancy: 0,
        ...(Object.keys(deviceBody).length > 0 ? { device: deviceBody } : {}),
        ...(gravityContext ? { gravity_context: gravityContext } : {}),
        user: {
          ...gravityUser,
          id: userId,
          uid: userId,
          email: userEmail ?? undefined,
          ...(emailHash
            ? {
                emailHash,
                email_hash: emailHash,
                hashed_email: emailHash,
              }
            : {}),
        },
      }

      const response = await fetch(GRAVITY_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (response.status === 204) {
        logger.debug(
          { request: requestBody, status: response.status },
          '[ads:gravity] No ad available',
        )
        return null
      }

      if (!response.ok) {
        let errorBody: unknown
        try {
          const contentType = response.headers.get('content-type') ?? ''
          errorBody = contentType.includes('application/json')
            ? await response.json()
            : await response.text()
        } catch {
          errorBody = 'Unable to parse error response'
        }
        logger.error(
          {
            request: requestBody,
            response: errorBody,
            status: response.status,
          },
          '[ads:gravity] API returned error',
        )
        return null
      }

      const ads = (await response.json()) as GravityRawAd[] | unknown
      if (!Array.isArray(ads) || ads.length === 0) {
        logger.debug(
          { request: requestBody, status: response.status },
          '[ads:gravity] No ads returned',
        )
        return null
      }

      return { ads: ads.map(normalize) }
    },
  }
}
