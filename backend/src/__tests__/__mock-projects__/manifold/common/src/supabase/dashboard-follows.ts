import { SupabaseClient } from 'common/supabase/utils'
import { run } from './utils'

export async function getUserFollowsDashboard(
  userId: string,
  dashboardId: string,
  db: SupabaseClient
) {
  const { data: follows } = await run(
    db
      .from('dashboard_follows')
      .select('*')
      .eq('follower_id', userId)
      .eq('dashboard_id', dashboardId)
      .limit(1)
  )

  return follows.length > 0
}
