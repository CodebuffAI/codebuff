import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { getErrorObject } from '@codebuff/common/util/error'
import { and, eq, gt, isNull } from 'drizzle-orm'

import {
  extractClientIp,
  getFreeModeCountryAccess,
  getFreeModePrivacyDecision,
  getFreeModePrivacyProviderDecision,
  hasHardBlockedPrivacySignal,
  hashClientIp,
  IPINFO_PRIVACY_CACHE_TTL_MS,
  shouldHardBlockFreeModeAccess,
} from './free-mode-country'

import type {
  FreeModeCountryAccess,
  FreeModeCountryAccessOptions,
} from './free-mode-country'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const FREE_MODE_COUNTRY_CACHE_ALLOWED_TTL_MS =
  IPINFO_PRIVACY_CACHE_TTL_MS
export const FREE_MODE_COUNTRY_CACHE_SPUR_CLEARED_TTL_MS = 10 * 60 * 1000
export const FREE_MODE_COUNTRY_CACHE_ANONYMOUS_NETWORK_TTL_MS = 15 * 60 * 1000
export const FREE_MODE_COUNTRY_CACHE_COUNTRY_NOT_ALLOWED_TTL_MS =
  6 * 60 * 60 * 1000
export const FREE_MODE_COUNTRY_CACHE_TRANSIENT_BLOCK_TTL_MS = 5 * 60 * 1000

export type FreeModeCountryAccessCacheStore = {
  get(params: {
    userId: string
    clientIpHash: string
    cfCountry: string | null
    now: Date
  }): Promise<FreeModeCountryAccess | null>
  set(params: {
    userId: string
    access: FreeModeCountryAccess
    now: Date
  }): Promise<void>
}

export function shouldCacheCountryAccess(
  access: FreeModeCountryAccess,
): boolean {
  return Boolean(access.clientIpHash) && !shouldHardBlockFreeModeAccess(access)
}

export function shouldIgnoreCountryAccessCacheRow(
  row: Pick<
    typeof schema.freeModeCountryAccessCache.$inferSelect,
    'country_block_reason' | 'ip_privacy_signals' | 'spur_status'
  >,
): boolean {
  return (
    row.country_block_reason === 'anonymous_network' &&
    row.spur_status === null &&
    hasHardBlockedPrivacySignal(
      row.ip_privacy_signals ? { signals: row.ip_privacy_signals } : null,
    )
  )
}

export function expiresAtForCountryAccess(
  access: FreeModeCountryAccess,
  now: Date,
): Date {
  let ttlMs = FREE_MODE_COUNTRY_CACHE_TRANSIENT_BLOCK_TTL_MS
  if (
    access.allowed &&
    access.spurStatus === 'clean' &&
    (access.ipPrivacy?.signals.length ?? 0) > 0
  ) {
    ttlMs = FREE_MODE_COUNTRY_CACHE_SPUR_CLEARED_TTL_MS
  } else if (access.allowed) {
    ttlMs = FREE_MODE_COUNTRY_CACHE_ALLOWED_TTL_MS
  } else if (
    access.blockReason === 'anonymous_network' &&
    access.spurStatus === 'failed'
  ) {
    ttlMs = FREE_MODE_COUNTRY_CACHE_TRANSIENT_BLOCK_TTL_MS
  } else if (access.blockReason === 'anonymous_network') {
    ttlMs = FREE_MODE_COUNTRY_CACHE_ANONYMOUS_NETWORK_TTL_MS
  } else if (access.blockReason === 'country_not_allowed') {
    ttlMs = FREE_MODE_COUNTRY_CACHE_COUNTRY_NOT_ALLOWED_TTL_MS
  }
  return new Date(now.getTime() + ttlMs)
}

function countryAccessFromCacheRow(
  row: typeof schema.freeModeCountryAccessCache.$inferSelect,
): FreeModeCountryAccess {
  return {
    allowed: row.allowed,
    countryCode: row.country_code,
    blockReason: row.country_block_reason,
    cfCountry: row.cf_country,
    geoipCountry: row.geoip_country,
    ipPrivacy: row.ip_privacy_signals
      ? { signals: row.ip_privacy_signals }
      : null,
    spurIpPrivacy: row.spur_ip_privacy_signals
      ? { signals: row.spur_ip_privacy_signals }
      : null,
    spurStatus: row.spur_status ?? 'not_checked',
    hasClientIp: true,
    clientIpHash: row.client_ip_hash,
  }
}

