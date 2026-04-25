import { createHash } from 'crypto'

import { buildArray } from '@codebuff/common/util/array'

import type {
  AdMessage,
  AdProvider,
  AdVariant,
  FetchAdInput,
  FetchAdResult,
  NormalizedAd,
} from './types'

const GRAVITY_URL = 'https://server.trygravity.ai/api/v1/ad'
const BANNER_PLACEMENT_ID = 'code-assist-ad'
const CHOICE_PLACEMENT_IDS = [
  'choice-ad-1',
  'choice-ad-2',
  'choice-ad-3',
  'choice-ad-4',
]
const WAITING_ROOM_PLACEMENT_IDS = [
  'waiting-room-1',
  'waiting-room-2',
  'waiting-room-3',
  'waiting-room-4',
]

type GravityRawAd = {
  adText: string
  title: string
  cta: string
  url: string
  favicon: string
  clickUrl: string
  impUrl: string
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
    payout: raw.payout,
  }
}

/**
 * A/B test: deterministically assign a user to the `banner` or `choice`
 * variant based on their userId. Stable across requests.
 */
function getGravityVariant(userId: string): AdVariant {
  const hash = createHash('sha256').update(`ad-variant:${userId}`).digest()
  return hash[0] % 2 === 0 ? 'banner' : 'choice'
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

export function createGravityProvider(config: { apiKey: string }): AdProvider {
  return {
    id: 'gravity',
    fetchAd: async (input: FetchAdInput): Promise<FetchAdResult> => {
      const {
        userId,
        userEmail,
        sessionId,
        clientIp,
        device,
        messages = [],
        testMode,
        logger,
        fetch,
      } = input

      const variant =
        input.surface === 'waiting_room' ? 'choice' : getGravityVariant(userId)
      const filteredMessages = prepareGravityMessages(messages)

      const placementIds =
        input.surface === 'waiting_room'
          ? WAITING_ROOM_PLACEMENT_IDS
          : variant === 'choice'
          ? CHOICE_PLACEMENT_IDS
          : [BANNER_PLACEMENT_ID]

      const placements = placementIds.map((id) => ({
        placement: 'below_response',
        placement_id: id,
      }))

      const deviceBody = clientIp
        ? {
            ip: clientIp,
            ...(device?.os ? { os: device.os } : {}),
            ...(device?.timezone ? { timezone: device.timezone } : {}),
            ...(device?.locale ? { locale: device.locale } : {}),
          }
        : undefined

      const requestBody = {
        messages: filteredMessages,
        sessionId: sessionId ?? userId,
        placements,
        testAd: testMode,
        relevancy: 0,
        ...(deviceBody ? { device: deviceBody } : {}),
        user: {
          id: userId,
          email: userEmail ?? undefined,
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
          { request: requestBody, response: errorBody, status: response.status },
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

      if (variant === 'choice') {
        return { variant: 'choice', ads: ads.map(normalize) }
      }
      return { variant: 'banner', ad: normalize(ads[0]) }
    },
  }
}
