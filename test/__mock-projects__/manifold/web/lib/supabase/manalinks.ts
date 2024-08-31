import { SupabaseClient, run } from 'common/supabase/utils'

export type ClaimInfo = {
  ts: number
  manalinkId: string
  userId: string
}

export type ManalinkInfo = {
  slug: string
  creatorId: string
  expiresTime: number | null
  maxUses: number | null
  amount: number
  message: string
}

export async function getManalink(
  id: string,
  db: SupabaseClient
): Promise<ManalinkInfo | null> {
  const { data } = await run(
    db
      .from('manalinks')
      .select('id, creator_id, expires_time, max_uses, amount, message')
      .eq('id', id)
  )
  if (data == null || !data.length) {
    return null
  }
  return {
    slug: data[0].id,
    creatorId: data[0].creator_id!,
    expiresTime:
      data[0].expires_time != null ? Date.parse(data[0].expires_time) : null,
    maxUses: data[0].max_uses,
    amount: data[0].amount!,
    message: data[0].message!,
  }
}

export async function getNumClaims(id: string, db: SupabaseClient) {
  const { count } = await run(
    db
      .from('manalink_claims')
      .select('*', { head: true, count: 'exact' })
      .eq('manalink_id', id)
  )
  return count
}

export async function getUserManalinks(
  userId: string,
  db: SupabaseClient
): Promise<ManalinkInfo[]> {
  const { data } = await run(
    db
      .from('manalinks')
      .select('id, expires_time, max_uses, amount, message')
      .eq('creator_id', userId)
  )

  if (data && data.length > 0) {
    return data.map((d) => ({
      slug: d.id,
      creatorId: userId,
      expiresTime: d.expires_time != null ? Date.parse(d.expires_time) : null,
      maxUses: d.max_uses,
      amount: d.amount!,
      message: d.message!,
    }))
  }
  return []
}

export async function getUserManalinkClaims(
  userId: string,
  db: SupabaseClient
): Promise<ClaimInfo[]> {
  const { data } = await run(
    db.rpc('get_user_manalink_claims', {
      creator_id: userId,
    })
  )
  return (data ?? []).map((d) => ({
    manalinkId: d.manalink_id,
    userId: d.claimant_id,
    ts: d.ts,
  }))
}