export const dbFreeModeCountryAccessCacheStore: FreeModeCountryAccessCacheStore =
  {
    async get({ userId, clientIpHash, cfCountry, now }) {
      const row = await db.query.freeModeCountryAccessCache.findFirst({
        where: and(
          eq(schema.freeModeCountryAccessCache.user_id, userId),
          eq(schema.freeModeCountryAccessCache.client_ip_hash, clientIpHash),
          cfCountry === null
            ? isNull(schema.freeModeCountryAccessCache.cf_country)
            : eq(schema.freeModeCountryAccessCache.cf_country, cfCountry),
          gt(schema.freeModeCountryAccessCache.expires_at, now),
        ),
      })
      if (!row) return null
      if (shouldIgnoreCountryAccessCacheRow(row)) return null
      return countryAccessFromCacheRow(row)
    },

    async set({ userId, access, now }) {
      if (!shouldCacheCountryAccess(access)) return

      const clientIpHash = access.clientIpHash
      if (!clientIpHash) return

      const expiresAt = expiresAtForCountryAccess(access, now)
      const privacyDecision = getFreeModePrivacyDecision(access)
      const privacyProviderDecision = getFreeModePrivacyProviderDecision(access)
      await db
        .insert(schema.freeModeCountryAccessCache)
        .values({
          user_id: userId,
          client_ip_hash: clientIpHash,
          allowed: access.allowed,
          country_code: access.countryCode,
          cf_country: access.cfCountry,
          geoip_country: access.geoipCountry,
          country_block_reason: access.blockReason,
          ip_privacy_signals: access.ipPrivacy?.signals ?? null,
          spur_ip_privacy_signals: access.spurIpPrivacy?.signals ?? null,
          spur_status: access.spurStatus,
          privacy_decision: privacyDecision,
          privacy_provider_decision: privacyProviderDecision,
          checked_at: now,
          expires_at: expiresAt,
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [
            schema.freeModeCountryAccessCache.user_id,
            schema.freeModeCountryAccessCache.client_ip_hash,
          ],
          set: {
            allowed: access.allowed,
            country_code: access.countryCode,
            cf_country: access.cfCountry,
            geoip_country: access.geoipCountry,
            country_block_reason: access.blockReason,
            ip_privacy_signals: access.ipPrivacy?.signals ?? null,
            spur_ip_privacy_signals: access.spurIpPrivacy?.signals ?? null,
            spur_status: access.spurStatus,
            privacy_decision: privacyDecision,
            privacy_provider_decision: privacyProviderDecision,
            checked_at: now,
            expires_at: expiresAt,
            updated_at: now,
          },
        })
    },
  }

export async function getCachedFreeModeCountryAccess(params: {
  userId: string
  req: Parameters<typeof getFreeModeCountryAccess>[0]
  options: FreeModeCountryAccessOptions
  cacheStore?: FreeModeCountryAccessCacheStore
  logger?: Logger
  now?: Date
}): Promise<FreeModeCountryAccess> {
  const {
    userId,
    req,
    options,
    cacheStore = dbFreeModeCountryAccessCacheStore,
    logger,
    now = new Date(),
  } = params
  const cfCountry = req.headers.get('cf-ipcountry')?.toUpperCase() ?? null
  const clientIp = extractClientIp(req)
  const clientIpHash = hashClientIp(clientIp, options.ipHashSecret)

  if (clientIpHash && !options.forceLimited) {
    try {
      const cached = await cacheStore.get({
        userId,
        clientIpHash,
        cfCountry,
        now,
      })
      if (cached) return cached
    } catch (error) {
      logger?.warn(
        {
          userId,
          clientIpHash,
          error: getErrorObject(error),
        },
        'Free mode country access cache read failed',
      )
      // Cache failures should not make free-mode availability depend on DB
      // health; fall back to the direct country/privacy check.
    }
  }

  const access = await getFreeModeCountryAccess(req, options)
  if (shouldCacheCountryAccess(access)) {
    try {
      await cacheStore.set({ userId, access, now })
    } catch (error) {
      logger?.warn(
        {
          userId,
          clientIpHash: access.clientIpHash,
          error: getErrorObject(error),
        },
        'Free mode country access cache write failed',
      )
      // Best-effort cache write. The direct country/privacy result is still
      // authoritative for this request.
    }
  }
  return access
}
