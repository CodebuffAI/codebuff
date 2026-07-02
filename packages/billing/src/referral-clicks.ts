import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'

/**
 * Record a click on a referral share link, deduped per (code, device). Resolves
 * the code's owner from `user.referral_code` and inserts a `referral_click` row;
 * a repeat visit from the same browser is a no-op (PK conflict). Unknown or
 * legacy codes (no matching user) are ignored so junk never creates rows.
 *
 * Best-effort: callers run this off the attribution-cookie hop and should not
 * block the response on it. Returns whether a NEW click was recorded.
 */
export async function recordReferralClick(params: {
  code: string
  deviceId: string
  ipHash?: string | null
  /** Injectable connection (defaults to the shared db) for integration tests. */
  conn?: typeof db
}): Promise<{ recorded: boolean }> {
  const conn = params.conn ?? db
  const code = params.code.trim()
  const deviceId = params.deviceId.trim()
  if (!code || !deviceId) return { recorded: false }

  const [owner] = await conn
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.referral_code, code))
    .limit(1)
  // Unknown code (or a legacy Convex code that isn't a Postgres share code):
  // nothing to attribute, so don't record a click.
  if (!owner) return { recorded: false }

  const inserted = await conn
    .insert(schema.referralClick)
    .values({
      referral_code: code,
      referrer_id: owner.id,
      device_id: deviceId,
      ip_hash: params.ipHash ?? null,
    })
    .onConflictDoNothing()
    .returning({ deviceId: schema.referralClick.device_id })

  return { recorded: inserted.length > 0 }
}

export interface ReferralFunnelStats {
  /** Unique browsers that landed via this referrer's share link. */
  clicks: number
  /** All signups attributed to this referrer (referral_v2, not revoked), */
  /** regardless of whether they've qualified/activated yet. */
  totalSignups: number
}

/**
 * The top of the referrer funnel: unique clicks and total attributed signups.
 * The "valid signups" figure is the qualified count from {@link getWebReferralScore}
 * (activated + GitHub age gate), returned separately by the referrals API.
 */
export async function getReferralFunnelStats(params: {
  referrerId: string
  conn?: typeof db
}): Promise<ReferralFunnelStats> {
  const conn = params.conn ?? db

  const [[clickRow], [signupRow]] = await Promise.all([
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.referralClick)
      .where(eq(schema.referralClick.referrer_id, params.referrerId)),
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.referralV2)
      .where(
        and(
          eq(schema.referralV2.referrer_id, params.referrerId),
          isNull(schema.referralV2.revoked_at),
        ),
      ),
  ])

  return {
    clicks: Number(clickRow?.count ?? 0),
    totalSignups: Number(signupRow?.count ?? 0),
  }
}
