import { createHash, randomUUID } from 'node:crypto'

import type {
  AdMessage,
  AdProvider,
  FetchAdInput,
  FetchAdResult,
  NormalizedAd,
} from './types'

const ZEROCLICK_OFFERS_URL = 'https://zeroclick.dev/api/v2/offers'
const ZEROCLICK_CHOICE_LIMIT = 4
const MAX_QUERY_LENGTH = 280

type ZeroClickOffer = {
  id: string
  title: string | null
  subtitle?: string | null
  content: string | null
  cta: string | null
  clickUrl: string
  imageUrl?: string | null
  brand?: {
    name?: string | null
    url?: string | null
    iconUrl?: string | null
  } | null
  product?: {
    title?: string | null
    category?: string | null
    image?: string | null
  } | null
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function extractLastUserMessageContent(content: string): string {
  const regex = /<user_message>([\s\S]*?)<\/user_message>/gi
  const matches = [...content.matchAll(regex)]
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    return lastMatch[1].trim()
  }
  return content.trim()
}

function queryFromMessages(messages: AdMessage[]): string | null {
  const lastUser = [...messages]
    .reverse()
    .find((m) => m.role === 'user' && m.content.trim())
  if (!lastUser) return null

  const query = extractLastUserMessageContent(lastUser.content)
    .replace(/\s+/g, ' ')
    .trim()
  if (!query) return null

  return query.length > MAX_QUERY_LENGTH
    ? query.slice(0, MAX_QUERY_LENGTH).trim()
    : query
}

function normalize(raw: ZeroClickOffer, servedId: string): NormalizedAd | null {
  if (!raw.id || !raw.clickUrl) return null

  const title =
    raw.brand?.name?.trim() ||
    raw.title?.trim() ||
    raw.product?.title?.trim() ||
    'Sponsored'
  const content = raw.content?.trim() || raw.subtitle?.trim() || ''

  return {
    adText: content || title,
    title,
    cta: raw.cta?.trim() || 'Learn more',
    url: raw.brand?.url?.trim() || '',
    favicon:
      raw.imageUrl?.trim() ||
      raw.product?.image?.trim() ||
      raw.brand?.iconUrl?.trim() ||
      '',
    clickUrl: raw.clickUrl,
    // Keep this URL-shaped so existing client/server validation can identify
    // the served ad. The actual ZeroClick impression is a client-side POST using
    // impressionIds, so do not put provider tracking IDs in this local key.
    impUrl: `https://codebuff.com/ads/zeroclick-impression/${servedId}`,
    impressionIds: [raw.id],
  }
}

export function createZeroClickProvider(config: {
  apiKey: string
}): AdProvider {
  return {
    id: 'zeroclick',
    fetchAd: async (input: FetchAdInput): Promise<FetchAdResult> => {
      const {
        userId,
        sessionId,
        clientIp,
        userAgent,
        device,
        messages = [],
        logger,
        fetch,
      } = input

      if (!clientIp) {
        logger.debug('[ads:zeroclick] Missing required clientIp')
        return null
      }

      const query = queryFromMessages(messages)
      const requestBody = {
        method: 'server',
        ipAddress: clientIp,
        ...(userAgent ? { userAgent } : {}),
        origin: 'https://codebuff.com',
        ...(query ? { query } : {}),
        limit: ZEROCLICK_CHOICE_LIMIT,
        groupingId: input.surface ?? 'choice',
        userId: `codebuff:${stableHash(userId)}`,
        userSessionId: sessionId
          ? `codebuff:${stableHash(sessionId)}`
          : undefined,
        userLocale: device?.locale,
      }

      const response = await fetch(ZEROCLICK_OFFERS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zc-api-key': config.apiKey,
        },
        body: JSON.stringify(requestBody),
      })

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
            request: { ...requestBody, ipAddress: '[redacted]' },
            response: errorBody,
            status: response.status,
          },
          '[ads:zeroclick] API returned error',
        )
        return null
      }

      const offers = (await response.json()) as ZeroClickOffer[] | unknown
      if (!Array.isArray(offers) || offers.length === 0) {
        logger.debug('[ads:zeroclick] No offers returned')
        return null
      }

      const ads = offers
        .map((offer) => normalize(offer, randomUUID()))
        .filter((ad) => ad !== null)
      if (ads.length === 0) {
        logger.debug('[ads:zeroclick] No renderable offers returned')
        return null
      }

      return { ads }
    },
  }
}
