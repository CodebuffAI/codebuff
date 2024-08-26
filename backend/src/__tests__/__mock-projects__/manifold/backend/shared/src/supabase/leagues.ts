import { APIError } from 'common/api/utils'
import { convertLeague } from 'common/supabase/leagues'
import { type SupabaseClient, run } from 'common/supabase/utils'

export async function getLeaguesForUser(
  db: SupabaseClient,
  filters: {
    userId?: string
    cohort?: string
    season?: number
  }
) {
  const { userId, cohort, season } = filters

  if (!userId && !season && !cohort)
    throw new APIError(400, 'Must provide userId, season, or cohort')

  let q = db
    .from('leagues')
    .select()
    .order('created_time', { ascending: false } as any)

  if (userId) q = q.eq('user_id', userId)
  if (cohort) q = q.eq('cohort', cohort)
  if (season) q = q.eq('season', season)

  const res = await run(q)
  return res.data.map(convertLeague)
}
