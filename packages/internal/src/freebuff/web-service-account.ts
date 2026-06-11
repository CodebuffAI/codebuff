import { and, desc, eq, gt } from 'drizzle-orm'

import defaultDb from '../db'
import * as schema from '../db/schema'

/**
 * Well-known email of the dedicated Freebuff Web service account. Provisioned
 * and rotated by scripts/create-freebuff-web-service-account.ts, which stores
 * the account's PAT in the shared `session` table.
 */
export const FREEBUFF_WEB_SERVICE_ACCOUNT_EMAIL =
  'freebuff-web-service@codebuff.internal'

/**
 * Looks up the service account's current PAT from the shared database, so
 * deployments that can reach Postgres (e.g. the freebuff.com web server)
 * don't need the key distributed through their environment. Returns null if
 * the account hasn't been provisioned or every credential has expired.
 */
export async function getFreebuffWebServiceAccountApiKey({
  db = defaultDb,
}: {
  db?: typeof defaultDb
} = {}): Promise<string | null> {
  const [row] = await db
    .select({ sessionToken: schema.session.sessionToken })
    .from(schema.session)
    .innerJoin(schema.user, eq(schema.session.userId, schema.user.id))
    .where(
      and(
        eq(schema.user.email, FREEBUFF_WEB_SERVICE_ACCOUNT_EMAIL),
        eq(schema.session.type, 'pat'),
        gt(schema.session.expires, new Date()),
      ),
    )
    .orderBy(desc(schema.session.expires))
    .limit(1)
  return row?.sessionToken ?? null
}

const CACHE_MS = 60_000
let cached: { promise: Promise<string | null>; fetchedAt: number } | null =
  null

/**
 * Cached variant for request paths. Concurrent callers share one in-flight
 * query, and the result (including "not provisioned") is held for up to 60
 * seconds — so a rotation, which revokes all of the account's PATs, is
 * picked up within the same window.
 */
export function getCachedFreebuffWebServiceAccountApiKey(): Promise<
  string | null
> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.promise
  }
  const entry = {
    promise: getFreebuffWebServiceAccountApiKey(),
    fetchedAt: Date.now(),
  }
  cached = entry
  entry.promise.catch(() => {
    // Don't hold a failed lookup for the full window.
    if (cached === entry) {
      cached = null
    }
  })
  return entry.promise
}
